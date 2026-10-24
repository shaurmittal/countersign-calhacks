import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--lp-font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--lp-font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Countersign War Room",
  description: "The second signer a one-person company never had.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
