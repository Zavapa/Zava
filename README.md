# Zava 🔐

## ZK-Powered Savings & Credit for Freelancers on Stellar

> Save privately. Prove your discipline. Unlock credit. No bank required.

---

## The Problem

Over 500 million people in Africa have no credit score.

Not because they're poor savers. Not because they're unreliable. But because the systems that measure financial trustworthiness were never built for them.

A Nigerian developer earning $3,000/month from international clients cannot walk into a bank and get a $500 equipment loan. Why? No salary slip. No credit history. No trust signal the bank recognizes.

Meanwhile, their entire financial life is on-chain — every payment received, every saving made — completely visible to the world on a public ledger. The very transparency that makes blockchain powerful also makes it a privacy nightmare.

The cruel irony: their financial data exists. Banks just won't look at it. And if banks did look at it, freelancers would lose all privacy.

**Zava solves both problems at once.**

---

## The Solution

Zava is a ZK-powered savings and credit reputation system built on Stellar — and the credit layer sits on top of Zava, the borderless payment infrastructure for freelancers.

Here's how the full ecosystem works together:

```
CLIENT PAYS FREELANCER VIA ZAVA
  └─ Instant Stellar payment or escrow release
  └─ Settled in USDC in seconds

           ↓

ZAVA AUTO-SAVES A PORTION
  └─ e.g. 10% of every payment → Zava savings contract
  └─ Each deposit recorded as a ZK commitment (amount hidden on-chain)

           ↓

SAVINGS REPUTATION BUILDS OVER TIME
  └─ 8 weeks  → Medium credit tier
  └─ 12 weeks → Low risk tier
  └─ 24 weeks → Very Low risk tier

           ↓

FREELANCER GENERATES A ZK PROOF
  Proves: "Saved ≥ $40/week, zero missed weeks, 12 consecutive weeks"
  Hides:  Balance, total amount, wallet address, income source, clients

           ↓

PROOF VERIFIED ON SOROBAN

           ↓

LENDER SEES:
  ✅ Consistent saver | Risk: LOW | Eligible: up to $500 USDC

           ↓

LOAN DISBURSED — repaid from future Zava payments
  └─ No paperwork. No identity exposure. No bank required.
```

**Zava is where you get paid. Zava Credit is what your payment history earns you.**

---

## How It Works

### 1. Receive Payment via Zava

Clients pay freelancers directly on Stellar through Zava — via instant transfer or milestone-based escrow. Payments settle in USDC in 3–5 seconds, globally, for fractions of a cent. No bank account required. No intermediary.

### 2. Auto-Save a Portion

When a Zava payment lands, the user sets a savings rule — e.g. "save 10% of every payment automatically." That portion flows into the Zava savings contract on Soroban.

Each deposit is recorded as a cryptographic commitment — a hash of the amount and a private secret known only to the user. The actual amount is never stored on-chain.

### 3. Build a Savings Reputation

Over weeks and months, users accumulate a chain of commitments. The contract tracks:

- How many consecutive periods had a deposit
- Whether each commitment matches the user's claimed behavior
- A nullifier per deposit (preventing double-counting or replay attacks)

### 4. Generate a ZK Proof

When ready to apply for credit, the user runs the Zava Noir circuit locally in their browser. The circuit takes their private savings data as input and outputs a proof that answers only these questions:

| Question                                 | Answer in Proof   |
| ---------------------------------------- | ----------------- |
| Did you save at least $X per period?     | ✅ Yes / ❌ No    |
| Did you save consistently for N periods? | ✅ Yes / ❌ No    |
| Did you ever miss a contribution?        | ✅ Never / ❌ Yes |
| How much do you have saved total?        | 🔒 Hidden         |
| What is your wallet address?             | 🔒 Hidden         |
| Who do you work for?                     | 🔒 Hidden         |
| What was your income?                    | 🔒 Hidden         |

### 5. Unlock Credit

The ZK proof is submitted to a Soroban verifier contract. If valid, it emits a verified credit signal — a Stellar event that any lending protocol can consume. The lender never interacts with the user's wallet directly. They only see the proof result.

| Proven Savings Behavior              | Risk Tier | Max Loan (Example) |
| ------------------------------------ | --------- | ------------------ |
| 8 consecutive weeks @ min threshold  | Medium    | 2× monthly savings |
| 12 consecutive weeks @ min threshold | Low       | 4× monthly savings |
| 24 consecutive weeks @ min threshold | Very Low  | 6× monthly savings |

### 6. Repay From Future Payments

Loan repayments are deducted automatically from future Zava payments as they land. The cycle continues — more payments, more savings, higher credit tier, larger loans.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│               ZAVA CREDIT FRONTEND               │
│  React + Stellar Wallets SDK                     │
│  - Savings dashboard                             │
│  - Proof generation (Noir WASM in browser)       │
│  - Credit application UI                         │
└────────────────────┬────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌─────────────────┐   ┌────────────────────────┐
│  SAVINGS        │   │  VERIFIER              │
│  CONTRACT       │   │  CONTRACT              │
│  (Soroban)      │   │  (Soroban)             │
│                 │   │                        │
│  - deposit()    │   │  - verify_proof()      │
│  - commitments  │   │  - nullifier set       │
│  - merkle root  │   │  - emit credit signal  │
└─────────────────┘   └────────────────────────┘
          │                     │
          └──────────┬──────────┘
                     ▼
          ┌─────────────────────┐
          │   NOIR ZK CIRCUIT   │
          │                     │
          │  Private inputs:    │
          │  - secret           │
          │  - weekly amounts   │
          │  - timestamps       │
          │                     │
          │  Public outputs:    │
          │  - consistency ✅   │
          │  - min met ✅       │
          │  - nullifiers       │
          └─────────────────────┘
```

---

## ZK Circuit Details

The core Zava circuit is written in Noir and proves the following statement:

> _"I have made at least N deposits, each meeting a minimum threshold, with no gap exceeding 8 days between consecutive deposits — and I know the secret behind each on-chain commitment."_

**Private inputs** (never leave the user's device):

- `secret` — user's private key for commitment generation
- `weekly_amounts[12]` — actual deposit amounts per period
- `deposit_timestamps[12]` — when each deposit was made

**Public inputs** (shared with lender and on-chain verifier):

- `min_weekly_amount` — the threshold being claimed (e.g. $40)
- `consistency_weeks` — number of periods claimed (e.g. 12)
- `commitment_root` — Merkle root of on-chain commitments
- `nullifiers[12]` — spent nullifiers (prevent replay)

**What the circuit checks:**

1. Every `weekly_amount[i] >= min_weekly_amount`
2. Every `timestamp[i] - timestamp[i-1] <= 8 days` (no missed weeks)
3. Every commitment `hash(secret, amount[i]) == on_chain_commitment[i]`
4. Nullifiers are correctly derived and unique

If all checks pass, the proof is generated. The Soroban verifier accepts it and the credit signal is emitted.

---

## Smart Contracts

### `savings_contract.rs` (Soroban)

| Function                         | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `deposit(commitment, nullifier)` | Record a new savings commitment               |
| `get_merkle_root()`              | Return current Merkle root of all commitments |
| `is_nullifier_spent(n)`          | Check replay protection                       |

### `verifier_contract.rs` (Soroban)

| Function                             | Description                      |
| ------------------------------------ | -------------------------------- |
| `verify_proof(proof, public_inputs)` | Verify Noir proof on-chain       |
| `get_credit_tier(wallet)`            | Return verified credit tier      |
| `emit_credit_signal(tier)`           | Emit event for lending protocols |

---

## Tech Stack

| Layer              | Technology                   |
| ------------------ | ---------------------------- |
| ZK Proofs          | Noir (Aztec)                 |
| Smart Contracts    | Soroban (Rust)               |
| Blockchain         | Stellar Testnet              |
| Frontend           | React + TypeScript (Next.js) |
| Backend            | NestJS                       |
| Wallet Integration | Stellar Wallets SDK          |
| Proof Generation   | Noir WASM (in-browser)       |
| Stablecoin         | USDC on Stellar              |

---

## Why Zero-Knowledge? Why Not Just Encrypt It?

Encryption hides data from observers but doesn't prove anything to a verifier. A bank would still need to decrypt your data to trust it — which means they'd see everything, and you're back to square one.

ZK proofs are fundamentally different. They let you prove a statement is true without revealing the underlying data. The lender doesn't decrypt anything. They verify a mathematical proof. The proof either checks out or it doesn't. No raw data ever changes hands.

This is the only technology that solves the credit problem for underbanked users without creating a new surveillance problem.

---

## Why Stellar?

- **Ultra-low fees** — savings deposits cost fractions of a cent, making micro-savings viable
- **USDC native** — savings and loans denominated in a stable asset
- **Soroban** — expressive enough to verify ZK proofs on-chain with the Groth16 verifier
- **Speed** — 3–5 second finality means proof verification and loan disbursement happen in one flow
- **Global reach** — Stellar's existing corridors cover Nigeria, Kenya, Philippines, and every major remittance market

---

## Real-World Impact

### The User

- **Who:** Freelancer, remote worker, or gig worker in an emerging market
- **Earns:** $500–$5,000/month in irregular income from international clients
- **Problem:** Cannot access credit despite earning reliably — no salary slip, no credit bureau, no bank relationship
- **Solution:** Gets paid via Zava → auto-saves a portion → proves savings discipline with ZK → unlocks credit with zero identity exposure

### A Day in the Life

Ibrahim is a developer in Lagos. He finishes a $1,200 milestone for a client in Germany. The payment lands in his Stellar wallet via Zava in 4 seconds. $120 (10%) auto-saves into his Zava contract.

After 12 weeks of consistent saving, he needs $300 to buy a new laptop for his next project. He opens Zava, generates a ZK proof in his browser, and submits it. The Soroban verifier confirms his savings discipline. A lending protocol sees: **Low risk. Eligible for up to $480.**

Loan disbursed in the same session. No bank. No paperwork. No one saw his balance, his clients, or his income. Just a proof that he saves reliably.

He repays over 8 weeks, automatically deducted from future Zava payments.

**Target markets:** Nigeria, Kenya, Ghana, Philippines, Indonesia, Pakistan — countries with large freelancer populations, weak credit infrastructure, and active Stellar usage.

---

## Getting Started

### Prerequisites

```
node >= 18
rust >= 1.70
stellar-cli
nargo (Noir CLI)
```

### Installation

```bash
# Clone the repo
git clone https://github.com/Zavapa/Zava.git
cd zava

# Install frontend dependencies
cd frontend && npm install

# Install Noir circuit dependencies
cd ../circuits && nargo check

# Build Soroban contracts
cd ../contracts && cargo build --target wasm32-unknown-unknown --release
```

### Run Locally

```bash
# Start frontend
cd frontend && npm run dev

# Deploy contracts to Stellar testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/savings_contract.wasm \
  --network testnet

# Compile ZK circuit
cd circuits && nargo compile && nargo codegen-verifier
```

### Run Tests

```bash
# Test ZK circuit
cd circuits && nargo test

# Test Soroban contracts
cd contracts && cargo test
```

---

## Project Structure

```
zava/
├── circuits/
│   ├── src/
│   │   └── main.nr          # Noir ZK circuit
│   └── Nargo.toml
├── contracts/
│   ├── savings/
│   │   └── src/lib.rs       # Savings deposit contract
│   └── verifier/
│       └── src/lib.rs       # ZK proof verifier contract
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── SavingsDashboard.tsx
│   │   │   ├── ProofGenerator.tsx
│   │   │   └── CreditApplication.tsx
│   │   └── hooks/
│   │       ├── useSavingsContract.ts
│   │       └── useNoirProof.ts
│   └── package.json
├── backend/                 # NestJS backend
│   └── src/
└── README.md
```

---

## Roadmap

### Hackathon MVP (June 2026)

- [x] Noir savings consistency circuit
- [x] Soroban savings deposit contract
- [x] Soroban ZK proof verifier
- [x] Frontend savings dashboard
- [x] In-browser proof generation
- [x] Mock lender credit decision UI

### Post-Hackathon

- [ ] Real lending protocol integration (DeFi on Stellar)
- [ ] Multi-period proof aggregation (prove 24 months in one proof)
- [ ] Mobile-first UI for feature phone markets
- [ ] Integration with Zava's existing payment infrastructure
- [ ] Pilot with freelancer communities in Nigeria and Kenya

---

## Team

Built by **Lawrence** — independent builder working at the intersection of Web3, payments, and financial inclusion for underserved communities in Africa.

Part of the **Zava ecosystem** — borderless payment infrastructure for freelancers and gig workers on Stellar.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- [Stellar Development Foundation](https://stellar.org) for Soroban and the ZK hackathon
- [Aztec / Noir](https://noir-lang.org) for making ZK circuits accessible
- The millions of African freelancers this is built for

---

_Built for Stellar Hacks: Real-World ZK — June 2026_
