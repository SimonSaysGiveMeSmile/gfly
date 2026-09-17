import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL("https://gfly.site"),
  title: { default: "GFly — a real fly brain, running in your browser", template: "%s — GFly" },
  description:
    "The complete fruit fly connectome from Janelia and Google, simulated live in a browser tab. 163,997 neurons, no server.",
  openGraph: {
    title: "GFly",
    description: "163,997 real neurons. Running in your browser.",
    url: "https://gfly.site", siteName: "GFly", type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <div className="wash" aria-hidden />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
