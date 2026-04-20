"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Small ℹ button that opens a popover explaining what a fee covers.
 * Keyboard-accessible, closes on Escape and on outside click.
 */
export default function FeeInfoTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1">
      {label}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-full"
        aria-label={`More info about ${label}`}
        aria-expanded={open}
      >
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
        >
          {description}
        </span>
      )}
    </span>
  );
}
