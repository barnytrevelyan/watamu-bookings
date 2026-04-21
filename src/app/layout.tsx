import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCurrentPlace, listActivePlaces } from "@/lib/places/context";
import { BrandProvider } from "@/lib/places/BrandProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const brandShort = host.brand_short;
  const placeName = place?.name ?? brandShort;
  const hostUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (host.host ? `https://${host.host}` : "https://watamubookings.com");

  const defaultTitle = place?.seo_title
    ? place.seo_title
    : `${brandName} — Book stunning properties and fishing charters in ${placeName}, Kenya`;
  const description = place?.seo_description
    ? place.seo_description
    : `Discover and book stunning beachfront properties and world-class fishing boat charters in ${placeName}, Kenya. Your gateway to paradise on the Kenyan coast.`;

  return {
    title: {
      default: defaultTitle,
      template: `%s | ${brandName}`,
    },
    description,
    keywords: [
      placeName,
      "Kenya",
      "beachfront",
      "holiday rentals",
      "fishing charters",
      "deep-sea fishing",
      "accommodation",
      "boat trips",
    ],
    openGraph: {
      type: "website",
      locale: "en_GB",
      url: hostUrl,
      siteName: brandName,
      title: defaultTitle,
      description,
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: `${brandName} — Beachfront stays and fishing charters`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brandName,
      description,
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
    metadataBase: new URL(hostUrl),
  };
}

export const viewport = {
  themeColor: "#0f766e",
  colorScheme: "light" as const,
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ place, host }, allPlaces] = await Promise.all([
    getCurrentPlace(),
    listActivePlaces(),
  ]);
  const brand = {
    name: host.brand_name,
    short: host.brand_short,
    supportEmail: host.support_email,
    supportWhatsapp: host.support_whatsapp,
  };
  const placeLabel = place
    ? `${place.name}, Kenya`
    : `${host.brand_short}, Kenya`;
  const destinations = allPlaces.map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <html lang="en" className={inter.variable}>
      <body
        className={`${inter.className} min-h-screen flex flex-col bg-white text-gray-900 antialiased`}
      >
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
        <BrandProvider
          brand={{
            name: brand.name,
            short: brand.short,
            supportEmail: brand.supportEmail,
            supportWhatsapp: brand.supportWhatsapp,
            placeName: place?.name ?? brand.short,
            placeSlug: place?.slug ?? null,
            features: place?.features ?? [],
            destinations,
          }}
        >
          <Navbar brandName={brand.name} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer
            brandName={brand.name}
            brandShort={brand.short}
            supportEmail={brand.supportEmail}
            placeLabel={placeLabel}
          />
        </BrandProvider>
      </body>
    </html>
  );
}
