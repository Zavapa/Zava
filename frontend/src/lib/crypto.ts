// Browser-side commitment / nullifier derivation.
//
// We use SHA-256 (via the Web Crypto API) rather than Pedersen for demo
// reliability. The on-chain ZK verifier is currently a STUB that accepts any
// well-formed proof bytes (see contract/SECURITY.md), so commitment/nullifier
// matching only needs to be consistent between the frontend, the indexer, and
// the vault's commitment-nullifier-binding storage.
//
// When the verifier crate matures and we wire real proofs, switch this back
// to bb.js Pedersen (it must match what the Noir circuit computes). The
// circuit code at contracts/circuits/zava_*.nr already uses pedersen_hash.

async function sha256(...parts: Uint8Array[]): Promise<string> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const part of parts) {
    buf.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function u64ToBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, false);
  return out;
}

function u32ToBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

export async function deriveCommitment(secretHex: string, amount: number | bigint): Promise<string> {
  return sha256(hexToBytes(secretHex), u64ToBytes(BigInt(amount)));
}

export async function deriveNullifier(secretHex: string, weekNumber: number): Promise<string> {
  return sha256(hexToBytes(secretHex), u32ToBytes(weekNumber));
}

/**
 * Generate a random 32-byte hex string in the BN254 scalar field. Sub-2^253
 * via masking the top 3 bits of the most-significant byte. Used for ZK-circuit
 * secrets and nonces — kept available for when real Noir proofs are wired in.
 */
export function randomFieldHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  bytes[0] &= 0x1f;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministic change-UTXO nonce derived from (secret, input commitment,
 * input nullifier). Because the inputs uniquely identify the partial
 * withdrawal, the same user spending the same input always produces the
 * same change nonce — so the change UTXO is recoverable purely from the
 * Freighter-derived secret, no localStorage needed.
 *
 * The output is masked to fit the BN254 scalar field.
 */
export async function deriveChangeNonce(
  secretHex: string,
  inCommitmentHex: string,
  inNullifierHex: string,
): Promise<string> {
  const enc = new TextEncoder();
  const parts = [
    hexToBytes(secretHex),
    enc.encode('zava_change_v1'),
    hexToBytes(inCommitmentHex),
    hexToBytes(inNullifierHex),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  bytes[0] &= 0x1f; // BN254-safe
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
