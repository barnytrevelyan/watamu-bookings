"use client";

import { useState } from "react";
import toast from "react-hot-toast";

/**
 * Share + Save buttons shown in the property header.
 * - Share uses the Web Share API where available, falls back to copying the URL.
 * - Save is a local-state toggle for now. Wiring it up to wb_wishlists is a
 *   follow-up (requires auth + new table), so for the demo we just show the
 *   heart toggling and a toast.
 */
export default function PropertyHeaderActions({
  propertyName,
}: {
  propertyName: string;
}) {
  const [saved, setSaved] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = {
      title: propertyName,
      text: `Check out ${propertyName} on Watamu Bookings`,
      url,
    };

    // Prefer the native share sheet (mobile, some desktops)
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && typeof (nav as any).share === "function") {
      try {
        await (nav as any).share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }

    // Fallback: copy URL
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  function handleSave() {
    setSaved((s) => !s);
    toast.success(saved ? "Removed from saved" : "Saved to your wishlist");
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Share this listing"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
        <span className="underline underline-offset-2">Share</span>
      </button>
      <button
        type="button"
        onClick={handleSave}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={saved ? "Remove from saved" : "Save to wishlist"}
        aria-pressed={saved}
      >
        <svg
          className={`w-4 h-4 ${saved ? "text-rose-500 fill-rose-500" : ""}`}
          fill={saved ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
        <span className="underline underline-offset-2">{saved ? "Saved" : "Save"}</span>
      </button>
    </div>
  );
}
