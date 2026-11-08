import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const CACHE = join(ROOT, '.cache');

const PHOTO_TYPES = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const PHOTO_WIDTHS = [1280, 2560];
const HERO_WIDTHS = [1600, 2880, 3840];
const HERO_PORTRAIT_EDGES = [1620, 2400];
const HERO_PORTRAIT_RATIO = 2 / 3;
const HERO_HEIGHT_VH = 112;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Encodes one size of a photograph into the cache and copies it to `outFile`. */
async function renderSize(source, hash, longEdge, outFile, crop) {
  const cached = join(CACHE, `${hash}-${crop ? `${crop.left}x${crop.width}-` : ''}${longEdge}.jpg`);
  if (!existsSync(cached)) {
    const image = sharp(source).rotate();
    if (crop) image.extract(crop);
    await image
      .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(cached);
  }
  await copyFile(cached, outFile);
  const { width, height } = await sharp(cached).metadata();
  return { width, height };
}

/** Writes each distinct size of a photograph and returns the data its <img> needs. */
async function renderPhoto(source, widths, outDir, urlPrefix, { name = parse(source).name, crop } = {}) {
  const hash = createHash('sha1').update(await readFile(source)).digest('hex').slice(0, 20);
  const sizes = [];
  for (const longEdge of widths) {
    const file = `${name}-${longEdge}.jpg`;
    const { width, height } = await renderSize(source, hash, longEdge, join(outDir, file), crop);
    if (sizes.some((size) => size.width === width)) continue;
    sizes.push({ url: `${urlPrefix}${file}`, width, height });
  }
  const largest = sizes[sizes.length - 1];
  return {
    name,
    src: largest.url,
    preview: sizes[0].url,
    srcset: sizes.map((size) => `${size.url} ${size.width}w`).join(', '),
    width: largest.width,
    height: largest.height,
  };
}

/** Renders the full frame for wide screens and a tall crop around `portraitCenter` for upright ones. */
async function renderHero(source, { portraitCenter }) {
  const outDir = join(DIST, 'assets');
  const { width, height } = await sharp(source).rotate().metadata();
  const cropWidth = Math.min(width, Math.round(height * HERO_PORTRAIT_RATIO));
  const left = Math.max(0, Math.min(width - cropWidth, Math.round(width * portraitCenter - cropWidth / 2)));
  return {
    landscape: await renderPhoto(source, HERO_WIDTHS, outDir, 'assets/'),
    portrait: await renderPhoto(source, HERO_PORTRAIT_EDGES, outDir, 'assets/', {
      name: 'hero-portrait',
      crop: { left, top: 0, width: cropWidth, height },
    }),
  };
}

async function loadAlbums() {
  const albumsDir = join(CONTENT, 'albums');
  const slugs = (await readdir(albumsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const albums = await Promise.all(
    slugs.map(async (slug) => {
      const dir = join(albumsDir, slug);
      const files = (await readdir(dir)).filter((f) => PHOTO_TYPES.has(extname(f).toLowerCase())).sort(naturally);
      return { slug, dir, files, ...(await readJson(join(dir, 'album.json'))) };
    }),
  );
  return albums.sort((a, b) => a.order - b.order);
}

const imageTag = (photo, { alt, sizes, className = '', parallax = 0, eager = false, root = '' }) =>
  `<img${className ? ` class="${className}"` : ''}${parallax ? ` data-parallax="${parallax}"` : ''} src="${root}${photo.src}" srcset="${photo.srcset
    .split(', ')
    .map((entry) => root + entry)
    .join(', ')}" sizes="${sizes}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(alt)}" ${
    eager ? 'fetchpriority="high"' : 'loading="lazy"'
  } decoding="async">`;

const menu = (albums, root) => `<nav class="menu" id="menu" aria-label="Albums" hidden>
  <ul class="menu__list">
${albums
  .map(
    (album) => `    <li class="card" style="--accent:${album.accent}">
      <a href="${root}${album.slug}/">
        <span class="card__title">${escapeHtml(album.title)}</span>
        <span class="card__cover">${
          album.cover ? imageTag(album.cover, { alt: '', sizes: '(max-width: 700px) 100vw, 50vw', root }) : ''
        }</span>
      </a>
    </li>`,
  )
  .join('\n')}
  </ul>
</nav>`;

const heroPicture = ({ landscape, portrait }) => {
  const displayWidth = (photo) => `max(100vw, ${Math.ceil((HERO_HEIGHT_VH * photo.width) / photo.height)}vh)`;
  return `<picture>
      <source media="(max-aspect-ratio: 1/1)" srcset="${portrait.srcset}" sizes="${displayWidth(portrait)}">
      ${imageTag(landscape, { alt: '', sizes: displayWidth(landscape), className: 'hero__image', parallax: 5, eager: true })}
    </picture>`;
};

const bar = (site, albums, root, stuck) => `<header class="bar${stuck ? ' bar--stuck' : ''}" data-bar>
  <a class="bar__brand" href="${root || '#top'}" aria-label="${escapeHtml(site.name)}"><img src="${root}assets/signature.svg" alt="" width="212" height="34"></a>
  <button class="burger" type="button" aria-expanded="false" aria-controls="menu" aria-label="Open album menu"><span></span></button>
</header>
${menu(albums, root)}`;

const footer = (site) => `<footer class="footer">
  <span>&copy; ${new Date().getFullYear()} ${escapeHtml(site.name)}</span>
  <a href="${escapeHtml(site.home)}">${escapeHtml(new URL(site.home).hostname.replace(/^www\./, ''))}</a>
</footer>`;

const page = ({ site, title, description, canonical, ogImage, root, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(new URL(ogImage, site.url))}">\n` : ''}<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${root}assets/fonts/roboto-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/styles.css">
<script src="${root}assets/site.js" defer></script>
</head>
<body>
${body}
</body>
</html>
`;

const homeBody = (site, albums, hero, signature) => `${bar(site, albums, '', false)}
<main id="top">
  <section class="hero" style="--hero-position:${escapeHtml(site.hero.position)}">
    ${hero ? heroPicture(hero) : ''}
    <div class="hero__inner">
      <a class="hero__name" href="#albums" aria-label="${escapeHtml(site.name)}">${signature}</a>
      <h1 class="hero__tagline">${escapeHtml(site.tagline)}</h1>
    </div>
    <a class="hero__arrow" href="#albums" aria-label="Scroll to albums"><svg viewBox="0 0 28 16" aria-hidden="true"><path d="M2 2l12 12L26 2" fill="none" stroke="currentColor" stroke-width="4"/></svg></a>
  </section>
  <div class="plates" id="albums">
${albums
  .map(
    (album, index) => `    <section class="plate" style="--accent:${album.accent}${album.coverPosition ? `;--cover-position:${escapeHtml(album.coverPosition)}` : ''}">
      ${album.cover ? imageTag(album.cover, { alt: '', sizes: '100vw', className: 'plate__image', parallax: 8 }) : ''}
      <div class="plate__content">
        <h2 class="plate__title">${String(index + 1).padStart(2, '0')}: ${escapeHtml(album.title)}</h2>
        <p class="plate__text">${escapeHtml(album.description)}</p>
        <a class="button" href="${album.slug}/">View Images</a>
      </div>
    </section>`,
  )
  .join('\n')}
  </div>
</main>
${footer(site)}`;

const workCaption = ({ title, place, appreciation }) =>
  title
    ? `
      <figcaption class="work__text">
        <h2 class="work__title">${escapeHtml(title)}</h2>
${place ? `        <p class="work__place">${escapeHtml(place)}</p>\n` : ''}        <p>${escapeHtml(appreciation)}</p>
      </figcaption>`
    : '';

const albumBody = (site, albums, album) => `${bar(site, albums, '../', true)}
<main class="album">
  <header class="album__head">
    <h1 class="album__title">${escapeHtml(album.title)}</h1>
    <p class="album__location">${escapeHtml(album.location)}</p>
    <p class="album__intro">${escapeHtml(album.description)}</p>
  </header>
  <div class="album__works">
${album.photos
  .map(
    (photo, index) => `    <figure class="work">
      ${imageTag(photo, {
        alt: photo.work.alt ?? `${album.title}, image ${index + 1}`,
        sizes: '(max-width: 860px) 100vw, 66vw',
        eager: index === 0,
      })}${workCaption(photo.work)}
    </figure>`,
  )
  .join('\n')}
  </div>
</main>
${footer(site)}`;

async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, 'assets'), { recursive: true });
  await mkdir(CACHE, { recursive: true });

  await cp(join(SRC, 'fonts'), join(DIST, 'assets', 'fonts'), { recursive: true });
  for (const file of ['styles.css', 'site.js', 'favicon.svg', 'signature.svg']) {
    await copyFile(join(SRC, file), join(DIST, 'assets', file));
  }

  const site = await readJson(join(CONTENT, 'site.json'));
  const albums = await loadAlbums();

  const heroFile = ['hero.jpg', 'hero.jpeg', 'hero.png'].map((f) => join(CONTENT, f)).find(existsSync);
  const hero = heroFile ? await renderHero(heroFile, site.hero) : null;

  for (const album of albums) {
    const outDir = join(DIST, album.slug, 'photos');
    await mkdir(outDir, { recursive: true });
    album.photos = [];
    for (const file of Object.keys(album.works ?? {})) {
      if (!album.files.includes(file)) console.warn(`${album.slug}/album.json describes ${file}, which is not in the album.`);
    }
    for (const file of album.files) {
      const photo = await renderPhoto(join(album.dir, file), PHOTO_WIDTHS, outDir, `${album.slug}/photos/`);
      album.photos.push({ ...photo, work: album.works?.[file] ?? {} });
    }
    album.cover = album.photos.find((photo) => `${photo.name}${extname(album.cover ?? '')}` === album.cover) ?? album.photos[0] ?? null;
  }

  const signature = (await readFile(join(SRC, 'signature.svg'), 'utf8'))
    .replace('<svg ', '<svg class="signature" aria-hidden="true" ')
    .trim();

  const homeOg = hero?.landscape.preview ?? albums.find((album) => album.cover)?.cover.preview;
  await writeFile(
    join(DIST, 'index.html'),
    page({
      site,
      title: `${site.name} | ${site.tagline}`,
      description: site.description,
      canonical: site.url,
      ogImage: homeOg,
      root: '',
      body: homeBody(site, albums, hero, signature),
    }),
  );

  for (const album of albums) {
    // Album pages sit one level down, so their photographs drop the album prefix.
    const local = {
      ...album,
      photos: album.photos.map((photo) => ({
        ...photo,
        src: photo.src.replace(`${album.slug}/`, ''),
        srcset: photo.srcset.replaceAll(`${album.slug}/photos/`, 'photos/'),
      })),
    };
    await writeFile(
      join(DIST, album.slug, 'index.html'),
      page({
        site,
        title: `${album.title} | ${site.name}`,
        description: album.description,
        canonical: new URL(`${album.slug}/`, site.url).href,
        ogImage: album.cover?.preview,
        root: '../',
        body: albumBody(site, albums, local),
      }),
    );
  }

  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);
  console.log(`Built ${albums.length} albums, ${photoCount} photographs${hero ? ', cover image' : ''}.`);
}

await build();
