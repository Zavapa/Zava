import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';

const spaceGrotesk = localFont({
  src: '../../public/fonts/space-grotesk.woff2',
  variable: '--font-space-grotesk',
  weight: '300 700',
  display: 'swap',
});

const geistMono = localFont({
  src: '../../public/fonts/geist-mono.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Zava',
  description: 'Privacy-preserving savings and credit on Stellar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
