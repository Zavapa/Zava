// Proof generation — currently STUBBED.
//
// The Noir circuits at contracts/circuits/zava_*.nr exist and pass their unit
// tests; bb.js can generate real UltraHonk proofs from them in principle.
// However the practical end-to-end flow is held up on two infra issues:
//
//   1. Soroban's `honk_verifier` contract uses a placeholder `verify_proof_inner`
//      that returns true for any well-formed bytes. The yugocabrio
//      `rs-soroban-ultrahonk` crate has a VK-format mismatch with the current
//      `bb` releases (expects 1760 bytes, current bb generates 1825-1888) so a
//      real verifier swap is blocked on the crate catching up.
//
//   2. `@aztec/bb.js` ships a webpack-wrapped browser bundle that uses
//      top-level await. Neither Turbopack nor plain Webpack in Next 16
//      manage to expose `Barretenberg` / `Fr` cleanly through this bundle's
//      indirection. We tried static imports, dynamic imports, deep paths,
//      and resolver aliases — each route hits the package's strict exports
//      field. A clean fix would either (a) wait for bb.js to ship a regular
//      ESM bundle without TLA, or (b) build the entire frontend with Vite,
//      which handles this dependency natively.
//
// Until both are resolved we ship a 256-byte zero buffer as the proof. The
// vault contract's commitment-nullifier binding (sha256(commitment||nullifier))
// is the real anti-theft check today and does NOT depend on ZK verification —
// see contract/SECURITY.md for the threat-model trade-off.

const STUB_PROOF_HEX = '00'.repeat(256);

export interface ShieldedProofInputs {
  secret: string;
  amount: bigint;
  merkleRoot: string;
  merklePathHex: string[];
  merklePathIndices: boolean[];
  nullifier: string;
  recipientHash: string;
  amountOut: bigint;
}

export async function generateShieldedProof(
  _inputs: ShieldedProofInputs,
): Promise<{ proofHex: string }> {
  // Tiny await to keep the call-site `async` shape stable for future swap.
  await Promise.resolve();
  return { proofHex: STUB_PROOF_HEX };
}

export interface PartialWithdrawProofInputs {
  secret: string;
  inputAmount: bigint;
  week: bigint;
  merklePathHex: string[];
  merklePathIndices: boolean[];
  changeSecret: string;
  inCommitment: string;
  inRoot: string;
  inNullifier: string;
  recipientHash: string;
  withdrawAmount: bigint;
  changeCommitment: string;
}

export async function generatePartialWithdrawProof(
  _inputs: PartialWithdrawProofInputs,
): Promise<{ proofHex: string }> {
  await Promise.resolve();
  return { proofHex: STUB_PROOF_HEX };
}
