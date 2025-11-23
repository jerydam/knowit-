import './globals.css';
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers"; // Import the new component
import { ReactNode } from 'react';

// --- CRITICAL FOR MINIPAY DETECTION ---
export const metadata: Metadata = {
  title: "KnowIt? - Learn & Earn on Celo",
  description: "Take quizzes, earn rewards, and mint NFTs on the Celo blockchain.",
  manifest: "/manifest.json", 
};

// --- CRITICAL FOR MOBILE UI SCALING ---
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="shortcut icon" href="/favicon.ico" />
      </head>
      <body className="bg-slate-900 text-white antialiased">
        {/* Wrap children in the Client Component we created */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}