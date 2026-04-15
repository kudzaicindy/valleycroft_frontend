/**
 * Canonical list of the three farm BnB stays — single source for landing, booking, and quick-book.
 * `legacyNames` map older API or marketing copy to the same stay (e.g. Garden Nook → Studio Flier).
 *
 * Images: files in `public/` (served at site root). Names match on-disk files (house 1 uses
 * `house 1living…` / `house 1bed…` — no space after the digit). For API/DB seeding, S3 URIs may
 * still differ; use `resolveRoomImageUrl()` wherever you pass URLs to img/CSS.
 */

const HOUSE1_IMAGES = [
  '/house 1living room.jpeg',
  '/house 1living room 2.jpeg',
  '/house 1bed 1.jpeg',
  '/house 1 bed 2.jpeg',
  '/house 1 bathroom.jpeg',
];

const HOUSE2_IMAGES = [
  '/house 2 living.jpeg',
  '/house 2 living 2.jpeg',
  '/house 2 living 3.jpeg',
  '/house 2 bath 1.jpeg',
  '/house 2 bath 2.jpeg',
];

const HOUSE3_IMAGES = [
  '/house 3 living.jpeg',
  '/house 3 bed 1.jpeg',
  '/house 3 bed 2.jpeg',
  '/house 3 kitchen.jpeg',
  '/house 3 bath.jpeg',
];

export const FARM_STAYS = [
  {
    slug: 'house-1',
    name: 'Willow Cottage',
    legacyNames: [],
    bedsShort: '2 bed',
    price: 1920,
    desc: 'Two-bedroom cottage on the farm — living spaces, bedrooms and bathroom. Ideal for small families or two couples.',
    tags: ['2 Bedrooms', 'Full bathroom', 'Farm breakfast', 'WiFi'],
    images: HOUSE1_IMAGES,
  },
  {
    slug: 'house-2',
    name: 'Studio Flier',
    legacyNames: ['Garden Nook'],
    bedsShort: '1 bed',
    price: 1280,
    desc: 'One-bedroom hideaway — quiet and comfortable for solo travellers or couples.',
    tags: ['1 Bedroom', 'Countryside', 'WiFi'],
    images: HOUSE2_IMAGES,
  },
  {
    slug: 'house-3',
    name: 'The Blue House',
    legacyNames: [],
    bedsShort: '3 bed',
    price: 3200,
    desc: 'Spacious three-bedroom home — our signature blue house — with room for larger groups.',
    tags: ['3 Bedrooms', 'Blue House', 'Groups', 'WiFi'],
    images: HOUSE3_IMAGES,
  },
];

/** Quick-book / navigate state: slug → display name for API lookup on landing */
export function quickBookNameBySlug(slug) {
  const s = FARM_STAYS.find((x) => x.slug === slug);
  return s ? s.name : null;
}

/** Match a rooms API row to a catalog stay (name, legacy names, or slug as id). */
export function apiRowMatchesStay(apiRow, stay) {
  if (!apiRow || !stay) return false;
  const apiId = String(apiRow._id ?? apiRow.id ?? '').trim();
  if (apiId && apiId === stay.slug) return true;
  const n = (apiRow.name || '').trim().toLowerCase();
  if (!n) return false;
  if (n === stay.name.trim().toLowerCase()) return true;
  return (stay.legacyNames || []).some((ln) => n === String(ln).trim().toLowerCase());
}
