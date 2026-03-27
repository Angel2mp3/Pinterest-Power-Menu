<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Pinterest-logo.png" width="60" alt="Pinterest Logo" />

# Pinterest Power Menu

**The all-in-one Pinterest userscript that makes Pinterest actually good.**

[![Version](https://img.shields.io/badge/Version-1.3.2-red?style=flat-square)](https://github.com/Angel2mp3)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![FMHY](https://img.shields.io/badge/Featured%20on-FMHY-purple?style=flat-square)](https://fmhy.net/social-media-tools#social-media-tools)

<br/>

### ⬇️ One-Click Install

> Requires a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox / Safari)

> While this script can do a lot on its own, it does not block most ads, so i **highly recomend** you install [Ublock Origin](https://github.com/gorhill/uBlock) as it works very well alongside it!

[![Install Pinterest Power Menu](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20Install%20Script-Pinterest%20Power%20Menu-E60023?style=for-the-badge&logoColor=white)](https://github.com/Angel2mp3/Pinterest-Power-Menu/raw/main/PinterestPowerMenu.user.js)

*Click the button above → the extension will open and ask you to confirm the install.*

</div>

---

## ✨ Features
#### Most of these features are supported for the mobile website version!

### 🖼️ Original Quality Images
Pinterest serves downscaled thumbnails by default. This script silently rewrites every image URL to load the **full original resolution** from Pinterest's CDN — no popups, no loading delays. Falls back to high-res (`736x`) if the original isn't available.

### 📹 Video Downloader (NEW)
Adds a download button on video pin closeup pages. Downloads the video at original **720p quality** directly from Pinterest's CDN — works on both desktop and mobile. Handles Pinterest's HLS streaming format automatically.

### 🗂️ Board Downloader
Adds a download button on board pages. Click it to download **all images from the current board**:
- Auto-scrolls the page to collect all pins
- Downloads all images at full original resolution
- Skips the "More Ideas" suggested section
- Names each file as the **Pin Title** when available
- Falls back to **Pin - 12345678** when a title is unavailable

### 💾 Download Fixer
Intercepts Pinterest's download button and replaces the low-quality compressed version with the **actual original-quality file**. Detects the correct file format (PNG, JPEG, GIF, WebP) from the binary header and names the file properly.

### ▶️ Auto-Play Visible GIFs
Optionally auto-play every GIF currently visible in the viewport. GIFs pause automatically when scrolled out of view to save CPU and memory.

### 🎞️ GIF Hover Play
GIFs in the feed are shown as static thumbnails by default. Hover over any pin containing a GIF to **play it live**, and it pauses the moment you move away. Only one GIF plays at a time.

### 🎬 Remove Videos
Collapses video pins from your feed while **leaving GIFs untouched**. Detects real video pins via Pinterest's CDN (`v.pinimg.com`) so animated GIFs (served from `i.pinimg.com`) are never wrongly removed.

### 🧹 Declutter
#### (Built on top of and added more from the original version by August4067)
Removes noise from your feed without leaving blank gaps in the grid:
- Sponsored pins
- Shopping / shoppable pins
- Shop-by banners and product cards
- Quiz posts
- "Explore featured boards" promos
- "Still shopping?" prompts
- Ad-blocker modals
- Download upsell popovers
- Explore tab notification badges
- Unavailable / Removed pins
- Shop Similar / Shop the Look sections on pin closeups
- Curated spotlight carousels on search pages

### 🙈 Hide UI Elements *(collapsible group)*
Individual toggles for UI elements you might not want:

| Toggle | What it hides |
|---|---|
| **Hide Visit Site** | All "Visit site" / external link buttons |
| **Hide Updates Bell** | The notifications/updates bell in the nav |
| **Hide Messages Button** | The Messages / chat button in the nav |
| **Hide Share Button** | The Share / Send button on pin closeups |
| **Hide Shop Posts** | Collapses pins linking to Amazon, Etsy, eBay, TeePublic, Redbubble, AliExpress |
| **Hide Comments** | Hides comment sections and the comment input box on pins |

---

## 🚀 Installation

1. Install a userscript manager **like the ones at the top of the readme** for your browser


2. **Click the install button** at the top of this page (or install manually by coping the contents of the .user.js file to your new script you made

3. The extension will open a confirmation tab → click **Install**

4. Visit [pinterest.com](https://www.pinterest.com) — the gear icon ⚙️ will appear in the bottom-right corner

---

## ⚙️ Settings

Click the **⚙️ gear button** in the bottom-right of any Pinterest page to open the settings panel. Every feature can be toggled individually and is saved automatically. No page reload needed for most options.

---

## 🔧 Technical Details

- **Run-at:** `document-start` — the Original Quality rewrite begins before images even load
- **No external dependencies** — pure vanilla JS, no jQuery or library downloads
- **GM APIs used:** `GM_xmlhttpRequest` (binary downloads), `GM_setValue` / `GM_getValue` (settings persistence)
- **Grid layout:** All hiding/filtering uses CSS collapsing (`height: 0`, `grid-auto-flow: dense`) instead of `display: none` — no blank spaces left in the masonry grid
- **SPA-aware:** Wraps `history.pushState` / `replaceState` and `popstate` to handle Pinterest's single-page navigation

---

## 🙏 Credits

This script builds upon and was inspired by the work of these excellent scripts:

| Script | Author | Link |
|---|---|---|
| Pinterest with no registration modal popup | **jesusmg** | [Greasy Fork](https://greasyfork.org/en/scripts/382612-pinterest-with-no-registration-modal-popup) |
| Use Pinterest Raw Image | **jcunews** | [Greasy Fork](https://greasyfork.org/en/scripts/389707-use-pinterest-raw-image) |
| Declutter Pinterest | **August4067** | [Greasy Fork](https://greasyfork.org/en/scripts/512469-declutter-pinterest) |

---

<div align="center">

Made with ❤️ by [Angel](https://github.com/Angel2mp3) · MIT License

</div>
