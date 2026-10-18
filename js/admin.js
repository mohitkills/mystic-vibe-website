import { supabase } from './supabase-client.js';
// Optional dashboard modules are loaded after the admin session is verified.
// A broken non-auth module must never prevent the login gate from initializing.
import { SUPABASE_URL } from './supabase-config.js';
import { buildOrderSwap, buildSlidePayload, normalizePersistentImageReference, saveCmsRecord } from './cms-records.js';

const gate = document.querySelector('#admin-gate');
const gateMessage = document.querySelector('#gate-message');
const loginLink = document.querySelector('#login-link');
const workspace = document.querySelector('#admin-workspace');
const statusNode = document.querySelector('#admin-status');
const productImageStatus = document.querySelector('#product-image-status');
const productImagePreview = document.querySelector('#product-image-preview');
const productImageGallery = document.querySelector('#product-image-gallery');
const signOutButton = document.querySelector('#sign-out');
const bucketIds = ['mystic-vibe-images', 'mystic-vibe-media'];
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const mediaTypes = [...imageTypes, 'video/mp4'];
let products = [];
let collections = [];
let slides = [];
let siteContent = [];
let productImagePaths = [];
const pendingProductImagePaths = new Set();
const uploadingForms = new WeakSet();
let productPreviewRequest = 0;
const signedImageUrlCache = new Map();
let productUploadInProgress = false;
let productSaveInProgress = false;
let productFormDirty = false;
const activeFormSaves = new WeakSet();
const dirtyForms = new WeakSet();

function setStatus(message, isError) {
  statusNode.textContent = message || '';
  statusNode.classList.toggle('error', Boolean(isError));
}

function setProductImageStatus(message, isError) {
  productImageStatus.textContent = message || '';
  productImageStatus.classList.toggle('error', Boolean(isError));
}

function isPrivateStorageReference(reference) {
  const value = String(reference || '').trim();
  if (/^(?:\.\.\/|\/)?assets\//i.test(value)) return false;
  if (/^https:\/\//i.test(value)) {
    try { return /\.supabase\.(?:co|in)$/i.test(new URL(value).hostname) && /\/storage\/v1\/object\//i.test(new URL(value).pathname); } catch (error) { return false; }
  }
  return true;
}

function uniquePaths(paths) {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
}

function parseImagePaths(value) {
  if (Array.isArray(value)) return uniquePaths(value.filter((item) => typeof item === 'string'));
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return uniquePaths(parsed.filter((item) => typeof item === 'string'));
    if (typeof parsed === 'string' && parsed !== text) return parseImagePaths(parsed);
  } catch (error) {}
  return uniquePaths(text.split(/[\n\r]+/));
}

function syncProductImagePaths(paths) {
  productImagePaths = uniquePaths(paths);
  document.querySelector('#product-form').elements.namedItem('image_urls').value = productImagePaths.join('\n');
  productFormDirty = true;
  renderProductImageGallery();
}

function setProductSaveBusy(busy) {
  document.querySelectorAll('#product-form button[type="submit"], [form="product-form"][type="submit"]').forEach((button) => {
    button.disabled = busy;
    button.textContent = busy ? 'Please wait…' : 'Save Product';
  });
}

async function renderProductImageGallery() {
  const request = ++productPreviewRequest;
  const paths = [...productImagePaths];
  productImagePreview.hidden = paths.length === 0;
  productImageGallery.replaceChildren();
  for (const [index, reference] of paths.entries()) {
    const card = document.createElement('article');
    card.className = 'admin-product-image-item';
    const image = document.createElement('img');
    image.alt = `${index === 0 ? 'Main' : `Additional ${index}`} product image preview`;
    image.loading = 'lazy';
    image.src = 'assets/images/perfume-bottle.svg';
    const url = await signedImageUrl(reference);
    if (request !== productPreviewRequest) return;
    if (url) image.src = url;
    const path = document.createElement('code');
    path.textContent = reference;
    const actions = document.createElement('div');
    actions.className = 'admin-product-image-actions';
    const mainLabel = document.createElement('strong');
    mainLabel.textContent = index === 0 ? 'Main image' : `Image ${index + 1}`;
    actions.append(mainLabel);
    const moveButton = (label, action, disabled) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.productImageAction = action;
      button.dataset.index = String(index);
      button.disabled = disabled;
      return button;
    };
    actions.append(moveButton('Set as main', 'main', index === 0));
    actions.append(moveButton('Move up', 'up', index === 0));
    actions.append(moveButton('Move down', 'down', index === paths.length - 1));
    actions.append(moveButton('Remove', 'remove', false));
    card.append(image, path, actions);
    productImageGallery.append(card);
  }
}

function markAdminGateReady() {
  document.documentElement.dataset.adminGateState = 'ready';
  window.dispatchEvent(new Event('mystic-vibe-admin-ready'));
}

function showGate(message, showLogin) {
  gateMessage.textContent = message;
  loginLink.hidden = !showLogin;
  markAdminGateReady();
}

function showWorkspace(user) {
  gate.hidden = true;
  workspace.hidden = false;
  signOutButton.hidden = false;
  document.querySelector('#admin-user-label').textContent = user?.email || 'Signed-in administrator';
  markAdminGateReady();
}

function appendRecord(container, title, detail, id, actions, imageUrl) {
  const row = document.createElement('article');
  row.className = 'admin-record';
  const main = document.createElement('div');
  main.className = 'admin-record-main';
  if (imageUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = imageUrl;
    main.append(img);
  }
  const copy = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title || '(Untitled)';
  const subheading = document.createElement('span');
  subheading.textContent = detail || '';
  copy.append(heading, subheading);
  main.append(copy);
  const controls = document.createElement('div');
  controls.className = 'admin-record-actions';
  actions.forEach(({ label, action, danger }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = id;
    if (danger) button.classList.add('danger');
    controls.append(button);
  });
  row.append(main, controls);
  container.append(row);
}

async function signedImageUrl(reference) {
  if (!reference) return '';
  let value = String(reference).trim();
  if (/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(value)) {
    const localPath = value.replace(/^(?:\.\.\/|\/)+/, '');
    return localPath.split('/').some((part) => part === '.' || part === '..') ? '' : localPath;
  }

  let bucket = '';
  let path = '';
  if (/^https:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch (error) { return ''; }
    const object = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (object) {
      let supabaseOrigin;
      try { supabaseOrigin = new URL(SUPABASE_URL).origin; } catch (error) { return ''; }
      if (url.origin !== supabaseOrigin) return '';
      try {
      bucket = decodeURIComponent(object[1]);
      path = object[2].split('/').map((part) => decodeURIComponent(part)).join('/');
      } catch (error) { return ''; }
    } else {
      if (/[?&](?:token|signature|expires)=/i.test(url.search)) return '';
      if (url.username || url.password) return '';
      return url.href;
    }
  } else {
    const separator = value.indexOf('/');
    const hasBucket = separator > 0 && bucketIds.includes(value.slice(0, separator));
    bucket = hasBucket ? value.slice(0, separator) : 'mystic-vibe-images';
    path = hasBucket ? value.slice(separator + 1) : value;
  }
  if (!bucketIds.includes(bucket) || !path || path.split('/').some((part) => part === '.' || part === '..')) return '';

  const cacheKey = `${bucket}/${path}`;
  const cached = signedImageUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  signedImageUrlCache.delete(cacheKey);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 900);
  if (error || !data?.signedUrl) return '';
  signedImageUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + 840_000 });
  return data.signedUrl;
}

function emptyMessage(container, message) {
  const p = document.createElement('p');
  p.className = 'admin-help';
  p.textContent = message;
  container.replaceChildren(p);
}

async function renderProducts() {
  const container = document.querySelector('#product-list');
  container.replaceChildren();
  if (!products.length) return emptyMessage(container, 'No products are available yet.');
  const search = document.querySelector('#product-search').value.trim().toLowerCase();
  const collectionFilter = document.querySelector('#product-filter-collection').value;
  const statusFilter = document.querySelector('#product-filter-status').value;
  const sortBy = document.querySelector('#product-sort').value;
  const collectionById = new Map(collections.map((collection) => [collection.id, collection.name]));
  let visibleProducts = products.filter((product) => {
    const searchable = [product.name, product.slug, product.sku, product.fragrance_family, product.fragrance_notes]
      .filter(Boolean).join(' ').toLowerCase();
    if (search && !searchable.includes(search)) return false;
    if (collectionFilter && product.collection_id !== collectionFilter) return false;
    if (statusFilter === 'published' && !product.is_published) return false;
    if (statusFilter === 'draft' && product.is_published) return false;
    return true;
  });
  visibleProducts = [...visibleProducts].sort((left, right) => {
    if (sortBy === 'price') return Number(left.price || 0) - Number(right.price || 0);
    if (sortBy === 'collection') return String(collectionById.get(left.collection_id) || '').localeCompare(collectionById.get(right.collection_id) || '') || left.name.localeCompare(right.name);
    if (sortBy === 'publication') return Number(right.is_published) - Number(left.is_published) || left.name.localeCompare(right.name);
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
  if (!visibleProducts.length) return emptyMessage(container, 'No products match these search and filter settings.');
  for (const product of visibleProducts) {
    const image = parseImagePaths(product.image_urls)[0] || '';
    const imageUrl = image ? await signedImageUrl(image) : '';
    appendRecord(container, product.name, `${product.slug} · ${product.is_published ? 'Published' : 'Draft'} · Stock ${product.stock}`, product.id, [
      { label: 'Edit', action: 'edit-product' },
      { label: 'Duplicate', action: 'duplicate-product' },
      { label: product.is_published ? 'Unpublish' : 'Publish', action: 'toggle-product' },
      { label: 'Archive', action: 'archive-product' },
    ], imageUrl);
  }
}

async function renderSlides() {
  const container = document.querySelector('#slide-list');
  container.replaceChildren();
  if (!slides.length) return emptyMessage(container, 'No homepage slides are available yet.');
  for (const slide of slides) {
    const transition = String(slide.transition_style || 'fade').replace(/-/g, ' ');
    const buttonText = String(slide.cta_text || 'Explore').trim();
    appendRecord(container, slide.heading, `${slide.is_published ? 'Published' : 'Draft'} · Order ${slide.sort_order} · ${transition} · CTA “${buttonText}”`, slide.id, [
      { label: 'Edit', action: 'edit-slide' },
      { label: 'Duplicate', action: 'duplicate-slide' },
      { label: 'Move up', action: 'move-slide-up' },
      { label: 'Move down', action: 'move-slide-down' },
      { label: slide.is_published ? 'Unpublish' : 'Publish', action: 'toggle-slide' },
      { label: 'Archive', action: 'archive-slide' },
    ], await signedImageUrl(slide.image_url));
  }
}

async function renderCollections() {
  const container = document.querySelector('#collection-list');
  container.replaceChildren();
  if (!collections.length) return emptyMessage(container, 'No collections have been created yet.');
  for (const collection of collections) {
    const assigned = products.filter((product) => product.collection_id === collection.id);
    const preview = assigned.map((product) => product.name).join(', ');
    appendRecord(
      container,
      collection.name,
      `${collection.slug} ? ${collection.is_published ? 'Published' : 'Draft'} ? ${assigned.length} assigned products${preview ? `: ${preview}` : ''}`,
      collection.id,
      [
        { label: 'Edit', action: 'edit-collection' },
        { label: 'Duplicate', action: 'duplicate-collection' },
        { label: collection.is_published ? 'Unpublish' : 'Publish', action: 'toggle-collection' },
        { label: 'Archive', action: 'archive-collection' },
        { label: 'Delete permanently', action: 'delete-collection', danger: true },
      ],
      await signedImageUrl(collection.image_url),
    );
  }
}

function renderContent() {
  const container = document.querySelector('#content-list');
  container.replaceChildren();
  if (!siteContent.length) return emptyMessage(container, 'No site content records are available yet.');
  siteContent.forEach((item) => appendRecord(container, item.content_key, item.is_published ? 'Published' : 'Draft', item.content_key, [
    { label: 'Edit', action: 'edit-content' },
    { label: item.is_published ? 'Unpublish' : 'Publish', action: 'toggle-content' },
    { label: 'Archive', action: 'archive-content' },
  ]));
}

function renderDashboardSummary() {
  const total = products.length;
  const published = products.filter((item) => item.is_published).length;
  const draft = total - published;
  const stockUnits = products.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
  const lowStock = products.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= 5).length;
  const outOfStock = products.filter((item) => Number(item.stock) === 0).length;
  document.querySelector('#summary-products').textContent = String(total);
  document.querySelector('#summary-published').textContent = String(published);
  document.querySelector('#summary-drafts').textContent = String(draft);
  document.querySelector('#summary-stock').textContent = `${stockUnits} units · ${lowStock} low · ${outOfStock} out`;
  const recent = [...products.map((item) => ({ type: 'Product', title: item.name, at: item.updated_at || item.created_at })),
    ...slides.map((item) => ({ type: 'Slide', title: item.heading, at: item.updated_at || item.created_at })),
    ...collections.map((item) => ({ type: 'Collection', title: item.name, at: item.updated_at || item.created_at }))]
    .filter((item) => item.at && !Number.isNaN(Date.parse(item.at)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 5);
  const recentNode = document.querySelector('#recent-changes');
  recentNode.replaceChildren();
  if (!recent.length) {
    const note = document.createElement('p');
    note.className = 'admin-help';
    note.textContent = 'No persisted change history is available; the database has no audit log table.';
    recentNode.append(note);
    return;
  }
  recent.forEach((item) => {
    const row = document.createElement('p');
    row.textContent = `${item.type}: ${item.title} · ${new Date(item.at).toLocaleString()}`;
    recentNode.append(row);
  });
}

function renderCollectionOptions(selected) {
  const select = document.querySelector('#product-form select[name="collection_id"]');
  const filter = document.querySelector('#product-filter-collection');
  select.replaceChildren(new Option('No collection', ''));
  filter.replaceChildren(new Option('All collections', ''));
  collections.forEach((collection) => {
    const option = new Option(collection.name, collection.id);
    option.selected = collection.id === selected;
    select.add(option);
    filter.add(new Option(collection.name, collection.id));
  });
}

async function loadRecords() {
  const [productResult, collectionResult, slideResult, contentResult] = await Promise.all([
    supabase.from('products').select('*').order('sort_order').order('name'),
    supabase.from('collections').select('*').order('sort_order').order('name'),
    supabase.from('homepage_slides').select('*').order('sort_order').order('created_at'),
    supabase.from('site_content').select('*').order('content_key'),
  ]);
  for (const result of [productResult, collectionResult, slideResult, contentResult]) {
    if (result.error) throw result.error;
  }
  products = productResult.data || [];
  collections = collectionResult.data || [];
  slides = slideResult.data || [];
  siteContent = contentResult.data || [];
  renderCollectionOptions(document.querySelector('#product-form select[name="collection_id"]').value);
  await renderCollections();
  await Promise.all([renderProducts(), renderSlides()]);
  renderContent();
  renderDashboardSummary();
}

async function saveAndRefresh({ table, key, id, payload, form, formId, label, successMessage }) {
  const rows = table === 'products' ? products : table === 'collections' ? collections : table === 'homepage_slides' ? slides : siteContent;
  const existing = id ? rows.find((row) => row[key] === id) : null;
  const writePayload = { ...payload, updated_at: new Date().toISOString() };
  const saved = await saveCmsRecord(supabase, table, key, id, writePayload, { expectedUpdatedAt: existing?.updated_at });
  if (form) {
    const keyField = form.elements.namedItem(key);
    if (keyField) {
      keyField.value = saved[key];
      if (key !== 'id') keyField.readOnly = true;
    }
    dirtyForms.delete(form);
  }
  try {
    await loadRecords();
  } catch (error) {
    setStatus(`${label} was saved, but the dashboard could not refresh. Its saved ID is retained; reload the list before retrying. ${error.message || ''}`.trim(), true);
    return { saved, refreshed: false };
  }
  if (formId) resetForm(formId, { force: true });
  setStatus(successMessage);
  return { saved, refreshed: true };
}

function fillCollectionForm(id) {
  const collection = collections.find((item) => item.id === id);
  if (!collection) return;
  const form = document.querySelector('#collection-form');
  if (dirtyForms.has(form) && !window.confirm('Discard unsaved collection changes and edit another record?')) return;
  Object.entries(collection).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  });
  dirtyForms.delete(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveCollection(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (uploadingForms.has(form)) throw new Error('Wait for the collection image upload to finish before saving.');
  const id = formValue(form, 'id');
  const slug = formValue(form, 'slug');
  if (collections.some((collection) => collection.id !== id && collection.slug?.toLowerCase() === slug.toLowerCase())) {
    throw new Error('Another collection already uses this slug. Choose a unique slug before saving.');
  }
  const payload = {
    name: formValue(form, 'name'),
    slug,
    description: formValue(form, 'description'),
    image_url: normalizePersistentImageReference(formValue(form, 'image_url'), SUPABASE_URL) || null,
    sort_order: Number(formValue(form, 'sort_order') || 0),
    is_published: form.elements.namedItem('is_published').checked,
  };
  if (!payload.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) throw new Error('Enter a collection name and a valid lowercase slug.');
  if (!Number.isSafeInteger(payload.sort_order)) throw new Error('Collection order must be a whole number.');
  await saveAndRefresh({ table: 'collections', key: 'id', id, payload, form, formId: 'collection-form', label: 'Collection', successMessage: id ? 'Collection updated.' : 'Collection created.' });
}

async function seedMissingCollections() {
  const suggestions = [
    { name: 'Marine & Aquatic', slug: 'marine-aquatic', description: 'Marine, aquatic and blue fragrance profiles.', sort_order: 10 },
    { name: 'Fresh & Citrus', slug: 'fresh-citrus', description: 'Fresh, bright and citrus-led compositions.', sort_order: 20 },
    { name: 'Woody & Amber', slug: 'woody-amber', description: 'Woody, resinous and amber fragrance profiles.', sort_order: 30 },
    { name: 'Fruity & Floral', slug: 'fruity-floral', description: 'Fruity, floral and softly gourmand compositions.', sort_order: 40 },
    { name: 'Musk & Modern', slug: 'musk-modern', description: 'Modern musk and contemporary signature scents.', sort_order: 50 },
  ];
  const existingSlugs = new Set(collections.map((collection) => collection.slug));
  const missing = suggestions.filter((collection) => !existingSlugs.has(collection.slug));
  if (!missing.length) return setStatus('All suggested collection slugs already exist; no records were changed.');
  const { error } = await supabase.from('collections').upsert(
    missing.map((collection) => ({ ...collection, is_published: true })),
    { onConflict: 'slug', ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not create the missing collections: ${error.message}`);
  await loadRecords();
  setStatus(`Added any still-missing collection categories (${missing.length} were missing at the last refresh). Existing records were left unchanged.`);
}

async function deleteCollection(id) {
  const collection = collections.find((item) => item.id === id);
  if (!collection) return;
  const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('collection_id', id);
  if (error) throw error;
  if (count > 0) throw new Error(`Cannot delete “${collection.name}”: ${count} product${count === 1 ? ' is' : 's are'} assigned. Reassign those products in Products first, then retry.`);
  await deleteRecord('collections', 'id', id, 'collection', collection.updated_at);
}

function formValue(form, name) {
  return form.elements.namedItem(name).value.trim();
}

function resetForm(formId, options = {}) {
  const form = document.getElementById(formId);
  const hasSavedRecordId = Boolean(form.elements.namedItem('id')?.value || form.elements.namedItem('content_key')?.readOnly);
  if (formId === 'product-form' && (productFormDirty || pendingProductImagePaths.size || hasSavedRecordId) && !options.force) {
    const shouldClear = window.confirm('Clear this product form? Unsaved changes will be lost. Uploaded private files may remain orphaned in Storage.');
    if (!shouldClear) return false;
  } else if (formId !== 'product-form' && (dirtyForms.has(form) || hasSavedRecordId) && !options.force) {
    if (!window.confirm('Clear this form? Unsaved changes will be lost.')) return false;
  }
  form.reset();
  if (formId === 'product-form') {
    form.elements.namedItem('id').value = '';
    productImagePaths = [];
    pendingProductImagePaths.clear();
    productFormDirty = false;
    renderProductImageGallery();
    setProductImageStatus('');
    renderCollectionOptions();
  }
  if (formId === 'content-form') form.elements.namedItem('content_key').readOnly = false;
  dirtyForms.delete(form);
  return true;
}

function fillProductForm(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  if ((productFormDirty || pendingProductImagePaths.size) && !window.confirm('This product form has unsaved changes. Uploaded private files will remain in Storage and may become orphaned. Discard these changes and edit another product?')) return;
  const form = document.querySelector('#product-form');
  Object.entries(product).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else if (key === 'image_urls') field.value = parseImagePaths(value).join('\n');
    else field.value = value ?? '';
  });
  productImagePaths = parseImagePaths(product.image_urls);
  pendingProductImagePaths.clear();
  productFormDirty = false;
  dirtyForms.delete(form);
  dirtyForms.delete(form);
  renderProductImageGallery();
  setProductImageStatus(productImagePaths.length ? 'Saved product image path loaded.' : '');
  renderCollectionOptions(product.collection_id);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fillSlideForm(id) {
  const slide = slides.find((item) => item.id === id);
  if (!slide) return;
  const form = document.querySelector('#slide-form');
  if (dirtyForms.has(form) && !window.confirm('Discard unsaved slide changes and edit another record?')) return;
  Object.entries(slide).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  });
  dirtyForms.delete(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function previewSlide() {
  const form = document.querySelector('#slide-form');
  const id = formValue(form, 'id');
  const payload = buildSlidePayload({
    heading: formValue(form, 'heading'),
    subtitle: formValue(form, 'subtitle'),
    cta_text: formValue(form, 'cta_text'),
    cta_link: formValue(form, 'cta_link'),
    image_url: formValue(form, 'image_url'),
    sort_order: formValue(form, 'sort_order'),
    transition_style: formValue(form, 'transition_style'),
    is_published: form.elements.namedItem('is_published').checked,
  }, slides.find((slide) => slide.id === id) || null, location.origin, SUPABASE_URL);
  const dialog = document.querySelector('#slide-preview');
  const stage = dialog.querySelector('.slide-preview-stage');
  const previewImage = stage.querySelector('img');
  const previewLink = stage.querySelector('a');
  stage.querySelector('h3').textContent = payload.heading;
  stage.querySelector('p').textContent = 'Transition: ' + payload.transition_style.replace(/-/g, ' ');
  stage.dataset.transitionStyle = payload.transition_style;
  previewLink.textContent = payload.cta_text;
  previewLink.href = payload.cta_link;
  previewImage.src = payload.image_url ? (await signedImageUrl(payload.image_url)) || 'assets/images/hero-royal-marine.png' : 'assets/images/hero-royal-marine.png';
  previewImage.alt = `${payload.heading} preview`;
  if (!dialog.open) dialog.showModal();
}

function fillContentForm(key) {
  const record = siteContent.find((item) => item.content_key === key);
  if (!record) return;
  const form = document.querySelector('#content-form');
  if (dirtyForms.has(form) && !window.confirm('Discard unsaved content changes and edit another record?')) return;
  form.elements.namedItem('content_key').value = record.content_key;
  form.elements.namedItem('content_key').readOnly = true;
  form.elements.namedItem('content_value').value = JSON.stringify(record.content_value, null, 2);
  form.elements.namedItem('is_published').checked = record.is_published;
  dirtyForms.delete(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveProduct(event) {
  event.preventDefault();
  if (productSaveInProgress) return;
  if (productUploadInProgress) throw new Error('Wait for the image upload to finish before saving this product.');
  productSaveInProgress = true;
  setProductSaveBusy(true);
  try {
    const form = event.currentTarget;
    const id = formValue(form, 'id');
    const slug = formValue(form, 'slug');
    const sku = formValue(form, 'sku');
    const collectionId = formValue(form, 'collection_id');
    if (products.some((product) => product.id !== id && product.slug?.toLowerCase() === slug.toLowerCase())) {
      throw new Error('Another product already uses this slug. Choose a unique slug before saving.');
    }
    if (sku && products.some((product) => product.id !== id && product.sku?.toLowerCase() === sku.toLowerCase())) {
      throw new Error('Another product already uses this SKU. Choose a unique SKU before saving.');
    }
    const imagePaths = uniquePaths(productImagePaths.map((reference) => normalizePersistentImageReference(reference, SUPABASE_URL)));
    syncProductImagePaths(imagePaths);
    const payload = {
      name: formValue(form, 'name'),
      slug,
      collection_id: collectionId || null,
      sku: sku || null,
      tagline: formValue(form, 'tagline'),
      description: formValue(form, 'description'),
      fragrance_family: formValue(form, 'fragrance_family'),
      fragrance_notes: formValue(form, 'fragrance_notes'),
      size_ml: Number(formValue(form, 'size_ml')),
      price: Number(formValue(form, 'price')),
      mrp: Number(formValue(form, 'mrp')),
      stock: Number(formValue(form, 'stock')),
      sort_order: Number(formValue(form, 'sort_order') || 0),
      image_urls: imagePaths,
      is_featured: form.elements.namedItem('is_featured').checked,
      is_published: form.elements.namedItem('is_published').checked,
    };
    if (!payload.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) throw new Error('Enter a product name and a valid lowercase slug.');
    if (!Number.isSafeInteger(payload.size_ml) || payload.size_ml < 1) throw new Error('Product size must be a positive whole number of milliliters.');
    if (![payload.price, payload.mrp].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Price and MRP must be valid non-negative amounts.');
    if (payload.price > payload.mrp) throw new Error('Sale price cannot be higher than MRP.');
    if (!Number.isSafeInteger(payload.stock) || payload.stock < 0) throw new Error('Stock must be a non-negative whole number.');
    if (!Number.isSafeInteger(payload.sort_order)) throw new Error('Product order must be a whole number.');
    const orphanedUploads = [...pendingProductImagePaths].filter((reference) => !imagePaths.includes(reference));
    const { saved, refreshed } = await saveAndRefresh({
      table: 'products', key: 'id', id, payload, form, formId: null,
      label: 'Product', successMessage: `${id ? 'Product updated' : 'Product created'} successfully.${orphanedUploads.length ? ' An uploaded image was removed from this product and may remain orphaned in private Storage; it was not deleted.' : ''}`,
    });
    dirtyForms.delete(form);
    if (refreshed) resetForm('product-form', { force: true });
    pendingProductImagePaths.clear();
    productFormDirty = false;
    if (!refreshed) form.elements.namedItem('id').value = saved.id;
    setProductImageStatus(imagePaths.length ? (imagePaths.some(isPrivateStorageReference) ? 'Product image paths saved in order. The storefront serves published private images through its image function; local artwork remains the fallback if that function is unavailable.' : 'Product record saved with its ordered image list.') : '');
  } finally {
    productSaveInProgress = false;
    setProductSaveBusy(false);
  }
}

async function saveSlide(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (uploadingForms.has(form)) throw new Error('Wait for the slide image upload to finish before saving.');
  const id = formValue(form, 'id');
  const existing = slides.find((slide) => slide.id === id) || null;
  const fields = Object.fromEntries(['heading', 'cta_text', 'cta_link', 'image_url', 'sort_order', 'transition_style'].map((key) => [key, formValue(form, key)]));
  fields.is_published = form.elements.namedItem('is_published').checked;
  const payload = buildSlidePayload(fields, existing, location.origin, SUPABASE_URL);
  await saveAndRefresh({ table: 'homepage_slides', key: 'id', id, payload, form, formId: 'slide-form', label: 'Homepage slide', successMessage: id ? 'Homepage slide updated.' : 'Homepage slide created.' });
}

async function saveContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  let parsedValue;
  try {
    parsedValue = JSON.parse(formValue(form, 'content_value'));
  } catch (error) {
    throw new Error('Content value must be valid JSON.');
  }
  const payload = {
    content_key: formValue(form, 'content_key'),
    content_value: parsedValue,
    is_published: form.elements.namedItem('is_published').checked,
    updated_at: new Date().toISOString(),
  };
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(payload.content_key)) throw new Error('Content keys may use lowercase letters, numbers, dots, underscores and hyphens.');
  if (formValue(form, 'content_value').length > 100_000) throw new Error('Content JSON must be 100 KB or smaller.');
  const keyField = form.elements.namedItem('content_key');
  const existing = siteContent.some((item) => item.content_key === payload.content_key) || keyField.readOnly;
  await saveAndRefresh({ table: 'site_content', key: 'content_key', id: existing ? payload.content_key : '', payload, form, formId: 'content-form', label: 'Site content', successMessage: existing ? 'Site content updated.' : 'Site content created.' });
}

async function deleteRecord(table, key, value, label, expectedUpdatedAt) {
  if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
  let query = supabase.from(table).delete().eq(key, value);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select(key).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${label[0].toUpperCase()}${label.slice(1)} was not deleted. It may have changed since this list loaded; refresh and review the latest record.`);
  try { await loadRecords(); } catch (refreshError) {
    setStatus(`${label[0].toUpperCase()}${label.slice(1)} was deleted, but the dashboard could not refresh. Reload the list. ${refreshError.message || ''}`.trim(), true);
    return;
  }
  setStatus(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
}

function safeFilename(name) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'upload';
}

async function uploadFile(bucket, file, prefix) {
  if (!bucketIds.includes(bucket)) throw new Error('Unknown Storage bucket.');
  const allowedTypes = bucket === 'mystic-vibe-images' ? imageTypes : mediaTypes;
  if (!allowedTypes.includes(file.type)) throw new Error('This file type is not allowed for the selected bucket.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Files must be 5 MiB or smaller.');
  const objectPath = `${prefix}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return `${bucket}/${objectPath}`;
}

function showMediaResult(bucket, reference, fileType) {
  const result = document.querySelector('#media-result');
  const previewHolder = document.createElement(fileType === 'video/mp4' ? 'video' : 'img');
  previewHolder.controls = fileType === 'video/mp4';
  previewHolder.alt = fileType === 'video/mp4' ? '' : 'Private media preview';
  const copy = document.createElement('div');
  copy.className = 'media-copy';
  const title = document.createElement('strong');
  title.textContent = 'Private object uploaded';
  const path = document.createElement('code');
  path.textContent = reference;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Copy path';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setStatus('Storage path copied.');
    } catch (error) {
      setStatus('Clipboard access was unavailable; select and copy the path.', true);
    }
  });
  copy.append(title, path, button);
  result.replaceChildren(previewHolder, copy);
  result.hidden = false;
  signedImageUrl(reference).then((url) => {
    if (url) previewHolder.src = url;
  });
}

async function listBucketFiles(bucket) {
  const files = [];
  const folders = [''];
  while (folders.length && files.length < 100) {
    const prefix = folders.shift();
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      for (const item of data || []) {
        if (!item?.name || item.name === '.' || item.name === '..' || item.name.includes('\\')) continue;
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) files.push({ bucket, path, ...item });
        else if (folders.length < 100 && path.split('/').length < 5) folders.push(path);
        if (files.length >= 100) break;
      }
      if (!data || data.length < 100 || files.length >= 100) break;
    }
  }
  return files;
}

async function renderMediaLibrary() {
  const container = document.querySelector('#media-library-list');
  emptyMessage(container, 'Loading private media…');
  const results = await Promise.all(bucketIds.map(async (bucket) => {
    try { return { bucket, files: await listBucketFiles(bucket), error: '' }; }
    catch (error) { return { bucket, files: [], error: error.message || 'Could not list this bucket.' }; }
  }));
  const files = results.flatMap((result) => result.files);
  container.replaceChildren();
  results.filter((result) => result.error).forEach((result) => {
    const message = document.createElement('p');
    message.className = 'admin-help error';
    message.textContent = `${result.bucket}: ${result.error}`;
    container.append(message);
  });
  if (!files.length && !results.some((result) => result.error)) return emptyMessage(container, 'No stored media was found in these private buckets.');
  const cards = await Promise.all(files.map(async (file) => {
    const metadata = file.metadata || {};
    const contentType = metadata.mimetype || metadata.contentType || 'Unknown file type';
    const isVideo = contentType === 'video/mp4';
    const url = await signedImageUrl(`${file.bucket}/${file.path}`);
    const card = document.createElement('article');
    card.className = 'admin-record media-library-item';
    const preview = isVideo ? document.createElement('video') : document.createElement('img');
    if (isVideo) preview.controls = true;
    else preview.alt = `Preview of ${file.path}`;
    if (isVideo) preview.preload = 'metadata';
    else preview.loading = 'lazy';
    preview.hidden = !url;
    const details = document.createElement('div');
    details.className = 'admin-record-main';
    const title = document.createElement('strong');
    title.textContent = file.path.split('/').pop();
    const note = document.createElement('span');
    const size = Number(metadata.size);
    note.textContent = `${file.bucket} · ${contentType} · ${Number.isFinite(size) ? `${(size / 1024).toFixed(1)} KiB` : 'size unavailable'}${file.updated_at ? ` · ${new Date(file.updated_at).toLocaleDateString()}` : ''}`;
    if (!isVideo) preview.addEventListener('load', () => {
      if (preview.naturalWidth && preview.naturalHeight) note.textContent += ` · ${preview.naturalWidth} × ${preview.naturalHeight}px`;
    }, { once: true });
    else preview.addEventListener('loadedmetadata', () => {
      if (preview.videoWidth && preview.videoHeight) note.textContent += ` · ${preview.videoWidth} × ${preview.videoHeight}px`;
    }, { once: true });
    if (url) preview.src = url;
    const path = document.createElement('code');
    path.textContent = `${file.bucket}/${file.path}`;
    details.append(title, note, path);
    const controls = document.createElement('div');
    controls.className = 'admin-record-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy path';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${file.bucket}/${file.path}`); setStatus('Private Storage path copied.'); }
      catch { setStatus('Clipboard access unavailable; select and copy the path.', true); }
    });
    controls.append(copy);
    card.append(preview, details, controls);
    return card;
  }));
  container.append(...cards);
  setStatus(`Media library loaded. Showing up to ${files.length} files from the private buckets.`);
}

async function handleUploadInput(event) {
  const input = event.currentTarget;
  const files = [...(input.files || [])];
  if (!files.length) return;
  const isSlide = input.name === 'slide-image';
  const isProductImage = input.name === 'product-image';
  const isCollectionImage = input.name === 'collection-image';
  const form = input.form;
  const bucket = 'mystic-vibe-images';
  const prefix = isSlide ? 'slides' : isCollectionImage ? 'collections' : 'products';
  const existingProductImagePaths = isProductImage ? [...productImagePaths] : [];
  const uploadedProductImagePaths = [];
  if (isProductImage) {
    productUploadInProgress = true;
    setProductSaveBusy(true);
    setProductImageStatus(`Uploading ${files.length} image${files.length === 1 ? '' : 's'} to private Storage...`);
  }
  uploadingForms.add(form);
  try {
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      setStatus(`Uploading image ${index + 1} of ${files.length} to private Storage...`);
      if (isProductImage) setProductImageStatus(`Uploading image ${index + 1} of ${files.length}...`);
      const reference = await uploadFile(bucket, file, prefix);
      uploaded += 1;
      if (isProductImage) {
        pendingProductImagePaths.add(reference);
        uploadedProductImagePaths.push(reference);
        syncProductImagePaths([...uploadedProductImagePaths, ...existingProductImagePaths]);
      } else {
        form.elements.namedItem('image_url').value = reference;
        if (isCollectionImage) setStatus('Collection image uploaded and attached to this form. Save collection to finish.');
        else setStatus('Slide image uploaded and attached to this form. Save slide to finish.');
      }
    }
    if (isProductImage) {
      await renderProductImageGallery();
      setProductImageStatus(`${uploaded} image${uploaded === 1 ? '' : 's'} uploaded to private Storage and placed first as the main image. Save Product to finish; the ordered paths are retained in this form.`);
      setStatus('Images uploaded. Save Product to finish.');
    }
  } catch (error) {
    const message = error.message || 'Image upload failed.';
    setStatus(message, true);
    if (isProductImage) setProductImageStatus(`${message} Completed uploads remain in the form path list and can be saved or removed; unused private objects may be orphaned.`, true);
  } finally {
    uploadingForms.delete(form);
    if (isProductImage) {
      productUploadInProgress = false;
      setProductSaveBusy(false);
    }
    input.value = '';
  }
}

async function saveMedia(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.namedItem('file').files?.[0];
  if (!file) throw new Error('Choose a file to upload.');
  const bucket = formValue(form, 'bucket');
  setStatus('Uploading file to private Storage…');
  const reference = await uploadFile(bucket, file, 'library');
  showMediaResult(bucket, reference, file.type);
  form.reset();
  await renderMediaLibrary();
  setStatus('Private upload complete. Preview link expires after 15 minutes.');
}

async function runFormHandler(handler, event) {
  const form = event?.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
  if (form && activeFormSaves.has(form)) return;
  if (form) activeFormSaves.add(form);
  const submitButtons = form ? [...form.querySelectorAll('button[type="submit"]'), ...document.querySelectorAll(`[form="${form.id}"][type="submit"]`)] : [];
  submitButtons.forEach((button) => { button.disabled = true; });
  setStatus('Saving…');
  try {
    await handler(event);
  } catch (error) {
    const message = error.message || 'The change could not be saved.';
    if (handler === saveProduct) {
      const retry = 'Check required fields and your admin access, then retry Save Product. If the request timed out, reload the product list first to check whether it saved and avoid creating a duplicate. The current form values and image path have been kept.';
      const orphan = pendingProductImagePaths.size
        ? ' The uploaded private file may remain orphaned if the product is not saved; after saving, remove an unused file from Storage if needed.'
        : '';
      setStatus(`Product save failed: ${message} ${retry}${orphan}`, true);
      if (pendingProductImagePaths.size) {
        setProductImageStatus(`Image uploaded — Save Product to finish. Save failed; the path is retained for retry.${orphan}`, true);
      }
      return;
    }
    setStatus(message, true);
  } finally {
    if (form) activeFormSaves.delete(form);
    submitButtons.forEach((button) => { button.disabled = false; });
  }
}

function uniqueSlug(base, records) {
  const normalized = String(base || 'copy').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'copy';
  const used = new Set(records.map((record) => record.slug?.toLowerCase()).filter(Boolean));
  let candidate = `${normalized}-copy`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${normalized}-copy-${suffix++}`;
  return candidate;
}

async function setPublished(table, key, id, published, label) {
  const rows = table === 'products' ? products : table === 'collections' ? collections : table === 'homepage_slides' ? slides : siteContent;
  const existing = rows.find((row) => row[key] === id);
  const saved = await saveCmsRecord(supabase, table, key, id, { is_published: published, updated_at: new Date().toISOString() }, { expectedUpdatedAt: existing?.updated_at });
  try { await loadRecords(); } catch (error) {
    setStatus(`${label} was ${published ? 'published' : 'unpublished'}, but the list did not refresh. Reload to verify. ${error.message || ''}`.trim(), true);
    return;
  }
  setStatus(`${label} ${published ? 'published' : 'unpublished'}.`);
  return saved;
}

async function archiveRecord(table, key, id, label, record) {
  if (!record) return;
  const collectionImpact = table === 'collections'
    ? ` ${products.filter((product) => product.collection_id === id).length} assigned product(s) remain published but will no longer show this collection.`
    : '';
  const catalogNote = table === 'products' && (window.MV_STATIC_PRODUCTS || []).some((product) => product.slug === record.slug)
    ? ' The original static fallback still displays this catalog item until a deliberate catalog removal feature is approved.'
    : '';
  if (!window.confirm(`Archive "${label}"? This keeps the record and its media, and unpublishes it from the storefront.${collectionImpact}${catalogNote}`)) {
    setStatus('Archive cancelled. No record changed.');
    return;
  }
  await setPublished(table, key, id, false, label);
}

function duplicateProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  if ((productFormDirty || pendingProductImagePaths.size) && !window.confirm('Discard the current product form and prepare this duplicate? Any unsaved uploaded private files may remain orphaned.')) return;
  productFormDirty = false;
  pendingProductImagePaths.clear();
  fillProductForm(id);
  const form = document.querySelector('#product-form');
  form.elements.namedItem('id').value = '';
  form.elements.namedItem('name').value = `${product.name} Copy`;
  form.elements.namedItem('slug').value = uniqueSlug(product.slug, products);
  form.elements.namedItem('sku').value = '';
  form.elements.namedItem('is_published').checked = false;
  productFormDirty = true;
  setStatus('Duplicate prepared as a draft. Review its slug and SKU before saving.');
}

function duplicateCollection(id) {
  const collection = collections.find((item) => item.id === id);
  if (!collection) return;
  const form = document.querySelector('#collection-form');
  if (dirtyForms.has(form) && !window.confirm('Discard unsaved collection changes and prepare this duplicate?')) return;
  dirtyForms.delete(form);
  fillCollectionForm(id);
  form.elements.namedItem('id').value = '';
  form.elements.namedItem('name').value = `${collection.name} Copy`;
  form.elements.namedItem('slug').value = uniqueSlug(collection.slug, collections);
  form.elements.namedItem('is_published').checked = false;
  dirtyForms.add(form);
  setStatus('Collection duplicate prepared as a draft. Review it before saving.');
}

function duplicateSlide(id) {
  const slide = slides.find((item) => item.id === id);
  if (!slide) return;
  const form = document.querySelector('#slide-form');
  if (dirtyForms.has(form) && !window.confirm('Discard unsaved slide changes and prepare this duplicate?')) return;
  dirtyForms.delete(form);
  fillSlideForm(id);
  form.elements.namedItem('id').value = '';
  form.elements.namedItem('heading').value = `${slide.heading} Copy`;
  form.elements.namedItem('sort_order').value = String(Math.max(0, ...slides.map((item) => Number(item.sort_order) || 0)) + 1);
  form.elements.namedItem('is_published').checked = false;
  dirtyForms.add(form);
  setStatus('Slide duplicate prepared as a draft. The image path is shared until you replace it.');
}

async function moveSlide(id, direction) {
  const changes = buildOrderSwap(slides, id, direction);
  if (!changes.length) return;
  try {
    for (const change of changes) {
      const existing = slides.find((slide) => slide.id === change.id);
      await saveCmsRecord(supabase, 'homepage_slides', 'id', change.id, { sort_order: change.sort_order, updated_at: new Date().toISOString() }, { expectedUpdatedAt: existing?.updated_at });
    }
  } catch (error) {
    try { await loadRecords(); } catch {}
    setStatus(`Slide order was not fully changed. The current server order has been reloaded; review it and retry if needed. ${error.message || ''}`.trim(), true);
    return;
  }
  try { await loadRecords(); } catch (error) {
    setStatus(`Slide order was updated but the dashboard could not refresh. Reload to verify. ${error.message || ''}`.trim(), true);
    return;
  }
  setStatus('Homepage slide order updated.');
}

function activateTab(name) {
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function setPreviewSize(size) {
  const stage = document.querySelector('#slide-preview .slide-preview-stage');
  stage.dataset.previewViewport = size === 'mobile' ? 'mobile' : 'desktop';
  document.querySelectorAll('[data-preview-size]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.previewSize === stage.dataset.previewViewport));
  });
}

async function initializeAdmin() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) {
    showGate('Sign in with an administrator account to continue.', true);
    return;
  }
  signOutButton.hidden = false;
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_current_user_admin');
  if (adminError) {
    showGate('Admin verification is unavailable. Apply the reviewed admin security migration before using this dashboard.', false);
    setStatus(adminError.message, true);
    return;
  }
  if (isAdmin !== true) {
    showGate('This signed-in account is not authorized for the admin dashboard.', false);
    return;
  }
  showWorkspace(session.user);
  try {
    await loadRecords();
  } catch (error) {
    console.error('Mystic Vibe catalog/content admin data could not load:', error);
    setStatus(error?.message || 'Catalog/content data could not load. The admin account is authenticated; retry loading records.', true);
  }

  const optionalModules = [
    { label: 'Orders', load: () => import('./orders-admin.js'), initialize: 'initializeOrdersAdmin' },
    { label: 'Store settings', load: () => import('./store-settings.js'), initialize: 'initializeStoreSettings' },
    { label: 'Coupons', load: () => import('./coupons-admin.js'), initialize: 'initializeCouponsAdmin' },
    { label: 'Customers', load: () => import('./customers-admin.js'), initialize: 'initializeCustomersAdmin' },
    { label: 'Newsletter', load: () => import('./marketing-admin.js'), initialize: 'initializeMarketingAdmin' },
  ];
  const moduleResults = await Promise.allSettled(optionalModules.map(async (feature) => {
    const module = await feature.load();
    if (typeof module[feature.initialize] !== 'function') {
      throw new Error('The module did not provide its expected initializer.');
    }
    module[feature.initialize](supabase);
    return feature.label;
  }));
  const failedFeatures = moduleResults.flatMap((result, index) => result.status === 'rejected'
    ? [{ label: optionalModules[index].label, error: result.reason }]
    : []);
  if (failedFeatures.length) {
    failedFeatures.forEach((feature) => console.error('Mystic Vibe admin feature failed to initialize:', feature.label, feature.error));
    const firstFailure = failedFeatures[0]?.error;
    const detail = firstFailure?.message ? ' (' + firstFailure.message + ')' : '';
    setStatus('Admin access is verified, but these sections could not load: ' +
      failedFeatures.map((feature) => feature.label).join(', ') +
      detail + '. Refresh the page or check the browser connection.', true);
  }
}

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  const currentPanel = document.querySelector('[data-panel].active');
  if (currentPanel?.dataset.panel === 'products' && button.dataset.tab !== 'products' && productFormDirty &&
      !window.confirm('Product changes are still in the form and will be kept while you visit this tab. Continue?')) return;
  activateTab(button.dataset.tab);
}));
document.querySelectorAll('[data-reset-form]').forEach((button) => button.addEventListener('click', () => {
  const cleared = resetForm(button.dataset.resetForm);
  if (cleared !== false && button.dataset.jumpTab) activateTab(button.dataset.jumpTab);
}));
document.querySelectorAll('[data-jump-tab]:not([data-reset-form])').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.jumpTab)));
document.querySelector('#product-form').addEventListener('submit', (event) => runFormHandler(saveProduct, event));
document.querySelector('#product-form').addEventListener('input', (event) => {
  productFormDirty = true;
  dirtyForms.add(event.currentTarget);
  if (event.target.name === 'image_urls') {
    productImagePaths = parseImagePaths(event.target.value);
    renderProductImageGallery();
  }
});
document.querySelector('#product-form').addEventListener('change', (event) => { productFormDirty = true; dirtyForms.add(event.currentTarget); });
['collection-form', 'slide-form', 'content-form'].forEach((id) => {
  const form = document.getElementById(id);
  form.addEventListener('input', () => dirtyForms.add(form));
  form.addEventListener('change', () => dirtyForms.add(form));
});
document.querySelector('#product-image-gallery').addEventListener('click', (event) => {
  const button = event.target.closest('[data-product-image-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || index < 0 || index >= productImagePaths.length) return;
  if (button.dataset.productImageAction === 'remove') {
    productImagePaths.splice(index, 1);
    syncProductImagePaths(productImagePaths);
    setProductImageStatus('Image removed from this product list. The Storage object was not deleted and may be orphaned if no record references it.');
    return;
  }
  const target = button.dataset.productImageAction === 'main' ? 0
    : button.dataset.productImageAction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= productImagePaths.length) return;
  const [reference] = productImagePaths.splice(index, 1);
  productImagePaths.splice(target, 0, reference);
  syncProductImagePaths(productImagePaths);
  setProductImageStatus('Image order changed. Save Product to persist the new main image and gallery order.');
});
document.querySelector('#collection-form').addEventListener('submit', (event) => runFormHandler(saveCollection, event));
document.querySelector('#seed-collections').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  runFormHandler(seedMissingCollections).finally(() => { button.disabled = false; });
});
document.querySelector('#slide-form').addEventListener('submit', (event) => runFormHandler(saveSlide, event));
document.querySelector('#content-form').addEventListener('submit', (event) => runFormHandler(saveContent, event));
document.querySelector('#media-form').addEventListener('submit', (event) => runFormHandler(saveMedia, event));
document.querySelector('#refresh-media').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  runFormHandler(renderMediaLibrary).finally(() => { button.disabled = false; });
});
document.querySelector('[data-preview-slide]').addEventListener('click', () => runFormHandler(previewSlide));
document.querySelectorAll('[data-preview-size]').forEach((button) => button.addEventListener('click', () => setPreviewSize(button.dataset.previewSize)));
document.querySelector('[data-close-slide-preview]').addEventListener('click', () => document.querySelector('#slide-preview').close());
document.querySelectorAll('input[name="product-image"], input[name="slide-image"], input[name="collection-image"]').forEach((input) => input.addEventListener('change', handleUploadInput));
['product-search', 'product-filter-collection', 'product-filter-status', 'product-sort'].forEach((id) => {
  const control = document.getElementById(id);
  control.addEventListener(id === 'product-search' ? 'input' : 'change', () => renderProducts());
});
document.querySelector('#media-form select[name="bucket"]').addEventListener('change', (event) => {
  document.querySelector('#media-form input[name="file"]').accept = event.target.value === 'mystic-vibe-images'
    ? imageTypes.join(',')
    : mediaTypes.join(',');
});

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    workspace.hidden = true;
    gate.hidden = false;
    showGate('Your session has ended. Sign in again to continue.', true);
  }
});

window.addEventListener('beforeunload', (event) => {
  if (!productFormDirty && !pendingProductImagePaths.size && !['collection-form', 'slide-form', 'content-form'].some((id) => dirtyForms.has(document.getElementById(id)))) return;
  event.preventDefault();
  event.returnValue = '';
});

document.addEventListener('click', (event) => {
  const galleryButton = event.target.closest('[data-product-image-action]');
  if (galleryButton) return;
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.disabled) return;
  const { action, id } = button.dataset;
  button.disabled = true;
  const operation = async () => {
    if (action === 'edit-product') { fillProductForm(id); setStatus('Product loaded into the form.'); return; }
    if (action === 'edit-collection') { fillCollectionForm(id); setStatus('Collection loaded into the form.'); return; }
    if (action === 'edit-slide') { fillSlideForm(id); setStatus('Slide loaded into the form.'); return; }
    if (action === 'edit-content') { fillContentForm(id); setStatus('Site content loaded into the form.'); return; }
    if (action === 'duplicate-product') return duplicateProduct(id);
    if (action === 'duplicate-collection') return duplicateCollection(id);
    if (action === 'duplicate-slide') return duplicateSlide(id);
    if (action === 'move-slide-up') return moveSlide(id, -1);
    if (action === 'move-slide-down') return moveSlide(id, 1);
    if (action === 'toggle-product') return setPublished('products', 'id', id, !products.find((item) => item.id === id)?.is_published, 'Product');
    if (action === 'toggle-collection') return setPublished('collections', 'id', id, !collections.find((item) => item.id === id)?.is_published, 'Collection');
    if (action === 'toggle-slide') return setPublished('homepage_slides', 'id', id, !slides.find((item) => item.id === id)?.is_published, 'Homepage slide');
    if (action === 'toggle-content') return setPublished('site_content', 'content_key', id, !siteContent.find((item) => item.content_key === id)?.is_published, 'Site content');
    if (action === 'archive-product') return archiveRecord('products', 'id', id, products.find((item) => item.id === id)?.name, products.find((item) => item.id === id));
    if (action === 'archive-collection') return archiveRecord('collections', 'id', id, collections.find((item) => item.id === id)?.name, collections.find((item) => item.id === id));
    if (action === 'archive-slide') return archiveRecord('homepage_slides', 'id', id, slides.find((item) => item.id === id)?.heading, slides.find((item) => item.id === id));
    if (action === 'archive-content') return archiveRecord('site_content', 'content_key', id, id, siteContent.find((item) => item.content_key === id));
    if (action === 'delete-collection') return deleteCollection(id);
  };
  runFormHandler(operation).finally(() => { button.disabled = false; });
});

signOutButton.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) setStatus(error.message, true);
  else {
    signedImageUrlCache.clear();
    location.href = 'login.html';
  }
});

initializeAdmin().catch((error) => {
  showGate('The dashboard could not load. Check the browser-safe Supabase configuration and network connection.', false);
  setStatus(error.message || 'Initialization failed.', true);
});
