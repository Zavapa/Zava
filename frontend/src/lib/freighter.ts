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
