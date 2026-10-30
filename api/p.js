export const config = { runtime: 'edge' };

const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // e.g. https://apknox.online

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const cfgRaw = url.searchParams.get('cfg');
  let target = url.searchParams.get('u');
  if (!cfgRaw || !target) return new Response('bad request', { status: 400, headers: CORS });

  // "https:/host/x" -> "https://host/x" (slashes collapse ho jaate hain)
  target = target.replace(/^(https?):\/+/, '$1://');

  // original query (token etc.) upstream ko forward karo
  let up;
try { up = new URL(target); }
catch { return new Response('bad target: ' + target, { status: 400, headers: CORS }); }
  for (const [k, v] of url.searchParams) {
    if (k !== 'cfg' && k !== 'u') up.searchParams.append(k, v);
  }

  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.some(h => up.hostname === h || (h.startsWith('*.') && up.hostname.endsWith(h.slice(1))))) {
    return new Response('host not allowed', { status: 403, headers: CORS });
  }

  let cfg = {};
  try { cfg = JSON.parse(decodeURIComponent(escape(b64urlDecode(cfgRaw)))); }
  catch { return new Response('bad cfg', { status: 400, headers: CORS }); }

  const h = new Headers();
  if (cfg.c) h.set('Cookie', cfg.c);
  if (cfg.r) h.set('Referer', cfg.r);
  if (cfg.u) h.set('User-Agent', cfg.u);
  const range = req.headers.get('range');
  if (range) h.set('Range', range);

  const res = await fetch(up.toString(), { method: req.method, headers: h, redirect: 'follow' });

  const out = new Headers(CORS);
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(k);
    if (v) out.set(k, v);
  }
  if (/mpegurl|dash\+xml/i.test(out.get('content-type') || '') || /\.(m3u8|mpd)$/i.test(up.pathname)) {
    out.set('Cache-Control', 'no-store');
  }
  return new Response(res.body, { status: res.status, headers: out });
}
