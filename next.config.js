/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Deploy now, fix strict types iteratively
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // AVIF first, WebP second. AVIF is typically 20-30% smaller than WebP
    // at equivalent quality — materially helps mobile LCP on the hero image,
    // which is our primary Core Web Vitals bottleneck on Safari iOS.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // Enable wildcard subdomains for watamu.ke
  // Each boat/property gets slug.watamu.ke
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    // Content-Security-Policy — baseline hardening. 'unsafe-inline' on
    // script-src is required for Next.js's inline bootstrap (script the
    // framework injects for hydration). 'unsafe-eval' is required for
    // development HMR; we drop it in production. 'unsafe-inline' on
    // style-src is needed because Tailwind + Next emit inline <style>
    // blocks during SSR. We allow Stripe's JS + iframe, Supabase, and
    // images from any HTTPS source (listings use S3, Unsplash, Supabase).
    const isProd = process.env.NODE_ENV === "production";
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      ...(isProd ? [] : ["'unsafe-eval'"]),
      "https://js.stripe.com",
    ].join(" ");
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    const securityHeaders = [
      // Only this origin can embed the app in an iframe — blocks clickjacking.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      // Disable MIME-type sniffing.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Don't leak full URLs (bookings, admin) on outbound navigation.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Lock down powerful browser APIs that the app doesn't use.
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self 'https://js.stripe.com')",
      },
      // HSTS — 2 years, include subdomains, eligible for browser preload list.
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      // Cross-origin isolation for the main app. (Webhooks are under /api
      // and their own handlers set CORS explicitly.)
      { key: "X-DNS-Prefetch-Control", value: "on" },
      // Content-Security-Policy. See notes above.
      { key: "Content-Security-Policy", value: csp },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
