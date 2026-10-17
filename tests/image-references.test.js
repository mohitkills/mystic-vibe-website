import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { localAssetFromFileReference, storefrontImageReference } from '../js/image-references.js';

test('a legacy Windows file URL inside the site assets resolves to a same-site asset URL', () => {
  const reference = 'file:///C:/Users/PC/Desktop/mystic-vibe-site/assets/images/p1.jpg';
  const assetUrl = localAssetFromFileReference(reference);

  assert.equal(assetUrl, 'assets/images/p1.jpg');
  assert.equal(existsSync(fileURLToPath(new URL('../assets/images/p1.jpg', import.meta.url))), true);
});

test('local file references outside the public assets directory are rejected', () => {
  assert.equal(localAssetFromFileReference('file:///C:/Users/PC/Desktop/private/photo.jpg'), null);
  assert.equal(localAssetFromFileReference('file:///C:/assets/../private/photo.jpg'), null);
  assert.equal(localAssetFromFileReference('file:///C:/assets/images/notes.txt'), null);
  assert.equal(localAssetFromFileReference('https://example.com/assets/images/p1.jpg'), null);
});

test('encoded asset names remain confined to the assets directory', () => {
  assert.equal(
    localAssetFromFileReference('file:///C:/site/assets/images/rose%20gold.png'),
    'assets/images/rose%20gold.png',
  );
  assert.equal(localAssetFromFileReference('file:///C:/site/assets/images/%2e%2e%2fsecret.png'), null);
});

test('storefront image resolver classifies local assets, approved private paths and ordinary HTTPS URLs', () => {
  assert.deepEqual(storefrontImageReference('assets/images/p1.jpg', 'https://abjvxemteuhnkuvpkess.supabase.co'), {
    kind: 'url', url: 'assets/images/p1.jpg',
  });
  assert.deepEqual(storefrontImageReference(
    'mystic-vibe-images/products/hero.png', 'https://abjvxemteuhnkuvpkess.supabase.co',
  ), { kind: 'private', bucket: 'mystic-vibe-images', path: 'products/hero.png' });
  assert.deepEqual(storefrontImageReference(
    'https://cdn.example.com/hero.png?v=2', 'https://abjvxemteuhnkuvpkess.supabase.co',
  ), { kind: 'url', url: 'https://cdn.example.com/hero.png?v=2' });
  assert.equal(storefrontImageReference(
    'file:///C:/Users/PC/Desktop/mystic-vibe-site/assets/images/p1.jpg', 'https://abjvxemteuhnkuvpkess.supabase.co',
  ).legacyLocalFile, true);
});

test('storefront image resolver rejects arbitrary storage URLs and temporary signed HTTPS URLs', () => {
  const project = 'https://abjvxemteuhnkuvpkess.supabase.co';
  assert.equal(storefrontImageReference('mystic-vibe-media/private.png', project), null);
  assert.equal(storefrontImageReference('https://outside.example/storage/v1/object/public/bucket/x.jpg', project), null);
  assert.equal(storefrontImageReference('https://cdn.example.com/x.jpg?X-Amz-Signature=temporary', project), null);
  assert.equal(storefrontImageReference('blob:https://example.com/id', project), null);
});
