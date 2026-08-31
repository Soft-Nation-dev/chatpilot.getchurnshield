import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/context/auth-context";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chatpilot.trygetchurnshield.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  other: {
    "facebook-domain-verification": "y4qyb9wiay2fpwrw97ans0uonxl6ip",
  },
  title: {
    default: "Outbound Engine — Property leads, qualified automatically",
    template: "%s · GetChurnShield",
  },
  description:
    "AI-powered outbound engine for property businesses. Sources prospects, qualifies buyers across WhatsApp and Meta, and keeps your team in control.",
  applicationName: "GetChurnShield",
  keywords: [
    "WhatsApp AI",
    "WhatsApp automation",
    "AI chatbot",
    "property lead qualification",
    "real estate leads",
    "lead generation",
    "customer support",
  ],
  authors: [{ name: "GetChurnShield" }],
  creator: "GetChurnShield",
  publisher: "GetChurnShield",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    shortcut: "/favicon.ico",
  },
  category: "business",
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "GetChurnShield",
    title: "Outbound Engine — Property leads, qualified automatically",
    description:
      "Source property prospects and qualify buyer conversations across WhatsApp, Facebook, and Instagram.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Outbound Engine — Property leads, qualified automatically",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Outbound Engine — Property leads, qualified automatically",
    description:
      "Source property prospects and qualify buyer conversations across WhatsApp, Facebook, and Instagram.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#065f46" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(geistSans.variable)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
