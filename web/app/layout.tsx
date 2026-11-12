import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "./veil.css";

const sans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Veil — private RWA prime account on Injective",
  description:
    "Prove you are allowed to hold real-world assets without revealing who you are. A bounded AI agent hedges the book through the weekend. Testnet demo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        {children}
        <Toaster theme="light" position="bottom-right" closeButton />
        {/* Self-hosted, cookie-free analytics. Only counts visits on the production domain. */}
        <Script defer src="https://stats.veilrwa.xyz/script.js" data-website-id="3db86cbb-6ecf-48b0-956c-bdf2aec40693" data-domains="veilrwa.xyz,www.veilrwa.xyz" strategy="afterInteractive" />
      </body>
    </html>
  );
}
