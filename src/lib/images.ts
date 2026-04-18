/**
 * Free stock images from Unsplash for Watamu Bookings
 * All images are free for commercial use, no attribution required
 * Using Unsplash Source API for reliable direct URLs
 */

export const STOCK_IMAGES = {
  // Hero / Landing page backgrounds
  hero: {
    beach: 'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=1920&q=80&fit=crop',
    oceanSunset: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&fit=crop',
    tropicalBeach: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1920&q=80&fit=crop',
    aerialOcean: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=1920&q=80&fit=crop',
  },

  // Property placeholder images
  properties: [
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80&fit=crop', // tropical villa
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&fit=crop', // modern house
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&fit=crop', // luxury home
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&fit=crop', // villa pool
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&fit=crop', // beachfront home
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&fit=crop', // modern villa
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80&fit=crop', // luxury property
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&fit=crop', // villa exterior
  ],

  // Fishing boat images
  boats: [
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80&fit=crop', // sport fishing boat
    'https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?w=800&q=80&fit=crop', // fishing vessel
    'https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=800&q=80&fit=crop', // boat on ocean
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80&fit=crop', // deep sea boat
    'https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=800&q=80&fit=crop', // tropical boat
    'https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=800&q=80&fit=crop', // fishing catamaran
  ],

  // Interior / Room images
  interiors: [
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80&fit=crop', // bedroom
    'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80&fit=crop', // hotel room
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80&fit=crop', // living room
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80&fit=crop', // bathroom
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80&fit=crop', // kitchen
  ],

  // Watamu / Kenya scenery
  scenery: {
    marinepark: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80&fit=crop',
    coralReef: 'https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=800&q=80&fit=crop',
    palmTrees: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80&fit=crop',
    sunset: 'https://images.unsplash.com/photo-1476673160081-cf065607f449?w=800&q=80&fit=crop',
    dhow: 'https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=800&q=80&fit=crop',
    fishMarket: 'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=800&q=80&fit=crop',
  },

  // Fishing / Activities
  fishing: {
    deepSea: 'https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=800&q=80&fit=crop',
    marlin: 'https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=800&q=80&fit=crop',
    snorkeling: 'https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800&q=80&fit=crop',
    kayaking: 'https://images.unsplash.com/photo-1472745942893-4b9f730c7668?w=800&q=80&fit=crop',
  },

  // Avatars / People
  avatars: [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80&fit=crop&crop=face',
  ],

  // Placeholder / fallback
  placeholder: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&fit=crop',
} as const;

/** Get a random property image for placeholders */
export function getPropertyImage(index: number = 0): string {
  return STOCK_IMAGES.properties[index % STOCK_IMAGES.properties.length];
}

/** Get a random boat image for placeholders */
export function getBoatImage(index: number = 0): string {
  return STOCK_IMAGES.boats[index % STOCK_IMAGES.boats.length];
}

/** Get a random interior image */
export function getInteriorImage(index: number = 0): string {
  return STOCK_IMAGES.interiors[index % STOCK_IMAGES.interiors.length];
}

/** Get a fallback avatar */
export function getAvatarImage(index: number = 0): string {
  return STOCK_IMAGES.avatars[index % STOCK_IMAGES.avatars.length];
}
