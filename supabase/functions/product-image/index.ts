import { withSupabase } from 'npm:@supabase/server@1';

const BUCKET = 'mystic-vibe-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, x-client-info, content-type',
  'access-control-max-age': '86400',
  'access-control-expose-headers': 'etag, cache-control',
  'vary': 'Origin',
};

function response(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...extraHeaders,
    },
  });
}

function imageReferenceList(value: unknown): unknown[] {
  let references = value;
  if (typeof references === 'string') {
    try {
      const parsed: unknown = JSON.parse(references);
      if (Array.isArray(parsed)) references = parsed;
      else if (typeof parsed === 'string' && parsed !== references) references = parsed.split('\n');
    } catch {
      references = references.split('\n');
    }
  }
  return Array.isArray(references) ? references : [];
}

function safeObjectPath(path: string) {
  return path.length > 0 && path.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') &&
    !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function normalizeProductImageReference(reference: unknown, projectUrl: string) {
  if (typeof reference !== 'string') return null;
  const value = reference.trim();
  if (!value) return null;

  let bucket = '';
  let path = '';
  if (/^https:\/\//i.test(value)) {
    let url: URL;
    let projectOrigin: string;
    try {
      url = new URL(value);
      projectOrigin = new URL(projectUrl).origin;
    } catch {
      return null;
    }
    if (url.origin !== projectOrigin || url.username || url.password) return null;
    const object = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (!object) return null;
    try {
      bucket = decodeURIComponent(object[1]);
      path = object[2].split('/').map((part) => decodeURIComponent(part)).join('/');
    } catch {
      return null;
    }
  } else {
    const separator = value.indexOf('/');
    const firstPart = separator > 0 ? value.slice(0, separator) : '';
    if (firstPart === 'mystic-vibe-media') return null;
    bucket = BUCKET;
    path = firstPart === BUCKET ? value.slice(separator + 1) : value;
  }

  return bucket === BUCKET && safeObjectPath(path) ? { bucket, path } : null;
}

async function versionFor(bucket: string, path: string) {
  const bytes = new TextEncoder().encode(`${bucket}/${path}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isNotModified(request: Request, etag: string) {
  return (request.headers.get('if-none-match') || '')
    .split(',')
    .some((candidate) => candidate.trim() === '*' || candidate.trim() === etag);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function hasAllowedImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n';
  if (contentType === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
  if (contentType !== 'image/avif' || ascii(bytes, 4, 8) !== 'ftyp') return false;

  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) brands.push(ascii(bytes, offset, offset + 4));
  return brands.some((brand) => brand === 'avif' || brand === 'avis');
}

const handleImageRequest = withSupabase({ auth: 'publishable' }, async (request, ctx) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, null, { allow: 'GET, HEAD, OPTIONS' });

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  const indexValue = url.searchParams.get('index') || '';
  const requestedVersion = url.searchParams.get('v') || '';
  const index = Number(indexValue);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^\d{1,3}$/.test(indexValue) ||
    !Number.isSafeInteger(index) || index < 0 || index > 99 || !/^[a-f0-9]{64}$/.test(requestedVersion)) {
    return response(404, null);
  }

  // Read the row under the caller's anon RLS context. Only published products
  // can be delivered. The raw object path never comes from request parameters.
  const { data: product, error: productError } = await ctx.supabase
    .from('products')
    .select('image_urls')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (productError || !product) return response(404, null);

  const references = imageReferenceList(product.image_urls);
  const reference = normalizeProductImageReference(references[index], Deno.env.get('SUPABASE_URL') || '');
  if (!reference) return response(404, null);
  const actualVersion = await versionFor(reference.bucket, reference.path);
  if (actualVersion !== requestedVersion) return response(404, null);

  const etag = `"${actualVersion}"`;
  const cacheHeaders = {
    etag,
    'cache-control': 'public, max-age=60, s-maxage=60',
  };
  if (isNotModified(request, etag)) return response(304, null, cacheHeaders);

  // Check object metadata before downloading so oversized files do not consume
  // the function's memory budget. The path still comes only from the published
  // database row, and the images bucket remains private.
  const { data: objectInfo, error: infoError } = await ctx.supabaseAdmin.storage
    .from(BUCKET)
    .info(reference.path);
  if (infoError || !objectInfo || !Number.isSafeInteger(objectInfo.size) || objectInfo.size < 1) {
    return response(404, null);
  }
  if (objectInfo.size > MAX_IMAGE_BYTES) return response(413, null);

  // Only the resolved image path from the published database row reaches the
  // privileged Storage client.
  const { data: image, error: imageError } = await ctx.supabaseAdmin.storage
    .from(BUCKET)
    .download(reference.path);
  if (imageError || !image || image.size < 1 || image.size > MAX_IMAGE_BYTES) return response(404, null);
  const contentType = (image.type || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return response(415, null);
  const imageHeader = new Uint8Array(await image.slice(0, 64).arrayBuffer());
  if (!hasAllowedImageSignature(imageHeader, contentType)) return response(415, null);

  const headers = {
    ...cacheHeaders,
    'content-type': contentType,
    'content-length': String(image.size),
    'content-disposition': 'inline; filename="mystic-vibe-product-image"',
  };
  return response(200, request.method === 'HEAD' ? null : image, headers);
});

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return response(204, null);
    try {
      const result = await handleImageRequest(request);
      const headers = new Headers(result.headers);
      Object.entries(CORS_HEADERS).forEach(([name, value]) => headers.set(name, value));
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      return new Response(result.body, { status: result.status, headers });
    } catch {
      return response(500, null);
    }
  },
};
