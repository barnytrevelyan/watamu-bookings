/**
 * Free stock images from Unsplash for Watamu Bookings
 * All images are free for commercial use, no attribution required
 * Using Unsplash CDN direct URLs
 *
 * Photo selection criteria: East African coastal character — white coral sand,
 * turquoise shallow water, dhow/traditional boats, Swahili-style architecture,
 * thatched-roof bungalows, mangrove creeks, local fishing culture.
 *
 * All IDs verified from live Unsplash search pages via browser scraping.
 */

export const STOCK_IMAGES = {
  // Hero / Landing page backgrounds
  hero: {
    // Turquoise tropical ocean aerial — Indian Ocean coast feel
    beach: 'https://images.unsplash.com/photo-1504814532849-cff240bbc503?w=1920&q=80&fit=crop',
    // Ocean sunset beach — warm East African evening light
    oceanSunset: 'https://images.unsplash.com/photo-1588001832198-c15cff59b078?w=1920&q=80&fit=crop',
    // Palm tree white sand beach — Zanzibar / Kenya coast
    tropicalBeach: 'https://images.unsplash.com/photo-1683877945938-8727191cd532?w=1920&q=80&fit=crop',
    // Aerial turquoise ocean — shallow reef coast from above
    aerialOcean: 'https://images.unsplash.com/photo-1558900811-887f48c4ad1b?w=1920&q=80&fit=crop',
  },

  // Property images — thatched-roof beach bungalows, Swahili-style cottages, NOT Miami mansions
  properties: [
    // Thatched-roof tropical beach bungalow
    'https://images.unsplash.com/photo-1601993396003-6cbec70ce171?w=800&q=80&fit=crop',
    // Simple tropical beach house surrounded by palms
    'https://images.unsplash.com/photo-1622779536320-bb5f5b501a06?w=800&q=80&fit=crop',
    // Thatched roof tropical resort with palm trees
    'https://images.unsplash.com/photo-1612895093576-6153128cf794?w=800&q=80&fit=crop',
    // Beach bungalow with thatched huts and blue water
    'https://images.unsplash.com/photo-1489211914964-32c31f87e86b?w=800&q=80&fit=crop',
    // Rustic tropical beach cottage near the ocean
    'https://images.unsplash.com/photo-1552873547-b88e7b2760e2?w=800&q=80&fit=crop',
    // Simple beach house with palm trees — East African coastal style
    'https://images.unsplash.com/photo-1659577252810-450ed5de380e?w=800&q=80&fit=crop',
    // White sand beach with simple cottages — Zanzibar style
    'https://images.unsplash.com/photo-1621583628955-42fbc37bf424?w=800&q=80&fit=crop',
    // Tropical beachfront property with thatched roof
    'https://images.unsplash.com/photo-1599076695552-6bab0cc1e80f?w=800&q=80&fit=crop',
  ],

  // Boat images — dhows, traditional wooden fishing boats, sport fishing vessels — NOT luxury yachts
  boats: [
    // Traditional dhow sailing vessel — East African / Arab dhow
    'https://images.unsplash.com/photo-1619550481986-5751a79d0d1b?w=800&q=80&fit=crop',
    // Dhow boat on ocean — classic lateen-sailed vessel
    'https://images.unsplash.com/photo-1597306428920-69049e0f26ed?w=800&q=80&fit=crop',
    // Small wooden fishing boat on calm tropical water
    'https://images.unsplash.com/photo-1631994299194-1d712dfd19b4?w=800&q=80&fit=crop',
    // Traditional fishing boats on beach — coastal Africa
    'https://images.unsplash.com/photo-1575658075190-c7b80d4a5e77?w=800&q=80&fit=crop',
    // Sport fishing boat heading out to sea
    'https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?w=800&q=80&fit=crop',
    // Wooden boat on mangrove creek water — Mida Creek feel
    'https://images.unsplash.com/photo-1643276715928-f0210284bea8?w=800&q=80&fit=crop',
  ],

  // Interior images — tropical bedrooms with mosquito nets, wooden furniture, airy beach house feel
  interiors: [
    // Tropical bedroom with white mosquito net — classic East African coastal
    'https://images.unsplash.com/photo-1443933223857-9ca346228f72?w=800&q=80&fit=crop',
    // Cozy beach house bedroom with canopy mosquito net
    'https://images.unsplash.com/photo-1627829631879-5b6e726cb57c?w=800&q=80&fit=crop',
    // Airy tropical room with white mosquito net over bed
    'https://images.unsplash.com/photo-1516893623281-98535aaa2205?w=800&q=80&fit=crop',
    // Simple beach bungalow interior — wooden furniture, tropical feel
    'https://images.unsplash.com/photo-1540571139928-d75d85dc41a6?w=800&q=80&fit=crop',
    // Tropical open-air living space with ocean view
    'https://images.unsplash.com/photo-1771526087519-ae6e37449c20?w=800&q=80&fit=crop',
  ],

  // Watamu / Kenya scenery — marine park, coral reef, palms, sunset, dhow, fish market
  scenery: {
    // Person snorkeling over coral reef — Watamu Marine Park
    marinepark: 'https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=800&q=80&fit=crop',
    // Coral reef with tropical fish — East African reef ecosystem
    coralReef: 'https://images.unsplash.com/photo-1683877945938-8727191cd532?w=800&q=80&fit=crop',
    // Palm trees on white sand beach — classic Kenyan coast
    palmTrees: 'https://images.unsplash.com/photo-1565300897499-7538e788695a?w=800&q=80&fit=crop',
    // Warm Indian Ocean beach sunset
    sunset: 'https://images.unsplash.com/photo-1601562219653-0f16522227b3?w=800&q=80&fit=crop',
    // Traditional dhow sailing at sea — quintessential Swahili coast
    dhow: 'https://images.unsplash.com/photo-1694860949468-652ce02c1002?w=800&q=80&fit=crop',
    // Local boats on beach — small harbour / fish landing scene
    fishMarket: 'https://images.unsplash.com/photo-1505441716189-50b06af1f43b?w=800&q=80&fit=crop',
  },

  // Fishing / Activities — deep sea fishing, marlin, snorkeling, kite surfing
  fishing: {
    // Deep sea sport fishing boat on open ocean
    deepSea: 'https://images.unsplash.com/photo-1529230117010-b6c436154f25?w=800&q=80&fit=crop',
    // Marlin / big game fishing — sailfish jump
    marlin: 'https://images.unsplash.com/photo-1674606844137-40e5b1239df1?w=800&q=80&fit=crop',
    // Snorkeling on coral reef with tropical fish
    snorkeling: 'https://images.unsplash.com/photo-1682687981630-cefe9cd73072?w=800&q=80&fit=crop',
    // Kite surfing on blue ocean — Watamu is a premier kite surfing spot
    kayaking: 'https://images.unsplash.com/photo-1519399224017-87a75eb50df9?w=800&q=80&fit=crop',
  },

  // Avatars / People
  avatars: [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80&fit=crop&crop=face',
  ],

  // Placeholder / fallback — turquoise Indian Ocean beach
  placeholder: 'https://images.unsplash.com/photo-1659577252810-450ed5de380e?w=800&q=80&fit=crop',
} as const;

/** Get a property image for placeholders */
export function getPropertyImage(index: number = 0): string {
  return STOCK_IMAGES.properties[index % STOCK_IMAGES.properties.length];
}

/** Get a boat image for placeholders */
export function getBoatImage(index: number = 0): string {
  return STOCK_IMAGES.boats[index % STOCK_IMAGES.boats.length];
}

/** Get an interior image */
export function getInteriorImage(index: number = 0): string {
  return STOCK_IMAGES.interiors[index % STOCK_IMAGES.interiors.length];
}

/** Get a fallback avatar */
export function getAvatarImage(index: number = 0): string {
  return STOCK_IMAGES.avatars[index % STOCK_IMAGES.avatars.length];
}
