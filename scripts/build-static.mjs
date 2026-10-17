import { cp, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SUPABASE_ORIGIN = 'https://abjvxemteuhnkuvpkess.supabase.co';
const PUBLIC_DIRECTORIES = ['assets', 'css', 'js', 'products'];
const GENERATED_CONFIG_FILES = new Set([
  path.join('js', 'supabase-config.js'),
  path.join('js', 'supabase-config.example.js'),
]);

export function resolveBrowserSupabaseConfig(env) {
  const rawUrl = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const publishableKey = typeof env.SUPABASE_PUBLISHABLE_KEY === 'string'
    ? env.SUPABASE_PUBLISHABLE_KEY.trim()
    : '';
  const anonKey = typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY.trim() : '';

  if (!rawUrl) throw new Error('Set SUPABASE_URL in the deployment environment.');
  let supabaseUrl;
  try {
    supabaseUrl = new URL(rawUrl);
  } catch {
    throw new Error('SUPABASE_URL must be this project HTTPS URL.');
  }
  if (
    supabaseUrl.origin !== EXPECTED_SUPABASE_ORIGIN ||
    supabaseUrl.pathname !== '/' || supabaseUrl.search || supabaseUrl.hash ||
    supabaseUrl.username || supabaseUrl.password
  ) {
    throw new Error('SUPABASE_URL must be this project HTTPS URL.');
  }

  if (publishableKey && anonKey && publishableKey !== anonKey) {
    throw new Error('Set only SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY.');
  }
  const key = publishableKey || anonKey;
  if (!key || key.length > 8192) {
    throw new Error('Set a Supabase publishable key or legacy anon key in the deployment environment.');
  }
  if (key.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length) {
    return { url: supabaseUrl.origin, key };
  }
  if (key.startsWith('sb_secret_')) {
    throw new Error('The browser build accepts only a publishable key or legacy anon key.');
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    throw new Error('The browser build accepts only a publishable key or legacy anon key.');
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role === 'anon') return { url: supabaseUrl.origin, key };
  } catch {
    // Use the same generic error for malformed and privileged keys; never echo key material.
  }
  throw new Error('The browser build accepts only a publishable key or legacy anon key.');
}

export async function buildStaticSite({ projectRoot, env = process.env } = {}) {
  const root = path.resolve(projectRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const outputDirectory = path.join(root, 'dist');
  const relativeOutput = path.relative(root, outputDirectory);
  if (relativeOutput !== 'dist') throw new Error('The static output directory must be the project dist folder.');

  // Validate credentials before cleaning or writing the generated output directory.
  const browserConfig = resolveBrowserSupabaseConfig(env);
  for (const directory of PUBLIC_DIRECTORIES) {
    const source = path.join(root, directory);
    const metadata = await lstat(source).catch(() => null);
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`The required public directory is unavailable: ${directory}.`);
    }
  }

  const existingOutput = await lstat(outputDirectory).catch(() => null);
  if (existingOutput?.isSymbolicLink() || (existingOutput && !existingOutput.isDirectory())) {
    throw new Error('The static output path must be a regular dist directory.');
  }
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const rootFiles = await readdir(root, { withFileTypes: true });
  const htmlFiles = rootFiles.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.html');
  for (const entry of htmlFiles) {
    await cp(path.join(root, entry.name), path.join(outputDirectory, entry.name));
  }

  for (const directory of PUBLIC_DIRECTORIES) {
    const source = path.join(root, directory);
    const destination = path.join(outputDirectory, directory);
    await cp(source, destination, {
      recursive: true,
      filter: (sourcePath) => !GENERATED_CONFIG_FILES.has(path.relative(root, path.resolve(sourcePath))),
    });
  }

  const generatedConfig = [
    '// Generated during the Vercel build from browser-safe environment values.',
    `export const SUPABASE_URL = ${JSON.stringify(browserConfig.url)};`,
    `export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(browserConfig.key)};`,
    '',
  ].join('\n');
  await writeFile(path.join(outputDirectory, 'js', 'supabase-config.js'), generatedConfig, { mode: 0o644 });

  return { outputDirectory, htmlFileCount: htmlFiles.length };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildStaticSite();
    console.log(`Mystic Vibe static site built in dist (${result.htmlFileCount} HTML pages).`);
  } catch (error) {
    console.error(`Mystic Vibe static build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
