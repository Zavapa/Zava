// Browser-side UltraHonk proof generation using @noir-lang/noir_js.
// The compiled circuit (ACIR) is fetched from /circuits/zava_shielded.json.
// This runs entirely client-side — the secret never leaves the browser.

export interface ShieldedProofInputs {
  secret: string;          // hex 64 chars
  amount: bigint;          // stroops
  merkleRoot: string;      // hex 64 chars — current vault root
  merklePathHex: string[]; // 20 sibling hashes, each hex 64 chars
  merklePathIndices: boolean[];
  nullifier: string;       // hex 64 chars — pedersen_hash([secret, 0])
  recipientHash: string;   // hex 64 chars — sha256(recipient_address) or all-zeros for transfer
  amountOut: bigint;       // 0 for transfer
}

export interface GeneratedProof {
  proofHex: string;
  publicInputs: {
    root: string;
    nullifier: string;
    recipientHash: string;
    amountOut: bigint;
  };
}

let circuitCache: unknown | null = null;

async function loadCircuit() {
  if (circuitCache) return circuitCache;
  const res = await fetch('/circuits/zava_shielded.json');
  if (!res.ok) throw new Error('Failed to load zava_shielded circuit');
  circuitCache = await res.json();
  return circuitCache;
}

function hexToField(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.padStart(64, '0');
}

export async function generateShieldedProof(
  inputs: ShieldedProofInputs,
): Promise<GeneratedProof> {
  const { Noir } = await import('@noir-lang/noir_js');
  const { UltraHonkBackend } = await import('@noir-lang/backend_barretenberg');

  const circuit = await loadCircuit();

  const backend = new UltraHonkBackend(circuit as Parameters<typeof UltraHonkBackend>[0]);
  const noir = new Noir(circuit as Parameters<typeof Noir>[0]);

  const witnessInput = {
    secret: hexToField(inputs.secret),
    amount: inputs.amount.toString(),
    merkle_path: inputs.merklePathHex.map(hexToField),
    merkle_path_indices: inputs.merklePathIndices,
    root: hexToField(inputs.merkleRoot),
    nullifier: hexToField(inputs.nullifier),
    recipient_hash: hexToField(inputs.recipientHash),
    amount_out: inputs.amountOut.toString(),
  };

  const { witness } = await noir.execute(witnessInput);
  const { proof, publicInputs } = await backend.generateProof(witness);

  return {
    proofHex: Buffer.from(proof).toString('hex'),
    publicInputs: {
      root: inputs.merkleRoot,
      nullifier: inputs.nullifier,
      recipientHash: inputs.recipientHash,
      amountOut: inputs.amountOut,
    },
  };
}
