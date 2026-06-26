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
  secret: string | null;  // 32-byte hex — NEVER shared, never in any URL
  zavaId: string | null;  // sha256("zava_id_v1"   || secret) — public payment identity
  scanKey: string | null; // sha256("zava_scan_v1" || secret) — included in payment links so payer can encrypt notes; lets holder READ but NOT SPEND
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setDisplayName: (name: string) => void;
}

const WalletContext = createContext<WalletState | null>(null);

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

  // Probe on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    void (async () => {
      const status = await freighter.getStatus();
      setInstalled(status.installed);
      if (status.connected && status.address) {
        setAddress(status.address);
        setNetwork(status.network);
        setNetworkPassphrase(status.networkPassphrase);
        loadLocalSecret(status.address);
        loadDisplayName(status.address);
      }
    })();
  }, []);

  const loadLocalSecret = (addr: string) => {
    const raw = localStorage.getItem(`${SECRET_STORAGE_KEY}.${addr}`);
    const s = raw ?? generateHexSecret();
    if (!raw) localStorage.setItem(`${SECRET_STORAGE_KEY}.${addr}`, s);
    setSecret(s);
    const enc = new TextEncoder();
    const sBytes = hexToBytes(s);
    // zavaId  = sha256("zava_id_v1"   || secret) — public identity, safe to share
    void crypto.subtle.digest('SHA-256', concat(enc.encode('zava_id_v1'), sBytes))
      .then((h) => setZavaId(toHex(h)));
    // scanKey = sha256("zava_scan_v1" || secret) — viewing key only, goes in payment link
    // Knowing scanKey lets you see incoming payments but CANNOT withdraw (need secret for that)
    void crypto.subtle.digest('SHA-256', concat(enc.encode('zava_scan_v1'), sBytes))
      .then((h) => setScanKey(toHex(h)));
  };

  const loadDisplayName = (addr: string) => {
    const raw = localStorage.getItem(`zava.name.v1.${addr}`);
    setDisplayNameState(raw);
  };

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
      loadLocalSecret(status.address);
      loadDisplayName(status.address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

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

function generateHexSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
