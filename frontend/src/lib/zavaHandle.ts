/**
 * Zava handle — the shareable identifier for receiving private payments.
 *
 * Format:  `zava:<zavaId>.<scanKey>`
 *  - `zavaId`  : sha256("zava_id_v1"   || secret)  — public identity
 *  - `scanKey` : sha256("zava_scan_v1" || secret)  — viewing key (lets sender
 *                encrypt notes for you; CANNOT withdraw — that requires secret)
 *
 * Both halves are hex-encoded (64 chars each). Total length: ~134 chars.
 *
 * Why not a username? See the design notes — usernames create metadata leaks,
 * impersonation risk, and require a centralized lookup service. Raw hex stays
 * decentralized and metadata-free at the cost of being harder to memorize
 * (which is fine — you copy/paste it or scan a QR code, never type it).
 */
export interface ZavaHandle {
  zavaId: string;  // 64-char hex
  scanKey: string; // 64-char hex
}

export function encodeZavaHandle(h: ZavaHandle): string {
  return `zava:${h.zavaId}.${h.scanKey}`;
}

/** Parse a `zava:` handle. Accepts the full prefixed form or raw `id.key`. */
export function parseZavaHandle(input: string): ZavaHandle | null {
  const trimmed = input.trim();
  const body = trimmed.startsWith('zava:') ? trimmed.slice(5) : trimmed;
  const parts = body.split('.');
  if (parts.length !== 2) return null;
  const [zavaId, scanKey] = parts;
  if (!isHex64(zavaId) || !isHex64(scanKey)) return null;
  return { zavaId, scanKey };
}

function isHex64(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}
