// Thin wrapper around @stellar/freighter-api so callers don't have to know about
// the dynamic-import dance required to keep it out of the server bundle.

export interface FreighterStatus {
  installed: boolean;
  connected: boolean;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  error?: string;
}

async function api() {
  if (typeof window === 'undefined') {
    throw new Error('Freighter is only available in the browser');
  }
  return await import('@stellar/freighter-api');
}

export async function getStatus(): Promise<FreighterStatus> {
  try {
    const f = await api();
    const connected = await f.isConnected();
    if (!connected.isConnected) {
      return {
        installed: false,
        connected: false,
        address: null,
        network: null,
        networkPassphrase: null,
      };
    }
    const allowed = await f.isAllowed();
    if (!allowed.isAllowed) {
      return {
        installed: true,
        connected: false,
        address: null,
        network: null,
        networkPassphrase: null,
      };
    }
    const addr = await f.getAddress();
    const net = await f.getNetwork();
    return {
      installed: true,
      connected: !!addr.address,
      address: addr.address || null,
      network: net.network || null,
      networkPassphrase: net.networkPassphrase || null,
      error: addr.error || net.error,
    };
  } catch (err) {
    return {
      installed: false,
      connected: false,
      address: null,
      network: null,
      networkPassphrase: null,
      error: (err as Error).message,
    };
  }
}

export async function connect(): Promise<FreighterStatus> {
  const f = await api();
  const res = await f.requestAccess();
  if (res.error) throw new Error(res.error);
  const net = await f.getNetwork();
  return {
    installed: true,
    connected: !!res.address,
    address: res.address ?? null,
    network: net.network ?? null,
    networkPassphrase: net.networkPassphrase ?? null,
  };
}

export async function signTransaction(
  xdr: string,
  opts: { network: string; networkPassphrase: string; accountToSign: string },
): Promise<string> {
  const f = await api();
  const res = await f.signTransaction(xdr, {
    networkPassphrase: opts.networkPassphrase,
    address: opts.accountToSign,
  });
  if ('error' in res && res.error) throw new Error(String(res.error));
  return (res as { signedTxXdr: string }).signedTxXdr;
}

/**
 * Have Freighter sign a deterministic "identity" transaction so we can derive
 * a stable per-wallet secret without storing one in localStorage. The
 * transaction is never submitted — we only need the Ed25519 signature.
 *
 * Stellar's Ed25519 is deterministic: signing identical bytes with the same
 * key always yields the same signature. By fixing every input (sequence = 0,
 * fee = BASE_FEE, no timebounds, a constant ManageData operation) we get the
 * same signature every time → the same secret, on every device, forever.
 *
 * Returns a 32-byte hex string suitable for use as `secret` in the Zava ZK
 * pipeline (top 3 bits masked to stay below the BN254 scalar modulus).
 */
export async function deriveSecretFromFreighter(
  address: string,
  networkPassphrase: string,
): Promise<string> {
  const {
    Account,
    BASE_FEE,
    Operation,
    TransactionBuilder,
  } = await import('@stellar/stellar-sdk');

  // Synthetic source account with sequence 0 — never submitted, so it doesn't
  // need to exist on-chain.
  const synthetic = new Account(address, '0');
  const tx = new TransactionBuilder(synthetic, {
    fee: BASE_FEE,
    networkPassphrase,
    // No timebounds → identical XDR every time.
  })
    .addOperation(
      Operation.manageData({
        name: 'zava_identity',
        value: 'v1',
      }),
    )
    .setTimeout(0)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), {
    network: 'TESTNET',
    networkPassphrase,
    accountToSign: address,
  });

  // Extract the raw 64-byte Ed25519 signature from the signed envelope.
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sig = signedTx.signatures[0]?.signature();
  if (!sig || sig.length === 0) {
    throw new Error('Freighter returned no signature');
  }

  // Hash the signature into a 32-byte field-safe secret.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(sig));
  const bytes = new Uint8Array(digest);
  // Mask top 3 bits so the value stays below the BN254 scalar modulus.
  bytes[0] &= 0x1f;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
