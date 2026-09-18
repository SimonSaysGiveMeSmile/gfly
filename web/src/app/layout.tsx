import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// Two faces: a soft, slightly wonky serif for what the site says, a plain
// grotesk for what it measures. Both self-hosted at build time.
const display = Fraunces({ subsets: ["latin"], axes: ["SOFT", "WONK", "opsz"], variable: "--font-display", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://gfly.site"),
  title: { default: "GFly — a real fly brain, running in your browser", template: "%s — GFly" },
  description:
    "The complete fruit fly connectome from Janelia and Google, simulated live in a browser tab. 164,740 neurons, no server.",
  openGraph: {
    title: "GFly",
    description: "164,740 real neurons. Running in your browser.",
    url: "https://gfly.site", siteName: "GFly", type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} lg:h-full lg:overflow-hidden`}>
      <body className="flex min-h-full flex-col lg:h-full lg:overflow-hidden">
        <div className="wash" aria-hidden />
        <SiteHeader />
        <main className="flex-1 lg:overflow-y-auto">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
