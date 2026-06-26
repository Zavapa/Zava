'use client';

import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { signTransaction } from './freighter';

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const NETWORK_NAME = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET';

export const CONTRACT_IDS = {
  savings: process.env.NEXT_PUBLIC_ZAVA_SAVINGS ?? '',
  honk8w: process.env.NEXT_PUBLIC_ZAVA_HONK_8W ?? '',
  honk12w: process.env.NEXT_PUBLIC_ZAVA_HONK_12W ?? '',
  honk24w: process.env.NEXT_PUBLIC_ZAVA_HONK_24W ?? '',
  verifier: process.env.NEXT_PUBLIC_ZAVA_VERIFIER ?? '',
};

export const NETWORK = {
  name: NETWORK_NAME,
  passphrase: NETWORK_PASSPHRASE,
  rpcUrl: RPC_URL,
};

const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });

export interface CommitmentRow {
  hash: string;
  nullifier: string;
  weekNumber: number;
  timestamp: number;
}

export interface CreditRecord {
  wallet: string;
  tier: 'Medium' | 'Low' | 'VeryLow';
  consistencyWeeks: number;
  verifiedAt: number;
  expiresAt: number;
}

// ---------- Conversion helpers ----------

function hexToBuffer(hex: string): Buffer {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 64) {
    throw new Error(`expected 32-byte hex string, got ${clean.length / 2} bytes`);
  }
  return Buffer.from(clean, 'hex');
}

function bytesN32(hex: string): xdr.ScVal {
  return nativeToScVal(hexToBuffer(hex), { type: 'bytes' });
}

function u32(n: number): xdr.ScVal {
  return nativeToScVal(n, { type: 'u32' });
}

function u64(n: bigint | number): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: 'u64' });
}

function addressScVal(addr: string): xdr.ScVal {
  return new Address(addr).toScVal();
}

function bytesScVal(buf: Buffer): xdr.ScVal {
  return nativeToScVal(buf, { type: 'bytes' });
}

function bufferToHex(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('hex');
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('hex');
  }
  return String(value ?? '');
}

// ---------- Read-only invokes (simulation) ----------

async function simulate(contractId: string, method: string, args: xdr.ScVal[]): Promise<unknown> {
  const contract = new Contract(contractId);
  // For simulations we only need ANY account — Soroban does not broadcast or
  // increment sequence during simulateTransaction. We use a synthetic placeholder
  // so reads work without the connected wallet being funded.
  const { Account } = await import('@stellar/stellar-sdk');
  const account = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0',
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate(${method}) failed: ${sim.error}`);
  }
  const result = (sim as rpc.Api.SimulateTransactionSuccessResponse).result;
  if (!result) return null;
  return scValToNative(result.retval);
}

export async function getCommitmentCount(): Promise<number> {
  const res = await simulate(CONTRACT_IDS.savings, 'get_commitment_count', []);
  return Number(res ?? 0);
}

export async function getMerkleRoot(): Promise<string> {
  const res = await simulate(CONTRACT_IDS.savings, 'get_merkle_root', []);
  return res ? bufferToHex(res) : '';
}

export async function getCommitments(start = 0, end = 50): Promise<CommitmentRow[]> {
  const res = (await simulate(CONTRACT_IDS.savings, 'get_commitments_by_range', [
    u32(start),
    u32(end),
  ])) as Array<{
    hash: Uint8Array;
    nullifier: Uint8Array;
    week_number: number;
    timestamp: bigint | number;
  }> | null;
  if (!res) return [];
  return res.map((r) => ({
    hash: bufferToHex(r.hash),
    nullifier: bufferToHex(r.nullifier),
    weekNumber: Number(r.week_number),
    timestamp: Number(r.timestamp),
  }));
}

export async function getCreditTier(wallet: string): Promise<CreditRecord | null> {
  const res = (await simulate(CONTRACT_IDS.verifier, 'get_credit_tier', [
    addressScVal(wallet),
  ])) as
    | {
        wallet: string;
        tier: { tag: 'Medium' | 'Low' | 'VeryLow' } | string;
        verified_at: bigint | number;
        consistency_weeks: number;
        expires_at: bigint | number;
      }
    | null;
  if (!res) return null;
  const tier = typeof res.tier === 'object' && res.tier !== null ? res.tier.tag : (res.tier as 'Medium' | 'Low' | 'VeryLow');
  return {
    wallet: typeof res.wallet === 'string' ? res.wallet : String(res.wallet),
    tier,
    consistencyWeeks: Number(res.consistency_weeks),
    verifiedAt: Number(res.verified_at),
    expiresAt: Number(res.expires_at),
  };
}

// ---------- Write invokes (sign with Freighter, submit via RPC) ----------

async function buildSignAndSubmit(
  sourceAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<{ hash: string; returnValue: unknown }> {
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(contractId);

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate(${method}) failed: ${sim.error}`);
  }
  tx = rpc.assembleTransaction(tx, sim).build();

  const signedXdr = await signTransaction(tx.toXDR(), {
    network: NETWORK_NAME,
    networkPassphrase: NETWORK_PASSPHRASE,
    accountToSign: sourceAddress,
  });

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(
      `sendTransaction failed: ${JSON.stringify(sent.errorResult ?? sent)}`,
    );
  }

  const final = await pollTx(sent.hash);
  const retval = final.returnValue ? scValToNative(final.returnValue) : null;
  return { hash: sent.hash, returnValue: retval };
}

async function pollTx(hash: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await server.getTransaction(hash);
    if (r.status === 'SUCCESS') return r;
    if (r.status === 'FAILED') {
      throw new Error(`tx ${hash} failed`);
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`tx ${hash} timed out`);
}

export async function depositCommitment(params: {
  wallet: string;
  commitment: string;
  nullifier: string;
  weekNumber: number;
}): Promise<{ hash: string }> {
  const { hash } = await buildSignAndSubmit(
    params.wallet,
    CONTRACT_IDS.savings,
    'deposit',
    [
      bytesN32(params.commitment),
      bytesN32(params.nullifier),
      u32(params.weekNumber),
    ],
  );
  return { hash };
}

export async function verifyProof(params: {
  wallet: string;
  proof: string;
  minWeeklyAmount: number;
  consistencyWeeks: 8 | 12 | 24;
  commitments: string[];
  nullifiers: string[];
}): Promise<{ hash: string; tier: 'Medium' | 'Low' | 'VeryLow' }> {
  const proofBuf = Buffer.from(
    params.proof.startsWith('0x') ? params.proof.slice(2) : params.proof,
    'hex',
  );
  const publicInputs = nativeToScVal(
    {
      min_weekly_amount: BigInt(params.minWeeklyAmount),
      consistency_weeks: params.consistencyWeeks,
      commitments: params.commitments.map((c) => hexToBuffer(c)),
      nullifiers: params.nullifiers.map((n) => hexToBuffer(n)),
    },
    {
      type: {
        min_weekly_amount: ['symbol', 'u64'],
        consistency_weeks: ['symbol', 'u32'],
        commitments: ['symbol', null],
        nullifiers: ['symbol', null],
      },
    },
  );

  const { hash, returnValue } = await buildSignAndSubmit(
    params.wallet,
    CONTRACT_IDS.verifier,
    'verify_proof',
    [addressScVal(params.wallet), bytesScVal(proofBuf), publicInputs],
  );

  const tier =
    returnValue && typeof returnValue === 'object' && 'tag' in returnValue
      ? (returnValue as { tag: 'Medium' | 'Low' | 'VeryLow' }).tag
      : tierForWeeks(params.consistencyWeeks);

  return { hash, tier };
}

function tierForWeeks(weeks: 8 | 12 | 24): 'Medium' | 'Low' | 'VeryLow' {
  if (weeks >= 24) return 'VeryLow';
  if (weeks >= 12) return 'Low';
  return 'Medium';
}
