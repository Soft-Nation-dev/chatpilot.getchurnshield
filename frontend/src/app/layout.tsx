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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://getchurnshield.chat-pilot.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GetChurnShield — Your business on WhatsApp, automated",
    template: "%s · GetChurnShield",
  },
  description:
    "AI-powered WhatsApp assistant for service businesses. Replies 24/7, books appointments, speaks Urdu + English, keeps your WhatsApp app working.",
  applicationName: "GetChurnShield",
  keywords: [
    "WhatsApp AI",
    "WhatsApp automation",
    "AI chatbot",
    "appointment booking",
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
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "GetChurnShield",
    title: "GetChurnShield — Your business on WhatsApp, automated",
    description:
      "AI-powered WhatsApp assistant. Replies 24/7, books appointments, speaks Urdu + English.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "GetChurnShield — Your business on WhatsApp, automated",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GetChurnShield — Your business on WhatsApp, automated",
    description:
      "AI-powered WhatsApp assistant. Replies 24/7, books appointments, speaks Urdu + English.",
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
