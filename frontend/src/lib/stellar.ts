'use client';

import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { signTransaction } from './freighter';

// USDC issuer on Stellar testnet (Circle)
const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: HORIZON_URL.startsWith('http://') });

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
  vault: process.env.NEXT_PUBLIC_ZAVA_VAULT ?? '',
  credit: process.env.NEXT_PUBLIC_ZAVA_CREDIT ?? '',
  xlmSac: process.env.NEXT_PUBLIC_XLM_SAC ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};

export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

export const SAVINGS_RANGES: Array<{ key: SavingsRange; minXlm: number; labelUsd: number }> = [
  { key: 'R5',   minXlm:   50, labelUsd:   5 },
  { key: 'R20',  minXlm:  200, labelUsd:  20 },
  { key: 'R50',  minXlm:  500, labelUsd:  50 },
  { key: 'R200', minXlm: 2000, labelUsd: 200 },
  { key: 'R500', minXlm: 5000, labelUsd: 500 },
];

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

// ---------- Account balances (via Horizon) ----------

export interface AssetBalance {
  asset: string;    // 'XLM', 'USDC', etc.
  balance: string;  // decimal string, e.g. "500.0000000"
}

export async function getAccountBalances(address: string): Promise<AssetBalance[]> {
  try {
    const account = await horizon.loadAccount(address);
    return account.balances.map((b) => {
      if (b.asset_type === 'native') return { asset: 'XLM', balance: b.balance };
      return {
        asset: (b as Horizon.HorizonApi.BalanceLineAsset).asset_code ?? b.asset_type,
        balance: b.balance,
      };
    });
  } catch {
    return [];
  }
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

// ---------- Real Stellar payment (XLM or USDC) ----------

export async function sendPayment(params: {
  from: string;
  to: string;
  amount: string; // decimal, e.g. "500" for 500 XLM
  asset: 'XLM' | 'USDC';
}): Promise<{ hash: string }> {
  const account = await server.getAccount(params.from);

  const stellarAsset =
    params.asset === 'XLM'
      ? Asset.native()
      : new Asset('USDC', USDC_ISSUER_TESTNET);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: params.to,
        asset: stellarAsset,
        amount: params.amount,
      }),
    )
    .setTimeout(120)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), {
    network: NETWORK_NAME,
    networkPassphrase: NETWORK_PASSPHRASE,
    accountToSign: params.from,
  });

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`Payment failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }
  await pollTx(sent.hash);
  return { hash: sent.hash };
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

// ─── ZavaVault — shielded payment pool ────────────────────────────────────────

function i128ScVal(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'i128' });
}

/** Deposit real XLM into the vault with a hidden commitment + encrypted note. */
export async function vaultDeposit(params: {
  depositor: string;
  commitment: string;      // hex 64 chars
  nullifier: string;       // hex 64 chars — stored as binding, NOT revealed publicly
  amountStroops: bigint;
  encryptedNote: string;   // hex — AES-GCM ciphertext only recipient can decrypt
}): Promise<{ hash: string; leafIndex: number }> {
  const encBuf = Buffer.from(params.encryptedNote, 'hex');
  const { hash, returnValue } = await buildSignAndSubmit(
    params.depositor,
    CONTRACT_IDS.vault,
    'deposit',
    [
      addressScVal(params.depositor),
      bytesN32(params.commitment),
      bytesN32(params.nullifier),
      i128ScVal(params.amountStroops),
      bytesScVal(encBuf),
    ],
  );
  return { hash, leafIndex: Number(returnValue ?? 0) };
}

/** Withdraw shielded XLM from the vault using a ZK proof. */
export async function vaultWithdraw(params: {
  caller: string;
  proofHex: string;
  commitment: string;   // hex 64 chars — must match what was deposited
  root: string;         // hex 64 chars
  nullifier: string;    // hex 64 chars
  recipientHash: string;// hex 64 chars
  amountStroops: bigint;
  recipient: string;    // stellar address
}): Promise<{ hash: string }> {
  const amountBytes = amountToBytes32(params.amountStroops);
  const publicInputs = nativeToScVal({
    commitment: hexToBuffer(params.commitment),
    root: hexToBuffer(params.root),
    nullifier: hexToBuffer(params.nullifier),
    recipient_hash: hexToBuffer(params.recipientHash),
    amount_bytes: amountBytes,
  }, {
    type: {
      commitment: ['symbol', 'bytes'],
      root: ['symbol', 'bytes'],
      nullifier: ['symbol', 'bytes'],
      recipient_hash: ['symbol', 'bytes'],
      amount_bytes: ['symbol', 'bytes'],
    },
  });
  const proofBuf = Buffer.from(
    params.proofHex.startsWith('0x') ? params.proofHex.slice(2) : params.proofHex,
    'hex',
  );
  const { hash } = await buildSignAndSubmit(
    params.caller,
    CONTRACT_IDS.vault,
    'withdraw',
    [
      bytesScVal(proofBuf),
      publicInputs,
      addressScVal(params.recipient),
      i128ScVal(params.amountStroops),
    ],
  );
  return { hash };
}

/** Read the current Merkle root and total XLM locked in the vault. */
export async function getVaultStats(): Promise<{ root: string; totalLocked: bigint; leafCount: number }> {
  const [root, locked, count] = await Promise.all([
    simulate(CONTRACT_IDS.vault, 'get_root', []),
    simulate(CONTRACT_IDS.vault, 'get_total_locked', []),
    simulate(CONTRACT_IDS.vault, 'get_leaf_count', []),
  ]);
  return {
    root: root ? bufferToHex(root) : '',
    totalLocked: BigInt(String(locked ?? 0)),
    leafCount: Number(count ?? 0),
  };
}

export async function vaultIsNullifierSpent(nullifier: string): Promise<boolean> {
  const res = await simulate(CONTRACT_IDS.vault, 'is_nullifier_spent', [bytesN32(nullifier)]);
  return Boolean(res);
}

// ─── Vault event scanner ──────────────────────────────────────────────────────

export interface VaultDepositEvent {
  leafIndex: number;
  commitment: string;   // hex
  encryptedNote: string; // hex — decrypt with user secret to read amount/nonce/week
  txHash: string;
  ledger: number;
}

/** Fetch all deposit events from the vault contract via Horizon. */
export async function getVaultDepositEvents(): Promise<VaultDepositEvent[]> {
  try {
    const vaultId = CONTRACT_IDS.vault;
    if (!vaultId) return [];
    const res = await fetch(
      `${HORIZON_URL}/contract_events?contract_id=${vaultId}&limit=200&order=asc`,
    );
    if (!res.ok) return [];
    const json = await res.json() as {
      _embedded?: { records?: Array<{
        tx_hash: string;
        ledger_closed_at: string;
        ledger: number;
        topic: string[];
        value: string;
      }> };
    };
    const records = json._embedded?.records ?? [];
    const events: VaultDepositEvent[] = [];
    for (const r of records) {
      // Filter for zava deposit events
      if (!r.topic || r.topic.length < 2) continue;
      try {
        const val = r.value;
        if (!val) continue;
        // The value is a base64-encoded XDR ScVal (DepositNote struct)
        const decoded = scValToNative(xdr.ScVal.fromXDR(val, 'base64')) as {
          leaf_index: number | bigint;
          commitment: Uint8Array;
          encrypted_note: Uint8Array;
        };
        events.push({
          leafIndex: Number(decoded.leaf_index ?? 0),
          commitment: Buffer.from(decoded.commitment).toString('hex'),
          encryptedNote: Buffer.from(decoded.encrypted_note).toString('hex'),
          txHash: r.tx_hash,
          ledger: r.ledger,
        });
      } catch {
        // skip malformed events
      }
    }
    return events;
  } catch {
    return [];
  }
}

// ─── ZavaCredit (bulletproof, vault-backed) ──────────────────────────────────

export interface CreditRecordOnChain {
  tier: 'Medium' | 'Low' | 'VeryLow' | 'None';
  savingsRange: SavingsRange;
  loanEligibleStroops: bigint;
  activeWeeks: number;
  withdrawnWeeks: number;
  verifiedAt: number;
  expiresAt: number;
}

export async function claimCredit(params: {
  wallet: string;
  proofHex: string;
  savingsRange: SavingsRange;
  commitments: string[]; // hex 64 chars each
  nullifiers: string[];
  weeks: number[];
}): Promise<{ hash: string; record: CreditRecordOnChain | null }> {
  const proof = Buffer.from(
    params.proofHex.startsWith('0x') ? params.proofHex.slice(2) : params.proofHex,
    'hex',
  );

  const claim = nativeToScVal(
    {
      savings_range: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(params.savingsRange)]),
      commitments: params.commitments.map((c) => hexToBuffer(c)),
      nullifiers:  params.nullifiers.map((n)  => hexToBuffer(n)),
      weeks:       params.weeks,
    },
    {
      type: {
        savings_range: null, // already constructed as enum ScVal above
        commitments: ['symbol', null],
        nullifiers:  ['symbol', null],
        weeks:       ['symbol', null],
      },
    },
  );

  const { hash, returnValue } = await buildSignAndSubmit(
    params.wallet,
    CONTRACT_IDS.credit,
    'claim_credit',
    [addressScVal(params.wallet), bytesScVal(proof), claim],
  );

  return { hash, record: parseCreditRecord(returnValue) };
}

export async function getCreditRecord(wallet: string): Promise<CreditRecordOnChain | null> {
  const res = await simulate(CONTRACT_IDS.credit, 'get_credit_record', [addressScVal(wallet)]);
  return parseCreditRecord(res);
}

export async function getLoanEligibility(wallet: string): Promise<bigint> {
  const res = await simulate(CONTRACT_IDS.credit, 'get_loan_eligibility', [addressScVal(wallet)]);
  return BigInt(String(res ?? 0));
}

function parseCreditRecord(value: unknown): CreditRecordOnChain | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as {
    tier?: { tag: string } | string;
    savings_range?: { tag: string } | string;
    loan_eligible_stroops?: bigint | string | number;
    active_weeks?: number;
    withdrawn_weeks?: number;
    verified_at?: bigint | number;
    expires_at?: bigint | number;
  };
  const tag = (e: unknown): string =>
    typeof e === 'object' && e !== null && 'tag' in (e as Record<string, unknown>)
      ? String((e as { tag: string }).tag)
      : String(e ?? 'None');

  return {
    tier: tag(v.tier) as CreditRecordOnChain['tier'],
    savingsRange: tag(v.savings_range) as SavingsRange,
    loanEligibleStroops: BigInt(String(v.loan_eligible_stroops ?? 0)),
    activeWeeks: Number(v.active_weeks ?? 0),
    withdrawnWeeks: Number(v.withdrawn_weeks ?? 0),
    verifiedAt: Number(v.verified_at ?? 0),
    expiresAt: Number(v.expires_at ?? 0),
  };
}

function amountToBytes32(stroops: bigint): Buffer {
  const buf = Buffer.alloc(32, 0);
  // Write as big-endian i128 in the last 16 bytes
  let v = stroops;
  for (let i = 31; i >= 16; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}
