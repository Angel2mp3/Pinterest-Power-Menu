<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Pinterest-logo.png" width="60" alt="Pinterest Logo" />

# Pinterest Power Menu

**An all-in-one userscript that makes Pinterest actually good.**

[![Version](https://img.shields.io/badge/Version-v1.4.0-red?style=flat-square)](https://github.com/Angel2mp3)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Installs](https://img.shields.io/endpoint?url=https%3A%2F%2Fuserscript-install-tracker.vercel.app%2Fapi%2Fbadge%3Frepo%3DPinterestPowerMenu&style=flat-square)](https://github.com/Angel2mp3/Pinterest-Power-Menu)
[![FMHY](https://img.shields.io/badge/Featured%20on-FMHY-purple?style=flat-square)](https://fmhy.net/social-media-tools#social-media-tools)

<br/>

### ⬇️ One-Click Install

> Requires a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/) for Chrome, Edge, Firefox, or Safari.

> This script has declutter tools, but it is not a full ad blocker. For the best results, use it with [uBlock Origin](https://github.com/gorhill/uBlock).

[![Install Pinterest Power Menu](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20Install%20Script-Pinterest%20Power%20Menu-E60023?style=for-the-badge&logoColor=white)](https://userscript-install-tracker.vercel.app/install/PinterestPowerMenu.user.js)

*Click the button above, then confirm the install in your userscript manager.*

</div>

---

## 📌 Overview

Pinterest Power Menu adds the Pinterest features that should have been there already. It improves image quality, fixes downloads, adds one-click image and video downloading, supports reverse image search, translates visible text, fixes awkward media sizing, and gives you toggles to hide the Pinterest clutter you do not want.

Most features work on the mobile Pinterest website too. A few are desktop-only, like the right-click image menu and custom logo controls, because they depend on desktop layout or mouse behavior.

## ✨ Features
#### Most of these features are supported for the mobile website version!               
#### There are also known issues with the quick download for videos on mobile, refreshing the page and trying again tends to fix it**

### ⭐ Feature Highlights

- Original-quality image loading from Pinterest's CDN
- Fixed media downloads with cleaner filenames and detected file types
- Board downloader for saving full board image collections
- Quick Download button for images and videos in pin closeups
- Desktop pin-card hover Download button for feed, search, discovery, and related pins
- Focused carousel downloads for the currently visible slide
- Reverse image search menu for the current closeup image
- Auto-translate titles, descriptions, and comments on visible pins
- GIF hover play and optional auto-play for visible GIFs
- Auto-play visible pin videos (muted), with pause on scroll-away
- Loop closeup videos so they auto-replay instead of showing "Watch again"
- Optional video-pin removal
- Declutter tools for sponsored, shopping, product, support, and suggestion modules
- Custom Pinterest logo replacement on desktop
- Hide controls for action buttons, comments, reactions, share sheets, search suggestions, and composer tools
- Lightweight update notice with a permanent opt-out

---

## 🖼️ Media Quality And Downloads

### 🖼️ Original Quality Images

Pinterest often loads scaled-down thumbnails. Original Quality rewrites Pinterest image URLs to request the original file when possible, with a high-resolution fallback when the original is unavailable.

### 💾 Download Fixer

Pinterest's built-in downloads can save compressed or badly named files. Download Fixer grabs the best available file URL, checks the real file format, and saves it with a cleaner name.

### 🗂️ Board Downloader

Board Downloader adds a download action to board pages. It scrolls the current board, finds pins, skips the "More Ideas" section, and downloads original-quality images when available.

Filenames use the pin title when Pinterest exposes one, with a `Pin - 12345678` style fallback when it does not.

### ⬇️ Quick Download Button

Quick Download adds a Pinterest-style **Download** button to pin closeups. It downloads images and videos with one click, using the actual Pinterest video file when video data is available. It grabs video pins through the same Download button when Pinterest exposes the video data.

On a carousel pin it downloads the currently visible carousel image and does not advance carousel slides while saving. The desktop pin-card Download button is also independent of Share, so hiding Share does not remove quick card downloads.

### 🖱️ Image Context Menu

On desktop, right-click Pinterest media to:

- Copy original media
- Copy media URL
- Open media in a new tab
- Save the original file

---

## 🔎 Reverse Image Search

The Reverse Image Search button opens a small provider menu for the focused closeup image.

| Provider | Behavior |
|---|---|
| Google | Opens an image-URL search page |
| Yandex | Opens an image-URL search page |
| SauceNAO | Copies the focused Pinterest image URL and opens SauceNAO for manual paste |
| TinEye | Copies the focused Pinterest image URL and opens TinEye for manual paste |

For SauceNAO and TinEye the script will copy the focused Pinterest image URL to your clipboard so you can paste it on the provider page. It uses direct Pinterest image URLs and does not upload image files itself.

---

## ▶️ GIF And Video Controls

### 🎞️ GIF Hover Play

GIF Hover Play keeps GIF pins still until you hover them. Only one hover GIF plays at a time.

### ▶️ Auto-Play Visible GIFs

Auto-Play Visible GIFs plays GIFs while they are visible and pauses them when they leave the viewport.

### ▶️ Auto-Play Visible Videos

Auto-plays currently visible videos (muted) and pauses them when you scroll away. This may not work with every video.

### 🔁 Loop Closeup Videos

Auto-replays closeup videos instead of showing Pinterest's "Watch again" prompt every time a video ends.

### 🎬 Remove Videos

Remove Videos collapses video pins from feeds while leaving GIFs alone. It looks for real Pinterest video sources instead of treating every animated-looking pin as a video.

---

## 🌐 Translation Controls

The Translate group can automatically translate visible Pinterest text:

- Pin titles
- Pin descriptions
- Expanded visible comments

Titles, descriptions, and comments each have their own toggle, so you can choose exactly what gets translated.

The target language defaults to your browser language, but you can change it in settings. If Google reports that the text is already in your selected language, the script leaves it alone.

Title display modes:

| Mode | Behavior |
|---|---|
| Translated only | Replaces the visible title and stores the original in metadata/tooltip |
| Original + translated | Shows the translated title with the original beneath it |

Translation uses Google's unofficial `translate.googleapis.com/translate_a/single?client=gtx` endpoint. When translation is enabled, the visible text being translated is sent to Google.

---

## 🧹 Declutter

The Declutter group is enabled by default. It removes or collapses noisy Pinterest modules without leaving huge empty gaps where possible.

It can clean up:

- Sponsored pins
- Shoppable pins
- Product cards and product-price pins
- Shop-by banners
- Quiz posts
- "Explore featured boards" promos
- "Still shopping?" prompts
- Ad-blocker modals
- Download upsell popovers
- Explore tab notification badges
- Removed or unavailable pins
- Shop Similar sections
- Shop the Look modules and product carousels
- Curated spotlight carousels on search pages

Declutter options:

| Toggle | Default | What it does |
|---|---:|---|
| Hide Shop The Look Modules | On | Collapses Shop the Look shopping modules and product carousels |
| Hide Search Support Advisory | Off | Collapses Pinterest's search support advisory cards when Declutter is also on |
| Hide Shop Posts | Off | Collapses pins linked to known shop domains such as Amazon, Etsy, eBay, TeePublic, Redbubble, and AliExpress when Declutter is also on |

New settings are saved the first time they appear. After that, your choices stay saved unless a setting is removed or intentionally reset later.

---

## 🙈 Hide UI Elements

The Hide UI Elements group lets you remove smaller Pinterest controls independently.

| Toggle | What it hides |
|---|---|
| Hide Visit Site | "Visit site" and external-link buttons |
| Hide Updates Bell | The notifications/updates bell in the navigation |
| Hide Messages Button | The Messages/chat button in the navigation |
| Hide Share Button | Closeup Share/Send buttons, mobile share sheet contents, provider buttons, and copy-link share controls |
| Hide React Button | The full React heart slot in closeup action rows |
| Hide Reaction Count | Only the numeric reaction count |
| Hide Upload Image Button | The Lens upload image button in Pinterest search |
| Hide Search Image Button | The Search image visual-search overlay button |
| Hide Search Suggestions | One-bar related search suggestion chips and mobile "Ideas you might love" suggestion cards |
| Hide View Larger Button | The View larger/media viewer overlay button |
| Hide More Options Button | Closeup More actions/ellipsis buttons |
| Hide Reverse Image Search Button | The custom Reverse Image Search button |
| Hide Comment Button | Only the Comments button in closeup action rows |
| Hide Comment Section | Comment sections and comment input areas |
| Hide Comment Emoji Button | The emoji picker in the comment composer |
| Hide Comment Sticker Button | The sticker picker in the comment composer |
| Hide Comment Photo Button | The photo picker in the comment composer |

The hide rules target known Pinterest areas so they do not wipe out unrelated mobile layouts.

---

## 🎨 Custom Pinterest Logo

On desktop, the Customize group can replace Pinterest's home logo with your own image URL.

Controls:

- Logo image URL
- Logo size
- Circular crop toggle

By default, custom logos render as a circular `32px` image with `object-fit: cover`, which keeps square images closer to Pinterest's normal round logo button. Non-circle mode uses contained square rendering.

This option is hidden on mobile because the logo replacement is desktop-only.

---

## ⚙️ Settings Panel

Click the gear button in the bottom-right corner of Pinterest to open Pinterest Power Menu settings.

Settings are grouped into:

- Main feature toggles
- Declutter Options
- Translate
- Customize
- Hide UI Elements

There's also a Dark Mode dropdown (Auto / Light / Dark) that controls the appearance of the settings panel and the floating gear button.

Most settings apply immediately without a page reload. Settings are saved through your userscript manager with `GM_setValue` / `GM_getValue`.

The script also includes a small "What's new" popup for major version highlights. It appears once per script version unless you choose **Never show me updates**.

---

## 🚀 Installation

1. Install a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Click the install button near the top of this README.
3. Confirm the install in your userscript manager.
4. Visit [pinterest.com](https://www.pinterest.com).
5. Open the gear button in the bottom-right corner to adjust settings.

Manual install:

1. Open `PinterestPowerMenu.user.js`.
2. Copy the script contents.
3. Create a new userscript in your manager.
4. Paste the script and save it.

---

## 🧭 Usage

After installation, visit Pinterest and open the gear button in the bottom-right corner. Most options apply immediately, so you can turn downloads, declutter tools, translation, reverse image search, and UI hiding on or off without reloading.

Reverse image search and download buttons appear on supported pins, closeups, and media surfaces when their settings are enabled. If Pinterest changes its layout, refresh the page first, then check the troubleshooting notes below.

---

## 🔐 Privacy And Security

- The script only runs on Pinterest pages matched by the userscript metadata.
- Settings are stored locally by your userscript manager through `GM_setValue` and `GM_getValue`.
- Download and media features may request Pinterest-hosted media with `GM_xmlhttpRequest` so files can be saved at the best available quality.
- Reverse image search opens the selected provider with the current image URL; some providers may receive that image URL when you choose them.
- The script does not ask for passwords, API keys, tokens, cookies, or extra accounts beyond your normal Pinterest session.

---

## 🧪 Testing

Run the local smoke test with Node.js:

```bash
node tests/userscript-feature-smoke.test.js
```

Optional syntax checks:

```bash
node --check PinterestPowerMenu.user.js
node --check tests/userscript-feature-smoke.test.js
```

---

## 🛠️ Troubleshooting

- If the install button does not open your userscript manager, install Violentmonkey or Tampermonkey first, then try again.
- If a feature does not appear, make sure it is enabled in settings and refresh Pinterest.
- If downloads or reverse image search do not work, check whether another extension or ad blocker is blocking Pinterest media URLs.
- If the layout looks wrong after a Pinterest update, disable declutter or hide-UI options one at a time to find the changed selector.
- If an old version keeps loading, force-update the script from your userscript manager dashboard.

---

## 🔧 Technical Notes

- Runs at `document-start` so image and declutter behavior can start early
- Uses vanilla JavaScript with no external runtime dependencies
- Uses `GM_xmlhttpRequest` for binary downloads
- Uses `GM_setValue` and `GM_getValue` for settings persistence
- Uses `GM_setClipboard` for manual reverse-search URL copy flows
- Handles Pinterest's single-page navigation through history and `popstate` hooks
- Uses scoped CSS and targeted observers instead of broad page-wide polling
- Uses `IntersectionObserver`, visible-node checks, small request queues, caching, and timeouts for translation work
- Keeps mobile closeup action buttons scoped to the mobile action row
- Avoids broad class-only selectors that can hide mobile page roots

---

## 🙏 Credits

This script builds upon and was inspired by the work of these scripts:

| Script | Author | Link |
|---|---|---|
| Use Pinterest Raw Image | **jcunews** | [Greasy Fork](https://greasyfork.org/en/scripts/389707-use-pinterest-raw-image) |
| Declutter Pinterest | **August4067** | [Greasy Fork](https://greasyfork.org/en/scripts/512469-declutter-pinterest) |

---

<div align="center">

Made with ❤️ by Angel · MIT License

</div>
