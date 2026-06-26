// Browser-side commitment/nullifier derivation.
// NOTE: production should use the same Pedersen hash the Noir circuit uses. For
// the demo we use SHA-256 so the values are deterministic and reproducible without
// shipping the bb.js bundle. The on-chain verifier is currently a structural stub,
// so commitment/nullifier matching is between frontend, backend, and the savings
// contract storage only.

async function sha256(...parts: Uint8Array[]): Promise<string> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buf.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function u64ToBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, n, false);
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
