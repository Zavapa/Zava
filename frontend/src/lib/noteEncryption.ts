// Encrypts and decrypts vault deposit notes using AES-GCM.
// Key = SHA-256("zava_note_v1" || secret_hex) — derived from user's secret.
// Only the holder of `secret` can decrypt their incoming notes.
//
// Notes are PADDED to a fixed 512-byte plaintext before encryption so that
// the resulting ciphertext is always the same length. This stops on-chain
// observers from inferring memo length (or any other field's variance) from
// the encrypted-note size — similar to Zcash's fixed-size memo design.

export interface VaultNote {
  amount: number;    // stroops
  nonce: string;     // hex 64 chars — used to derive the commitment
  week: number;
  asset: string;
  /** Private memo from the sender — encrypted, never on-chain in plaintext. */
  memo?: string;
}

/** Plaintext size after padding. Must be larger than the biggest realistic note. */
const PADDED_PLAINTEXT_BYTES = 512;
/** Maximum memo length (UTF-8 bytes). Leaves ~256 bytes for the other fields. */
export const MAX_MEMO_BYTES = 256;

async function deriveNoteKey(secretHex: string): Promise<CryptoKey> {
  const prefix = new TextEncoder().encode('zava_note_v1');
  const secretBytes = hexToBytes(secretHex);
  const material = new Uint8Array(new ArrayBuffer(prefix.length + secretBytes.length));
  material.set(prefix);
  material.set(secretBytes, prefix.length);
  const raw = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Pad plaintext to a fixed size using a 0x00 sentinel + zero-fill. */
function padNote(jsonBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (jsonBytes.length + 1 > PADDED_PLAINTEXT_BYTES) {
    throw new Error(`Note plaintext too large (${jsonBytes.length} > ${PADDED_PLAINTEXT_BYTES - 1})`);
  }
  const out = new Uint8Array(new ArrayBuffer(PADDED_PLAINTEXT_BYTES));
  out.set(jsonBytes);
  out[jsonBytes.length] = 0x00; // explicit terminator
  return out; // rest of buffer is already zero-filled
}

/** Strip trailing zero-pad and return the JSON prefix. */
function unpadNote(padded: Uint8Array): string {
  let end = padded.indexOf(0x00);
  if (end === -1) end = padded.length;
  return new TextDecoder().decode(padded.subarray(0, end));
}

export async function encryptNote(note: VaultNote, secretHex: string): Promise<string> {
  // Enforce memo size before encrypting so users get a clean error instead of
  // a confusing "Note plaintext too large".
  if (note.memo !== undefined) {
    const memoBytes = new TextEncoder().encode(note.memo);
    if (memoBytes.length > MAX_MEMO_BYTES) {
      throw new Error(`Memo too long: ${memoBytes.length} bytes (max ${MAX_MEMO_BYTES})`);
    }
  }
  const key = await deriveNoteKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const jsonBytes = new TextEncoder().encode(JSON.stringify(note));
  const plaintext = padNote(jsonBytes);
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
    const padded = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
    );
    const json = unpadNote(padded);
    return JSON.parse(json) as VaultNote;
  } catch {
    return null; // not our note
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
