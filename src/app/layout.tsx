import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCurrentPlace, listActivePlaces } from "@/lib/places/context";
import { BrandProvider } from "@/lib/places/BrandProvider";
import { getPreferredCurrency } from "@/lib/currency";
import { PATH_HEADER } from "@/middleware";
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
  // On the generic multi-place shell (e.g. kwetu.ke root) there's no single
  // place to anchor copy on, and "in Kwetu, Kenya" reads as if Kwetu were a
  // town — so fall back to a coast-scoped phrasing.
  const hasSpecificPlace = Boolean(place?.name);
  const hostUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (host.host ? `https://${host.host}` : "https://watamubookings.com");

  const defaultTitle = place?.seo_title
    ? place.seo_title
    : hasSpecificPlace
      ? `${brandName} — Book stunning properties and fishing charters in ${placeName}, Kenya`
      : `${brandName} — Stay on the Kenyan coast. Book local.`;
  const description = place?.seo_description
    ? place.seo_description
    : hasSpecificPlace
      ? `Discover and book stunning beachfront properties and world-class fishing boat charters in ${placeName}, Kenya. Your gateway to paradise on the Kenyan coast.`
      : `Discover and book stunning beachfront properties and world-class fishing boat charters on Kenya's coast. Local hosts, local payments, local support.`;

  return {
    title: {
      default: defaultTitle,
      template: `%s | ${brandName}`,
    },
    description,
    keywords: [
      ...(hasSpecificPlace ? [placeName] : []),
      "Kenya",
      "Kenyan coast",
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
  const [{ place, host }, allPlaces, headerList, preferredCurrency] = await Promise.all([
    getCurrentPlace(),
    listActivePlaces(),
    headers(),
    getPreferredCurrency(),
  ]);
  // Bare-shell routes that render without site chrome (nav/footer) so
  // they can be used as standalone forms / tools — e.g. discovery
  // questionnaires that we don't want linking back into the site.
  const path = headerList.get(PATH_HEADER) ?? '';
  const isBareShell = path.startsWith('/survey');
  const brand = {
    name: host.brand_name,
    short: host.brand_short,
    supportEmail: host.support_email,
    supportWhatsapp: host.support_whatsapp,
  };
  // Footer's "based in" line. On a resolved place ("Watamu, Kenya") it reads
  // naturally. On the generic kwetu.ke shell, "Kwetu, Kenya" reads as if
  // Kwetu were a town — so scope to the coast instead.
  const placeLabel = place ? `${place.name}, Kenya` : 'Kenyan coast';
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
            // On the generic multi-place shell, fall back to 'Kenya' rather
            // than the brand short ('Kwetu'), since `brand.placeName` is used
            // in placeholders like "e.g. Bahari Villa <placeName>" where a
            // brand name reads as nonsense. Matches BrandProvider's internal
            // default and keeps copy coherent when no place is resolved.
            placeName: place?.name ?? 'Kenya',
            placeSlug: place?.slug ?? null,
            features: place?.features ?? [],
            destinations,
            preferredCurrency,
          }}
        >
          {!isBareShell && <Navbar brandName={brand.name} />}
          <main id="main" className="flex-1">
            {children}
          </main>
          {!isBareShell && (
            <Footer
              brandName={brand.name}
              brandShort={brand.short}
              supportEmail={brand.supportEmail}
              placeLabel={placeLabel}
            />
          )}
        </BrandProvider>
      </body>
    </html>
  );
}
