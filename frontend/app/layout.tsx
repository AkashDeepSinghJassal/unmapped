import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "UNMAPPED — Skills Infrastructure for Youth",
  description:
    "Closing the distance between real skills and economic opportunity in LMICs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f1117] text-gray-100">
        <header className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                U
              </div>
              <span className="font-semibold text-lg tracking-tight">UNMAPPED</span>
              <span className="text-gray-500 text-sm hidden sm:block">
                Skills Infrastructure
              </span>
            </Link>
            <nav className="flex gap-6 text-sm text-gray-400">
              <Link href="/" className="hover:text-white transition-colors">
                Youth
              </Link>
              <Link href="/chat" className="hover:text-white transition-colors flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Chat
              </Link>
              <Link
                href="/dashboard"
                className="hover:text-white transition-colors"
              >
                Policymaker
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-gray-800 px-6 py-4 mt-16">
          <div className="max-w-6xl mx-auto flex flex-wrap gap-4 text-xs text-gray-600">
            <span>Data: ILOSTAT · World Bank WDI · Frey-Osborne (2013) · ESCO v1.2.1</span>
            <span className="ml-auto">Powered by AI · ESCO v1.2.1</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
