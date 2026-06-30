'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ZavaLogo } from '@/components/ZavaLogo';

interface FAQ {
  q: string;
  a: string | string[];
}

interface Category {
  title: string;
  icon: string;
  items: FAQ[];
}

const categories: Category[] = [
  {
    title: 'Getting Started',
    icon: '◎',
    items: [
      {
        q: 'What is Zava?',
        a: 'Zava is a privacy-preserving savings and credit reputation system built for freelancers on Stellar. It lets you collect your salary, save consistently, and build a verifiable credit score — all without exposing your financial data to anyone.',
      },
      {
        q: 'Who is Zava built for?',
        a: 'Zava is designed for freelancers, gig workers, and independent contractors — people who earn irregular income and are often ignored or underserved by traditional credit systems. If you get paid project-by-project and want access to credit without a bank, Zava is for you.',
      },
      {
        q: 'How do I get started?',
        a: [
          '1. Install the Freighter browser extension (freighter.app).',
          '2. Fund your Freighter wallet with USDC on Stellar Testnet.',
          '3. Connect to Zava and set your display name.',
          '4. Start depositing into your savings vault and building your credit score.',
        ],
      },
      {
        q: 'Is Zava free to use?',
        a: 'Yes. Zava is free to use. Stellar transactions cost a tiny fraction of a cent in XLM (the network fee), but there is no Zava platform fee on top of that.',
      },
      {
        q: 'Is Zava on mainnet?',
        a: 'Zava is currently deployed on Stellar Testnet. This means you can use it with test USDC at no real cost. A mainnet launch is planned after the testnet phase is complete.',
      },
    ],
  },
  {
    title: 'Privacy & Security',
    icon: '⬡',
    items: [
      {
        q: 'What is a zero-knowledge proof?',
        a: 'A zero-knowledge proof (ZK proof) is a cryptographic method that lets you prove something is true without revealing the underlying data. On Zava, it means you can prove "I have saved consistently for 3 months" to a lender — without showing your balance, your income amounts, or who paid you.',
      },
      {
        q: 'Can anyone see my balance or savings history?',
        a: 'No. Your balance and savings history are private. What gets shared with lenders is only a cryptographic proof — a mathematical statement that your savings behaviour meets a threshold. The proof reveals nothing about the actual numbers.',
      },
      {
        q: 'Can Zava see my income or who my clients are?',
        a: 'No. Zava only sees on-chain activity — deposits into your vault and withdrawals. It does not know who paid you, how many clients you have, or what your work involves. Payments that arrive in your Stellar wallet before you deposit are completely outside Zava\'s view.',
      },
      {
        q: 'Is my salary private when clients pay me?',
        a: 'On Stellar, all transactions are publicly recorded on the blockchain — but they are pseudonymous. Your Stellar wallet address is not linked to your real identity unless you choose to reveal it. Clients pay your wallet address, not your name, and no central party ties that address back to you.',
      },
      {
        q: 'What happens if I lose access to my wallet?',
        a: 'Your Freighter wallet is protected by a 12-word recovery phrase. If you lose access to your device, you can restore your wallet using that phrase. Zava does not hold your keys — your funds are fully self-custodied.',
      },
    ],
  },
  {
    title: 'Salary Collection',
    icon: '◈',
    items: [
      {
        q: 'How do I receive my salary through Zava?',
        a: 'Share your Stellar wallet address with your client. They send USDC to that address on Stellar — it arrives in your Freighter wallet within seconds. You then decide how much to deposit into your Zava savings vault.',
      },
      {
        q: 'Does my client need to use Zava?',
        a: 'No. Your client just needs to be able to send USDC on Stellar. They do not need a Zava account. Any Stellar wallet or exchange that supports USDC can pay you.',
      },
      {
        q: 'What currency does Zava use?',
        a: 'Zava uses USDC — a dollar-pegged stablecoin on Stellar. 1 USDC is always worth $1 USD, so you don\'t have to worry about price volatility when saving or getting paid.',
      },
      {
        q: 'Can I receive payments from clients in other countries?',
        a: 'Yes. Stellar is a global network. Your clients can pay you from anywhere in the world, instantly, with near-zero fees — regardless of borders or banking systems.',
      },
    ],
  },
  {
    title: 'Savings & Credit Score',
    icon: '◇',
    items: [
      {
        q: 'How does Zava calculate my credit score?',
        a: 'Your credit score is based on your inflow-to-savings ratio over time. Inflow is money arriving in your wallet (your salary). Outflow to savings is money you deposit into your vault. The more consistently you save a meaningful portion of what you earn, the higher your score.',
      },
      {
        q: 'What is the inflow/outflow ratio?',
        a: 'The inflow/outflow ratio compares what you receive (inflow) with what you save (outflow to vault). For example, if you receive 1,000 USDC and save 200 USDC, your ratio is 20%. A consistent ratio over many months signals strong financial discipline — and that\'s what builds your credit score.',
      },
      {
        q: 'How long does it take to build a credit score?',
        a: 'You start building your score immediately with your first deposit. A meaningful score typically takes 1–3 months of consistent saving to develop. The longer your history, the more reliable and higher your score can become.',
      },
      {
        q: 'Can I withdraw my savings at any time?',
        a: 'Yes. Your savings are never locked. You can withdraw at any time. However, withdrawals will affect your savings history and may lower your credit score, so plan withdrawals carefully.',
      },
      {
        q: 'What happens to my credit score if I miss a month?',
        a: 'Gaps in saving will lower your score over time. Zava rewards consistency — regular deposits, even small ones, are better for your score than large one-time deposits with long gaps.',
      },
    ],
  },
  {
    title: 'For Lenders',
    icon: '◉',
    items: [
      {
        q: 'How does Zava work for lenders?',
        a: 'Lenders access the Zava Lender Portal and use a borrower\'s ZK credit token to view their verified credit score. The score is backed by an on-chain proof — no raw financial data, no KYC friction. Lenders see a score and tier (e.g. Excellent, Good, Fair) and make their own lending decision.',
      },
      {
        q: 'What data does a lender see about a borrower?',
        a: 'Lenders see a credit score, a tier label, and a summary of savings behaviour (e.g. number of deposits, consistency streak). They do not see the borrower\'s balance, salary amounts, client names, or transaction history.',
      },
      {
        q: 'How do I verify a borrower\'s score?',
        a: 'The borrower shares a unique credit token with you. Paste it into the Lender Portal — Zava verifies the ZK proof on-chain and returns the credit score. The verification is cryptographic, so it cannot be faked.',
      },
      {
        q: 'What happens if a borrower defaults?',
        a: 'Zava provides credit scores, not loan management. Lenders are responsible for their own loan agreements, repayment enforcement, and risk management. Defaulting will damage the borrower\'s on-chain savings record and therefore their future Zava credit score.',
      },
    ],
  },
  {
    title: 'Stellar & Technical',
    icon: '⬢',
    items: [
      {
        q: 'What is Stellar?',
        a: 'Stellar is an open-source blockchain network designed for fast, low-cost financial transactions. It settles transactions in 3–5 seconds with fees under $0.001. Zava runs on Stellar because it\'s purpose-built for real-world financial use cases.',
      },
      {
        q: 'What is Soroban?',
        a: 'Soroban is Stellar\'s smart contract platform. Zava\'s savings vault and credit scoring logic run as Soroban smart contracts — self-executing code on the blockchain that no single party controls.',
      },
      {
        q: 'What is Freighter?',
        a: 'Freighter is the official Stellar browser wallet extension — similar to MetaMask but for Stellar. It lets you manage your wallet, sign transactions, and connect to apps like Zava. Your private keys never leave the extension.',
      },
      {
        q: 'What ZK technology does Zava use?',
        a: 'Zava uses Noir — a domain-specific language for writing zero-knowledge circuits — compiled with Barretenberg (the Aztec Protocol ZK backend). Proofs are generated in the browser using your local device, so your data never leaves your machine during proof generation.',
      },
      {
        q: 'Is Zava open source?',
        a: 'Zava is built as part of the Stellar Hacks hackathon. The contracts and frontend code are open source — you can audit exactly how the credit score is calculated and how proofs are generated.',
      },
    ],
  },
];

function AccordionItem({ faq, isOpen, onToggle }: { faq: FAQ; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-6 py-6 text-left transition-colors hover:text-foreground"
      >
        <span className="text-lg font-semibold leading-snug">{faq.q}</span>
        <span className="mt-0.5 shrink-0 text-xl text-muted transition-transform duration-200" style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
          +
        </span>
      </button>
      {isOpen && (
        <div className="pb-6">
          {Array.isArray(faq.a) ? (
            <ul className="space-y-2">
              {faq.a.map((line, i) => (
                <li key={i} className="text-base text-muted leading-relaxed">{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-muted leading-relaxed">{faq.a}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  function toggle(key: string) {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Nav */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/">
            <ZavaLogo size={34} />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-base text-muted hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/connect">
              <Button size="md">Launch App</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border bg-subtle">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="max-w-2xl space-y-4">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
              Help & FAQ
            </span>
            <h1 className="text-5xl font-bold tracking-tight leading-tight md:text-6xl">
              Frequently asked questions
            </h1>
            <p className="text-lg text-muted leading-relaxed">
              Everything you need to know about Zava — from getting your first payment to understanding how your ZK credit score works.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Body */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-16 lg:grid-cols-[280px_1fr]">

          {/* Sticky category nav */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-muted">
                Categories
              </p>
              {categories.map((cat) => (
                <a
                  key={cat.title}
                  href={`#${cat.title.toLowerCase().replace(/\s+/g, '-')}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-base text-muted transition-colors hover:bg-subtle hover:text-foreground"
                >
                  <span className="text-sm">{cat.icon}</span>
                  {cat.title}
                </a>
              ))}
            </div>
          </aside>

          {/* Questions */}
          <div className="space-y-14">
            {categories.map((cat) => (
              <div key={cat.title} id={cat.title.toLowerCase().replace(/\s+/g, '-')}>
                <div className="mb-8 flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <h2 className="text-2xl font-bold tracking-tight">{cat.title}</h2>
                </div>
                <div className="rounded-xl border border-border bg-surface px-6">
                  {cat.items.map((faq, i) => {
                    const key = `${cat.title}-${i}`;
                    return (
                      <AccordionItem
                        key={key}
                        faq={faq}
                        isOpen={!!openItems[key]}
                        onToggle={() => toggle(key)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still have questions CTA */}
      <section className="border-t border-border bg-subtle">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center space-y-5">
          <h2 className="text-3xl font-bold tracking-tight">Still have questions?</h2>
          <p className="text-base text-muted max-w-sm mx-auto leading-relaxed">
            Try the app on Stellar Testnet — it's free and takes less than a minute to get started.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/connect">
              <Button size="lg">Get Started Free</Button>
            </Link>
            <Link href="/lender">
              <Button variant="secondary" size="lg">Lender Portal</Button>
            </Link>
          </div>
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
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/lender" className="hover:text-foreground transition-colors">Lender Portal</Link>
            <Link href="/connect" className="hover:text-foreground transition-colors">Launch App</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
