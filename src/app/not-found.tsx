import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";

export const metadata = {
  title: "Page not found",
  description: "We couldn\u2019t find that page.",
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-20">
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-6">
          <Compass className="h-10 w-10" aria-hidden />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-3">
          Lost at sea
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          We can't find the page you were looking for. It may have been moved,
          renamed, or the link might be out of date.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-3 transition"
          >
            <Home className="h-4 w-4" aria-hidden />
            Back to homepage
          </Link>
          <Link
            href="/properties"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 hover:border-gray-400 text-gray-800 font-semibold px-5 py-3 transition"
          >
            <Search className="h-4 w-4" aria-hidden />
            Browse properties
          </Link>
        </div>
      </div>
    </div>
  );
}
