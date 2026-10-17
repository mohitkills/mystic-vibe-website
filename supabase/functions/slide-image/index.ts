import { withSupabase } from 'npm:@supabase/server@1';

const BUCKET = 'mystic-vibe-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, x-client-info, content-type, if-none-match',
  'access-control-expose-headers': 'etag, cache-control',
  'access-control-max-age': '86400',
  vary: 'Origin',
};

function response(status: number, body: BodyInit | null, extra: HeadersInit = {}) {
  return new Response(body, { status, headers: {
    ...CORS_HEADERS,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  } });
}

function safePath(path: string) {
  return path.length > 0 && path.length <= 1024 && !/[\\\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith('/') && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function normalizeSlidePath(value: unknown, projectUrl: string) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const reference = value.trim();
  let bucket = BUCKET;
  let path = reference;
  if (/^https:\/\//i.test(reference)) {
    try {
      const url = new URL(reference);
      if (url.origin !== new URL(projectUrl).origin || url.username || url.password) return null;
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
      if (!match) return null;
      bucket = decodeURIComponent(match[1]);
      path = match[2].split('/').map((part) => decodeURIComponent(part)).join('/');
    } catch {
      return null;
    }
  } else if (reference.includes('/')) {
    const first = reference.slice(0, reference.indexOf('/'));
    if (first === 'mystic-vibe-media') return null;
    if (first === BUCKET) path = reference.slice(BUCKET.length + 1);
  }
  return bucket === BUCKET && safePath(path) ? path : null;
}

async function versionFor(path: string) {
  const bytes = new TextEncoder().encode(`${BUCKET}/${path}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function signatureMatches(bytes: Uint8Array, mime: string) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return ascii(0, 8) === '\x89PNG\r\n\x1a\n';
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (mime !== 'image/avif' || ascii(4, 8) !== 'ftyp') return false;
  const brands = [ascii(8, 12)];
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) brands.push(ascii(offset, offset + 4));
  return brands.some((brand) => brand === 'avif' || brand === 'avis');
}

const servePublishedSlide = withSupabase({ auth: 'publishable' }, async (request, ctx) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, null, { allow: 'GET, HEAD, OPTIONS' });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const requestedVersion = url.searchParams.get('v') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/.test(requestedVersion)) return response(404, null);

  // RLS plus this explicit filter mean draft slides cannot reveal their media path.
  const { data: slide, error } = await ctx.supabase.from('homepage_slides')
    .select('image_url').eq('id', id).eq('is_published', true).maybeSingle();
  if (error || !slide) return response(404, null);
  const path = normalizeSlidePath(slide.image_url, Deno.env.get('SUPABASE_URL') || '');
  if (!path || await versionFor(path) !== requestedVersion) return response(404, null);

  const etag = `"${requestedVersion}"`;
  const cacheHeaders = { etag, 'cache-control': 'public, max-age=60, s-maxage=60' };
  if ((request.headers.get('if-none-match') || '').split(',').some((value) => value.trim() === etag || value.trim() === '*')) {
    return response(304, null, cacheHeaders);
  }
  const { data: info, error: infoError } = await ctx.supabaseAdmin.storage.from(BUCKET).info(path);
  if (infoError || !info || !Number.isSafeInteger(info.size) || info.size < 1) return response(404, null);
  if (info.size > MAX_IMAGE_BYTES) return response(413, null);
  const { data: image, error: imageError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(path);
  if (imageError || !image || image.size < 1 || image.size > MAX_IMAGE_BYTES) return response(404, null);
  const mime = (image.type || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(mime) || !signatureMatches(new Uint8Array(await image.slice(0, 64).arrayBuffer()), mime)) return response(415, null);
  return response(200, request.method === 'HEAD' ? null : image, {
    ...cacheHeaders,
    'content-type': mime,
    'content-length': String(image.size),
    'content-disposition': 'inline; filename="mystic-vibe-slide-image"',
  });
});

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return response(204, null);
    try {
      const result = await servePublishedSlide(request);
      return new Response(result.body, { status: result.status, headers: result.headers });
    } catch {
      return response(500, null);
    }
  },
};
