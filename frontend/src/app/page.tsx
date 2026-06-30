import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ZavaLogo } from '@/components/ZavaLogo';

const steps = [
  {
    number: '01',
    title: 'Collect your salary privately',
    description:
      'Share your Zava wallet address with clients. They pay you in USDC on Stellar — fast, borderless, and untraceable back to you. No bank. No middleman. No one watching.',
  },
  {
    number: '02',
    title: 'Save consistently',
    description:
      'Deposit a portion of each payment into your Zava savings vault. Your money inflow and your savings outflow are both recorded privately on-chain — building your financial fingerprint over time.',
  },
  {
    number: '03',
    title: 'Prove without revealing',
    description:
      'Zava reads your inflow-to-savings ratio and generates a zero-knowledge proof of your discipline. Lenders receive a verified score — never your balances, client names, or transaction amounts.',
  },
  {
    number: '04',
    title: 'Unlock credit',
    description:
      'Present your ZK proof to any lender on the Zava network. Borrow based on demonstrated savings discipline — not collateral, not a bank statement, not a credit bureau.',
  },
];

const pillars = [
  {
    icon: '⬡',
    title: 'Private by design',
    description:
      'Zero-knowledge proofs mean lenders verify your discipline — not your data. Your income, balances, and clients stay yours alone.',
  },
  {
    icon: '◈',
    title: 'On Stellar',
    description:
      'Instant settlement, near-zero fees. Zava runs on Stellar with Soroban smart contracts — built for real-world speed and scale.',
  },
  {
    icon: '◎',
    title: 'Portable reputation',
    description:
      'Your credit score lives in your wallet. Take it to any lender on the Zava network — no gatekeepers, no institutions required.',
  },
  {
    icon: '◇',
    title: 'Built for freelancers',
    description:
      'Traditional credit ignores gig income. Zava recognises your inflow/outflow pattern as proof of real financial discipline.',
  },
];

const specs = [
  { value: '< 2s', label: 'ZK proof time' },
  { value: '0', label: 'Data exposed to lenders' },
  { value: '4', label: 'Steps to credit' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/">
            <ZavaLogo size={34} />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/faq" className="text-base text-muted hover:text-foreground transition-colors">
              FAQ
            </Link>
            <Link
              href="/lender"
              className="text-base text-muted hover:text-foreground transition-colors"
            >
              Lenders
            </Link>
            <Link href="/connect">
              <Button size="md">Launch App</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-accent text-accent-foreground pt-16">
        <div className="mx-auto max-w-6xl px-6 py-32 md:py-40">
          <div className="max-w-3xl space-y-8">
            <span className="inline-block rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium tracking-widest uppercase text-white/60">
              Stellar · Real-World ZK · Built for Freelancers
            </span>
            <h1 className="text-6xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
              Save privately.
              <br />
              Prove discipline.
              <br />
              Unlock credit.
            </h1>
            <p className="text-xl text-white/60 max-w-lg leading-relaxed">
              Collect your salary. Save a portion. Let Zava turn your inflow and outflow into a zero-knowledge credit score — without revealing a single number.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/connect">
                <Button size="lg" variant="light" className="text-base px-8">
                  Start Saving
                </Button>
              </Link>
              <Link href="/lender">
                <Button size="lg" variant="outline-light" className="text-base px-8">
                  Lender Portal
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-6">
            <dl className="grid grid-cols-3 divide-x divide-white/10">
              {specs.map((s) => (
                <div key={s.label} className="px-6 py-10 first:pl-0 last:pr-0">
                  <dd className="font-mono text-4xl font-bold tracking-tight text-white md:text-5xl">
                    {s.value}
                  </dd>
                  <dt className="mt-2 text-sm text-white/50 uppercase tracking-widest">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Salary section */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-16 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                Private payments
              </span>
              <h2 className="text-4xl font-bold tracking-tight leading-tight md:text-5xl">
                Get paid.<br />Stay invisible.
              </h2>
              <p className="text-lg text-muted leading-relaxed">
                Freelancers share their Zava wallet address with clients. Payments arrive in USDC on Stellar — instant and borderless. No bank account. No payment processor. No one can track the money back to you.
              </p>
              <p className="text-lg text-muted leading-relaxed">
                Your financial life stays yours. Zava only sees what it needs to build your credit score — and even that is hidden behind a proof.
              </p>
              <Link href="/connect">
                <Button size="lg" className="text-base">
                  Set up your wallet →
                </Button>
              </Link>
            </div>

            {/* Inflow / Outflow flow diagram */}
            <div className="space-y-4">
              {[
                {
                  label: 'Inflow',
                  tag: 'Client payments',
                  desc: 'USDC lands in your Zava wallet from any client, anywhere.',
                  color: 'border-success/40 bg-success/5',
                  dot: 'bg-success',
                },
                {
                  label: 'Outflow',
                  tag: 'Savings vault',
                  desc: 'You move a portion to savings. Zava tracks your consistency ratio privately.',
                  color: 'border-accent/30 bg-accent/5',
                  dot: 'bg-accent',
                },
                {
                  label: 'Credit score',
                  tag: 'ZK proof',
                  desc: 'Your inflow ÷ outflow pattern becomes a zero-knowledge credit proof. Lenders verify it — no data shared.',
                  color: 'border-border bg-subtle',
                  dot: 'bg-muted',
                },
              ].map((item, i) => (
                <div key={item.label}>
                  <div className={`rounded-xl border p-6 space-y-2 ${item.color}`}>
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                      <span className="text-base font-bold">{item.label}</span>
                      <span className="rounded-full bg-border px-2.5 py-0.5 text-xs font-medium text-muted">
                        {item.tag}
                      </span>
                    </div>
                    <p className="text-base text-muted leading-relaxed pl-5">{item.desc}</p>
                  </div>
                  {i < 2 && (
                    <div className="flex justify-start pl-8 py-1 text-muted text-lg font-light select-none">
                      ↓
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border bg-subtle">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            How it works
          </span>
          <div className="mt-12 grid gap-12 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className="space-y-4">
                <span className="font-mono text-base text-muted">{step.number}</span>
                <h3 className="text-2xl font-bold tracking-tight leading-snug">{step.title}</h3>
                <p className="text-base text-muted leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Zava — 4 pillars */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            Why Zava
          </span>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border border-border bg-surface p-7 space-y-4"
              >
                <span className="text-3xl">{p.icon}</span>
                <h3 className="text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="text-base text-muted leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For lenders */}
      <section className="border-b border-border bg-subtle">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-16 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                For lenders
              </span>
              <h3 className="text-4xl font-bold tracking-tight leading-tight md:text-5xl">
                Verified borrowers.<br />Zero data risk.
              </h3>
              <p className="text-lg text-muted leading-relaxed">
                Access a pool of borrowers who have cryptographically proven their savings discipline using real inflow and outflow data. No KYC friction. No raw financial data. Just a score you can trust.
              </p>
              <Link href="/lender">
                <Button variant="secondary" size="lg" className="text-base">
                  Open Lender Portal →
                </Button>
              </Link>
            </div>
            <div className="grid gap-4">
              {[
                {
                  label: 'Proof verified on-chain',
                  sub: 'Every credit score is backed by a ZK proof anchored to Stellar — tamper-proof and instant to verify.',
                },
                {
                  label: 'No raw data exposure',
                  sub: "You receive a verified score, never the borrower's balance history, salary amounts, or client names.",
                },
                {
                  label: 'Inflow/outflow scoring',
                  sub: "The credit score reflects a freelancer's real earning and saving behaviour — not a self-reported figure.",
                },
                {
                  label: 'Instant settlement',
                  sub: 'Loan disbursements and repayments settle in seconds on Stellar with near-zero fees.',
                },
              ].map((item) => (
                <div key={item.label} className="flex gap-4 rounded-xl border border-border bg-surface p-6">
                  <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                  <div>
                    <p className="text-base font-semibold">{item.label}</p>
                    <p className="mt-1.5 text-base text-muted leading-relaxed">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built with */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
              Built with
            </p>
            <div className="flex flex-wrap items-center gap-10">
              {['Stellar', 'Soroban', 'Noir ZK', 'Freighter', 'USDC'].map((tech) => (
                <span key={tech} className="text-base font-semibold text-muted/60">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-accent text-accent-foreground">
        <div className="mx-auto max-w-6xl px-6 py-28 text-center space-y-8">
          <h2 className="text-5xl font-bold tracking-tight md:text-6xl">
            Ready to unlock credit?
          </h2>
          <p className="text-xl text-white/60 max-w-md mx-auto leading-relaxed">
            Start collecting your salary privately today. Build your ZK credit score. Borrow on your terms.
          </p>
          <Link href="/connect">
            <Button size="lg" variant="light" className="text-base px-10 mt-2">
              Get Started
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <ZavaLogo size={22} />
            <span>© 2025 · Stellar Testnet</span>
          </div>
          <div className="flex gap-6">
            <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
            <Link href="/lender" className="hover:text-foreground transition-colors">Lender Portal</Link>
            <Link href="/connect" className="hover:text-foreground transition-colors">Launch App</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
