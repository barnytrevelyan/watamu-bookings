import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * POST /api/survey — capture a host or guest discovery questionnaire.
 *
 * Anonymous submission — the table lives behind RLS with no anon
 * policy, so we insert via the service-role client and never expose
 * reads through this endpoint. Admins read via the admin UI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      audience?: string;
      contact?: { name?: string; email?: string; phone?: string };
      answers?: Record<string, unknown>;
    };

    const audience = body.audience;
    if (audience !== 'host' && audience !== 'guest') {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
    }

    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    if (Object.keys(answers).length === 0) {
      return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
    }

    // Trim + cap contact strings defensively — this is a public,
    // unauthenticated endpoint. Over-long strings are almost certainly
    // noise or abuse; the column type is text but we don't want 5MB
    // blobs landing in the inbox.
    const clip = (s: unknown, max = 300) => {
      if (typeof s !== 'string') return null;
      const t = s.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };

    const contact = body.contact ?? {};
    const contact_name = clip(contact.name);
    const contact_email = clip(contact.email, 200);
    const contact_phone = clip(contact.phone, 60);

    // Light meta — the kind of thing we'd want when skim-reading results
    // ("was this from a UK referrer or a local one?") but nothing that
    // would count as tracking. No IP.
    const meta = {
      userAgent: request.headers.get('user-agent') ?? null,
      referer: request.headers.get('referer') ?? null,
      language: request.headers.get('accept-language')?.split(',')[0] ?? null,
    };

    const supabase = createClient();
    const { data, error } = await supabase
      .from('wb_survey_responses')
      .insert({
        audience,
        contact_name,
        contact_email,
        contact_phone,
        answers,
        meta,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[survey] insert failed', error);
      return NextResponse.json({ error: 'Could not save response' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[survey] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
