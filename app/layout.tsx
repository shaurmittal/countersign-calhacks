import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

// Every page, the /demo film included: Geist for words, Geist Mono for amounts, codes, times and hashes.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const sansMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Countersign War Room",
  description: "The second signer a one-person company never had.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${sansMono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
