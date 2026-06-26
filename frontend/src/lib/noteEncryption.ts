// Encrypts and decrypts vault deposit notes using AES-GCM.
// Key = SHA-256("zava_note_v1" || secret_hex) — derived from user's secret.
// Only the holder of `secret` can decrypt their incoming notes.

export interface VaultNote {
  amount: number;    // stroops
  nonce: string;     // hex 64 chars — used to derive the commitment
  week: number;
  asset: string;
}

async function deriveNoteKey(secretHex: string): Promise<CryptoKey> {
  const prefix = new TextEncoder().encode('zava_note_v1');
  const secretBytes = hexToBytes(secretHex);
  const material = new Uint8Array(prefix.length + secretBytes.length);
  material.set(prefix);
  material.set(secretBytes, prefix.length);
  const raw = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptNote(note: VaultNote, secretHex: string): Promise<string> {
  const key = await deriveNoteKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  // Prepend IV to ciphertext, encode as hex
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToHex(combined);
}

export async function decryptNote(
  encryptedHex: string,
  secretHex: string,
): Promise<VaultNote | null> {
  try {
    const key = await deriveNoteKey(secretHex);
    const combined = hexToBytes(encryptedHex);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as VaultNote;
  } catch {
    return null; // not our note
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
