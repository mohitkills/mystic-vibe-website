export function mergeCatalogBySlug(fallbackProducts, liveProducts) {
  const merged = new Map();
  fallbackProducts.forEach((product) => {
    if (product?.slug) merged.set(product.slug, { ...product });
  });
  liveProducts.forEach((product) => {
    if (!product?.slug) return;
    merged.set(product.slug, { ...(merged.get(product.slug) || {}), ...product });
  });
  return [...merged.values()];
}

export function normalizeInternalLink(value, origin = globalThis.location?.origin || 'http://localhost') {
  const raw = String(value || '').trim() || '/collection.html';
  let base;
  let parsed;
  try {
    base = new URL(origin);
    parsed = new URL(raw, base);
  } catch {
    throw new Error('Enter a valid link on the Mystic Vibe website.');
  }
  if (parsed.origin !== base.origin || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Slide buttons must link to a page on the Mystic Vibe website.');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function normalizePersistentImageReference(value, projectUrl) {
  const reference = String(value || '').trim();
  if (!reference) return '';
  if (/^(?:blob:|data:|javascript:)/i.test(reference)) throw new Error('Temporary or executable URLs cannot be saved as image references. Upload the image or use a durable HTTPS URL.');
  if (/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(reference)) {
    const local = reference.replace(/^(?:\.\.\/|\/)+/, '');
    if (local.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Use a valid local image asset path.');
    return local;
  }
  if (/^https:\/\//i.test(reference)) {
    let url;
    try { url = new URL(reference); } catch { throw new Error('Enter a valid HTTPS image URL.'); }
    if (url.username || url.password) throw new Error('Image URLs must not contain embedded credentials.');
    if (/(?:token|signature|expires|x-amz-|x-goog-|awsaccesskeyid|[?&]sig=)/i.test(url.search)) {
      const expectedOrigin = projectUrl ? new URL(projectUrl).origin : '';
      const storageObject = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
      if (!storageObject || !expectedOrigin || url.origin !== expectedOrigin) throw new Error('Temporary signed image URLs expire. Save the private bucket/path instead.');
      let bucket;
      let path;
      try {
        bucket = decodeURIComponent(storageObject[1]);
        path = storageObject[2].split('/').map((part) => decodeURIComponent(part)).join('/');
      } catch { throw new Error('The Supabase Storage image path is invalid.'); }
      if (bucket !== 'mystic-vibe-images' || !isSafeObjectPath(path)) throw new Error('Only Mystic Vibe image bucket paths can be saved for private images.');
      return `${bucket}/${path}`;
    }
    if (/\.supabase\.(?:co|in)$/i.test(url.hostname) || /\/storage\/v1\/object\//i.test(url.pathname)) {
      const expectedOrigin = projectUrl ? new URL(projectUrl).origin : '';
      const storageObject = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
      if (!storageObject || !expectedOrigin || url.origin !== expectedOrigin) throw new Error('Use a Mystic Vibe bucket/path instead of a direct Supabase Storage URL.');
      const bucket = decodeURIComponent(storageObject[1]);
      const path = storageObject[2].split('/').map((part) => decodeURIComponent(part)).join('/');
      if (bucket !== 'mystic-vibe-images' || !isSafeObjectPath(path)) throw new Error('Only Mystic Vibe image bucket paths can be saved for private images.');
      return `${bucket}/${path}`;
    }
    return url.href;
  }
  if (/^http:\/\//i.test(reference)) throw new Error('Use HTTPS for public image URLs.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) throw new Error('Use a local asset path, Mystic Vibe Storage path, or durable HTTPS image URL.');
  const parts = reference.split('/');
  if (parts[0] === 'mystic-vibe-media') throw new Error('The media bucket is private and is not configured for storefront image delivery.');
  const bucketPath = parts[0] === 'mystic-vibe-images' ? parts.slice(1) : parts;
  const path = bucketPath.join('/');
  if (!isSafeObjectPath(path)) throw new Error('Use a valid Mystic Vibe Storage object path.');
  return `mystic-vibe-images/${path}`;
}

function isSafeObjectPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') &&
    !path.split('/').some((part) => !part || part === '.' || part === '..');
}

const HERO_TRANSITIONS = new Set(['fade', 'slide-left', 'slide-up', 'zoom']);

export function buildSlidePayload(fields, existing = null, origin, projectUrl) {
  const heading = String(fields.heading || '').trim();
  if (!heading) throw new Error('Add a slide name so you can identify it in Admin.');
  const sortOrder = Number(String(fields.sort_order ?? '0').trim() || 0);
  if (!Number.isSafeInteger(sortOrder)) throw new Error('Slide order must be a whole number.');

  const submittedImage = String(fields.image_url || '').trim();
  const imageUrl = normalizePersistentImageReference(submittedImage || existing?.image_url || '', projectUrl) || null;
  const isPublished = fields.is_published === true;
  if (isPublished && !imageUrl) throw new Error('Upload a hero image before publishing this slide.');

  const transitionStyle = String(fields.transition_style || existing?.transition_style || 'fade').trim().toLowerCase();
  if (!HERO_TRANSITIONS.has(transitionStyle)) throw new Error('Choose a supported hero transition style.');

  const ctaText = String(fields.cta_text || '').trim() || 'Explore';
  if (ctaText.length > 40) throw new Error('Button text must be 40 characters or fewer.');

  return {
    heading,
    subtitle: '',
    cta_text: ctaText,
    cta_link: normalizeInternalLink(fields.cta_link, origin),
    image_url: imageUrl,
    transition_style: transitionStyle,
    sort_order: sortOrder,
    is_published: isPublished,
  };
}

export function buildOrderSwap(records, id, direction, field = 'sort_order') {
  if (![-1, 1].includes(direction)) throw new Error('Order direction must be -1 or 1.');
  const ordered = [...records].sort((left, right) => Number(left[field]) - Number(right[field]) ||
    String(left.created_at || '').localeCompare(String(right.created_at || '')));
  const index = ordered.findIndex((record) => record.id === id);
  const neighbor = ordered[index + direction];
  if (index < 0 || !neighbor) return [];
  return [
    { id: ordered[index].id, [field]: neighbor[field] },
    { id: neighbor.id, [field]: ordered[index][field] },
  ];
}

export async function saveCmsRecord(client, table, primaryKey, id, payload, options = {}) {
  let query = id
    ? client.from(table).update(payload).eq(primaryKey, id)
    : client.from(table).insert(payload);
  if (id && options.expectedUpdatedAt) query = query.eq('updated_at', options.expectedUpdatedAt);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    const reason = options.expectedUpdatedAt ? ' It changed since this form was loaded; reload it and review the latest values.' : ' It may have been removed or access was denied.';
    throw new Error(`The ${table} record was not saved.${reason}`);
  }
  return data;
}
