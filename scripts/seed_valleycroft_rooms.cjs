#!/usr/bin/env node
/**
 * Upsert the three BnB stays from the marketing/booking site into your API (POST /api/rooms, PUT /api/rooms/:id).
 * Data mirrors src/content/farmStays.js and admin Rooms page fields (name, type, pricePerNight, capacity, images, …).
 *
 * Usage:
 *   set API_BASE_URL=https://your-backend.example.com
 *   set JWT=your_bearer_token   (admin/finance user)
 *   node scripts/seed_valleycroft_rooms.cjs
 *
 * PowerShell:
 *   $env:API_BASE_URL="http://localhost:5000"; $env:JWT="..."; node scripts/seed_valleycroft_rooms.cjs
 *
 * Idempotent: matches existing rooms by exact `name` and updates them; otherwise creates.
 */

const axios = require('axios');

const API_BASE = (process.env.API_BASE_URL || 'https://valleycroft-backend.onrender.com').replace(/\/$/, '');
const TOKEN = process.env.JWT || process.env.TOKEN || process.env.API_TOKEN || '';

/**
 * S3 object references (same as src/content/farmStays.js). Frontend resolves to HTTPS via VITE_S3_PUBLIC_HTTP_BASE or
 * https://valleycroft.s3.amazonaws.com/public/...
 */
const S3P = 's3://valleycroft/public';
const ROOMS = [
  {
    siteSlug: 'house-1',
    name: 'Willow Cottage',
    type: 'cottage',
    pricePerNight: 1920,
    floor: '1',
    capacity: 4,
    bedConfig: '2 bedrooms',
    bathroom: '1 full bathroom',
    view: 'Farm & garden',
    description:
      'Two-bedroom cottage on the farm — living spaces, bedrooms and bathroom. Ideal for small families or two couples. Tags: 2 Bedrooms, Full bathroom, Farm breakfast, WiFi. [site-slug: house-1]',
    images: [
      `${S3P}/house 1 living room.jpeg`,
      `${S3P}/house 1 living room 2.jpeg`,
      `${S3P}/house 1 bed 1.jpeg`,
      `${S3P}/house 1 bed 2.jpeg`,
      `${S3P}/house 1 bathroom.jpeg`,
    ],
    status: 'available',
    isAvailable: true,
  },
  {
    siteSlug: 'house-2',
    name: 'Studio Flier',
    type: 'cottage',
    pricePerNight: 1280,
    floor: '1',
    capacity: 2,
    bedConfig: '1 bedroom',
    bathroom: '1 bathroom',
    view: 'Countryside',
    description:
      'One-bedroom hideaway — quiet and comfortable for solo travellers or couples. (Legacy display name on older records: Garden Nook.) Tags: 1 Bedroom, Countryside, WiFi. [site-slug: house-2]',
    images: [
      `${S3P}/house 2 living.jpeg`,
      `${S3P}/house 2 living 2.jpeg`,
      `${S3P}/house 2 living 3.jpeg`,
      `${S3P}/house 2 bath 1.jpeg`,
      `${S3P}/house 2 bath 2.jpeg`,
    ],
    status: 'available',
    isAvailable: true,
  },
  {
    siteSlug: 'house-3',
    name: 'The Blue House',
    type: 'farmhouse',
    pricePerNight: 3200,
    floor: '1',
    capacity: 8,
    bedConfig: '3 bedrooms',
    bathroom: '2 bathrooms',
    view: 'Farm & valley',
    description:
      'Spacious three-bedroom home — our signature blue house — with room for larger groups. Tags: 3 Bedrooms, Blue House, Groups, WiFi. [site-slug: house-3]',
    images: [
      `${S3P}/house 3 living.jpeg`,
      `${S3P}/house 3 bed 1.jpeg`,
      `${S3P}/house 3 bed 2.jpeg`,
      `${S3P}/house 3 kitchen.jpeg`,
      `${S3P}/house 3 bath.jpeg`,
    ],
    status: 'available',
    isAvailable: true,
  },
];

function unwrapList(res) {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.rooms)) return d.rooms;
  return [];
}

function roomId(r) {
  return r?._id ?? r?.id ?? null;
}

async function main() {
  if (!TOKEN.trim()) {
    console.error('Missing JWT: set JWT (or TOKEN) to a Bearer token for an admin user.');
    process.exit(1);
  }

  const client = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${TOKEN.trim()}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });

  const listRes = await client.get('/api/rooms', { params: { limit: 200 } });
  if (listRes.status >= 400) {
    console.error('GET /api/rooms failed:', listRes.status, listRes.data);
    process.exit(1);
  }

  const existing = unwrapList(listRes);
  const byName = new Map(existing.map((r) => [String(r.name || '').trim(), r]));

  for (const room of ROOMS) {
    const { siteSlug, ...body } = room;
    const prev = byName.get(room.name);
    const id = prev ? roomId(prev) : null;

    if (id) {
      const putRes = await client.put(`/api/rooms/${encodeURIComponent(id)}`, body);
      if (putRes.status >= 400) {
        console.error(`PUT ${room.name} failed:`, putRes.status, putRes.data);
        process.exit(1);
      }
      console.log('Updated:', room.name, `(${siteSlug})`, id);
    } else {
      const postRes = await client.post('/api/rooms', body);
      if (postRes.status >= 400) {
        console.error(`POST ${room.name} failed:`, postRes.status, postRes.data);
        process.exit(1);
      }
      const created = postRes.data?.data ?? postRes.data;
      console.log('Created:', room.name, `(${siteSlug})`, roomId(created) || '');
    }
  }

  console.log('Done. Three stays: Willow Cottage, Studio Flier, The Blue House.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
