import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/sidebar';
import Navbar from '@/components/navbar';
import AuthGate from '@/providers/AuthGate';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Engramma Dashboard',
  description: 'Memory analytics and monitoring dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-stone-300`}
        suppressHydrationWarning
      >
        <AuthGate>
          <Sidebar />
          <Navbar />
          <main className="mt-20 p-4 pb-28 min-h-[calc(100vh-5rem)] transition-all duration-300">
            {children}
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
