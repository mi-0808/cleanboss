import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'クリーン番長',
  description: 'クリーンウェア検査アプリ',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
