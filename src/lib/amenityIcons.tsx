/**
 * Shared amenity icon map.
 *
 * The `wb_amenities.icon` column in Supabase stores a *slug* (e.g. `wifi`,
 * `snowflake`, `tree-palm`). Both the property detail page and the host
 * dashboard's new/edit amenity picker need to render those slugs as real
 * lucide icons — not as raw text. Defining the map in one place keeps them
 * in sync.
 */

import {
  Snowflake,
  Plane,
  Car,
  Dog,
  Shirt,
  Wifi,
  Sun,
  Flame,
  Umbrella,
  Trees,
  Eye,
  Waves,
  Coffee,
  Refrigerator,
  UtensilsCrossed,
  Cross,
  Zap,
  ShieldCheck,
  SatelliteDish,
  Tv,
  Thermometer,
  BugOff,
  BedDouble,
  Check,
  type LucideIcon,
} from "lucide-react";

export const AMENITY_ICON_MAP: Record<string, LucideIcon> = {
  snowflake: Snowflake,
  plane: Plane,
  car: Car,
  dog: Dog,
  shirt: Shirt,
  wifi: Wifi,
  sun: Sun,
  flame: Flame,
  umbrella: Umbrella,
  "tree-palm": Trees,
  eye: Eye,
  waves: Waves,
  coffee: Coffee,
  refrigerator: Refrigerator,
  "utensils-crossed": UtensilsCrossed,
  cross: Cross,
  zap: Zap,
  shield: ShieldCheck,
  "satellite-dish": SatelliteDish,
  tv: Tv,
  thermometer: Thermometer,
  "bug-off": BugOff,
  "bed-double": BedDouble,
};

/** Resolve a stored amenity icon slug to its lucide component. */
export function amenityIconFor(slug?: string | null): LucideIcon {
  if (!slug) return Check;
  return AMENITY_ICON_MAP[slug] ?? Check;
}

/** Friendly category labels used across the listing + picker surfaces. */
export const AMENITY_CATEGORY_LABEL: Record<string, string> = {
  general: "Essentials",
  outdoor: "Outdoor",
  kitchen: "Kitchen & dining",
  safety: "Safety",
  entertainment: "Entertainment",
  bathroom: "Bathroom",
  bedroom_amenity: "Bedroom",
  accessibility: "Accessibility",
};
