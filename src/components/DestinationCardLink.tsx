'use client';

import type { MouseEvent, ReactNode } from 'react';

interface DestinationCardLinkProps {
  slug: string;
  className?: string;
  children: ReactNode;
}

/**
 * Destination-card anchor that forces a full browser navigation when
 * switching destinations on the kwetu.ke shell.
 *
 * Why not Next.js `<Link>`: every place slug (/watamu, /kilifi, …)
 * rewrites to `/` via middleware. The App Router treats /watamu and /
 * as the same page tree, keyed by route not URL, so both the prefetch
 * and the `router.push()` resolution can hand back the shell's cached
 * RSC payload — the URL bar updates, the page scrolls to the top, and
 * the shell's "Pick your destination" content stays on screen.
 * `router.refresh()` is not reliable enough to beat this because the
 * prefetched payload for the target URL is already the shell's.
 *
 * A plain `<a href>` triggers a full page load, which guarantees a
 * fresh middleware run, a correct `x-wb-place` header, and the right
 * place-scoped home rendering. Crossing a place boundary is a hard
 * context switch anyway (brand, features, nav), so a clean reload is
 * also the more honest UX.
 *
 * Still a real anchor so right-click → "Open in new tab", middle-click,
 * and SEO crawlers all behave normally.
 */
export default function DestinationCardLink({
  slug,
  className,
  children,
}: DestinationCardLinkProps) {
  const href = `/${slug}`;

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;
    e.preventDefault();
    window.location.assign(href);
  };

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
