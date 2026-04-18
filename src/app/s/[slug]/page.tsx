import { redirect, notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Subdomain landing page
 *
 * When someone visits unreel.watamu.ke, the middleware rewrites to /s/unreel.
 * This page checks if the slug is a boat or property and renders the
 * appropriate detail page content inline (via server-side redirect).
 */

async function findListingBySlug(slug: string): Promise<{ type: 'boat' | 'property'; slug: string } | null> {
  const supabase = await createServerClient();

  // Check boats first (most common for watamu.ke)
  const { data: boat } = await supabase
    .from("wb_boats")
    .select("slug")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (boat) return { type: 'boat', slug: boat.slug };

  // Check properties
  const { data: property } = await supabase
    .from("wb_properties")
    .select("slug")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (property) return { type: 'property', slug: property.slug };

  return null;
}

export default async function SubdomainPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await findListingBySlug(slug);

  if (!listing) notFound();

  // Redirect to the appropriate detail page
  if (listing.type === 'boat') {
    redirect(`/boats/${listing.slug}`);
  } else {
    redirect(`/properties/${listing.slug}`);
  }
}
