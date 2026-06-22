import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const payloadDir = '.frontline-upload';
const targetDir = 'frontline-roads';
const iconNames = ['icon-192.png', 'icon-512.png'];
const preservedIcons = new Map();

for (const name of iconNames) {
  preservedIcons.set(name, await readFile(join(targetDir, name)));
}

const chunkNames = (await readdir(payloadDir))
  .filter((name) => /^chunk-\d+\.jsonl$/.test(name))
  .sort();

if (chunkNames.length === 0) throw new Error('No payload chunks found.');

const records = [];
for (const name of chunkNames) {
  const lines = (await readFile(join(payloadDir, name), 'utf8'))
    .split('\n')
    .filter(Boolean);
  for (const line of lines) records.push(JSON.parse(line));
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

for (const record of records) {
  const destination = join(targetDir, record.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, record.content, 'utf8');
}

for (const [name, bytes] of preservedIcons) {
  await writeFile(join(targetDir, name), bytes);
}

const expectedFiles = records.length + preservedIcons.size;
const countFiles = async (dir) => {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    count += entry.isDirectory() ? await countFiles(full) : 1;
  }
  return count;
};
const actualFiles = await countFiles(targetDir);
if (actualFiles !== expectedFiles) {
  throw new Error(`File count mismatch: expected ${expectedFiles}, got ${actualFiles}`);
}

await rm(payloadDir, { recursive: true, force: true });
await rm('.github/workflows/frontline-refactor-upload.yml', { force: true });
console.log(`Assembled ${actualFiles} files.`);
