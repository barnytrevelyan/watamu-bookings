import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Watamu Bookings — Book stunning properties and fishing charters in Watamu, Kenya",
    template: "%s | Watamu Bookings",
  },
  description:
    "Discover and book stunning beachfront properties and world-class fishing boat charters in Watamu, Kenya. Your gateway to paradise on the Kenyan coast.",
  keywords: [
    "Watamu",
    "Kenya",
    "beachfront",
    "holiday rentals",
    "fishing charters",
    "deep-sea fishing",
    "Watamu Marine Park",
    "accommodation",
    "boat trips",
  ],
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "https://watamubookings.com",
    siteName: "Watamu Bookings",
    title: "Watamu Bookings — Book stunning properties and fishing charters in Watamu, Kenya",
    description:
      "Discover and book stunning beachfront properties and world-class fishing boat charters in Watamu, Kenya.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Watamu Bookings — Beachfront stays and fishing charters",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Watamu Bookings",
    description:
      "Book stunning beachfront properties and world-class fishing charters in Watamu, Kenya.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://watamubookings.com"),
};

export const viewport = {
  themeColor: "#0f766e",
  colorScheme: "light" as const,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen flex flex-col bg-white text-gray-900 antialiased`}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: "8px",
              background: "#333",
              color: "#fff",
            },
          }}
        />
        {/* Visually-hidden skip link — becomes visible on keyboard focus. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-gray-900 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          Skip to main content
        </a>
        <Navbar />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
