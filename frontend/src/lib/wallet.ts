// Demo-only mock wallet. Generates a Stellar-formatted address and a 32-byte
// secret used to derive commitments/nullifiers. Replace with Freighter / Stellar
// Wallets SDK integration for production.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateMockWallet(): { wallet: string; secret: string } {
  const wallet = `G${randomBase32(55)}`;
  const secret = randomHex(32);
  return { wallet, secret };
}
