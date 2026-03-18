<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Pinterest-logo.png" width="60" alt="Pinterest Logo" />

# Pinterest Power Menu

**The all-in-one Pinterest userscript that makes Pinterest actually good.**

[![Version](https://img.shields.io/badge/version-1.0.0-red?style=flat-square)](https://github.com/Angel2mp3)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-brightgreen?style=flat-square&logo=tampermonkey)](https://www.tampermonkey.net/)

<br/>

### ⬇️ One-Click Install

> Requires a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox / Safari)

> While this script can do a lot on its own, it does not block most ads, so i **highly recomend** you install [Ublock Origin](https://github.com/gorhill/uBlock) as it works very well alongside it!

[![Install Pinterest Power Menu](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20Install%20Script-Pinterest%20Power%20Menu-E60023?style=for-the-badge&logoColor=white)](https://github.com/Angel2mp3/pinterest-power-menu/raw/main/PinterestEnhanced.user.js)

*Click the button above → the extension will open and ask you to confirm the install.*

</div>

---

## ✨ Features

### 🖼️ Original Quality Images
Pinterest serves downscaled thumbnails by default. This script silently rewrites every image URL to load the **full original resolution** from Pinterest's CDN — no popups, no loading delays. Falls back to high-res (`736x`) if the original isn't available.

### 🚫 No Registration Required
Auto-removes all login/signup modals and paywalls the moment they appear so you can browse freely without an account.

### 💾 Download Fixer
Intercepts Pinterest's download button and replaces the low-quality compressed version with the **actual original-quality file**. Detects the correct file format (PNG, JPEG, GIF, WebP) from the binary header and names the file properly.

### 🗂️ Board Downloader
Adds a download FAB (floating button) on board pages. Click it to save **every image from the entire board** to a folder of your choice:
- Auto-scrolls the page to collect all pins (including lazy-loaded ones)
- Downloads all images at full original resolution
- Names each file as **Board Name - Pin Title** (or a random string if no title exists)
- Uses the File System Access API to save directly to a folder (with a fallback for unsupported browsers)

### 🎞️ GIF Hover Play
GIFs in the feed are shown as static thumbnails by default. Hover over any pin containing a GIF to **play it live**, and it pauses the moment you move away. Only one GIF plays at a time.

### ▶️ Auto-Play Visible GIFs
Optionally auto-play every GIF currently visible in the viewport. GIFs pause automatically when scrolled out of view to save CPU and memory.

### 🎬 Remove Videos
Collapses video pins from your feed while **leaving GIFs untouched**. Detects real video pins via Pinterest's CDN (`v.pinimg.com`) so animated GIFs (served from `i.pinimg.com`) are never wrongly removed.

### 🧹 Declutter
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

### 🙈 Hide UI Elements *(collapsible group)*
Individual toggles for UI elements you might not want:

| Toggle | What it hides |
|---|---|
| **Hide Visit Site** | All "Visit site" / external link buttons |
| **Hide Updates Bell** | The notifications/updates bell in the nav |
| **Hide Messages Button** | The Messages / chat button in the nav |
| **Hide Share Button** | The Share / Send button on pin closeups |

---

## 📱 Mobile Support

The script runs on Pinterest's mobile web inside mobile browsers that support userscript managers (e.g. **Firefox for Android + Violentmonkey**, **Safari on iOS + Userscripts app**, **Kiwi Browser + Tampermonkey**).

| Feature | Mobile |
|---|---|
| Original Quality Images | ✅ Works |
| No Registration Wall | ✅ Works |
| Download Fixer | ✅ Works |
| Board Downloader | ✅ Works (falls back to individual downloads if folder picker is unavailable) |
| **GIF Hover Play** | ❌ Desktop only — hover requires a mouse. Toggle it off and use Auto-Play instead. |
| **Auto-Play Visible GIFs** |❓ May or may not work |
| Remove Videos | ✅ Works |
| Declutter | ✅ Works |
| Hide UI Elements | ➖ Not all work |

---

## 🚀 Installation

1. Install a userscript manager **like the ones at the top of the readme** for your browser


2. **Click the install button** at the top of this page (or install manually by coping the contents of the .user.js file to your new script you made

3. The extension will open a confirmation tab → click **Install**

4. Visit [pinterest.com](https://www.pinterest.com) — the gear icon ⚙️ will appear in the bottom-right corner

---

## ⚙️ Settings

Click the **⚙️ gear button** in the bottom-right of any Pinterest page to open the settings panel. Every feature can be toggled individually and is saved automatically. No page reload needed for most options.


</details>

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
