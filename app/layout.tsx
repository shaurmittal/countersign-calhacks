import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--lp-font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--lp-font-mono", display: "swap" });
// The app UI (War Room, /owner, /bank, /try): Geist for everything, Geist Mono for amounts, codes and hashes.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const sansMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Countersign War Room",
  description: "The second signer a one-person company never had.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${sans.variable} ${sansMono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
