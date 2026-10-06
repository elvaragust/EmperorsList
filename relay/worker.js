/**
 * EmperorsList relay — a tiny Cloudflare Worker that lets the app download
 * Wahapedia's export files (Wahapedia doesn't allow browsers to fetch them
 * directly). It only passes through an allowlisted set of CSV files, adds the
 * CORS header, and caches for an hour. Nothing is stored and nothing else is proxied.
 *
 * GET /wahapedia/Stratagems.csv  ->  https://wahapedia.ru/wh40k11ed/Stratagems.csv
 */
const UPSTREAM = 'https://wahapedia.ru/wh40k11ed/';
const FILES = new Set(['Factions.csv', 'Stratagems.csv', 'Enhancements.csv', 'Detachment_abilities.csv', 'Detachments.csv', 'Last_update.csv']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/wahapedia\/([\w.]+)$/);
    if (!m || !FILES.has(m[1])) return new Response('Not found', { status: 404, headers: cors });

    const cache = caches.default;
    const key = new Request(UPSTREAM + m[1]);
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(UPSTREAM + m[1], { headers: { 'User-Agent': 'EmperorsList relay (personal use)' } });
      if (!up.ok) return new Response(`Upstream ${up.status}`, { status: 502, headers: cors });
      res = new Response(up.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    out.headers.set('X-Powered-By', 'Wahapedia');
    return out;
  },
};
