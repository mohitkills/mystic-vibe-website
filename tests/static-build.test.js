import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildStaticSite, resolveBrowserSupabaseConfig } from '../scripts/build-static.mjs';

const projectUrl = 'https://abjvxemteuhnkuvpkess.supabase.co';
const publishableKey = 'sb_publishable_test_value';

test('static build packages the storefront and generates only browser-safe Supabase config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mystic-vibe-static-build-'));
  try {
    for (const directory of ['assets/images', 'css', 'js', 'products', 'supabase/migrations', 'tests', 'mystic-vibe-site/css']) {
      await mkdir(path.join(root, directory), { recursive: true });
    }
    await writeFile(path.join(root, 'index.html'), '<main>storefront</main>');
    await writeFile(path.join(root, 'admin.html'), '<main>admin</main>');
    await writeFile(path.join(root, 'assets/images/p1.jpg'), 'image fixture');
    await writeFile(path.join(root, 'css/premium.css'), 'body { color: #fff; }');
    await writeFile(path.join(root, 'js/app.js'), 'window.appReady = true;');
    await writeFile(path.join(root, 'js/supabase-config.js'), 'ignored local config must not ship');
    await writeFile(path.join(root, 'js/supabase-config.example.js'), 'placeholder template');
    await writeFile(path.join(root, 'products/royal-marine.html'), '<main>product</main>');
    await writeFile(path.join(root, 'supabase/migrations/private.sql'), 'not a public asset');
    await writeFile(path.join(root, 'tests/example.test.js'), 'not a public asset');
    await writeFile(path.join(root, 'mystic-vibe-site/css/archive.css'), 'not a public asset');

    const { outputDirectory, htmlFileCount } = await buildStaticSite({
      projectRoot: root,
      env: { SUPABASE_URL: projectUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey },
    });
    assert.equal(htmlFileCount, 2);
    assert.equal(await readFile(path.join(outputDirectory, 'index.html'), 'utf8'), '<main>storefront</main>');
    assert.equal(await readFile(path.join(outputDirectory, 'admin.html'), 'utf8'), '<main>admin</main>');
    assert.equal(await readFile(path.join(outputDirectory, 'products/royal-marine.html'), 'utf8'), '<main>product</main>');
    assert.equal(await readFile(path.join(outputDirectory, 'css/premium.css'), 'utf8'), 'body { color: #fff; }');
    assert.equal(await readFile(path.join(outputDirectory, 'assets/images/p1.jpg'), 'utf8'), 'image fixture');

    const generated = await readFile(path.join(outputDirectory, 'js/supabase-config.js'), 'utf8');
    assert.equal(generated, [
      '// Generated during the Vercel build from browser-safe environment values.',
      'export const SUPABASE_URL = "https://abjvxemteuhnkuvpkess.supabase.co";',
      'export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_value";',
      '',
    ].join('\n'));
    assert.equal(spawnSync(process.execPath, ['--check', path.join(outputDirectory, 'js/supabase-config.js')]).status, 0);
    await assert.rejects(readFile(path.join(outputDirectory, 'js/supabase-config.example.js')));
    await assert.rejects(readFile(path.join(outputDirectory, 'supabase/migrations/private.sql')));
    await assert.rejects(readFile(path.join(outputDirectory, 'tests/example.test.js')));
    await assert.rejects(readFile(path.join(outputDirectory, 'mystic-vibe-site/css/archive.css')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing or privileged build configuration fails before clearing an existing output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mystic-vibe-static-build-'));
  try {
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist/keep.txt'), 'preserve until config validates');
    await assert.rejects(buildStaticSite({ projectRoot: root, env: {} }), /Set SUPABASE_URL/);
    assert.equal(await readFile(path.join(root, 'dist/keep.txt'), 'utf8'), 'preserve until config validates');

    await assert.rejects(buildStaticSite({
      projectRoot: root,
      env: { SUPABASE_URL: projectUrl, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test_value' },
    }), /publishable key or legacy anon key/);
    assert.equal(await readFile(path.join(root, 'dist/keep.txt'), 'utf8'), 'preserve until config validates');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser config validation accepts only this project and publishable or anon keys', () => {
  assert.deepEqual(resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }), { url: projectUrl, key: publishableKey });

  const anonPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  const anonKey = `eyJhbGciOiJub25lIn0.${anonPayload}.signature`;
  assert.equal(resolveBrowserSupabaseConfig({ SUPABASE_URL: projectUrl, SUPABASE_ANON_KEY: anonKey }).key, anonKey);

  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
    SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test_value',
  }), /publishable key or legacy anon key/);

  const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const serviceRoleKey = `eyJhbGciOiJub25lIn0.${serviceRolePayload}.signature`;
  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
    SUPABASE_ANON_KEY: serviceRoleKey,
  }), /publishable key or legacy anon key/);

  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: 'https://wrong-project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }), /this project HTTPS URL/);

  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }), /Set SUPABASE_URL/);
  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
  }), /Set a Supabase publishable key or legacy anon key/);
  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
    SUPABASE_PUBLISHABLE_KEY: 'not-a-supabase-key',
  }), /publishable key or legacy anon key/);
  assert.throws(() => resolveBrowserSupabaseConfig({
    SUPABASE_URL: projectUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_ANON_KEY: 'a-different-key',
  }), /Set only SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY/);
});
