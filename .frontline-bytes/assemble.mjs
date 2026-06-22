import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { gunzipSync } from 'node:zlib';

const payloadDir = '.frontline-bytes';
const targetDir = 'frontline-roads';
const iconNames = ['icon-192.png', 'icon-512.png'];
const preservedIcons = new Map();
for (const name of iconNames) preservedIcons.set(name, await readFile(join(targetDir, name)));

const modules = (await readdir(payloadDir))
  .filter(name => /^part-\d+\.mjs$/.test(name))
  .sort();
if (modules.length === 0) throw new Error('No payload parts found.');

const bytes = [];
for (const name of modules) {
  const part = (await import(new URL(`./${name}`, import.meta.url).href)).default;
  if (!Array.isArray(part)) throw new Error(`Invalid payload part: ${name}`);
  bytes.push(...part);
}

const payload = JSON.parse(gunzipSync(Buffer.from(bytes)).toString('utf8'));
const entries = Object.entries(payload.files ?? {});
if (entries.length !== 89) throw new Error(`Unexpected text file count: ${entries.length}`);

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
for (const [rawPath, content] of entries) {
  const path = normalize(rawPath.replace(/^\.\//, ''));
  if (!path || path.startsWith('..') || path.includes('/../') || typeof content !== 'string') {
    throw new Error(`Invalid payload path: ${rawPath}`);
  }
  const destination = join(targetDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}
for (const [name, bytesValue] of preservedIcons) await writeFile(join(targetDir, name), bytesValue);
console.log(`Assembled ${entries.length + preservedIcons.size} files.`);
