"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the digest visible in the browser console so production incidents
    // can be correlated with server logs.
    if (error?.digest) {
      // eslint-disable-next-line no-console
      console.error("App error", { digest: error.digest, message: error.message });
    }
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-20">
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-coral-50 text-coral-700 mb-6">
          <AlertTriangle className="h-10 w-10" aria-hidden />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-3">
          Something went wrong
        </h1>
        <p className="text-base text-gray-600 mb-2">
          We hit an unexpected error loading this page. Please try again — if
          it keeps happening, let us know at{" "}
          <a href="mailto:hello@watamubookings.com" className="text-teal-700 underline">
            hello@watamubookings.com
          </a>
          .
        </p>
        {error?.digest && (
          <p className="text-xs text-gray-400 mb-8">
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-3 transition"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 hover:border-gray-400 text-gray-800 font-semibold px-5 py-3 transition"
          >
            <Home className="h-4 w-4" aria-hidden />
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
