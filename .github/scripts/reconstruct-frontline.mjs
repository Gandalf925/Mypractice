import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const root = 'frontline-roads';
const partPattern = /^(.*)\.part-(\d{3})$/;
const groups = new Map();

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(fullPath);
      continue;
    }
    const match = entry.name.match(partPattern);
    if (!match) continue;
    const target = join(dirname(fullPath), match[1]);
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push({ path: fullPath, index: Number(match[2]) });
  }
}

await collect(root);
for (const [target, parts] of groups) {
  parts.sort((a, b) => a.index - b.index);
  const buffers = [];
  for (const part of parts) buffers.push(await readFile(part.path));
  await writeFile(target, Buffer.concat(buffers));
  for (const part of parts) await rm(part.path);
  console.log(`Reconstructed ${basename(target)} from ${parts.length} parts.`);
}
