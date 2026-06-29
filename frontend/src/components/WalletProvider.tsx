'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as freighter from '@/lib/freighter';

const SECRET_STORAGE_KEY = 'zava.secret.v1';

interface WalletState {
  installed: boolean;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  displayName: string | null;
  /** 32-byte hex — NEVER shared, never in any URL. Derived deterministically
   *  from a Freighter-signed identity message so reconnecting any device
   *  produces the same value. localStorage is just a cache. */
  secret: string | null;
  /** sha256("zava_id_v1" || secret) — public payment identity. */
  zavaId: string | null;
  /** sha256("zava_scan_v1" || secret) — viewing key. Included in payment
   *  links so payers can encrypt notes; can READ incoming payments but NOT
   *  spend (spending requires `secret`). */
  scanKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setDisplayName: (name: string) => void;
}

const WalletContext = createContext<WalletState | null>(null);

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState<string | null>(null);
  const [secret, setSecret]   = useState<string | null>(null);
  const [zavaId, setZavaId]   = useState<string | null>(null);
  const [scanKey, setScanKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Derive scanKey + zavaId from the secret and update state.
   */
  const installSecret = useCallback(async (addr: string, s: string) => {
    setSecret(s);
    localStorage.setItem(`${SECRET_STORAGE_KEY}.${addr}`, s);
    const enc = new TextEncoder();
    const sBytes = hexToBytes(s);
    const idHash = await crypto.subtle.digest(
      'SHA-256',
      concat(enc.encode('zava_id_v1'), sBytes),
    );
    setZavaId(toHex(idHash));
    const scanHash = await crypto.subtle.digest(
      'SHA-256',
      concat(enc.encode('zava_scan_v1'), sBytes),
    );
    setScanKey(toHex(scanHash));
  }, []);

  /**
   * Make sure we have a secret for `addr`. Order of preference:
   *   1. Already in localStorage (fast path) — use it as cache.
   *   2. Ask Freighter to sign a deterministic identity message — derive
   *      a stable secret from the signature.
   * Step 2 prompts the user. We only do it on explicit `connect()`, never
   * on initial mount.
   */
  const ensureSecret = useCallback(
    async (addr: string, passphrase: string, allowSigningPrompt: boolean) => {
      const cached = localStorage.getItem(`${SECRET_STORAGE_KEY}.${addr}`);
      if (cached) {
        await installSecret(addr, cached);
        return;
      }
      if (!allowSigningPrompt) return; // mount path — don't pop a sign prompt
      const s = await freighter.deriveSecretFromFreighter(
        addr,
        passphrase || TESTNET_PASSPHRASE,
      );
      await installSecret(addr, s);
    },
    [installSecret],
  );

  const loadDisplayName = (addr: string) => {
    const raw = localStorage.getItem(`zava.name.v1.${addr}`);
    setDisplayNameState(raw);
  };

  // Probe on mount. If Freighter is connected but we don't have a cached
  // secret (e.g. user cleared localStorage), automatically prompt Freighter
  // once to re-derive it — this is the recovery path that lets users access
  // their vault from any device with the same wallet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    void (async () => {
      const status = await freighter.getStatus();
      setInstalled(status.installed);
      if (status.connected && status.address) {
        setAddress(status.address);
        setNetwork(status.network);
        setNetworkPassphrase(status.networkPassphrase);
        const hasCached =
          !!localStorage.getItem(`${SECRET_STORAGE_KEY}.${status.address}`);
        await ensureSecret(
          status.address,
          status.networkPassphrase ?? TESTNET_PASSPHRASE,
          /* allowSigningPrompt */ !hasCached,
        );
        loadDisplayName(status.address);
      }
    })();
  }, [ensureSecret]);

  const setDisplayName = useCallback(
    (name: string) => {
      if (!address) return;
      localStorage.setItem(`zava.name.v1.${address}`, name);
      setDisplayNameState(name);
    },
    [address],
  );

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const status = await freighter.connect();
      setInstalled(true);
      if (!status.address) {
        throw new Error('Freighter did not return an address');
      }
      setAddress(status.address);
      setNetwork(status.network);
      setNetworkPassphrase(status.networkPassphrase);
      // Autosign: prompt Freighter once on connect so the deterministic
      // secret is materialised and the user can use any device with the
      // same wallet to recover their funds.
      await ensureSecret(
        status.address,
        status.networkPassphrase ?? TESTNET_PASSPHRASE,
        true,
      );
      loadDisplayName(status.address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [ensureSecret]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setNetwork(null);
    setNetworkPassphrase(null);
    setDisplayNameState(null);
    setSecret(null);
    setZavaId(null);
    setScanKey(null);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      installed,
      address,
      network,
      networkPassphrase,
      displayName,
      secret,
      zavaId,
      scanKey,
      connecting,
      error,
      connect,
      disconnect,
      setDisplayName,
    }),
    [
      installed,
      address,
      network,
      networkPassphrase,
      displayName,
      secret,
      zavaId,
      scanKey,
      connecting,
      error,
      connect,
      disconnect,
      setDisplayName,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
