import { supabase } from './supabase-client.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const IMAGE_BUCKET = 'mystic-vibe-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const pageImageUrls = new Set();

function safeStoragePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    !/[\\\\\u0000-\u001f\u007f]/.test(value) && !value.startsWith('/') &&
    !value.split('/').some((part) => !part || part === '.' || part === '..');
}

function normalizeStorageReference(reference) {
  const value = String(reference || '').trim();
  if (!value) throw new Error('The slide has no image path.');

  if (/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(value)) {
    return { kind: 'local', url: value.replace(/^(?:\.\.\/|\/)+/, '') };
  }

  if (/^https:\/\//i.test(value)) {
    const url = new URL(value);
    const projectOrigin = new URL(SUPABASE_URL).origin;
    const storageObject = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);

    if (url.origin === projectOrigin && storageObject) {
      const bucket = decodeURIComponent(storageObject[1]);
      const path = storageObject[2].split('/').map((part) => decodeURIComponent(part)).join('/');
      if (bucket !== IMAGE_BUCKET || !safeStoragePath(path)) throw new Error('The slide image path is not allowed.');
      return { kind: 'private', path };
    }

    if (url.username || url.password || /\.supabase\.(?:co|in)$/i.test(url.hostname) ||
      /\/storage\/v1\/object\//i.test(url.pathname)) {
      throw new Error('Use a Mystic Vibe image bucket path for private slide images.');
    }
    return { kind: 'remote', url: url.href };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error('The slide image reference is not supported.');
  const parts = value.split('/');
  if (parts[0] === 'mystic-vibe-media') throw new Error('The private media bucket is not enabled for hero images.');
  const path = (parts[0] === IMAGE_BUCKET ? parts.slice(1) : parts).join('/');
  if (!safeStoragePath(path)) throw new Error('The slide image path is invalid.');
  return { kind: 'private', path };
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadPrivateSlideImage(slide, path) {
  const bytes = new TextEncoder().encode(IMAGE_BUCKET + '/' + path);
  const version = toHex(await crypto.subtle.digest('SHA-256', bytes));
  const endpoint = new URL('/functions/v1/slide-image', SUPABASE_URL);
  endpoint.searchParams.set('id', slide.id);
  endpoint.searchParams.set('v', version);

  const response = await fetch(endpoint.href, {
    method: 'GET',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('Slide image delivery returned HTTP ' + response.status + '.');

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) throw new Error('The slide image has an unsupported file type.');

  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error('The slide image is empty or too large.');
  const imageUrl = URL.createObjectURL(blob);
  pageImageUrls.add(imageUrl);
  return imageUrl;
}

async function resolveSlideImage(slide) {
  const reference = normalizeStorageReference(slide.image_url);
  if (reference.kind === 'local' || reference.kind === 'remote') return reference.url;
  return loadPrivateSlideImage(slide, reference.path);
}

async function loadPublishedSlides() {
  try {
    const { data, error } = await supabase
      .from('homepage_slides')
      .select('id, heading, subtitle, image_url, cta_text, cta_link, sort_order, transition_style, is_published, created_at')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    const records = Array.isArray(data) ? data : [];
    const resolved = await Promise.all(records.map(async (slide) => {
      try {
        const displayImageUrl = await resolveSlideImage(slide);
        return { ...slide, display_image_url: displayImageUrl };
      } catch (error) {
        console.warn('A published Mystic Vibe hero image could not be loaded:', slide.id, error);
        return null;
      }
    }));

    window.dispatchEvent(new CustomEvent('mystic-vibe-storefront-data', {
      detail: { slides: resolved.filter(Boolean) },
    }));
  } catch (error) {
    console.error('Mystic Vibe homepage slides could not be loaded:', error);
  }
}

window.addEventListener('pagehide', () => {
  pageImageUrls.forEach((url) => URL.revokeObjectURL(url));
  pageImageUrls.clear();
}, { once: true });

loadPublishedSlides();
