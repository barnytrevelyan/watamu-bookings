/**
 * VideoEmbed — turns a pasted URL into the right kind of player.
 *
 * Supported:
 *   - YouTube:   https://youtu.be/ID  |  https://youtube.com/watch?v=ID  |
 *                https://youtube.com/shorts/ID  |  https://youtube.com/embed/ID
 *   - Vimeo:     https://vimeo.com/ID  |  https://player.vimeo.com/video/ID
 *   - Direct:    anything ending in .mp4 / .webm / .mov / .m4v (served as <video>)
 *
 * Anything else falls back to a "Watch video on <domain>" link so we never
 * render an unsafe iframe src.
 */

interface VideoEmbedProps {
  url: string | null | undefined;
  /** Label used in the heading above the player. */
  title?: string;
  /** If true, renders without the surrounding section wrapper (just the player). */
  bare?: boolean;
  className?: string;
}

type Parsed =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string }
  | null;

/** Parse any user-pasted URL into one of the supported shapes. */
export function parseVideoUrl(raw: string | null | undefined): Parsed {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  // YouTube
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return { kind: 'youtube', id };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      if (id) return { kind: 'youtube', id };
    }
    const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{6,})/);
    if (m) return { kind: 'youtube', id: m[1] };
  }

  // Vimeo
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return { kind: 'vimeo', id };
  }
  if (host === 'player.vimeo.com') {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return { kind: 'vimeo', id: m[1] };
  }

  // Direct file
  if (/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u.pathname)) {
    return { kind: 'file', src: u.toString() };
  }

  // Unknown — surface as a plain link rather than iframe-ing arbitrary origins.
  return { kind: 'link', href: u.toString() };
}

export default function VideoEmbed({
  url,
  title = 'Video tour',
  bare = false,
  className = '',
}: VideoEmbedProps) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  let player: React.ReactNode;
  if (parsed.kind === 'youtube') {
    const src = `https://www.youtube-nocookie.com/embed/${parsed.id}?rel=0`;
    player = (
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  } else if (parsed.kind === 'vimeo') {
    const src = `https://player.vimeo.com/video/${parsed.id}?dnt=1`;
    player = (
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  } else if (parsed.kind === 'file') {
    player = (
      <video
        controls
        preload="metadata"
        playsInline
        className="absolute inset-0 h-full w-full bg-black object-contain"
      >
        <source src={parsed.src} />
        Your browser doesn't support embedded video.
      </video>
    );
  } else {
    // Unknown provider — render a safe out-link, not an iframe.
    let host = '';
    try {
      host = new URL(parsed.href).hostname.replace(/^www\./, '');
    } catch {}
    return (
      <a
        href={parsed.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:border-teal-300 hover:text-teal-700 ${className}`}
      >
        <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
        Watch video on {host || 'external site'}
      </a>
    );
  }

  const frame = (
    <div className={`relative w-full overflow-hidden rounded-xl bg-black ${className}`} style={{ aspectRatio: '16 / 9' }}>
      {player}
    </div>
  );

  if (bare) return frame;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      {frame}
    </section>
  );
}
