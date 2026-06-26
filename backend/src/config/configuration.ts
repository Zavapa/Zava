export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'zava',
    password: process.env.DATABASE_PASSWORD ?? 'zava',
    database: process.env.DATABASE_NAME ?? 'zava',
  },
  stellar: {
    network: process.env.STELLAR_NETWORK ?? 'testnet',
    rpcUrl: process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ??
      'Test SDF Network ; September 2015',
    submitterSecret: process.env.STELLAR_SUBMITTER_SECRET ?? '',
    contracts: {
      savings: process.env.ZAVA_SAVINGS ?? '',
      honk8w: process.env.ZAVA_HONK_8W ?? '',
      honk12w: process.env.ZAVA_HONK_12W ?? '',
      honk24w: process.env.ZAVA_HONK_24W ?? '',
      verifier: process.env.ZAVA_VERIFIER ?? '',
    },
  },
  circuits: {
    root: process.env.CIRCUITS_ROOT ?? '../../contract/circuits',
    useStubProofs: (process.env.USE_STUB_PROOFS ?? 'true') === 'true',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
