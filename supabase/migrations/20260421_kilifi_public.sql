-- Flip Kilifi from preview to public. Kilifi has full landing content
-- (activities, map, tides) even though inventory is still being onboarded,
-- so the shell destination picker lists it alongside Watamu.

update public.wb_places
set
  visibility = 'public',
  updated_at = now()
where slug = 'kilifi';
