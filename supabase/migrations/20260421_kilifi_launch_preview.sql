-- Launch Kilifi as a preview destination — full Watamu parity.
-- Writes activities, map POIs, hero image, polished copy; flips visibility
-- to 'preview' so it's gated behind the kwetu-preview cookie until we
-- ship inventory onboarding.

update public.wb_places
set
  hero_image_url = 'https://images.unsplash.com/photo-1694860949468-652ce02c1002?w=1920&q=80&fit=crop',
  short_tagline = 'Kenya''s creek-side escape.',
  description = 'Kilifi is a laid-back coastal town about 60km north of Mombasa, built around the deep blue-green Kilifi Creek. The creek cuts inland for kilometres — lined with mangroves, baobab-studded cliffs, and a growing yachting and backpacker scene. Kilifi Bridge joins the north and south banks, with Mnarani Ruins perched on the south side and Bofa Beach stretching up the coast to the north. Less developed than Watamu but increasingly loved by in-the-know travellers.',
  seo_title = 'Kilifi Bookings — Beachfront stays and creek-side charters in Kilifi, Kenya',
  seo_description = 'Book stunning properties and boat charters in Kilifi, Kenya. Kilifi Creek dhow trips, Bofa Beach stays, deep-sea fishing and the Mnarani Ruins on the Kilifi coast.',
  default_zoom = 13,
  activities_json = jsonb_build_array(
    jsonb_build_object(
      'title', 'Kilifi Creek & Dhow Sailing',
      'image', 'https://images.unsplash.com/photo-1694860949468-652ce02c1002?w=800&q=80&fit=crop',
      'description', 'Kilifi Creek is the town''s signature feature — a deep tidal inlet of impossibly blue-green water reaching several kilometres inland, lined with mangroves, forested cliffs, and the occasional baobab. Traditional dhows sail the creek at sunset, and the Kilifi Boatyard hosts an international yachting community year-round. Sundowner cruises, overnight stays on anchor, and morning paddles through the mangrove channels are all on offer. The creek is also the heart of the Kilifi New Year''s festival every December.',
      'tags', jsonb_build_array('Best at sunset — take a dhow cruise')
    ),
    jsonb_build_object(
      'title', 'Deep-Sea Fishing',
      'image', 'https://images.unsplash.com/photo-1529230117010-b6c436154f25?w=800&q=80&fit=crop',
      'description', 'Kilifi sits on the same deep-water shelf as Watamu, with access to the Kilifi Canyon and the North Kenya Bank. Target black and striped marlin, sailfish, yellowfin tuna, wahoo and dorado. Peak billfish season runs August to March, with December and January the busiest months. Half and full-day charters depart from the creek mouth, and Kilifi is a tag-and-release fishery — most billfish are released alive.',
      'tags', jsonb_build_array('Peak season: August to March')
    ),
    jsonb_build_object(
      'title', 'Bofa Beach',
      'image', 'https://images.unsplash.com/photo-1565300897499-7538e788695a?w=800&q=80&fit=crop',
      'description', 'Bofa Beach is the long, quiet stretch of white coral sand running north from Kilifi town. Safe, shallow swimming at high tide, vast exposed sand flats at low, and a handful of beach bars tucked in among the palms. It is far less developed than Watamu or Diani — a good beach for long morning walks, empty sunbathing, and reading a book. Kite surfing operators have started to open along the Vipingo–Kilifi stretch thanks to the reliable trade winds.',
      'tags', jsonb_build_array('Quiet, uncrowded, wild')
    ),
    jsonb_build_object(
      'title', 'Mnarani Ruins',
      'image', 'https://images.unsplash.com/photo-1601562219653-0f16522227b3?w=800&q=80&fit=crop',
      'description', 'The Mnarani Ruins sit on a bluff above the south bank of Kilifi Creek — the remains of a 14th-century Swahili town that traded along the East African coast until it was sacked by the Oromo and abandoned in the 17th century. Today you can explore the Great Mosque, a cluster of pillar tombs, and a towering baobab grove. The site is managed by the National Museums of Kenya and there is a small entry fee. The views across the creek to the north bank are worth the visit alone.',
      'tags', jsonb_build_array('14th-century Swahili ruins')
    ),
    jsonb_build_object(
      'title', 'Watersports & Kite Surfing',
      'image', 'https://images.unsplash.com/photo-1519399224017-87a75eb50df9?w=800&q=80&fit=crop',
      'description', 'Kilifi and the coastline up to Vipingo have become one of Kenya''s kite surfing hotspots — consistent trade winds from June to September and again December to March, wide shallow beaches, and open water well beyond the reef. Stand-up paddleboarding on the creek is spectacular in the calm morning hours, and kayaks let you explore the mangrove channels at your own pace. A handful of operators run lessons and rentals from Bofa and from the creek-side beach clubs.',
      'tags', jsonb_build_array('Best kite surfing: Jun-Sep & Dec-Mar')
    ),
    jsonb_build_object(
      'title', 'Places to Eat & Drink',
      'image', 'https://images.unsplash.com/photo-1505441716189-50b06af1f43b?w=800&q=80&fit=crop',
      'description', 'Distant Relatives Ecolodge & Backpackers is a Kilifi institution — wood-fired pizza, cold Tusker, a permaculture garden, and the best hangout on the south bank. The Boatyard Bistro sits right on the creek, ideal for a long lunch watching the dhows pass. Nautilus serves Creole and East African seafood on a verandah above the water. For a quick bite, Kilifi Juice does smoothies and breakfast, and Thamani Farm-to-Table is worth the short drive for Mediterranean-leaning plates with ingredients from their own farm.',
      'tags', jsonb_build_array('Don''t miss Distant Relatives')
    )
  ),
  centroid_lat = -3.6364762,
  centroid_lng = 39.8485246,
  -- Coordinates resolved via Google Places text search (2026-04-21).
  map_pois_json = jsonb_build_array(
    jsonb_build_object('name','Kilifi Creek','lat',-3.6304941,'lng',39.8218953,'description','The iconic tidal creek — dhow cruises, kayaking, mangroves, and the Kilifi Boatyard yachting scene.','category','nature'),
    jsonb_build_object('name','Kilifi Bridge','lat',-3.6364762,'lng',39.8485246,'description','The long concrete bridge linking the north and south banks — classic Kilifi landmark.','category','landmark'),
    jsonb_build_object('name','Mnarani Ruins','lat',-3.6395141,'lng',39.8438272,'description','14th-century Swahili ruins on the south bank — mosque, pillar tombs, baobabs, creek views.','category','nature'),
    jsonb_build_object('name','Bofa Beach','lat',-3.5957456,'lng',39.8866424,'description','Long, quiet white-sand beach stretching north of Kilifi town — excellent for walks and swims.','category','beach'),
    jsonb_build_object('name','Kilifi Boatyard','lat',-3.6359204,'lng',39.8402491,'description','Creek-side boatyard, yachting hub, and home of the Kilifi New Year''s festival. Boatyard Bistro sits on the premises.','category','activity'),
    jsonb_build_object('name','Distant Relatives Ecolodge','lat',-3.621596,'lng',39.834938,'description','Backpackers, pizza oven, permaculture garden — Kilifi''s best hangout, on the north bank.','category','dining'),
    jsonb_build_object('name','Nautilus Kilifi','lat',-3.6336207,'lng',39.8445334,'description','Creole and East African seafood on a verandah above Old Ferry Road.','category','dining'),
    jsonb_build_object('name','Old Ferry Kilifi','lat',-3.6343585,'lng',39.8451269,'description','The old ferry landing on the south bank — still active for boat and dhow rides on the creek.','category','landmark')
  ),
  visibility = 'preview',
  updated_at = now()
where slug = 'kilifi';
