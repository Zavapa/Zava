# Zava — local setup

A minimal step-by-step to run the borrower flow end-to-end against Stellar testnet.

## 1. Postgres

```bash
docker compose up -d postgres
```

This starts Postgres on `localhost:5432` with `zava / zava / zava` (user / password / db). Data persists in a named volume.

## 2. Backend (NestJS, port 4000)

```bash
cd backend
cp .env.example .env
# Optional: paste STELLAR_SUBMITTER_SECRET if you want server-signed deposit/verify txs.
# Generate one with: stellar keys generate --network testnet --fund
pnpm install
pnpm start:dev
```

API lands at `http://localhost:4000/api`. Health check: `curl http://localhost:4000/api/health`.

### What the backend does

- `users` — wallet registration and lookup (Postgres).
- `savings` — reads commitments + count from the deployed savings contract; writes deposits when a submitter is configured.
- `proofs` — runs `nargo execute` + `bb prove` against `../contract/circuits/zava_{N}w` if `USE_STUB_PROOFS=false`. Otherwise returns a deterministic stub (the on-chain Honk verifier is still a structural stub, so stubs are accepted).
- `credit` — submits proofs to the verifier contract and reads back credit records.

## 3. Frontend (Next.js 16, port 3000)

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## 4. Demo flow

1. Land → create a demo wallet (locally generated, not funded).
2. Dashboard → see ledger-wide commitments.
3. Deposit → enter amount + week, sign locally, backend submits to the savings contract.
4. Credit → pick 8 / 12 / 24-week tier, backend generates a proof, submits to the verifier, you get a `CreditRecord` back.

## Notes

- The Honk verifier on-chain is currently a structural stub (see `contract/README.md`). The end-to-end flow works; real UltraHonk verification needs soroban-sdk 22+ and a ported verifier.
- Without `STELLAR_SUBMITTER_SECRET`, write operations return an error. Reads (commitments, count, credit tier) still work.
- `USE_STUB_PROOFS=true` is the default so the demo runs without `nargo` and `bb` installed.
