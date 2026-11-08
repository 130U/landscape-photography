# Landscape Photography

Portfolio of landscape photographs by Theodore Ouyang. A static site with two albums, Yellowstone and Alaska, generated from the `content` folder.

## Setup

Requires Node 20.9 or later.

```bash
npm ci
npm run dev
```

The site is served at <http://localhost:4323/>. Run `npm run dev` again to pick up new photographs or edits.

## Adding Photographs

```bash
npm run add -- yellowstone "D:\Photos\Yellowstone 2026"
npm run add -- alaska "D:\Photos\denali-01.jpg" "D:\Photos\denali-02.jpg"
```

Each photograph is numbered after the last one in its album and saved to `content/albums/<album>/` as an upright sRGB JPEG, at most 3840 pixels on the long edge, with camera and GPS metadata removed. Export raw camera files to JPEG or TIFF first. Albums display photographs in file-name order, so renaming a file changes its position.

Set the landing page photograph with:

```bash
npm run add -- hero "D:\Photos\forest.jpg"
```

Wide screens show the full frame, aligned by `hero.position` in `content/site.json`. Phones and upright tablets show a 2:3 crop centered at `hero.portraitCenter`, where 0 is the left edge of the photograph and 1 is the right edge.

## Editing Text

| File | Controls |
| --- | --- |
| `content/site.json` | Name, tagline, description, addresses, and cover framing |
| `content/albums/<album>/album.json` | Title, location, description, accent color, date, and order |

Set `taken` to a date such as `"August 2026"` to display it on the album page. Set `cover` to a file name such as `"007.jpg"` to choose the album's banner image; the first photograph is used otherwise.

## Publishing

Pushing to `main` builds the site with GitHub Actions and deploys `dist` to GitHub Pages.

```bash
git add content
git commit -m "Add Yellowstone photographs"
git push
```

## Credits

The name is drawn from WindSong by Robert Leuschke (SIL Open Font License). Text is set in Roboto, Roboto Condensed, and Source Sans 3, all hosted with the site.

Photographs are &copy; Theodore Ouyang. All rights reserved.
