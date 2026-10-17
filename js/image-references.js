const PUBLIC_IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const PRODUCT_IMAGE_BUCKET = 'mystic-vibe-images';

function safeObjectPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') &&
    !path.split('/').some((part) => !part || part === '.' || part === '..');
}

/**
 * Convert a legacy file:// reference into a same-site URL only when it points
 * into this site's public assets directory. Arbitrary local files are rejected.
 */
export function localAssetFromFileReference(reference) {
  if (typeof reference !== 'string' || !/^file:/i.test(reference)) return null;

  let fileUrl;
  try {
    fileUrl = new URL(reference);
  } catch {
    return null;
  }
  if (fileUrl.protocol !== 'file:' || fileUrl.host || fileUrl.search || fileUrl.hash) return null;

  let segments;
  try {
    segments = fileUrl.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  const assetsIndex = segments.lastIndexOf('assets');
  if (assetsIndex < 0 || assetsIndex === segments.length - 1) return null;
  const assetSegments = segments.slice(assetsIndex + 1);
  if (assetSegments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/\u0000-\u001f\u007f]/.test(segment))) {
    return null;
  }

  const filename = assetSegments[assetSegments.length - 1];
  if (!PUBLIC_IMAGE_EXTENSION.test(filename)) return null;
  return `assets/${assetSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function privateImageReference(reference, projectUrl) {
  const value = String(reference || '').trim();
  if (!value) return null;

  let bucket = '';
  let path = '';
  if (/^https:\/\//i.test(value)) {
    let url;
    let projectOrigin;
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
    if (firstPart === 'mystic-vibe-media' || /^(?:blob|file|data):/i.test(value)) return null;
    bucket = PRODUCT_IMAGE_BUCKET;
    path = firstPart === PRODUCT_IMAGE_BUCKET ? value.slice(separator + 1) : value;
  }

  return bucket === PRODUCT_IMAGE_BUCKET && safeObjectPath(path) ? { bucket, path } : null;
}

function hasTemporarySignature(url) {
  const temporaryParameters = new Set([
    'token', 'signature', 'expires', 'sig', 'se', 'sv',
    'x-amz-signature', 'x-amz-credential', 'x-amz-expires',
    'x-goog-signature', 'x-goog-credential', 'x-goog-expires',
  ]);
  return [...url.searchParams.keys()].some((key) => temporaryParameters.has(key.toLowerCase()));
}

/** Classify a public storefront image reference without exposing private object paths as URLs. */
export function storefrontImageReference(reference, projectUrl) {
  if (typeof reference !== 'string') return null;
  const value = reference.trim();
  const legacyLocalAsset = localAssetFromFileReference(value);
  if (legacyLocalAsset) return { kind: 'url', url: legacyLocalAsset, legacyLocalFile: true };

  if (/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(value)) {
    const localPath = value.replace(/^(?:\.\.\/|\/)+/, '');
    return localPath.split('/').some((part) => part === '.' || part === '..') ? null : { kind: 'url', url: localPath };
  }

  const privateReference = privateImageReference(value, projectUrl);
  if (privateReference) return { kind: 'private', ...privateReference };
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || hasTemporarySignature(url) ||
      /\.supabase\.(?:co|in)$/i.test(url.hostname) || /\/storage\/v1\/object\//i.test(url.pathname)) return null;
    return { kind: 'url', url: url.href };
  } catch {
    return null;
  }
}
