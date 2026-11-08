import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const IMAGE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const LONG_EDGE = 3840;

const USAGE = `Usage:
  npm run add -- <album> <file-or-folder> [more files or folders]
  npm run add -- hero <file>

Albums live in content/albums. Raw camera files must be exported to JPEG or TIFF first.`;

const fail = (message) => {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
};

const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

async function collectImages(paths) {
  const images = [];
  for (const path of paths) {
    const target = resolve(path);
    if (!existsSync(target)) fail(`Not found: ${target}`);
    if ((await stat(target)).isDirectory()) {
      const names = (await readdir(target)).filter((name) => IMAGE_TYPES.has(extname(name).toLowerCase())).sort(naturally);
      images.push(...names.map((name) => join(target, name)));
    } else if (IMAGE_TYPES.has(extname(target).toLowerCase())) {
      images.push(target);
    } else {
      fail(`Unsupported file type: ${target}`);
    }
  }
  return images;
}

/** Saves a web-master JPEG: upright, sRGB, capped in size, with camera and GPS metadata removed. */
const saveMaster = (source, output) =>
  sharp(source)
    .rotate()
    .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(output);

const [target, ...paths] = process.argv.slice(2);
if (!target || paths.length === 0) fail('Name a destination and at least one photograph.');

const images = await collectImages(paths);
if (images.length === 0) fail('No photographs found.');

if (target === 'hero') {
  if (images.length > 1) fail('The cover takes a single photograph.');
  await saveMaster(images[0], join(CONTENT, 'hero.jpg'));
  console.log('Cover saved to content/hero.jpg');
} else {
  const albumDir = join(CONTENT, 'albums', target);
  if (!existsSync(join(albumDir, 'album.json'))) fail(`No album named "${target}".`);

  const numbers = (await readdir(albumDir)).map((name) => Number.parseInt(name, 10)).filter(Number.isFinite);
  let next = numbers.length ? Math.max(...numbers) + 1 : 1;

  for (const image of images) {
    const name = `${String(next).padStart(3, '0')}.jpg`;
    await saveMaster(image, join(albumDir, name));
    console.log(`${target}/${name}`);
    next += 1;
  }
  console.log(`Added ${images.length} photograph${images.length === 1 ? '' : 's'} to ${target}.`);
}
