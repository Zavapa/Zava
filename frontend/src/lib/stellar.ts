'use client';

import {
  Address,
  Asset as StellarAsset,
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
  vaultXLM:  process.env.NEXT_PUBLIC_ZAVA_VAULT_XLM  ?? process.env.NEXT_PUBLIC_ZAVA_VAULT ?? '',
  vaultUSDC: process.env.NEXT_PUBLIC_ZAVA_VAULT_USDC ?? '',
  /** @deprecated use vaultXLM / vaultUSDC */
  vault: process.env.NEXT_PUBLIC_ZAVA_VAULT ?? '',
  credit: process.env.NEXT_PUBLIC_ZAVA_CREDIT ?? '',
  xlmSac: process.env.NEXT_PUBLIC_XLM_SAC ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  usdcSac: process.env.NEXT_PUBLIC_USDC_SAC ?? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  usdcIssuer: process.env.NEXT_PUBLIC_USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export type Asset = 'XLM' | 'USDC';
export const ALL_ASSETS: Asset[] = ['XLM', 'USDC'];

/** Pick the right vault contract id for an asset. */
export function vaultIdFor(asset: Asset): string {
  return asset === 'USDC' ? CONTRACT_IDS.vaultUSDC : CONTRACT_IDS.vaultXLM;
}

/**
 * Convert a per-asset stroop amount to USD-equivalent stroops (1 USD = 1e7).
 * USDC SAC uses 7-decimal precision and is 1:1 USD.
 * XLM uses 7-decimal precision; valued at $0.10 for testnet purposes.
 */
const XLM_USD_RATE = 0.10;
export function toUsdStroops(amountStroops: number | bigint, asset: Asset): number {
  const n = typeof amountStroops === 'bigint' ? Number(amountStroops) : amountStroops;
  return asset === 'USDC' ? n : Math.floor(n * XLM_USD_RATE);
}

export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

/**
 * Range tiers expressed as USD-equivalent minimums. Each tier matches any
 * deposit whose USD-equivalent meets the floor — so 50 XLM (~$5) AND 5 USDC
 * both satisfy R5.
 */
export const SAVINGS_RANGES: Array<{
  key: SavingsRange;
  minUsd: number;
  minXlm: number;
  minUsdc: number;
  labelUsd: number;
}> = [
  { key: 'R5',   minUsd:   5, minXlm:   50, minUsdc:   5, labelUsd:   5 },
  { key: 'R20',  minUsd:  20, minXlm:  200, minUsdc:  20, labelUsd:  20 },
  { key: 'R50',  minUsd:  50, minXlm:  500, minUsdc:  50, labelUsd:  50 },
  { key: 'R200', minUsd: 200, minXlm: 2000, minUsdc: 200, labelUsd: 200 },
  { key: 'R500', minUsd: 500, minXlm: 5000, minUsdc: 500, labelUsd: 500 },
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

/**
 * Check if a wallet already has a USDC trustline. Stellar classic assets need
 * an explicit trustline before the account can hold them. Without one, USDC
 * deposits into the vault will fail.
 */
export async function hasUsdcTrustline(address: string): Promise<boolean> {
  try {
    const balances = await getAccountBalances(address);
    return balances.some((b) => b.asset === 'USDC');
  } catch {
    return false;
  }
}

/**
 * Build a trustline-establishing transaction the user can sign with Freighter.
 * Adds USDC:CircleIssuer trustline with no limit. Costs ~0.5 XLM in account
 * reserves (returned if the trustline is later removed).
 */
export async function buildAddUsdcTrustlineTx(fromAddress: string): Promise<string> {
  const account = await server.getAccount(fromAddress);
  const usdcAsset = new StellarAsset('USDC', CONTRACT_IDS.usdcIssuer);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset }))
    .setTimeout(120)
    .build();
  return tx.toXDR();
}

export async function submitSignedXdr(signedXdr: string): Promise<string> {
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`Trustline tx failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }
  await pollTx(sent.hash);
  return sent.hash;
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
      ? StellarAsset.native()
      : new StellarAsset('USDC', USDC_ISSUER_TESTNET);

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

/** Deposit tokens into the per-asset vault with a hidden commitment + encrypted note. */
export async function vaultDeposit(params: {
  depositor: string;
  asset: Asset;
  commitment: string;      // hex 64 chars
  nullifier: string;       // hex 64 chars
  amountStroops: bigint;
  encryptedNote: string;   // hex — AES-GCM ciphertext only recipient can decrypt
}): Promise<{ hash: string; leafIndex: number }> {
  const encBuf = Buffer.from(params.encryptedNote, 'hex');
  const { hash, returnValue } = await buildSignAndSubmit(
    params.depositor,
    vaultIdFor(params.asset),
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

/** Withdraw shielded tokens from the per-asset vault using a ZK proof. */
export async function vaultWithdraw(params: {
  caller: string;
  asset: Asset;
  proofHex: string;
  commitment: string;
  root: string;
  nullifier: string;
  recipientHash: string;
  amountStroops: bigint;
  recipient: string;
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
    vaultIdFor(params.asset),
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

/** Read the current Merkle root + total locked for one asset's vault. */
export async function getVaultStats(asset: Asset = 'XLM'): Promise<{
  asset: Asset;
  root: string;
  totalLocked: bigint;
  leafCount: number;
}> {
  const vaultId = vaultIdFor(asset);
  const [root, locked, count] = await Promise.all([
    simulate(vaultId, 'get_root', []),
    simulate(vaultId, 'get_total_locked', []),
    simulate(vaultId, 'get_leaf_count', []),
  ]);
  return {
    asset,
    root: root ? bufferToHex(root) : '',
    totalLocked: BigInt(String(locked ?? 0)),
    leafCount: Number(count ?? 0),
  };
}

/** Convenience: read both XLM and USDC vault stats in parallel. */
export async function getAllVaultStats() {
  return Promise.all(ALL_ASSETS.map((a) => getVaultStats(a)));
}

export async function vaultIsNullifierSpent(nullifier: string, asset: Asset = 'XLM'): Promise<boolean> {
  const res = await simulate(vaultIdFor(asset), 'is_nullifier_spent', [bytesN32(nullifier)]);
  return Boolean(res);
}

/** Check whether a commitment hash exists in the per-asset vault's Merkle tree. */
export async function vaultCommitmentExists(commitment: string, asset: Asset = 'XLM'): Promise<boolean> {
  const res = await simulate(vaultIdFor(asset), 'commitment_exists', [bytesN32(commitment)]);
  return Boolean(res);
}

/**
 * Withdraw part of a deposit. Releases `withdrawStroops` to the recipient and
 * inserts `changeCommitment` (representing `inputStroops - withdrawStroops`)
 * back into the pool as a new shielded note.
 */
export async function vaultPartialWithdraw(params: {
  caller: string;
  asset: Asset;
  proofHex: string;
  inCommitment: string;
  inNullifier: string;
  inRoot: string;
  recipient: string;
  recipientHash: string;
  withdrawStroops: bigint;
  changeCommitment: string;
}): Promise<{ hash: string }> {
  const proof = Buffer.from(
    params.proofHex.startsWith('0x') ? params.proofHex.slice(2) : params.proofHex,
    'hex',
  );
  const { hash } = await buildSignAndSubmit(
    params.caller,
    vaultIdFor(params.asset),
    'partial_withdraw',
    [
      bytesScVal(proof),
      bytesN32(params.inCommitment),
      bytesN32(params.inNullifier),
      bytesN32(params.inRoot),
      addressScVal(params.recipient),
      bytesN32(params.recipientHash),
      i128ScVal(params.withdrawStroops),
      bytesN32(params.changeCommitment),
    ],
  );
  return { hash };
}

/**
 * Once a change commitment has been spent for the first time, bind a
 * nullifier to it so future re-spends are protected by the same commitment-
 * nullifier security guarantee as regular deposits.
 */
/**
 * Burn one of your commitments and create a new one owned by someone else,
 * encrypted to their scanKey. NO XLM moves on-chain — funds change owners
 * entirely inside the shielded pool.
 */
export async function vaultTransferShielded(params: {
  caller: string;
  asset: Asset;
  proofHex: string;
  inNullifier: string;
  outCommitment: string;
  root: string;
}): Promise<{ hash: string }> {
  const proof = Buffer.from(
    params.proofHex.startsWith('0x') ? params.proofHex.slice(2) : params.proofHex,
    'hex',
  );
  const { hash } = await buildSignAndSubmit(
    params.caller,
    vaultIdFor(params.asset),
    'transfer_shielded',
    [
      bytesScVal(proof),
      bytesN32(params.inNullifier),
      bytesN32(params.outCommitment),
      bytesN32(params.root),
    ],
  );
  return { hash };
}

export async function vaultBindChangeNullifier(params: {
  caller: string;
  asset: Asset;
  proofHex: string;
  changeCommitment: string;
  changeNullifier: string;
}): Promise<{ hash: string }> {
  const proof = Buffer.from(
    params.proofHex.startsWith('0x') ? params.proofHex.slice(2) : params.proofHex,
    'hex',
  );
  const { hash } = await buildSignAndSubmit(
    params.caller,
    vaultIdFor(params.asset),
    'bind_change_nullifier',
    [
      bytesScVal(proof),
      bytesN32(params.changeCommitment),
      bytesN32(params.changeNullifier),
    ],
  );
  return { hash };
}

// ─── Vault event scanner ──────────────────────────────────────────────────────

export interface VaultDepositEvent {
  asset: Asset;
  leafIndex: number;
  commitment: string;
  encryptedNote: string;
  txHash: string;
  ledger: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Fetch vault deposit events for one specific asset's vault. Prefers our
 * backend indexer (Postgres-backed, never expires); falls back to Soroban RPC
 * for the ~24 h retention window.
 */
async function fetchVaultEvents(asset: Asset): Promise<VaultDepositEvent[]> {
  const vaultId = vaultIdFor(asset);
  if (!vaultId) return [];

  // Primary: backend indexer.
  try {
    const res = await fetch(`${API_BASE}/vault/events?contractId=${vaultId}&limit=1000`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as {
        events: Array<{
          leafIndex: number;
          commitment: string;
          encryptedNote: string;
          txHash: string;
          ledger: number;
        }>;
      };
      if (data.events && data.events.length > 0) {
        return data.events.map((e) => ({ ...e, asset }));
      }
    }
  } catch (err) {
    console.warn('[zava] indexer fetch failed, falling back to RPC:', err);
  }

  // Fallback: Soroban RPC.
  try {
    const latest = await server.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - 7_200);
    const response = await server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [vaultId] }],
      limit: 200,
    });

    const events: VaultDepositEvent[] = [];
    for (const ev of response.events ?? []) {
      try {
        const topicNames = (ev.topic ?? []).map((t) => {
          try { return scValToNative(t); } catch { return null; }
        });
        if (!topicNames.some((n) => n === 'deposit')) continue;

        const decoded = scValToNative(ev.value) as {
          leaf_index?: number | bigint;
          commitment?: Uint8Array;
          encrypted_note?: Uint8Array;
        };
        if (!decoded?.commitment || !decoded?.encrypted_note) continue;

        events.push({
          asset,
          leafIndex: Number(decoded.leaf_index ?? 0),
          commitment: Buffer.from(decoded.commitment).toString('hex'),
          encryptedNote: Buffer.from(decoded.encrypted_note).toString('hex'),
          txHash: ev.txHash ?? '',
          ledger: ev.ledger ?? 0,
        });
      } catch {/* skip */}
    }
    return events;
  } catch (err) {
    console.error('[zava] fetchVaultEvents failed:', err);
    return [];
  }
}

/** Fetch deposit events from BOTH vaults, merged into a single asset-tagged list. */
export async function getVaultDepositEvents(): Promise<VaultDepositEvent[]> {
  const results = await Promise.all(ALL_ASSETS.map((a) => fetchVaultEvents(a)));
  return results.flat();
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
        savings_range: [null, null], // already constructed as enum ScVal above
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
