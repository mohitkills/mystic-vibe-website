import { supabase } from './supabase-client.js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';
import { mergeCatalogBySlug } from './cms-records.js';
import { storefrontImageReference } from './image-references.js';

const PRODUCT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const privateImagePromises = new Map();

function htmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function notesText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

function imageReferenceList(value) {
  let references = value;
  if (typeof references === 'string') {
    try {
      const parsed = JSON.parse(references);
      if (Array.isArray(parsed)) references = parsed;
      else if (typeof parsed === 'string' && parsed !== references) references = parsed.split('\n');
    } catch (error) {
      references = references.split('\n');
    }
  }
  return Array.isArray(references) ? references : [];
}

function storefrontImageReferences(value) {
  return imageReferenceList(value).map((reference) => storefrontImageReference(reference, SUPABASE_URL));
}

function fallbackImage(product, index) {
  const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  return images[index] || images[0] || 'assets/images/perfume-bottle.svg';
}

async function imageReferenceVersion(bucket, path) {
  const bytes = new TextEncoder().encode(`${bucket}/${path}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchPrivateProductImage(slug, index, reference) {
  const version = await imageReferenceVersion(reference.bucket, reference.path);
  const cacheKey = `${slug}:${index}:${version}`;
  if (privateImagePromises.has(cacheKey)) return privateImagePromises.get(cacheKey);

  const pending = (async () => {
    const endpoint = new URL('/functions/v1/product-image', SUPABASE_URL);
    endpoint.searchParams.set('slug', slug);
    endpoint.searchParams.set('index', String(index));
    endpoint.searchParams.set('v', version);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, accept: 'image/avif,image/webp,image/png,image/jpeg' },
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`Mystic Vibe product image unavailable for ${slug} image ${index + 1}: HTTP ${response.status}.`);
        return null;
      }
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!PRODUCT_IMAGE_MIME_TYPES.has(contentType)) {
        console.warn(`Mystic Vibe product image unavailable for ${slug} image ${index + 1}: unsupported content type.`);
        return null;
      }
      const image = await response.blob();
      if (!image.size || image.size > 5 * 1024 * 1024) {
        console.warn(`Mystic Vibe product image unavailable for ${slug} image ${index + 1}: invalid image size.`);
        return null;
      }
      return URL.createObjectURL(image);
    } catch {
      console.warn(`Mystic Vibe product image request failed for ${slug} image ${index + 1}; local artwork will be used.`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  privateImagePromises.set(cacheKey, pending);
  return pending;
}

async function fetchPrivateSlideImage(slide, reference) {
  const version = await imageReferenceVersion(reference.bucket, reference.path);
  const cacheKey = `slide:${slide.id}:${version}`;
  if (privateImagePromises.has(cacheKey)) return privateImagePromises.get(cacheKey);
  const pending = (async () => {
    const endpoint = new URL('/functions/v1/slide-image', SUPABASE_URL);
    endpoint.searchParams.set('id', slide.id);
    endpoint.searchParams.set('v', version);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, accept: 'image/avif,image/webp,image/png,image/jpeg' },
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`Mystic Vibe homepage slide image unavailable: HTTP ${response.status}.`);
        return null;
      }
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!PRODUCT_IMAGE_MIME_TYPES.has(contentType)) {
        console.warn('Mystic Vibe homepage slide image unavailable: unsupported content type.');
        return null;
      }
      const image = await response.blob();
      if (!image.size || image.size > 5 * 1024 * 1024) {
        console.warn('Mystic Vibe homepage slide image unavailable: invalid image size.');
        return null;
      }
      return URL.createObjectURL(image);
    } catch {
      console.warn('Mystic Vibe homepage slide image request failed; local artwork will be used.');
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  privateImagePromises.set(cacheKey, pending);
  return pending;
}

async function hydrateSlideImages(slides) {
  return Promise.all(slides.map(async (slide) => {
    const reference = storefrontImageReference(slide.image_url, SUPABASE_URL);
    if (reference?.kind === 'url') {
      if (reference.legacyLocalFile) console.warn('Mystic Vibe normalized a legacy local-file slide image to a same-site asset.');
      return { ...slide, display_image_url: reference.url };
    }
    if (reference?.kind === 'private' && reference.bucket === 'mystic-vibe-images') {
      const deliveredImage = await fetchPrivateSlideImage(slide, reference);
      if (deliveredImage) return { ...slide, display_image_url: deliveredImage };
    } else if (slide.image_url) {
      console.warn('Mystic Vibe homepage slide image reference is unsupported; local artwork will be used.');
    }
    return { ...slide, display_image_url: 'assets/images/hero-royal-marine.png' };
  }));
}

async function hydrateProductImages(products, imageSlotsBySlug) {
  await Promise.all(products.map(async (product) => {
    const slots = imageSlotsBySlug.get(product.slug);
    if (!slots?.length) return;
    const images = await Promise.all(slots.map(async (slot, index) => {
      if (slot?.kind === 'url') {
        if (slot.legacyLocalFile) console.warn('Mystic Vibe normalized a legacy local-file product image to a same-site asset.');
        return slot.url;
      }
      if (slot?.kind === 'private') {
        const deliveredImage = await fetchPrivateProductImage(product.slug, index, slot);
        if (deliveredImage) return deliveredImage;
      } else {
        console.warn(`Mystic Vibe product image reference is unsupported for ${product.slug} image ${index + 1}; local artwork will be used.`);
      }
      return fallbackImage(product, index);
    }));
    product.images = images.filter(Boolean);
  }));
}

function rerenderImagePage() {
  const page = document.body.dataset.page;
  if (page === 'home') window.renderMysticVibeHome?.();
  if (page === 'collection') window.renderMysticVibeCollection?.();
  if (page === 'product') window.renderMysticVibeProduct?.();
}

function dispatchStorefrontData() {
  window.dispatchEvent(new CustomEvent('mystic-vibe-storefront-data', { detail: {
    products: window.MV_PRODUCTS,
    collections: window.MV_COLLECTIONS,
    slides: window.MV_HOMEPAGE_SLIDES,
    content: window.MV_SITE_CONTENT,
  }}));
}

function toStorefrontProduct(row, collectionNames) {
  if (!row || typeof row.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) return null;
  const product = {
    slug: row.slug,
    published: row.is_published === true,
  };
  const imageSlots = storefrontImageReferences(row.image_urls);
  if (typeof row.name === 'string' && row.name.trim()) product.name = htmlText(row.name);
  if (typeof row.tagline === 'string' && row.tagline.trim()) product.tagline = htmlText(row.tagline);
  if (Number.isFinite(Number(row.size_ml)) && Number(row.size_ml) > 0) product.size = `${Number(row.size_ml)}ML`;
  if (Number.isFinite(Number(row.price)) && Number(row.price) > 0) product.price = Number(row.price);
  if (typeof row.fragrance_family === 'string' && row.fragrance_family.trim()) product.family = htmlText(row.fragrance_family);
  if (typeof row.description === 'string' && row.description.trim()) product.description = htmlText(row.description);
  if (Number.isFinite(Number(row.mrp)) && Number(row.mrp) > 0) product.mrp = Number(row.mrp);
  if (Number.isFinite(Number(row.stock)) && Number(row.stock) >= 0) product.stock = Number(row.stock);
  if (typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at))) product.created_at = row.created_at;
  if (typeof row.product_type === 'string' && row.product_type.trim()) product.product_type = htmlText(row.product_type);
  if (row.fragrance_notes !== null && row.fragrance_notes !== undefined && notesText(row.fragrance_notes).trim()) {
    product.notes = htmlText(notesText(row.fragrance_notes));
  }
  if (typeof row.is_featured === 'boolean') product.best = row.is_featured;
  if (row.collection_id) {
    product.collection_id = row.collection_id;
    const collectionName = collectionNames.get(row.collection_id);
    if (collectionName) product.collection = htmlText(collectionName);
  }
  return { product, imageSlots };
}

async function readPublished(table) {
  const rows = [];
  const batchSize = 1000;
  const order = table === 'site_content' ? ['content_key']
    : table === 'homepage_slides' ? ['sort_order', 'created_at']
      : ['sort_order', 'name'];
  for (let offset = 0; ; offset += batchSize) {
    let query = supabase.from(table).select('*').eq('is_published', true);
    order.forEach((column) => { query = query.order(column, { ascending: true }); });
    const { data, error } = await query.range(offset, offset + batchSize - 1);
    if (error) {
      console.warn(`Mystic Vibe could not load published ${table}:`, error.message);
      return [];
    }
    rows.push(...(Array.isArray(data) ? data : []));
    if (!data || data.length < batchSize) break;
  }
  return rows;
}

window.refreshMysticVibeReveals = function (root) {
  const scope = root || document;
  const items = scope.querySelectorAll('.reveal:not(.visible)');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('visible'));
    return;
  }
  if (!window.mysticVibeRevealObserver) {
    window.mysticVibeRevealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
  }
  items.forEach((item) => window.mysticVibeRevealObserver.observe(item));
};

function applySiteContent(rows) {
  const content = Object.create(null);
  rows.filter((row) => row?.is_published).forEach((row) => { content[row.content_key] = row.content_value; });
  window.MV_SITE_CONTENT = content;
  document.querySelectorAll('[data-site-content]').forEach((node) => {
    const value = content[node.dataset.siteContent];
    const text = typeof value === 'string' ? value : (value && typeof value.text === 'string' ? value.text : null);
    if (text !== null) node.textContent = text;
  });
}

async function applyRemoteData({ products, collections, slides, content }) {
  const collectionNames = new Map(collections.filter((row) => row?.is_published).map((row) => [row.id, row.name]));
  const mappedProducts = products.map((row) => toStorefrontProduct(row, collectionNames)).filter(Boolean);
  const imageSlotsBySlug = new Map(mappedProducts.map(({ product, imageSlots }) => [product.slug, imageSlots]));
  const fallback = window.MV_STATIC_PRODUCTS || [];
  const mergedProducts = mergeCatalogBySlug(fallback, mappedProducts.map(({ product }) => product));
  window.MV_PRODUCTS.splice(0, window.MV_PRODUCTS.length, ...mergedProducts);
  window.MV_COLLECTIONS = collections.filter((row) => row?.is_published);
  const publishedSlides = slides.filter((row) => row?.is_published)
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order) || String(left.created_at || '').localeCompare(String(right.created_at || '')));
  window.MV_HOMEPAGE_SLIDES = await hydrateSlideImages(publishedSlides);
  applySiteContent(content);
  rerenderImagePage();

  await Promise.all([hydrateProductImages(mergedProducts, imageSlotsBySlug)]);
  rerenderImagePage();

  window.refreshMysticVibeReveals(document.querySelector('main'));
  dispatchStorefrontData();
}

const [products, collections, slides, content] = await Promise.all([
  readPublished('products'),
  readPublished('collections'),
  readPublished('homepage_slides'),
  readPublished('site_content'),
]);
await applyRemoteData({ products, collections, slides, content });
