'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

interface DestinationCardLinkProps {
  slug: string;
  className?: string;
  children: ReactNode;
}

/**
 * Client-side wrapper around a plain `<Link>` that forces an RSC refresh
 * when hopping between destinations on the kwetu.ke shell.
 *
 * Why: every place slug (/watamu, /kilifi, …) rewrites to `/` via the
 * middleware, so Next.js considers it the same route as the shell landing
 * and re-uses the cached RSC payload. Result: the URL bar changes, the
 * page scrolls to the top, but the content stays on the shell.
 *
 * `router.refresh()` after `router.push()` invalidates the cached RSC
 * payload, so the new place's layout + page get re-fetched against the
 * updated `x-wb-place` header.  Matches the same trick Navbar.tsx's
 * destination tabs use.
 *
 * Still renders a real anchor so SSR, right-click → "Open in new tab",
 * middle-click and SEO crawlers all behave like a normal link.
 */
export default function DestinationCardLink({
  slug,
  className,
  children,
}: DestinationCardLinkProps) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modifier-clicks / middle-clicks keep their native browser behaviour
    // (open in new tab/window) — no hijacking.
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;

    e.preventDefault();
    router.push(`/${slug}`);
    router.refresh();
  };

  return (
    <Link href={`/${slug}`} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
