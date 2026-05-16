// ==UserScript==
// @name         Pinterest Power Menu
// @description  All-in-one Pinterest power tool: original quality, download fixer, closeup image/video downloads, visible text translation, GIF hover/auto-play, remove videos, hide UI elements, declutter, scroll preservation
// @version      1.4.0
// @author       Angel
// @namespace    https://angelmakes.software
// @homepageURL  https://angelmakes.software
// @supportURL   https://github.com/Angel2mp3
// @icon         https://www.pinterest.com/favicon.ico
// @match        https://www.pinterest.com/*
// @match        https://pinterest.com/*
// @match        https://*.pinterest.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      *
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Angel2mp3/Pinterest-Power-Menu/main/PinterestPowerMenu.user.js
// @downloadURL  https://raw.githubusercontent.com/Angel2mp3/Pinterest-Power-Menu/main/PinterestPowerMenu.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  const SETTINGS_KEY = 'pe_settings_v1';
  const SCRIPT_VERSION = '1.4.0';
  const UPDATE_NOTES_HIGHLIGHTS = [
    'Quick Download button on every pin closeup — works for videos too, not just images.',
    'Reverse Image Search button on closeups — Google, Yandex, SauceNAO, TinEye.',
    'Auto-Play Visible Videos — more reliable, with canplay waits, retries, and tab-visibility resume.',
    'New: hover Download button on every pin in feed/search/discovery grids — no closeup needed.',
  ];

  // ── Mobile / touch detection ─────────────────────────────────────────
  // Declared early so DEFAULTS can reference it (contextMenu off on mobile).
  // Gates features that are mouse-only or cause jank on touch devices.
  const IS_MOBILE = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /macintel/i.test(navigator.platform));
  const USER_LANG = ((navigator.language || navigator.userLanguage || 'en').split('-')[0] || 'en').toLowerCase();

  function isMobilePinCloseupPage() {
    return IS_MOBILE && /\/pin\/\d/i.test(location.pathname);
  }

  const DEFAULTS = {
    originalQuality:  true,
    downloadFixer:    true,
    gifHover:         true,
    hideVisitSite:    true,
    boardDownloader:  true,
    declutter:        true,
    declutterShopTheLook: true,
    declutterSearchAdvisory: false,
    contextMenu:      !IS_MOBILE,  // mouse-only feature; off by default on mobile
    hideUpdates:      false,
    hideMessages:     false,
    hideShare:        false,
    gifAutoPlay:      false,
    videoAutoPlay:    false,
    infiniteLoopVideo: false,
    darkMode:         'auto',
    removeVideos:     false,
    hideShopPosts:    false,
    hideComments:     false,
    hideCommentButton: false,
    hideReactButton:  false,
    hideReactionCount: false,
    hideUploadImageButton: false,
    hideSearchImageButton: false,
    hideSearchSuggestions: false,
    hideViewLargerButton: false,
    hideMoreOptionsButton: false,
    hideReverseImageSearchButton: false,
    hideCommentEmojiButton: false,
    hideCommentStickerButton: false,
    hideCommentPhotoButton: false,
    autoTranslate:    false,
    autoTranslateTitles: false,
    autoTranslateDescriptions: false,
    autoTranslateComments: false,
    autoTranslateCommentMode: 'visible',
    autoTranslateTarget: 'browser',
    titleTranslationDisplay: 'translated',
    customPinterestLogoUrl: '',
    customPinterestLogoSize: 32,
    customPinterestLogoCircle: true,
    reverseImageSearchButton: true,
    updateNotesDisabled: false,
    lastUpdateNotesVersion: '',
  };

  let _cfg = null;

  function loadCfg() {
    try {
      const raw = GM_getValue(SETTINGS_KEY, null);
      const saved = raw ? JSON.parse(raw) : {};
      _cfg = { ...DEFAULTS, ...saved };
      if (saved.autoTranslate === true) {
        if (saved.autoTranslateTitles === undefined) _cfg.autoTranslateTitles = true;
        if (saved.autoTranslateDescriptions === undefined) _cfg.autoTranslateDescriptions = true;
        if (saved.autoTranslateComments === undefined) _cfg.autoTranslateComments = true;
      }
      if (saved.hideComments === true && saved.hideCommentButton === undefined) _cfg.hideCommentButton = true;
      if (saved.autoTranslateTarget === undefined) _cfg.autoTranslateTarget = DEFAULTS.autoTranslateTarget;
      if (saved.autoTranslateCommentMode === undefined) _cfg.autoTranslateCommentMode = DEFAULTS.autoTranslateCommentMode;
      _cfg.showManualTranslateButtons = false;
      rememberMissingDefaultPrefs(saved);
    } catch (_) {
      _cfg = { ...DEFAULTS };
    }
  }

  function saveCfg() {
    try { GM_setValue(SETTINGS_KEY, JSON.stringify(_cfg)); } catch (_) {}
  }

  function rememberMissingDefaultPrefs(saved) {
    let changed = false;
    Object.keys(DEFAULTS).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(saved, key)) return;
      if (_cfg[key] === undefined) _cfg[key] = DEFAULTS[key];
      changed = true;
    });
    if (changed) saveCfg();
  }

  function get(key) {
    if (!_cfg) loadCfg();
    return key in _cfg ? _cfg[key] : DEFAULTS[key];
  }

  function set(key, val) {
    if (!_cfg) loadCfg();
    _cfg[key] = val;
    saveCfg();
  }

  function shouldShowUpdateNotes() {
    return !get('updateNotesDisabled') && get('lastUpdateNotesVersion') !== SCRIPT_VERSION;
  }

  function escapeUpdateNoteText(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function dismissUpdateNotesPopup() {
    document.getElementById('pe-update-notes-layer')?.remove();
    set('lastUpdateNotesVersion', SCRIPT_VERSION);
  }

  function disableUpdateNotesForever() {
    document.getElementById('pe-update-notes-layer')?.remove();
    set('updateNotesDisabled', true);
    set('lastUpdateNotesVersion', SCRIPT_VERSION);
  }

  function createUpdateNotesPopup() {
    if (!document.body || !shouldShowUpdateNotes()) return;
    if (document.getElementById('pe-update-notes-layer')) return;

    const layer = document.createElement('div');
    layer.id = 'pe-update-notes-layer';
    layer.setAttribute('data-pe-ui', 'true');
    layer.innerHTML = `
      <div id="pe-update-notes-card" role="dialog" aria-modal="false" aria-label="Pinterest Power Menu update">
        <button id="pe-update-notes-close" type="button" aria-label="Close update notes">
          <svg viewBox="0 0 14 14" aria-hidden="true" width="14" height="14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
        <div id="pe-update-notes-eyebrow">Updated to ${escapeUpdateNoteText(SCRIPT_VERSION)}</div>
        <div id="pe-update-notes-title">What's new</div>
        <ul id="pe-update-notes-list">
          ${UPDATE_NOTES_HIGHLIGHTS.map(note => `<li>${escapeUpdateNoteText(note)}</li>`).join('')}
        </ul>
        <button id="pe-update-notes-never" type="button">Never show me updates</button>
      </div>
    `;

    layer.addEventListener('click', e => {
      if (e.target === layer) dismissUpdateNotesPopup();
    });
    layer.querySelector('#pe-update-notes-close')?.addEventListener('click', dismissUpdateNotesPopup);
    layer.querySelector('#pe-update-notes-never')?.addEventListener('click', disableUpdateNotesForever);
    document.body.appendChild(layer);

    try {
      const mode = get('darkMode');
      let dark = false;
      if (mode === 'dark') dark = true;
      else if (mode === 'auto' && typeof isPinterestDarkTheme === 'function') dark = isPinterestDarkTheme();
      layer.querySelector('#pe-update-notes-card')?.classList.toggle('pe-dark', dark);
    } catch (_) {}
  }

  loadCfg();

  function injectEarlyDeclutterStyles() {
    if (document.getElementById('pe-declutter-early-styles')) return;
    const style = document.createElement('style');
    style.id = 'pe-declutter-early-styles';
    style.textContent = `
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has(div[title="Sponsored"]),
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has([aria-label="Shoppable Pin indicator"]),
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has([data-test-id="product-price-text"]),
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has([data-test-id="pincard-product-with-link"]) {
        height: 0 !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        opacity: 0 !important;
        min-height: 0 !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="duplo-shopping-module"],
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="ShopTheLookSimilarProducts"],
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="visual-search-shopping-bar"],
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="related-products"],
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="ShopTheLookAnnotations"],
      html.pe-declutter-enabled.pe-declutter-shop-look-enabled [data-test-id="shopping-module"] {
        height: 0 !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        opacity: 0 !important;
        min-height: 0 !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }
      html.pe-declutter-enabled.pe-declutter-advisory-enabled [data-test-id="search-advisory"],
      html.pe-declutter-enabled.pe-declutter-advisory-enabled [data-test-id="fresh-search-advisory"] {
        height: 0 !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        opacity: 0 !important;
        min-height: 0 !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }
      html.pe-declutter-enabled [data-test-id="pin-action-bar-container"]:has([data-test-id="visit-button-mobile-inline"]),
      html.pe-declutter-enabled [data-test-id="visit-button-mobile-inline"],
      html.pe-declutter-enabled [data-test-id="main-pin-section-visit-button"] {
        height: 0 !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        opacity: 0 !important;
        min-height: 0 !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyDeclutterToggle() {
    document.documentElement.classList.toggle('pe-declutter-enabled', get('declutter'));
    document.documentElement.classList.toggle('pe-declutter-shop-look-enabled', get('declutter') && get('declutterShopTheLook'));
    document.documentElement.classList.toggle('pe-declutter-advisory-enabled', get('declutter') && get('declutterSearchAdvisory'));
  }

  injectEarlyDeclutterStyles();
  applyDeclutterToggle();

  // ─── Video URL interceptor ──────────────────────────────────────────────
  // On desktop, Pinterest uses HLS.js which sets video.src to a blob:
  // MediaSource URL — findPinterestVideoSrc() cannot read the actual CDN URL
  // from the DOM.  Intercept XHR/fetch at document-start to capture
  // v1.pinimg.com video URLs as they are requested by HLS.js, then use them
  // as a fallback for the Quick Download button.
  function extractPinterestVideoHashFromText(value) {
    const text = String(value || '');
    const path = text.match(/(?:^|\/)([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{32})(?=[._/?#]|$)/i);
    if (path) return `${path[1].toLowerCase()}/${path[2].toLowerCase()}/${path[3].toLowerCase()}/${path[4].toLowerCase()}`;
    const bare = text.match(/\b([a-f0-9]{32})\b/i)?.[1];
    if (!bare) return '';
    const hash = bare.toLowerCase();
    return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash.slice(4, 6)}/${hash}`;
  }

  function getPinterestVideoCdnBucket(value) {
    return String(value || '').match(/v1\.pinimg\.com\/videos\/(mc|iht)\//i)?.[1]?.toLowerCase() || '';
  }

  const _interceptedVideoUrls = [];   // most-recently-seen first
  const _interceptedVideoUrlsByHash = new Map();
  const _mobilePinVideoDownloadCache = new Map();
  let _onVideoUrlCapture = null;      // set by Quick Download startup
  (function () {
    function captureVideoUrl(url) {
      if (typeof url !== 'string') return;
      if (!/v1\.pinimg\.com\/videos/i.test(url)) return;
      const idx = _interceptedVideoUrls.indexOf(url);
      if (idx !== -1) _interceptedVideoUrls.splice(idx, 1);
      _interceptedVideoUrls.unshift(url);                // newest first
      if (_interceptedVideoUrls.length > 20) _interceptedVideoUrls.pop();
      const hash = extractPinterestVideoHashFromText(url);
      if (hash) {
        const urls = _interceptedVideoUrlsByHash.get(hash) || [];
        const hashIdx = urls.indexOf(url);
        if (hashIdx !== -1) urls.splice(hashIdx, 1);
        urls.unshift(url);
        if (urls.length > 8) urls.pop();
        _interceptedVideoUrlsByHash.set(hash, urls);
      }
      if (typeof _onVideoUrlCapture === 'function') _onVideoUrlCapture();
    }
    const _xOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, url, ...a) {
      captureVideoUrl(String(url));
      return _xOpen.call(this, m, url, ...a);
    };
    const _oFetch = window.fetch;
    if (typeof _oFetch === 'function') {
      window.fetch = function (input) {
        captureVideoUrl(typeof input === 'string' ? input : (input && input.url) || '');
        return _oFetch.apply(this, arguments);
      };
    }
  })();

  // Utility: returns a debounced version of fn (resets timer on every call).
  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function isPowerMenuNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return !!node.closest?.(
      '[data-pe-ui="true"], #pe-settings-wrap, #pe-ctx-menu, #pe-bd-fab, ' +
      '#pe-reverse-image-search-menu, #pe-toast'
    );
  }

  function isPowerMenuEvent(e) {
    return isPowerMenuNode(e?.target);
  }

  function hasOnlyPowerMenuMutations(records) {
    return !!records?.length && records.every(record => {
      if (isPowerMenuNode(record.target)) return true;
      const nodes = [...record.addedNodes, ...record.removedNodes]
        .filter(node => node.nodeType === 1);
      return nodes.length > 0 && nodes.every(isPowerMenuNode);
    });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: ORIGINAL QUALITY  (fast – no probe, no popup)
  // ═══════════════════════════════════════════════════════════════════
  // Directly rewrite pinimg.com thumbnail URLs → /originals/ with
  // an inline onerror fallback to /736x/ so zero extra requests are
  // made upfront and the "Optimizing…" overlay is never shown.

  const OQ_RE = /^(https?:\/\/i\.pinimg\.com)\/\d+x(\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:jpg|jpeg|png|gif|webp))$/i;

  function upgradeImg(img) {
    if (!get('originalQuality')) return;
    if (img.__peOQ || img.tagName !== 'IMG' || !img.src) return;
    const m = img.src.match(OQ_RE);
    if (!m) return;
    img.__peOQ = true;
    const origSrc = m[1] + '/originals' + m[2];
    const fallSrc = m[1] + '/736x'      + m[2];
    img.onerror = function () {
      if (img.src === origSrc) { img.onerror = null; img.src = fallSrc; }
    };
    if (img.getAttribute('data-src') === img.src) img.setAttribute('data-src', origSrc);
    img.src = origSrc;
  }

  function scanOQ(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IMG') upgradeImg(node);
    else node.querySelectorAll('img[src*="pinimg.com"]').forEach(upgradeImg);
  }

  // Start MutationObserver immediately (document-start) so we catch
  // images before they fire their first load event.
  const oqObs = new MutationObserver(records => {
    if (!get('originalQuality')) return;
    const process = () => records.forEach(r => {
      if (r.attributeName === 'src') upgradeImg(r.target);
      else r.addedNodes.forEach(scanOQ);
    });
    // On mobile, yield to the browser's render pipeline so scroll stays smooth
    if (IS_MOBILE && typeof requestIdleCallback === 'function') {
      requestIdleCallback(process, { timeout: 300 });
    } else {
      process();
    }
  });
  oqObs.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
  });


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: HIDE VISIT SITE
  // ═══════════════════════════════════════════════════════════════════
  // Uses CSS classes on <body> so toggles are instant and zero-cost.
  function applyVisitSiteToggle() {
    if (!document.body) return;
    document.body.classList.toggle('pe-hide-visit', get('hideVisitSite'));
  }

  function applyNavToggles() {
    if (!document.body) return;
    applyDeclutterToggle();
    document.body.classList.toggle('pe-hide-updates',    get('hideUpdates'));
    document.body.classList.toggle('pe-hide-messages',   get('hideMessages'));
    document.body.classList.toggle('pe-hide-share',      get('hideShare'));
    document.body.classList.toggle('pe-hide-comments',   get('hideComments'));
    document.body.classList.toggle('pe-hide-comment-button', get('hideCommentButton'));
    document.body.classList.toggle('pe-hide-react',      get('hideReactButton'));
    document.body.classList.toggle('pe-hide-reaction-count', get('hideReactionCount'));
    document.body.classList.toggle('pe-hide-upload-image', !IS_MOBILE && get('hideUploadImageButton'));
    document.body.classList.toggle('pe-hide-search-image', get('hideSearchImageButton'));
    document.body.classList.toggle('pe-hide-search-suggestions', get('hideSearchSuggestions'));
    document.body.classList.toggle('pe-hide-view-larger', get('hideViewLargerButton'));
    document.body.classList.toggle('pe-hide-more-options', get('hideMoreOptionsButton'));
    document.body.classList.toggle('pe-hide-reverse-image-search', get('hideReverseImageSearchButton'));
    document.body.classList.toggle('pe-hide-comment-emoji', get('hideCommentEmojiButton'));
    document.body.classList.toggle('pe-hide-comment-sticker', get('hideCommentStickerButton'));
    document.body.classList.toggle('pe-hide-comment-photo', get('hideCommentPhotoButton'));
  }

  // Physically removes the Messages nav button from the DOM (not just hidden with CSS).
  // A MutationObserver re-removes it whenever Pinterest re-renders the nav (SPA navigation).
  let _messagesRemoverObs = null;
  function initMessagesRemover() {
    if (!get('hideMessages')) return;
    if (_messagesRemoverObs) return; // already running
    const SELS = [
      'div[aria-label="Messages"]',
      '[data-test-id="nav-bar-speech-ellipsis"]',
    ];
    function removeNow(root) {
      SELS.forEach(sel => {
        (root.querySelectorAll ? root.querySelectorAll(sel) : []).forEach(el => el.remove());
      });
    }
    removeNow(document);
    _messagesRemoverObs = new MutationObserver(recs => {
      if (hasOnlyPowerMenuMutations(recs)) return;
      if (!get('hideMessages')) { _messagesRemoverObs.disconnect(); _messagesRemoverObs = null; return; }
      recs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) removeNow(n); }));
    });
    _messagesRemoverObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // JS-based "Visit site" link removal – catches links that CSS alone misses
  // (e.g. <a rel="nofollow"><div>Visit site</div></a>)
  function initVisitSiteHider() {
    function hideInTree(root) {
      if (!get('hideVisitSite') || !root) return;
      const links = root.querySelectorAll ? root.querySelectorAll('a') : [];
      links.forEach(a => {
        if (a.__peVisitHidden) return;
        const text = a.textContent.trim();
        if (/^visit\s*site$/i.test(text)) {
          a.__peVisitHidden = true;
          a.style.setProperty('display', 'none', 'important');
        }
      });
    }
    hideInTree(document);
    new MutationObserver(recs => {
      if (hasOnlyPowerMenuMutations(recs)) return;
      if (!get('hideVisitSite')) return;
      recs.forEach(r => r.addedNodes.forEach(n => {
        if (n.nodeType === 1) hideInTree(n);
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: SHARE URL OVERRIDE
  // ═══════════════════════════════════════════════════════════════════
  // Replaces Pinterest's shortened pin.it URLs in the share dialog
  // with the actual pin URL.  On closeup pages that's location.href;
  // on the grid we walk up from the share button to find the pin link.
  // Also intercepts "Copy link" and clicks on the URL input box.

  function initShareOverride() {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    ).set;

    let _sharePinUrl = null;

    // 1) Track share/send button clicks to capture the pin's real URL
    document.addEventListener('click', e => {
      if (isPowerMenuEvent(e)) return;
      const shareBtn = e.target.closest(
        '[data-test-id="sendPinButton"], button[aria-label="Send"], ' +
        '[data-test-id="closeup-share-button"], div[aria-label="Share"], ' +
        'button[aria-label="Share"]'
      );
      if (!shareBtn) return;

      // On a pin closeup page, location.href IS the pin URL
      if (/\/pin\/\d+/.test(location.pathname)) {
        _sharePinUrl = location.href;
        return;
      }

      // On grid: walk up from the share button to find the pin card link
      _sharePinUrl = null;
      let el = shareBtn;
      for (let i = 0; i < 30 && el; i++) {
        if (el.querySelector) {
          const link = el.querySelector('a[href*="/pin/"]');
          if (link) {
            _sharePinUrl = new URL(link.href, location.origin).href;
            break;
          }
        }
        el = el.parentElement;
      }
      if (!_sharePinUrl) _sharePinUrl = location.href;
    }, true);

    // 2) Watch for the share-popup URL input and override its value
    function fixShareInputs() {
      const realUrl = _sharePinUrl || location.href;
      document.querySelectorAll(
        'input#url-text, ' +
        '[data-test-id="copy-link-share-icon-auth"] input[type="text"], ' +
        'input[readonly][value*="pin.it"], ' +
        'input[readonly][value*="pinterest.com/pin/"]'
      ).forEach(input => {
        // Always re-fix if value doesn't match
        if (input.value !== realUrl) {
          nativeSetter.call(input, realUrl);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (!input.__peShareClick) {
          input.__peShareClick = true;
          // Intercept clicks on the input box itself
          input.addEventListener('click', ev => {
            ev.stopPropagation();
            const url = _sharePinUrl || location.href;
            navigator.clipboard.writeText(url).catch(() => {
              const ta = document.createElement('textarea');
              ta.value = url;
              ta.style.cssText = 'position:fixed;left:-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
            });
          }, true);
          // Re-fix if React re-renders the value
          new MutationObserver(() => {
            const url = _sharePinUrl || location.href;
            if (input.value !== url) {
              nativeSetter.call(input, url);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }).observe(input, { attributes: true, attributeFilter: ['value'] });
        }
      });
    }

    new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      fixShareInputs();
    })
      .observe(document.documentElement, { childList: true, subtree: true });

    // 3) Intercept "Copy link" button clicks
    document.addEventListener('click', e => {
      if (isPowerMenuEvent(e)) return;
      const copyBtn = e.target.closest(
        'button[aria-label="Copy link"], ' +
        '[data-test-id="copy-link-share-icon-auth"] button'
      );
      if (!copyBtn) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const realUrl = _sharePinUrl || location.href;
      navigator.clipboard.writeText(realUrl).then(() => {
        const txt = copyBtn.querySelector('div');
        if (txt) {
          const orig = txt.textContent;
          txt.textContent = 'Copied!';
          setTimeout(() => { txt.textContent = orig; }, 1500);
        }
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = realUrl;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      });
    }, true);
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: GIF / VIDEO HOVER PLAY
  // ═══════════════════════════════════════════════════════════════════
  // In the pin grid, Pinterest renders GIFs as static <img> elements
  // (showing a .jpg thumbnail) with the real .gif URL hidden in
  // srcset at "4x".  There is no <video> in the grid.
  //
  // Strategy:
  //  • On mouseover – walk up to [data-test-id="pinWrapper"], find
  //    img[srcset*=".gif"], extract the .gif URL, swap img.src to it.
  //  • On mouseout – restore the original .jpg src.
  //  • Only ONE gif plays at a time (previous is restored before new starts).
  //  • <video> elements (pin closeup / detail page) are still kept paused
  //    via the MutationObserver so they don't auto-play in the background.

  // Selector matching any img that carries a GIF URL in srcset, live src, or lazy data-src.
  // Used by both hover-play and auto-play modules.
  const GIF_IMG_SEL = 'img[srcset*=".gif"], img[src*=".gif"], img[data-src*=".gif"]';
  const GIF_PIN_CONTAINER_SEL = [
    '[data-test-id="pinWrapper"]',
    '[data-grid-item="true"]',
    '[data-test-id="pin"]',
    'div[role="listitem"]',
    '[data-test-id="pin-closeup-image"]',
  ].join(', ');

  let _gifActiveImg     = null;   // <img> currently showing a .gif
  let _gifOrigSrc       = null;   // original src to restore on leave
  let _gifOrigSrcset    = null;   // original srcset to restore on leave
  let _gifActiveCont    = null;   // pinWrapper of the active gif
  let _gifActiveVid     = null;   // <video> currently playing a GIF (mobile hover/tap)

  // Pinterest uses different card wrappers across home/search/closeup pages,
  // especially on mobile. Resolve the nearest usable pin container defensively.
  function findGifContainer(node) {
    if (!node || node.nodeType !== 1) return null;
    return node.closest(GIF_PIN_CONTAINER_SEL);
  }

  // Resolve a video source even when Pinterest lazy-loads into data-* attrs.
  function getVideoSrc(video) {
    if (!video) return '';
    const source = video.querySelector && video.querySelector('source');
    return video.src
      || video.getAttribute('src')
      || video.getAttribute('data-src')
      || (source && (source.src || source.getAttribute('src') || source.getAttribute('data-src')))
      || '';
  }

  // Ensure lazy mobile GIF videos have a concrete src before play() attempts.
  function hydrateVideoSource(video) {
    if (!video) return;
    if (!video.getAttribute('src')) {
      const ds = video.getAttribute('data-src');
      if (ds) video.setAttribute('src', ds);
    }
    const source = video.querySelector && video.querySelector('source');
    if (source && !source.getAttribute('src')) {
      const ds = source.getAttribute('data-src');
      if (ds) source.setAttribute('src', ds);
    }
  }

  // Classify whether a <video> is a GIF-like pin media.
  // Some mobile layouts use i.pinimg.com sources, others expose only
  // a PinTypeIdentifier badge with text "GIF".
  function isGifVideo(video, container) {
    if (!video) return false;
    const src = getVideoSrc(video);
    if (/i\.pinimg\.com/i.test(src)) return true;
    const wrap = container || findGifContainer(video);
    const badge = wrap && wrap.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (!badge) return false;
    const t = (badge.textContent || '').trim().toLowerCase();
    if (t === 'gif' || t.includes('animated')) return true;
    if (t === 'video' || t.includes('watch')) return false;
    return false;
  }

  // Detect the mobile/touch layout GIF pin — Pinterest renders these with
  // JPEG-only srcset; the GIF container data-test-ids identify them reliably.
  function isMobileGifPin(container) {
    if (!container) return false;
    if (container.querySelector('[data-test-id="inp-perf-pinType-gif"]')) return true;
    if (container.querySelector('[data-test-id="pincard-gif-without-link"]')) return true;
    const badge = container.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (badge) {
      const t = (badge.textContent || '').trim().toLowerCase();
      if (t === 'gif' || t.includes('animated')) return true;
    }
    return false;
  }

  // Convert a pinimg.com JPEG/WebP thumbnail URL to the /originals/ GIF URL.
  // e.g. …/236x/ab/cd/ef/hash.jpg → …/originals/ab/cd/ef/hash.gif
  function deriveGifUrl(jpegUrl) {
    if (!jpegUrl) return null;
    const m = jpegUrl.match(/^(https?:\/\/i\.pinimg\.com)\/[^/]+(\/.+?)(?:\.jpe?g|\.webp)(\?.*)?$/i);
    if (!m) return null;
    return m[1] + '/originals' + m[2] + '.gif';
  }

  // Extract the .gif URL from an img element, checking srcset, live src, and data-src.
  // On mobile Pinterest uses JPEG-only srcset for GIF pins; derive the .gif URL when needed.
  function getGifSrcFromImg(img) {
    if (!img) return null;
    // Prefer srcset (Pinterest hides the GIF at "4x"; also stored in __peAutoOrigSrcset)
    const srcset = img.getAttribute('srcset') || img.__peAutoOrigSrcset || '';
    for (const part of srcset.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url && /\.gif(\?|$)/i.test(url)) return url;
    }
    // GIF already in src (srcset was cleared and .gif URL was applied)
    if (/\.gif(\?|$)/i.test(img.src)) return img.src;
    // Lazy-loaded src attribute
    const ds = img.getAttribute('data-src') || '';
    if (/\.gif(\?|$)/i.test(ds)) return ds;
    // Mobile layout: GIF pins have JPEG-only srcset but carry inp-perf-pinType-gif /
    // pincard-gif-without-link in their container. Derive the originals .gif URL.
    const wrap = img.closest('[data-test-id="pinWrapper"], [data-grid-item="true"], [data-test-id="pin"]');
    if (isMobileGifPin(wrap)) {
      const jpegSrc = img.getAttribute('src') || img.src || '';
      if (jpegSrc) {
        const d = deriveGifUrl(jpegSrc);
        if (d) return d;
      }
      // Fallback: try highest-res srcset entry
      const parts = srcset.split(',').map(p => p.trim().split(/\s+/)[0]).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const d = deriveGifUrl(parts[i]);
        if (d) return d;
      }
    }
    return null;
  }

  function pauseActiveGif() {
    if (_gifActiveImg) {
      // Restore srcset FIRST so the browser doesn't re-pick from it
      // before we restore src
      if (_gifOrigSrcset !== null) _gifActiveImg.setAttribute('srcset', _gifOrigSrcset);
      if (_gifOrigSrc    !== null) _gifActiveImg.src = _gifOrigSrc;
    }
    if (_gifActiveVid) {
      try { _gifActiveVid.pause(); } catch (_) {}
      _gifActiveVid = null;
    }
    const prevCont    = _gifActiveCont;
    _gifActiveImg     = null;
    _gifOrigSrc       = null;
    _gifOrigSrcset    = null;
    _gifActiveCont    = null;
    // If GIF auto-play is active, let it take over this wrapper
    if (prevCont && get('gifAutoPlay') && _gifAutoIO) {
      setTimeout(() => {
        const r = prevCont.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startGifInView(prevCont);
      }, 50);
    }
  }

  // Keep any <video> elements (pin detail/closeup page) paused so they
  // don't auto-play in the background.
  function pauseVidOnAdd(v) {
    if (v.__pePaused || v.__peGifVid) return;
    // GIFs rendered as <video src="i.pinimg.com/…"> on mobile must NOT be paused here —
    // the GIF hover / auto-play modules manage those independently.
    const getSrc = () => getVideoSrc(v);
    const src = getSrc();
    const initialWrap = findGifContainer(v);
    if (isGifVideo(v, initialWrap)) {
      v.__peGifVid = true;
      return;
    }
    // src not yet assigned (lazy-load): observe for when it is set before deciding to pause.
    // Without this, Pinterest's async src assignment races with auto-play on mobile —
    // the deferred kill() calls would pause the video after auto-play had already started it.
    if (!src) {
      if (v.__peVidSrcObs) return; // observer already attached
      v.__peVidSrcObs = true;
      const obs = new MutationObserver(() => {
        const s = getSrc();
        if (!s) return; // still not set – keep waiting
        obs.disconnect();
        v.__peVidSrcObs = false;
        const wrap = findGifContainer(v);
        if (isGifVideo(v, wrap)) {
          // It's a mobile GIF video – let hover / auto-play manage it; never pause it
          v.__peGifVid = true;
          const pw = wrap;
          if (pw && _gifAutoIO) { pw.__peAutoObs = false; observeGifPins(); }
        } else {
          pauseVidOnAdd(v); // real video – go ahead and pause it
        }
      });
      obs.observe(v, { attributes: true, attributeFilter: ['src'], childList: true });
      return;
    }
    v.__pePaused = true;
    v.muted = true;
    // Respect videoAutoPlay: don't fight it by killing playback.
    if (get('videoAutoPlay')) return;
    const kill = () => {
      try { v.pause(); } catch (_) {}
    };
    kill(); setTimeout(kill, 60); setTimeout(kill, 250);
  }

  new MutationObserver(records => {
    if (hasOnlyPowerMenuMutations(records)) return;
    records.forEach(r => r.addedNodes.forEach(function scan(n) {
      if (!n || n.nodeType !== 1) return;
      if (n.tagName === 'VIDEO') pauseVidOnAdd(n);
      n.querySelectorAll && n.querySelectorAll('video').forEach(pauseVidOnAdd);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  function initGifHover() {
    document.addEventListener('mouseover', e => {
      if (!get('gifHover')) return;

      const pinWrapper = findGifContainer(e.target);
      if (!pinWrapper || pinWrapper === _gifActiveCont) return;

      // Look for a GIF image inside this pin card (incl. mobile JPEG-srcset GIF pins)
      const img = pinWrapper.querySelector(GIF_IMG_SEL)
               || (isMobileGifPin(pinWrapper) ? pinWrapper.querySelector('img') : null);
      if (!img) return;
      const gifUrl = getGifSrcFromImg(img);
      if (!gifUrl) return;

      // Stop the previous gif first
      pauseActiveGif();

      // Start the new one.
      // IMPORTANT: browsers use srcset over src, so we must clear srcset
      // before setting src to the gif URL, otherwise src change is ignored.
      _gifActiveImg     = img;
      _gifOrigSrc       = img.src;
      _gifOrigSrcset    = img.getAttribute('srcset');
      _gifActiveCont    = pinWrapper;
      img.removeAttribute('srcset');   // prevent srcset overriding our src
      img.src = gifUrl;
    }, { passive: true });

    document.addEventListener('mouseout', e => {
      if (!get('gifHover') || !_gifActiveCont) return;
      const to = e.relatedTarget;
      // If the mouse moved to another element still inside the pin wrapper, keep playing
      if (to && _gifActiveCont.contains(to)) return;
      pauseActiveGif();
    }, { passive: true });

    // ── Touch: tap to preview GIF on mobile ──────────────────────────
    // First tap on a GIF pin starts playback; second tap (or tap elsewhere) stops it.
    // Scrolling never accidentally triggers GIF playback.
    let _gifTouchStartY = 0, _gifTouchScrolled = false;

    document.addEventListener('touchstart', e => {
      _gifTouchStartY   = e.touches[0].clientY;
      _gifTouchScrolled = false;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (Math.abs(e.touches[0].clientY - _gifTouchStartY) > 8) _gifTouchScrolled = true;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!get('gifHover') || _gifTouchScrolled) return;
      // Don't interfere when the context menu is open
      if (document.getElementById('pe-ctx-menu')) return;
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el) return;
      const pinWrapper = findGifContainer(el);
      if (!pinWrapper) { pauseActiveGif(); return; }
      const img    = pinWrapper.querySelector(GIF_IMG_SEL)
                  || (isMobileGifPin(pinWrapper) ? pinWrapper.querySelector('img') : null);
      const gifUrl = img ? getGifSrcFromImg(img) : null;
      if (!gifUrl) {
        // No img-based GIF – check for a mobile video-based GIF
        const vid   = pinWrapper.querySelector('video');
        if (vid) hydrateVideoSource(vid);
        if (!vid || !isGifVideo(vid, pinWrapper)) { pauseActiveGif(); return; }
        // Second tap on the same video GIF = stop
        if (pinWrapper === _gifActiveCont) { pauseActiveGif(); return; }
        pauseActiveGif();
        _gifActiveCont = pinWrapper;
        _gifActiveVid  = vid;
        vid.muted = true;
        vid.loop  = true;
        vid.playsInline = true;
        if (vid.readyState === 0) {
          try { vid.load(); } catch (_) {}
        }
        try { vid.play(); } catch (_) {}
        return;
      }
      // Second tap on the same GIF pin = stop
      if (pinWrapper === _gifActiveCont) { pauseActiveGif(); return; }
      pauseActiveGif();
      _gifActiveImg     = img;
      _gifOrigSrc       = img.src;
      _gifOrigSrcset    = img.getAttribute('srcset');
      _gifActiveCont    = pinWrapper;
      img.removeAttribute('srcset');
      img.src = gifUrl;
    }, { passive: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: GIF AUTO-PLAY (viewport-based)
  // ═══════════════════════════════════════════════════════════════════
  // Uses IntersectionObserver to play all GIFs currently visible on
  // screen and stop them when scrolled out of view to save CPU/memory.

  let _gifAutoIO = null;   // IntersectionObserver
  let _gifAutoMO = null;   // MutationObserver for new pins

  function startGifInView(wrapper) {
    // ── img-based GIF (desktop + most mobile, including mobile JPEG-srcset GIFs) ──
    const img = wrapper.querySelector(GIF_IMG_SEL)
             || (isMobileGifPin(wrapper) ? wrapper.querySelector('img') : null);
    if (img && !img.__peAutoPlaying) {
      const gifUrl = getGifSrcFromImg(img);
      if (gifUrl) {
        img.__peAutoOrigSrc    = img.src;
        img.__peAutoOrigSrcset = img.getAttribute('srcset');
        img.removeAttribute('srcset');
        img.src = gifUrl;
        img.__peAutoPlaying = true;
        return;
      }
    }
    // ── video-based GIF (mobile) ──
    const vid = wrapper.querySelector('video');
    if (vid && !vid.__peAutoPlaying) {
      hydrateVideoSource(vid);
      if (isGifVideo(vid, wrapper)) {
        vid.__peAutoPlaying = true;
        vid.muted = true;
        vid.loop  = true;
        vid.playsInline = true;
        if (vid.readyState === 0) {
          try { vid.load(); } catch (_) {}
        }
        try { vid.play(); } catch (_) {}
      }
    }
  }

  function stopGifInView(wrapper) {
    wrapper.querySelectorAll('img').forEach(img => {
      if (!img.__peAutoPlaying) return;
      // Don't interfere if hover is currently managing this img
      if (img === _gifActiveImg) { img.__peAutoPlaying = false; return; }
      if (img.__peAutoOrigSrcset) img.setAttribute('srcset', img.__peAutoOrigSrcset);
      if (img.__peAutoOrigSrc)    img.src = img.__peAutoOrigSrc;
      img.__peAutoPlaying = false;
    });
    // Stop video-based GIFs (mobile)
    wrapper.querySelectorAll('video').forEach(vid => {
      if (!vid.__peAutoPlaying) return;
      vid.__peAutoPlaying = false;
      if (vid === _gifActiveVid) return; // hover/tap is managing this video
      try { vid.pause(); } catch (_) {}
    });
  }

  function observeGifPin(wrapper) {
    if (!_gifAutoIO || !wrapper || wrapper.__peAutoObs) return;
    // Detect img-based GIF, video-based GIF, or mobile JPEG-srcset GIF
    const hasGifImg = !!wrapper.querySelector(GIF_IMG_SEL);
    const hasGifVid = (() => {
      const vid = wrapper.querySelector('video');
      if (!vid) return false;
      if (vid.__peGifVid) return true; // already confirmed as a GIF video
      return isGifVideo(vid, wrapper);
    })();
    const hasMobileGif = !hasGifImg && !hasGifVid && isMobileGifPin(wrapper);
    if (!hasGifImg && !hasGifVid && !hasMobileGif) return;
    wrapper.__peAutoObs = true;
    _gifAutoIO.observe(wrapper);
  }

  function observeGifPins(root = document) {
    if (!_gifAutoIO) return;
    if (root.matches && root.matches(GIF_PIN_CONTAINER_SEL)) observeGifPin(root);
    if (root.querySelectorAll) root.querySelectorAll(GIF_PIN_CONTAINER_SEL).forEach(observeGifPin);
  }

  function initGifAutoPlay() {
    if (_gifAutoIO) return;
    _gifAutoIO = new IntersectionObserver(entries => {
      // Skip when feature is off or tab is hidden (avoids playing on inactive tabs)
      if (!get('gifAutoPlay') || document.hidden) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) startGifInView(entry.target);
        else                      stopGifInView(entry.target);
      });
    }, { threshold: 0.1 });

    observeGifPins();
    _gifAutoMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      records.forEach(r => r.addedNodes.forEach(n => {
        if (n && n.nodeType === 1) observeGifPins(n);
      }));
    });
    _gifAutoMO.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopGifAutoPlay() {
    if (_gifAutoIO) { _gifAutoIO.disconnect(); _gifAutoIO = null; }
    if (_gifAutoMO) { _gifAutoMO.disconnect(); _gifAutoMO = null; }
    document.querySelectorAll(GIF_PIN_CONTAINER_SEL).forEach(wrapper => {
      stopGifInView(wrapper);
      wrapper.__peAutoObs = false;
    });
  }

  // Pause all auto-playing GIFs when the tab/window is hidden to save resources,
  // and resume them when the user comes back.
  document.addEventListener('visibilitychange', () => {
    if (!get('gifAutoPlay')) return;
    if (document.hidden) {
      document.querySelectorAll(GIF_PIN_CONTAINER_SEL).forEach(stopGifInView);
    } else if (_gifAutoIO) {
      // Re-start GIFs that are still in the viewport
      document.querySelectorAll(GIF_PIN_CONTAINER_SEL).forEach(wrapper => {
        if (!wrapper.__peAutoObs) return;
        const r = wrapper.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startGifInView(wrapper);
      });
    }
  });


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: VIDEO AUTO-PLAY (viewport-based)
  // ═══════════════════════════════════════════════════════════════════
  // Mirrors GIF auto-play for non-GIF <video> elements. Browsers require
  // muted auto-play, so all auto-played videos are muted.

  let _vidAutoIO = null;
  let _vidAutoMO = null;
  const _vidAutoPending = new Set();

  // A real pin video — not a GIF rendered as <video>, not our own chrome.
  function isRealVideo(v) {
    if (!v || v.tagName !== 'VIDEO') return false;
    if (v.__peGifVid) return false;
    const wrap = findGifContainer(v);
    if (isGifVideo(v, wrap)) return false;
    return true;
  }

  function startVidInView(v) {
    if (!isRealVideo(v) || v.__peAutoVidPlaying) return;
    v.__peAutoVidPlaying = true;
    v.muted = true;
    v.playsInline = true;

    const doPlay = () => {
      if (!v.__peAutoVidPlaying) return;
      let p;
      try { p = v.play(); } catch (_) {}
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          setTimeout(() => {
            if (v.__peAutoVidPlaying && v.paused && !document.hidden) {
              try { v.play(); } catch (_) {}
            }
          }, 500);
        });
      }
    };

    if (v.readyState >= 2) {
      doPlay();
    } else {
      if (v.readyState === 0) { try { v.load(); } catch (_) {} }
      v.addEventListener('canplay', doPlay, { once: true });
    }
  }

  function stopVidInView(v) {
    if (!v || !v.__peAutoVidPlaying) return;
    v.__peAutoVidPlaying = false;
    try { v.pause(); } catch (_) {}
  }

  function observeVideo(v) {
    if (!_vidAutoIO || !v || v.__peAutoVidObs) return;
    if (!isRealVideo(v)) return;
    v.__peAutoVidObs = true;
    _vidAutoIO.observe(v);
  }

  function observeVideos(root = document) {
    if (!_vidAutoIO) return;
    if (root.tagName === 'VIDEO') observeVideo(root);
    if (root.querySelectorAll) root.querySelectorAll('video').forEach(observeVideo);
  }

  function initVideoAutoPlay() {
    if (_vidAutoIO) return;
    _vidAutoIO = new IntersectionObserver(entries => {
      if (!get('videoAutoPlay')) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (document.hidden) { _vidAutoPending.add(entry.target); return; }
          startVidInView(entry.target);
        } else {
          _vidAutoPending.delete(entry.target);
          stopVidInView(entry.target);
        }
      });
    }, { threshold: 0.25 });

    observeVideos();
    _vidAutoMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      records.forEach(r => r.addedNodes.forEach(n => {
        if (n && n.nodeType === 1) observeVideos(n);
      }));
    });
    _vidAutoMO.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopVideoAutoPlay() {
    if (_vidAutoIO) { _vidAutoIO.disconnect(); _vidAutoIO = null; }
    if (_vidAutoMO) { _vidAutoMO.disconnect(); _vidAutoMO = null; }
    _vidAutoPending.clear();
    document.querySelectorAll('video').forEach(v => {
      stopVidInView(v);
      v.__peAutoVidObs = false;
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!get('videoAutoPlay')) return;
    if (document.hidden) {
      document.querySelectorAll('video').forEach(stopVidInView);
    } else if (_vidAutoIO) {
      _vidAutoPending.forEach(v => {
        const r = v.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startVidInView(v);
      });
      _vidAutoPending.clear();
      document.querySelectorAll('video').forEach(v => {
        if (!v.__peAutoVidObs) return;
        const r = v.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startVidInView(v);
      });
    }
  });


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: VIDEO MUTE-STATE PRESERVATION + INFINITE LOOP
  // ═══════════════════════════════════════════════════════════════════
  // Pinterest resets `muted = true` when a closeup video replays via the
  // "Watch again" button. We track the user's last explicit unmute via
  // volumechange, then restore it on play. Always on — fixes native bug.
  //
  // initInfiniteLoopVideo: opt-in setting that sets video.loop=true on
  // every real closeup video so the "Watch again" overlay never appears.

  // Desktop closeup containers PLUS the mobile/story closeup containers.
  // The mobile pin-closeup wraps the <video> in visual-content-container /
  // story-pin-video-block / [data-video-signature] (NOT the desktop
  // closeup-visual-container), so without these the loop flag was never
  // applied on mobile and Pinterest's "Watch again / Share" end-screen showed.
  const CLOSEUP_VIDEO_SELECTOR =
    '[data-test-id="closeup-visual-container"], ' +
    '[data-test-id="closeup-video-with-visibility"], ' +
    '[data-test-id="visual-content-container"], ' +
    '[data-test-id="story-pin-video-block"], ' +
    '[data-test-id="closeup-body-image-container"], ' +
    '[data-test-id="pin-closeup-image"], ' +
    '[data-video-signature]';

  let _loopVideoObs = null;
  const _loopVideoOriginalState = new Map();

  function applyLoopFlagToVideo(v) {
    if (!v || v.tagName !== 'VIDEO') return;
    if (!isRealVideo(v)) return;
    if (!v.closest || !v.closest(CLOSEUP_VIDEO_SELECTOR)) return;
    if (!_loopVideoOriginalState.has(v)) _loopVideoOriginalState.set(v, v.loop);
    if (v.loop) return;
    try { v.loop = true; } catch (_) {}
  }

  function applyLoopFlagToAllVideos(root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('video').forEach(applyLoopFlagToVideo);
  }

  function trackCloseupVideoMuteState() {
    // Snapshot mute state at end. Pinterest's "Watch again" handler resets
    // `muted = true` *before* the next play event fires, so reading the
    // current value at play() time is too late — we must capture on ended.
    document.addEventListener('ended', e => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !isRealVideo(v)) return;
      v.__peWasUnmutedBeforeEnd = !v.muted;
    }, true);

    document.addEventListener('play', e => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !isRealVideo(v)) return;
      if (v.__peWasUnmutedBeforeEnd && v.muted) {
        try { v.muted = false; } catch (_) {}
      }
      v.__peWasUnmutedBeforeEnd = false;
    }, true);
  }

  // Native video.loop is the primary mechanism, but Pinterest's mobile player
  // drives playback through its own React/HLS layer and can pause at the end
  // (showing the "Watch again / Share" end-screen) instead of honoring the
  // attribute — in that case an `ended` event still fires. Force a replay so
  // the closeup video loops regardless of how Pinterest stopped it.
  let _loopEndedBound = false;

  function bindLoopEndedFallback() {
    if (_loopEndedBound) return;
    _loopEndedBound = true;
    document.addEventListener('ended', e => {
      if (!get('infiniteLoopVideo')) return;
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !isRealVideo(v)) return;
      if (!v.closest || !v.closest(CLOSEUP_VIDEO_SELECTOR)) return;
      try {
        v.loop = true;
        v.currentTime = 0;
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }, true);
  }

  function initInfiniteLoopVideo() {
    applyLoopFlagToAllVideos();
    bindLoopEndedFallback();
    if (_loopVideoObs) return;
    _loopVideoObs = new MutationObserver(records => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'VIDEO') applyLoopFlagToVideo(n);
          else applyLoopFlagToAllVideos(n);
        }
      }
    });
    _loopVideoObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopInfiniteLoopVideo() {
    if (_loopVideoObs) { _loopVideoObs.disconnect(); _loopVideoObs = null; }
    _loopVideoOriginalState.forEach((wasLooping, v) => {
      try { v.loop = wasLooping; } catch (_) {}
    });
    _loopVideoOriginalState.clear();
  }

  function applyInfiniteLoopVideoToggle() {
    const on = !!get('infiniteLoopVideo');
    document.body && document.body.classList.toggle('pe-loop-video', on);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: DECLUTTER  (no ads, no shopping, no blank spaces)
  // ═══════════════════════════════════════════════════════════════════
  // Collapses unwanted elements to zero size instead of display:none
  // so the masonry grid reflows cleanly with no empty slots.
  // Sets grid-auto-flow:dense on pin-list containers once per container.

  function collapseEl(el) {
    if (!el) return;
    el.style.setProperty('height',     '0',       'important');
    el.style.setProperty('width',      '0',       'important');
    el.style.setProperty('margin',     '0',       'important');
    el.style.setProperty('padding',    '0',       'important');
    el.style.setProperty('border',     'none',    'important');
    el.style.setProperty('overflow',   'hidden',  'important');
    el.style.setProperty('opacity',    '0',       'important');
    el.style.setProperty('min-height', '0',       'important');
    el.style.setProperty('min-width',  '0',       'important');
    // Make the parent grid fill the gap
    const grid = el.closest('div[role="list"]');
    if (grid && !grid.dataset.peDense) {
      grid.style.setProperty('grid-auto-flow', 'dense', 'important');
      grid.dataset.peDense = '1';
    }
  }

  const SHOP_THE_LOOK_DIRECT_SELECTORS = [
    '[data-test-id="duplo-shopping-module"]',
    '[data-test-id="ShopTheLookSimilarProducts"]',
    '[data-test-id="visual-search-shopping-bar"]',
    '[data-test-id="related-products"]',
    '[data-test-id="ShopTheLookAnnotations"]',
    '[data-test-id="shopping-module"]',
  ];

  function isShopTheLookDeclutterEnabled() {
    return !!get('declutter') && !!get('declutterShopTheLook');
  }

  function isSafeShopTheLookRoot(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.matches?.('[data-test-id="closeup-body"], [data-test-id="closeup-body-style"], [data-test-id="closeup-lego-container"], [data-test-id="description-content-container"]')) return false;
    if (el.querySelector?.('[data-test-id="closeup-visual-container"]') && el.querySelector?.('[data-test-id="description-content-container"]')) return false;
    return true;
  }

  function textLooksLikeShopTheLook(text) {
    return /^(shop the look|shop similar|shop products|more products)\b/i.test(String(text || '').trim());
  }

  function getShopTheLookModuleRoot(el) {
    if (!el || el.nodeType !== 1) return null;
    const direct = el.closest?.(SHOP_THE_LOOK_DIRECT_SELECTORS.join(','));
    if (direct) {
      if (direct.matches('[data-test-id="shopping-module"]')) {
        return direct.closest('div[role="listitem"]') || direct.closest('[data-grid-item="true"]') || direct;
      }
      if (direct.parentElement && direct.parentElement.children.length === 1 && isSafeShopTheLookRoot(direct.parentElement)) {
        return direct.parentElement;
      }
      return direct;
    }

    const titleNode = el.matches?.('div[title="Shop the look"]') ? el : el.querySelector?.('div[title="Shop the look"]');
    if (titleNode) {
      const titleRoot = titleNode.closest('[data-test-id="duplo-shopping-module"], [data-test-id="collapsible-layout"]');
      if (titleRoot && isSafeShopTheLookRoot(titleRoot)) return titleRoot;
    }

    const headings = [
      ...(el.matches?.('h2,[data-test-id="collapsible-header"]') ? [el] : []),
      ...Array.from(el.querySelectorAll?.('h2,[data-test-id="collapsible-header"]') || []),
    ];
    const shopHeading = headings.find(node => textLooksLikeShopTheLook(node.textContent));
    if (!shopHeading) return null;

    const moduleRoot = shopHeading.closest('[data-test-id="duplo-shopping-module"]');
    if (moduleRoot && isSafeShopTheLookRoot(moduleRoot)) return moduleRoot;

    const layout = shopHeading.closest('[data-test-id="collapsible-layout"]');
    if (layout && isSafeShopTheLookRoot(layout.parentElement)) return layout.parentElement;
    if (layout && isSafeShopTheLookRoot(layout)) return layout;
    return null;
  }

  function collapseShopTheLookModule(el) {
    const root = getShopTheLookModuleRoot(el);
    if (!root || root.__peShopTheLookHidden) return false;
    root.__peShopTheLookHidden = true;
    collapseEl(root);
    return true;
  }

  function hideShopTheLookModules(root = document) {
    if (!isShopTheLookDeclutterEnabled()) return false;
    const scope = root?.nodeType === 1 ? root : document;
    let matched = false;
    if (scope.matches?.(SHOP_THE_LOOK_DIRECT_SELECTORS.join(',')) || scope.matches?.('div[title="Shop the look"], h2, [data-test-id="collapsible-header"]')) {
      matched = collapseShopTheLookModule(scope) || matched;
    }
    scope.querySelectorAll?.(`${SHOP_THE_LOOK_DIRECT_SELECTORS.join(',')}, div[title="Shop the look"]`).forEach(el => {
      matched = collapseShopTheLookModule(el) || matched;
    });
    if (scope !== document || !isMobilePinCloseupPage()) {
      scope.querySelectorAll?.('h2, [data-test-id="collapsible-header"]').forEach(el => {
        matched = collapseShopTheLookModule(el) || matched;
      });
    }
    return matched;
  }

  function hideDeclutterMobileInlineVisitButtons(root = document) {
    if (!get('declutter')) return false;
    const scope = root?.nodeType === 1 ? root : document;
    const nodes = new Set();
    if (scope.matches?.('[data-test-id="visit-button-mobile-inline"], [data-test-id="main-pin-section-visit-button"]')) {
      nodes.add(scope);
    }
    scope.querySelectorAll?.('[data-test-id="visit-button-mobile-inline"], [data-test-id="main-pin-section-visit-button"]').forEach(el => nodes.add(el));

    let matched = false;
    nodes.forEach(el => {
      const actionContainer = el.closest('[data-test-id="pin-action-bar-container"]');
      const wrapper = actionContainer?.parentElement && actionContainer.parentElement.children.length === 1
        ? actionContainer.parentElement
        : actionContainer;
      collapseEl(wrapper || el);
      matched = true;
    });
    return matched;
  }

  function isDeclutterPin(pin) {
    // Sponsored
    if (pin.querySelector('div[title="Sponsored"]')) return true;
    // Shoppable Pin indicator
    if (pin.querySelector('[aria-label="Shoppable Pin indicator"]')) return true;
    // Shopping cards / "Shop" headings
    const h2 = pin.querySelector('h2#comments-heading');
    if (h2 && h2.textContent.trim().toLowerCase().startsWith('shop')) return true;
    for (const heading of pin.querySelectorAll('h2')) {
      if ((heading.textContent || '').trim().toLowerCase().startsWith('shop')) return true;
    }
    const aLink = pin.querySelector('a');
    if (aLink && (aLink.getAttribute('aria-label') || '').toLowerCase().startsWith('shop')) return true;
    // Featured boards / window shopping promos
    const text = pin.textContent.trim().toLowerCase();
    if (text.startsWith('explore featured boards')) return true;
    if (text.startsWith('still window shopping'))  return true;
    // Quiz posts
    if (/\bquiz\b/i.test(pin.textContent)) return true;
    // Deleted / unavailable pins
    if (pin.querySelector('[data-test-id="unavailable-pin"]')) return true;
    // Product cards with price tags (individual Shop the look items)
    if (pin.querySelector('[data-test-id="product-price-text"]')) return true;
    if (pin.querySelector('[data-test-id="pincard-product-with-link"]')) return true;
    if (pin.querySelector('div[title="Shop the look"]')) return true;
    return false;
  }

  function collapseDeclutterPin(pin) {
    if (!pin || pin.__peDecluttered) return false;
    if (!isDeclutterPin(pin)) return false;
    pin.__peDecluttered = true;
    collapseEl(pin);
    return true;
  }

  function scanDeclutterNode(node) {
    if (!node || node.nodeType !== 1) return false;
    let matched = false;
    matched = hideDeclutterMobileInlineVisitButtons(node) || matched;
    matched = hideShopTheLookModules(node) || matched;
    const closestPin = node.closest?.('div[role="listitem"]');
    if (closestPin) matched = collapseDeclutterPin(closestPin) || matched;
    if (node.matches?.('div[role="listitem"]')) matched = collapseDeclutterPin(node) || matched;
    node.querySelectorAll?.('div[role="listitem"]').forEach(pin => {
      matched = collapseDeclutterPin(pin) || matched;
    });
    return matched;
  }

  function scanDeclutterMutationRecords(records) {
    let matched = false;
    records.forEach(record => {
      if (record.type === 'attributes') {
        matched = hideDeclutterMobileInlineVisitButtons(record.target) || matched;
        matched = hideShopTheLookModules(record.target) || matched;
        matched = collapseDeclutterPin(record.target.closest?.('div[role="listitem"]')) || matched;
        return;
      }
      record.addedNodes.forEach(node => {
        matched = scanDeclutterNode(node) || matched;
      });
    });
    return matched;
  }

  function filterPins(container) {
    if (!get('declutter')) return;
    hideDeclutterMobileInlineVisitButtons(container);
    hideShopTheLookModules(container);
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      collapseDeclutterPin(pin);
    });
  }

  function getDirectChildOf(parent, node) {
    let current = node;
    while (current && current.parentElement !== parent) current = current.parentElement;
    return current || null;
  }

  function removeDeclutterOneoffs() {
    if (!get('declutter')) return;
    hideShopTheLookModules(document);
    hideDeclutterMobileInlineVisitButtons(document);
    if (isMobilePinCloseupPage()) return;
    // Shop tab on board tools bar
    document.querySelectorAll('[data-test-id="board-tools"] [data-test-id="Shop"]')
      .forEach(el => collapseEl(el.closest('div')));
    // Shop-by / sf-header banners
    document.querySelectorAll('[data-test-id="sf-header-heading"]').forEach(el => {
      collapseEl(el.closest('div[role="listitem"]') || el.parentElement);
    });
    // Download upsell popover
    document.querySelectorAll('[data-test-id="post-download-upsell-popover"]')
      .forEach(collapseEl);
    // Ad blocker modal
    document.querySelectorAll('div[aria-label="Ad blocker modal"]').forEach(el => {
      collapseEl(el);
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
    });
    // Explore-tab notification badge
    const todayTab = document.querySelector('a[data-test-id="today-tab"]');
    if (todayTab) {
      const iconWrap = todayTab.closest('div');
      const sidebarItem = iconWrap?.parentElement?.parentElement;
      const badge = sidebarItem?.parentElement?.querySelector('.MIw[style*="pointer-events: none"]');
      if (badge) collapseEl(badge);
    }
    // Pin card notification badges (the floating status dot on pins)
    document.querySelectorAll('[aria-label="Notifications"][role="status"]').forEach(el => {
      collapseEl(el.parentElement || el);
    });
    // Shopping spotlight carousel section
    document.querySelectorAll('[data-test-id="carousel-bubble-wrapper-shopping_spotlight"]').forEach(el => {
      collapseEl(el.closest('div[role="listitem"]') || el.parentElement?.parentElement?.parentElement || el.parentElement || el);
    });
    // Shop the look sections that Pinterest renders outside normal pin cards
    document.querySelectorAll('div[title="Shop the look"]').forEach(el => {
      if (collapseShopTheLookModule(el)) return;
      const buttonWrapper = el.closest('[role="button"]');
      collapseEl(buttonWrapper?.parentElement || el.closest('div[role="listitem"]') || el.parentElement || el);
    });
    // Board/search product banners
    document.querySelectorAll('h2').forEach(el => {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text.startsWith('more products') && !text.startsWith('shop products')) return;
      const baseGrid = el.closest('[data-test-id="base-board-pin-grid"]');
      collapseEl(
        (baseGrid && getDirectChildOf(baseGrid, el)) ||
        el.closest('div[role="listitem"]') ||
        el.closest('[data-grid-item="true"]') ||
        el.parentElement ||
        el
      );
    });
    // Curated spotlight section (search page immersive header carousel)
    document.querySelectorAll('[data-test-id="search-story-suggestions-container"]:has([data-test-id="search-suggestion-curated-board-bubble"])').forEach(el => {
      collapseEl(el);
    });
    // Shop similar / Shop the look sections on pin closeup
    document.querySelectorAll(
      '[data-test-id="ShopTheLookSimilarProducts"],' +
      '[data-test-id="visual-search-shopping-bar"],' +
      '[data-test-id="related-products"],' +
      '[data-test-id="ShopTheLookAnnotations"]'
    ).forEach(el => {
      if (collapseShopTheLookModule(el)) return;
      collapseEl(el.closest('div[role="listitem"]') || el.parentElement || el);
    });
    // Shop the look carousel grid items (full-width shopping module in feed)
    document.querySelectorAll('[data-test-id="shopping-module"]').forEach(el => {
      if (collapseShopTheLookModule(el)) return;
      collapseEl(el.closest('div[role="listitem"]') || el.closest('[data-grid-item="true"]') || el.parentElement || el);
    });
  }

  let _declutterListObs = null;

  function initDeclutter() {
    if (!get('declutter')) return;

    // Observe the pin grid list(s) for new list items
    function attachListObserver(listEl) {
      if (listEl.__peDeclutterObs) return;
      listEl.__peDeclutterObs = true;
      filterPins(listEl);
      const onMutate = IS_MOBILE ? debounce(() => filterPins(listEl), 200) : () => filterPins(listEl);
      new MutationObserver(records => {
        if (hasOnlyPowerMenuMutations(records)) return;
        const matched = scanDeclutterMutationRecords(records);
        if (matched) return;
        onMutate();
      })
        .observe(listEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['title', 'aria-label', 'data-test-id'],
        });
    }

    // Attach to any already-present lists
    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    removeDeclutterOneoffs();

    // Watch for new lists added by SPA navigation or lazy load
    if (_declutterListObs) return;
    _declutterListObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
      removeDeclutterOneoffs();
    });
    _declutterListObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: REMOVE VIDEOS (collapse to avoid blank spaces)
  // ═══════════════════════════════════════════════════════════════════
  // Detects video pins via their duration label (PinTypeIdentifier)
  // and collapses them using the same technique as Declutter to
  // avoid blank spaces in the grid.

  function isVideoPin(pin) {
    // PinTypeIdentifier badge appears on both GIFs and videos — check its text
    const badge = pin.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (badge) {
      const t = badge.textContent.trim().toLowerCase();
      if (t === 'gif' || t.includes('animated')) return false; // it's a GIF, not a video
      if (t === 'video' || t.includes('watch')) return true;
    }
    // <video> elements: GIFs use i.pinimg.com, real videos use v.pinimg.com
    const vid = pin.querySelector('video');
    if (vid) {
      const src = vid.src
        || (vid.querySelector('source') && vid.querySelector('source').src)
        || '';
      if (/v\.pinimg\.com/i.test(src)) return true;  // Pinterest-hosted video
      if (/i\.pinimg\.com/i.test(src)) return false; // GIF rendered as video
      // Unknown CDN (e.g. YouTube embed inside an iframe) — treat as video
      if (src) return true;
    }
    // Explicit video-only indicators
    if (pin.querySelector('[data-test-id="video-pin-indicator"], [data-test-id="PinVideoIdentifier"]')) return true;
    return false;
  }

  function filterVideoPins(container) {
    if (!get('removeVideos')) return;
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      if (!pin.__peVideoRemoved && isVideoPin(pin)) {
        pin.__peVideoRemoved = true;
        collapseEl(pin);
      }
    });
  }

  let _removeVideosObs = null;

  function initRemoveVideos() {
    if (!get('removeVideos') || _removeVideosObs) return;

    function attachListObserver(listEl) {
      if (listEl.__peVideoObs) return;
      listEl.__peVideoObs = true;
      filterVideoPins(listEl);
      const onMutate = IS_MOBILE ? debounce(() => filterVideoPins(listEl), 200) : () => filterVideoPins(listEl);
      new MutationObserver(records => {
        if (hasOnlyPowerMenuMutations(records)) return;
        onMutate();
      })
        .observe(listEl, { childList: true, subtree: true });
    }

    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);

    _removeVideosObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    });
    _removeVideosObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: HIDE SHOP POSTS (TeePublic, Redbubble, AliExpress, etc.)
  // ═══════════════════════════════════════════════════════════════════
  const SHOP_DOMAINS = [
    'teepublic.com', 'redbubble.com',
    'aliexpress.com', 'aliexpress.us', 'aliexpress.ru',
    'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.com.au', 'amazon.de',
    'etsy.com',
    'ebay.com', 'ebay.co.uk', 'ebay.ca', 'ebay.com.au',
  ];

  function isShopPost(pin) {
    const links = pin.querySelectorAll('a[href]');
    for (const a of links) {
      const href = (a.href || '').toLowerCase();
      if (SHOP_DOMAINS.some(d => href.includes(d))) return true;
    }
    const text = (pin.textContent || '').toLowerCase();
    return ['teepublic', 'redbubble', 'aliexpress', 'amazon', 'etsy', 'ebay'].some(name => text.includes(name));
  }

  const _hiddenShopPosts = new Map();
  const _hideShopPostListObservers = new Map();
  let _hideShopPostsObs = null;

  function hideShopPin(pin) {
    if (pin.__peShopHidden) return;
    pin.__peShopHidden = true;
    _hiddenShopPosts.set(pin, {
      display: pin.style.display,
      visibility: pin.style.visibility,
      height: pin.style.height,
      minHeight: pin.style.minHeight,
      overflow: pin.style.overflow,
    });
    collapseEl(pin);
  }

  function restoreShopPosts() {
    _hiddenShopPosts.forEach((style, pin) => {
      if (!pin || !pin.style) return;
      pin.style.display = style.display;
      pin.style.visibility = style.visibility;
      pin.style.height = style.height;
      pin.style.minHeight = style.minHeight;
      pin.style.overflow = style.overflow;
      delete pin.__peShopHidden;
    });
    _hiddenShopPosts.clear();
  }

  function filterShopPosts(container) {
    if (!get('hideShopPosts') || !get('declutter')) return;
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      if (isShopPost(pin)) hideShopPin(pin);
    });
  }

  function attachShopPostListObserver(listEl) {
    if (_hideShopPostListObservers.has(listEl)) return;
    filterShopPosts(listEl);
    const onMutate = IS_MOBILE ? debounce(() => filterShopPosts(listEl), 200) : () => filterShopPosts(listEl);
    const obs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      onMutate();
    });
    obs.observe(listEl, { childList: true, subtree: true });
    _hideShopPostListObservers.set(listEl, obs);
  }

  function stopHideShopPosts({ restore = true } = {}) {
    if (_hideShopPostsObs) { _hideShopPostsObs.disconnect(); _hideShopPostsObs = null; }
    _hideShopPostListObservers.forEach((obs, listEl) => {
      obs.disconnect();
      if (listEl) delete listEl.__peShopObs;
    });
    _hideShopPostListObservers.clear();
    if (restore) restoreShopPosts();
  }

  function initHideShopPosts() {
    if (!get('hideShopPosts') || !get('declutter')) return;

    document.querySelectorAll('div[role="list"]').forEach(attachShopPostListObserver);

    if (_hideShopPostsObs) return;
    _hideShopPostsObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachShopPostListObserver);
    });
    _hideShopPostsObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: HIDE COMMENTS
  // ═══════════════════════════════════════════════════════════════════
  function hideCommentEditorWrapper() {
    if (!get('hideComments')) return;
    // Walk up from the known comment editor container ID to find
    // its bordered outer wrapper and hide the whole thing
    ['dweb-comment-editor-container', 'mweb-comment-editor-container'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      let p = el.parentElement;
      for (let i = 0; i < 10 && p && p !== document.body; i++) {
        const style = p.getAttribute('style') || '';
        if (style.includes('border-color')) {
          p.style.setProperty('display', 'none', 'important');
          return;
        }
        p = p.parentElement;
      }
      el.style.setProperty('display', 'none', 'important');
    });
    // Hide mobile comment preview ("View all comments" text + snippet above it)
    document.querySelectorAll('div,span,a').forEach(el => {
      if (!el.children.length && /^view all comments$/i.test(el.textContent.trim())) {
        const container = el.parentElement && el.parentElement.parentElement;
        if (container && container !== document.body) {
          container.style.setProperty('display', 'none', 'important');
        } else if (el.parentElement) {
          el.parentElement.style.setProperty('display', 'none', 'important');
        }
      }
    });
  }

  let _hideCommentsObs = null;
  const scheduleHideComments = debounce(hideCommentEditorWrapper, 150);

  function initHideComments() {
    if (!get('hideComments')) return;
    hideCommentEditorWrapper();
    if (_hideCommentsObs) return;
    _hideCommentsObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      scheduleHideComments();
    });
    _hideCommentsObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: AUTO TRANSLATE
  // ═══════════════════════════════════════════════════════════════════
  const CLOSEUP_TITLE_SELECTORS = [
    '[data-test-id="closeup-title"] h1',
    '[data-test-id="closeup-title-card"] h1',
    '[data-test-id="pin-title-wrapper"] h1',
    '[data-test-id="pin-title"]',
  ].join(',');

  const PIN_CARD_TITLE_SELECTORS = [
    '[data-test-id="pinrep-title"]',
    '[data-test-id="pinrep-title"] span',
    '[data-test-id="pinrep-title"] div',
    '[data-test-id="grid-item"] [data-test-id="pin-title"]',
    '[data-grid-item-idx] [data-test-id="pin-title"]',
    '[data-test-id="pin"] [data-test-id="pin-title"]',
    '[data-test-id="pinWrapper"] [data-test-id="pin-title"]',
  ].join(',');

  const TITLE_TRANSLATE_SELECTORS = [
    '[data-test-id="closeup-title"] h1',
    '[data-test-id="closeup-title-card"] h1',
    '[data-test-id="pin-title-wrapper"] h1',
    '[data-test-id="pin-title"]',
    PIN_CARD_TITLE_SELECTORS,
  ].join(',');

  const CLOSEUP_DESCRIPTION_SELECTORS = [
    '[data-test-id="description-content-container"] [data-test-id="text-container"]',
    '[data-test-id="rich-pin-information"] [data-test-id="text-container"]',
    '[data-test-id="pin-closeup-description"]',
    '[data-test-id="closeup-description"]',
    '[data-test-id="pin-description"]',
  ].join(',');

  const PIN_CARD_DESCRIPTION_SELECTORS = [
    '[data-test-id="pinrep-description"]',
    '[data-test-id="pinrep-description"] span',
    '[data-test-id="pinrep-description"] div',
    '[data-test-id="grid-item"] [data-test-id="pin-description"]',
    '[data-grid-item-idx] [data-test-id="pin-description"]',
    '[data-test-id="pin"] [data-test-id="pin-description"]',
    '[data-test-id="pinWrapper"] [data-test-id="pin-description"]',
  ].join(',');

  const DESCRIPTION_TRANSLATE_SELECTORS = [
    '[data-test-id="description-content-container"] [data-test-id="text-container"]',
    '[data-test-id="rich-pin-information"] [data-test-id="text-container"]',
    '[data-test-id="pin-closeup-description"]',
    '[data-test-id="closeup-description"]',
    '[data-test-id="pin-description"]',
    PIN_CARD_DESCRIPTION_SELECTORS,
  ].join(',');

  const COMMENT_TRANSLATE_SELECTORS = [
    '[data-test-id="commentThread-comment"] [data-test-id="text-container"]',
  ].join(',');

  const AUTO_TRANSLATE_SELECTORS = [
    TITLE_TRANSLATE_SELECTORS,
    DESCRIPTION_TRANSLATE_SELECTORS,
    COMMENT_TRANSLATE_SELECTORS,
  ].join(',');

  const _translateCache = new Map();
  const _translateQueue = [];
  const TRANSLATE_MAX_CONCURRENT = IS_MOBILE ? 2 : 4;
  const TRANSLATE_CONSERVATIVE_COMMENT_LIMIT = IS_MOBILE ? 1 : 2;
  let _translateActive = 0;
  let _autoTranslateIO = null;
  let _autoTranslateMO = null;
  let _autoTranslateRescan = null;
  let _manualTranslateMO = null;
  let _manualTranslateRescan = null;

  function getAutoTranslateTargetLang() {
    const raw = String(get('autoTranslateTarget') || 'browser').toLowerCase();
    if (raw === 'browser') return USER_LANG || 'en';
    return /^[a-z]{2,3}(?:-[a-z0-9]+)?$/i.test(raw) ? raw.split('-')[0] : 'en';
  }

  function isSameLanguage(detectedLanguage, targetLanguage) {
    const detected = String(detectedLanguage || '').split('-')[0].toLowerCase();
    const target = String(targetLanguage || '').split('-')[0].toLowerCase();
    return !!detected && !!target && detected === target;
  }

  function hasAnyAutoTranslateEnabled() {
    return !!(get('autoTranslateTitles') || get('autoTranslateDescriptions') || get('autoTranslateComments'));
  }

  function getTranslateElementType(el) {
    if (!el?.matches) return null;
    if (el.matches(TITLE_TRANSLATE_SELECTORS)) return 'title';
    if (el.matches(COMMENT_TRANSLATE_SELECTORS)) return 'comment';
    if (el.matches(DESCRIPTION_TRANSLATE_SELECTORS)) return 'description';
    if (el.closest?.('[data-test-id="commentThread-comment"]') && el.matches('[data-test-id="text-container"]')) return 'comment';
    if (el.closest?.('[data-test-id="closeup-title-card"], [data-test-id="pin-title-wrapper"], [data-test-id="pinrep-title"]')) return 'title';
    if (el.closest?.('[data-test-id="description-content-container"], [data-test-id="rich-pin-information"], [data-test-id="pinrep-description"]')) return 'description';
    return null;
  }

  function isAutoTranslateEnabledForType(type) {
    if (type === 'title') return get('autoTranslateTitles');
    if (type === 'description') return get('autoTranslateDescriptions');
    if (type === 'comment') return get('autoTranslateComments');
    return false;
  }

  function shouldShowManualTranslateForType(type) {
    return !!get('showManualTranslateButtons') && !!type;
  }

  function isElementActuallyVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function findCommentToggleForList(list) {
    if (!list?.id) return document.querySelector('[data-test-id="canonical-card-tap-area"][aria-expanded]');
    for (const el of document.querySelectorAll('[aria-controls]')) {
      if (el.getAttribute('aria-controls') === list.id) return el;
    }
    return document.querySelector('[data-test-id="canonical-card-tap-area"][aria-expanded]');
  }

  function isCommentElementTranslatable(el) {
    const comment = el.closest('[data-test-id="commentThread-comment"]');
    if (!comment) return true;
    if (get('hideComments')) return false;
    const list = el.closest('[data-test-id="aggregated-comment-list"]');
    if (!list || !isElementActuallyVisible(list)) return false;
    const toggle = findCommentToggleForList(list);
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') return false;
    return isElementActuallyVisible(comment);
  }

  function normalizeTranslateText(el) {
    if (!el || isTranslateCandidateExcluded(el) || el.closest('[contenteditable="true"], textarea, input, [data-test-id="comment-editor-container"], #dweb-comment-editor-container, #mweb-comment-editor-container')) {
      return null;
    }
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 800) return null;
    if (/^https?:\/\//i.test(text)) return null;
    if (/^[\d\s.,:;!?()[\]{}'"`~_\-+%#/@$&|]+$/.test(text)) return null;
    if (/^(save|reply|share|more|comments?|view larger|search image)$/i.test(text)) return null;
    return text;
  }

  function isTranslateCandidateExcluded(el) {
    if (!el || !el.isConnected) return true;
    if (el.closest(
      '#pe-settings-wrap, #pe-bd-fab, #pe-ctx-menu, ' +
      '.pe-manual-translate-btn, .pe-manual-translate-mount, ' +
      '[contenteditable="true"], textarea, input, select, option, ' +
      '[data-test-id="closeup-action-items"], [data-test-id="pin-action-bar"], ' +
      '[data-test-id="creator-card-profile"], [data-test-id="creator-avatar"], ' +
      '[data-test-id="creator-profile-link"], [data-test-id="creator-profile-name"], ' +
      '[data-test-id="comment-editor-container"], #dweb-comment-editor-container, #mweb-comment-editor-container'
    )) return true;
    if (el.matches('button, [role="button"], [role="menuitem"], svg, path')) return true;
    const knownText = el.matches(TITLE_TRANSLATE_SELECTORS + ',' + DESCRIPTION_TRANSLATE_SELECTORS + ',' + COMMENT_TRANSLATE_SELECTORS) ||
      el.closest('[data-test-id="pinrep-title"], [data-test-id="pinrep-description"], [data-test-id="pin-title-wrapper"], [data-test-id="description-content-container"], [data-test-id="rich-pin-information"]');
    const control = el.closest('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]');
    if (control && !knownText && !el.closest('[data-test-id="commentThread-comment"]')) return true;
    return false;
  }

  function rememberTranslation(key, value) {
    if (_translateCache.has(key)) _translateCache.delete(key);
    _translateCache.set(key, value);
    while (_translateCache.size > 500) {
      const oldest = _translateCache.keys().next().value;
      _translateCache.delete(oldest);
    }
  }

  function normalizeTranslationResponse(text, target, responseText) {
    let translatedText = text;
    let detectedLanguage = '';
    try {
      const data = JSON.parse(responseText);
      const parts = Array.isArray(data?.[0]) ? data[0] : [];
      translatedText = parts.map(part => Array.isArray(part) ? part[0] : '').join('').trim() || text;
      detectedLanguage = String(data?.[2] || data?.[8]?.[0]?.[0] || '').toLowerCase();
    } catch (_) {}

    const result = {
      translatedText,
      detectedLanguage,
      targetLanguage: target,
      status: 'translated',
    };
    if (isSameLanguage(result.detectedLanguage, target)) {
      return { ...result, translatedText: text, status: 'same-language' };
    }
    if (!translatedText || translatedText === text) return { ...result, translatedText: text, status: 'unchanged' };
    return result;
  }

  function requestTranslation(text) {
    const target = getAutoTranslateTargetLang();
    const key = `${target}\n${text}`;
    if (_translateCache.has(key)) return Promise.resolve(_translateCache.get(key));

    return new Promise(resolve => {
      const url = 'https://translate.googleapis.com/translate_a/single' +
        '?client=gtx&sl=auto&tl=' + encodeURIComponent(target) +
        '&dt=t&q=' + encodeURIComponent(text);
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: r => {
          const result = normalizeTranslationResponse(text, target, r.responseText);
          rememberTranslation(key, result);
          resolve(result);
        },
        onerror: () => {
          resolve({ translatedText: text, detectedLanguage: '', targetLanguage: target, status: 'error' });
        },
        ontimeout: () => {
          resolve({ translatedText: text, detectedLanguage: '', targetLanguage: target, status: 'error' });
        },
      });
    });
  }

  function applyTitleTranslation(el, original, translated) {
    const displayMode = get('titleTranslationDisplay');
    if (displayMode === 'both') {
      el.textContent = translated;
      const originalLine = document.createElement('span');
      originalLine.className = 'pe-title-original-line';
      originalLine.textContent = original;
      el.appendChild(originalLine);
      return;
    }
    el.classList.add('pe-title-mode-translated-only');
    el.textContent = translated;
  }

  function applyTranslatedText(el, original, result, options = {}) {
    if (!result) return 'retry';
    const type = options.type || getTranslateElementType(el);
    const source = options.source || 'auto';
    const target = result?.targetLanguage || getAutoTranslateTargetLang();
    if (isSameLanguage(result?.detectedLanguage, target)) {
      result.status = 'same-language';
      return 'done';
    }
    const translated = result?.translatedText || '';
    if (!translated || translated === original || result.status === 'unchanged') return 'done';
    if (result.status === 'error') return 'retry';
    if (result.status !== 'translated') return 'retry';
    if (source !== 'manual' && !isAutoTranslateEnabledForType(type)) return 'done';
    if (!el.isConnected) return 'retry';
    if (!isElementActuallyVisible(el) || !isCommentElementTranslatable(el)) return 'retry';
    const current = normalizeTranslateText(el);
    if (current !== original) return 'retry';
    el.setAttribute('data-pe-auto-translate-original', original);
    el.setAttribute('data-pe-auto-translate-title', el.getAttribute('title') || '');
    el.setAttribute('data-pe-auto-translate-kind', type || '');
    if (type === 'title') applyTitleTranslation(el, original, translated);
    else el.textContent = translated;
    el.title = 'Original: ' + original;
    el.classList.add('pe-translated-text');
    removeManualTranslateButtonFor(el);
    return 'done';
  }

  function getTranslateConcurrencyLimit(item) {
    if (item?.type === 'comment' && get('autoTranslateCommentMode') === 'conservative') {
      return Math.min(TRANSLATE_MAX_CONCURRENT, TRANSLATE_CONSERVATIVE_COMMENT_LIMIT);
    }
    return TRANSLATE_MAX_CONCURRENT;
  }

  function finishQueuedTranslation(item, state) {
    if (item?.el?.isConnected) item.el.__peTranslateState = state === 'done' ? 'done' : null;
    _translateActive--;
    pumpTranslateQueue();
  }

  function pumpTranslateQueue() {
    while (_translateQueue.length) {
      const item = _translateQueue[0];
      if (_translateActive >= getTranslateConcurrencyLimit(item)) return;
      _translateQueue.shift();
      if (!item?.el?.isConnected) continue;
      if (item.source !== 'manual' && !isAutoTranslateEnabledForType(item.type)) {
        item.el.__peTranslateState = null;
        continue;
      }
      _translateActive++;
      requestTranslation(item.text)
        .then(result => applyTranslatedText(item.el, item.text, result, item))
        .then(state => finishQueuedTranslation(item, state))
        .catch(() => finishQueuedTranslation(item, 'retry'));
    }
  }

  function queueTranslateElement(el, source = 'auto') {
    const type = getTranslateElementType(el);
    if (!type) return;
    if (source !== 'manual' && !isAutoTranslateEnabledForType(type)) return;
    if (!el || el.__peTranslateState === 'queued' || el.__peTranslateState === 'done') return;
    if (el.hasAttribute('data-pe-auto-translate-original')) return;
    if (!isElementActuallyVisible(el) || !isCommentElementTranslatable(el)) return;
    const text = normalizeTranslateText(el);
    if (!text) return;
    el.__peTranslateState = 'queued';
    _translateQueue.push({ el, text, type, source });
    pumpTranslateQueue();
  }

  async function translateElementNow(el, source = 'manual') {
    const type = getTranslateElementType(el);
    if (!type || !el || el.hasAttribute('data-pe-auto-translate-original')) return null;
    if (!isElementActuallyVisible(el) || !isCommentElementTranslatable(el)) return null;
    const text = normalizeTranslateText(el);
    if (!text) return null;
    el.__peTranslateState = 'queued';
    const result = await requestTranslation(text);
    const state = applyTranslatedText(el, text, result, { type, source });
    el.__peTranslateState = state === 'done' ? 'done' : null;
    return result;
  }

  function addTranslateCandidate(nodes, el) {
    if (!el || nodes.has(el)) return;
    if (!getTranslateElementType(el)) return;
    if (!normalizeTranslateText(el)) return;
    nodes.add(el);
  }

  function collectExplicitTranslateCandidates(root) {
    const nodes = new Set();
    if (!root) return [];
    if (root.matches?.(AUTO_TRANSLATE_SELECTORS)) addTranslateCandidate(nodes, root);
    if (root.querySelectorAll) {
      root.querySelectorAll(AUTO_TRANSLATE_SELECTORS).forEach(el => addTranslateCandidate(nodes, el));
    }
    return [...nodes];
  }

  function collectHeuristicTranslateCandidates(root) {
    const nodes = new Set();
    if (!root?.querySelectorAll) return [];
    const closeupContainers = [
      '[data-test-id="closeup-title-card"]',
      '[data-test-id="description-content-container"]',
      '[data-test-id="rich-pin-information"]',
    ].join(',');
    const cardContainers = [
      '[data-test-id="pinrep-title"]',
      '[data-test-id="pinrep-description"]',
      '[data-test-id="grid-item"]',
      '[data-grid-item-idx]',
      '[data-test-id="pin"]',
      '[data-test-id="pinWrapper"]',
    ].join(',');
    const containers = new Set();
    if (root.matches?.(closeupContainers + ',' + cardContainers)) containers.add(root);
    root.querySelectorAll(closeupContainers + ',' + cardContainers).forEach(el => containers.add(el));
    containers.forEach(container => {
      container.querySelectorAll?.(
        'h1, h2, h3, [data-test-id="text-container"], [data-test-id*="title" i], [data-test-id*="description" i], [itemprop="name"], [itemprop="description"]'
      ).forEach(el => addTranslateCandidate(nodes, el));
    });
    return [...nodes];
  }

  function collectTranslateCandidates(root) {
    const nodes = new Set();
    collectExplicitTranslateCandidates(root).forEach(el => nodes.add(el));
    collectHeuristicTranslateCandidates(root).forEach(el => nodes.add(el));
    return [...nodes];
  }

  function scanAutoTranslateCandidates(root) {
    if (!hasAnyAutoTranslateEnabled() || !root) return;
    const nodes = collectTranslateCandidates(root);

    nodes.forEach(el => {
      if (el.__peTranslateObserved || el.hasAttribute('data-pe-auto-translate-original')) return;
      const type = getTranslateElementType(el);
      if (!isAutoTranslateEnabledForType(type)) return;
      el.__peTranslateObserved = true;
      if (_autoTranslateIO) _autoTranslateIO.observe(el);
      else queueTranslateElement(el);
    });
  }

  function restoreAutoTranslations() {
    document.querySelectorAll('[data-pe-auto-translate-original]').forEach(el => {
      el.textContent = el.getAttribute('data-pe-auto-translate-original') || el.textContent;
      const priorTitle = el.getAttribute('data-pe-auto-translate-title') || '';
      if (priorTitle) el.setAttribute('title', priorTitle);
      else el.removeAttribute('title');
      el.removeAttribute('data-pe-auto-translate-original');
      el.removeAttribute('data-pe-auto-translate-title');
      el.removeAttribute('data-pe-auto-translate-kind');
      el.classList.remove('pe-translated-text');
      el.classList.remove('pe-title-mode-translated-only');
      el.__peTranslateState = null;
      el.__peTranslateObserved = null;
    });
  }

  function clearTranslateCandidateState() {
    document.querySelectorAll(AUTO_TRANSLATE_SELECTORS).forEach(el => {
      el.__peTranslateState = null;
      el.__peTranslateObserved = null;
    });
  }

  function stopAutoTranslate() {
    if (_autoTranslateIO) { _autoTranslateIO.disconnect(); _autoTranslateIO = null; }
    if (_autoTranslateMO) { _autoTranslateMO.disconnect(); _autoTranslateMO = null; }
    _translateQueue.length = 0;
    clearTranslateCandidateState();
    restoreAutoTranslations();
  }

  function initAutoTranslate() {
    if (!hasAnyAutoTranslateEnabled()) return;
    if (!_autoTranslateIO && 'IntersectionObserver' in window) {
      _autoTranslateIO = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) queueTranslateElement(entry.target);
        });
      }, { rootMargin: '220px 0px', threshold: 0.01 });
    }
    scanAutoTranslateCandidates(document);
    if (_autoTranslateMO) return;
    _autoTranslateRescan = debounce(() => scanAutoTranslateCandidates(document), IS_MOBILE ? 700 : 300);
    _autoTranslateMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      _autoTranslateRescan();
    });
    _autoTranslateMO.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded'],
    });
  }

  function removeManualTranslateButtonFor(el) {
    if (el?.__peManualTranslateButton) {
      const mount = el.__peManualTranslateButton.__peManualTranslateMount;
      if (mount) mount.remove();
      else el.__peManualTranslateButton.remove();
      el.__peManualTranslateButton = null;
    }
  }

  function createManualTranslateButton(el, type) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pe-manual-translate-btn pe-manual-translate-${type}`;
    btn.setAttribute('data-pe-ui', 'true');
    btn.setAttribute('aria-label', 'Translate');
    btn.title = 'Translate';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M12.87 15.07 10.33 12l.03-.03A17.5 17.5 0 0 0 14.07 5H17V3h-7V1H8v2H1v2h11.17a15.8 15.8 0 0 1-2.82 5.35A15.2 15.2 0 0 1 7.3 7H5.3a17.5 17.5 0 0 0 2.7 5l-5.08 5.02L4.34 18.43 9.33 13.5l3.11 3.73zM17.5 10h-2L11 22h2l1.12-3h4.74L20 22h2zm-2.62 7 1.62-4.33L18.12 17z"/>
      </svg>`;
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('pe-busy');
      try {
        const result = await translateElementNow(el, 'manual');
        if (result?.status === 'translated') removeManualTranslateButtonFor(el);
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.classList.remove('pe-busy');
        }
      }
    });
    return btn;
  }

  function createManualTranslateMount(btn, type) {
    const mount = document.createElement('span');
    mount.className = `pe-manual-translate-mount pe-manual-translate-mount-${type}`;
    mount.setAttribute('data-pe-ui', 'true');
    mount.appendChild(btn);
    btn.__peManualTranslateMount = mount;
    return mount;
  }

  function placeManualTranslateButton(el, btn) {
    const mount = createManualTranslateMount(btn, getTranslateElementType(el));
    const title = getTranslateElementType(el) === 'title';
    if (title && el.parentElement) {
      el.insertAdjacentElement('afterend', mount);
      return;
    }
    el.insertAdjacentElement('afterend', mount);
  }

  function scanManualTranslateCandidates(root) {
    if (!get('showManualTranslateButtons') || !root) return;
    collectTranslateCandidates(root).forEach(el => {
      const type = getTranslateElementType(el);
      if (!shouldShowManualTranslateForType(type) ||
          el.hasAttribute('data-pe-auto-translate-original') ||
          !isElementActuallyVisible(el) ||
          !isCommentElementTranslatable(el)) {
        removeManualTranslateButtonFor(el);
        return;
      }
      if (el.__peManualTranslateButton?.isConnected) return;
      const btn = createManualTranslateButton(el, type);
      el.__peManualTranslateButton = btn;
      placeManualTranslateButton(el, btn);
    });
  }

  function stopManualTranslateButtons() {
    if (_manualTranslateMO) { _manualTranslateMO.disconnect(); _manualTranslateMO = null; }
    document.querySelectorAll('.pe-manual-translate-mount').forEach(mount => mount.remove());
    document.querySelectorAll('.pe-manual-translate-btn').forEach(btn => btn.remove());
    document.querySelectorAll(AUTO_TRANSLATE_SELECTORS).forEach(el => { el.__peManualTranslateButton = null; });
  }

  function initManualTranslateButtons() {
    if (!get('showManualTranslateButtons')) {
      stopManualTranslateButtons();
      return;
    }
    scanManualTranslateCandidates(document);
    if (_manualTranslateMO) return;
    _manualTranslateRescan = debounce(() => scanManualTranslateCandidates(document), IS_MOBILE ? 700 : 300);
    _manualTranslateMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      _manualTranslateRescan();
    });
    _manualTranslateMO.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded'],
    });
  }

  function refreshTranslationFeatures() {
    stopAutoTranslate();
    clearTranslateCandidateState();
    if (hasAnyAutoTranslateEnabled()) initAutoTranslate();
    stopManualTranslateButtons();
    if (get('showManualTranslateButtons')) initManualTranslateButtons();
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: SCROLL PRESERVATION
  //  Saves home-feed scroll position when navigating away and restores
  //  it on browser back (popstate).  Does NOT restore on explicit
  //  home-link clicks so fresh home navigation always goes to top.
  // ═══════════════════════════════════════════════════════════════════
  function initScrollPreservation() {
    let _homeScrollY = 0;
    let _homeClickIntent = false;

    // Continuously save scroll Y while on the home feed
    window.addEventListener('scroll', () => {
      if (location.pathname === '/') _homeScrollY = window.scrollY;
    }, { passive: true });

    // When the user explicitly clicks a home nav link, clear saved scroll
    // so that intentional "go home" always scrolls to top
    document.addEventListener('click', e => {
      if (isPowerMenuEvent(e)) return;
      const homeLink = e.target.closest(
        'a[href="/"], [data-test-id="home-tab"], [aria-label="Home"]'
      );
      if (homeLink) {
        _homeClickIntent = true;
        _homeScrollY = 0;
      }
    }, true);

    // On browser back/forward (popstate), restore scroll if returning to home
    window.addEventListener('popstate', () => {
      if (location.pathname === '/' && _homeScrollY > 0 && !_homeClickIntent) {
        // Delay so React finishes rendering the feed before we scroll
        setTimeout(() => window.scrollTo(0, _homeScrollY), 400);
      }
      _homeClickIntent = false;
    });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: DOWNLOAD FIXER  (original Angel2mp3 logic, intact)
  // ═══════════════════════════════════════════════════════════════════
  function detectFileType(arr) {
    if (arr.length < 12) return '.jpg';
    if (arr[0]===0x89 && arr[1]===0x50 && arr[2]===0x4E && arr[3]===0x47) return '.png';
    if (arr[0]===0xFF && arr[1]===0xD8 && arr[2]===0xFF) return '.jpg';
    if (arr[0]===0x47 && arr[1]===0x49 && arr[2]===0x46 && arr[3]===0x38) return '.gif';
    if (arr[0]===0x52 && arr[1]===0x49 && arr[2]===0x46 && arr[3]===0x46 &&
        arr[8]===0x57 && arr[9]===0x45 && arr[10]===0x42 && arr[11]===0x50) return '.webp';
    if (arr[4]===0x66 && arr[5]===0x74 && arr[6]===0x79 && arr[7]===0x70) return '.mp4';
    return '.jpg';
  }

  function sanitizeFilename(n) {
    if (!n) return null;
    let s = String(n).replace(/[<>:"/\\|?*\x00-\x1f\x80-\x9f]/g, '').trim();
    if (s.length > 200) s = s.slice(0, 200);
    return s.length ? s : null;
  }

  // Remove any trailing known image/video extension from a base name so that
  // the binary-detected extension is always the final (and only) one.
  // e.g. "photo.jpg" → "photo"  |  "photo.jpg.png" → "photo.jpg"  |  "jpg" → "jpg"
  // If stripping would leave an empty string we keep the original to avoid
  // producing a bare extension file (e.g. ".jpg").
  function stripKnownExt(name) {
    if (!name) return name;
    const stripped = name.replace(/\.(jpe?g|png|gif|webp|mp4|bmp|tiff?)$/i, '').trim();
    return stripped.length ? stripped : name;
  }

  function randDigits(len) {
    let r = '';
    for (let i = 0; i < len; i++) r += String(Math.floor(Math.random() * 10));
    return r;
  }

  function makeFallbackPinName() {
    return `Pin - ${randDigits(8)}`;
  }

  const CLOSEUP_PIN_TITLE_SELECTORS = [
    '[data-test-id="closeup-title-card"] h1',
    '[data-test-id="rich-pin-information"] [data-test-id="pin-title-wrapper"] h1',
    '[data-test-id="pin-title-wrapper"] h1',
    '[data-test-id="closeup-title"] h1',
    '[data-test-id="closeup-title"]',
    '[data-test-id="pin-title"] h1',
    '[data-test-id="pin-title"]',
    'h1[itemprop="name"]',
  ];

  const PIN_TITLE_SELECTORS = [
    ...CLOSEUP_PIN_TITLE_SELECTORS,
    '[data-test-id="pinrep-footer-organic-title"] a',
    '[data-test-id="pinrep-footer-organic-title"] h2',
  ];

  function getPinTitleTextFromElement(el) {
    if (!el) return null;
    return sanitizeFilename(
      el.getAttribute?.('data-pe-auto-translate-original') ||
      el.getAttribute?.('title')?.replace(/^Original:\s*/i, '') ||
      el.textContent?.trim()
    );
  }

  function extractPinTitleFromScope(scope, selectors = PIN_TITLE_SELECTORS) {
    if (!scope || !scope.querySelector) return null;
    for (const s of selectors) {
      const el = scope.querySelector(s);
      const t = getPinTitleTextFromElement(el);
      if (t) return t;
    }
    return null;
  }

  function extractPinTitle() {
    return extractPinTitleFromScope(document);
  }

  // Upgrade any pinimg thumbnail URL to /originals/ for max quality
  function upgradeToOriginal(url) {
    if (!url) return url;
    const m = url.match(OQ_RE);
    return m ? m[1] + '/originals' + m[2] : url;
  }

  function getBestCloseupImageUrl(img) {
    if (!img) return null;
    const gifUrl = getGifSrcFromImg(img);
    if (gifUrl) return gifUrl;

    const gifBadge = document.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (gifBadge && /gif|animated/i.test(gifBadge.textContent)) {
      const derived = deriveGifUrl(img.currentSrc || img.src);
      if (derived) return derived;
    }

    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const best = srcset.split(',')
        .map(p => p.trim().split(/\s+/))
        .filter(p => p[0])
        .sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
      if (best) return upgradeToOriginal(best[0]);
    }
    return upgradeToOriginal(img.currentSrc || img.src);
  }

  function addPinimgUrl(urls, value) {
    if (!value) return;
    String(value).split(/\s*,\s*/).forEach(piece => {
      const url = piece.trim().split(/\s+/)[0].replace(/&amp;/g, '&');
      if (/^https?:\/\/[iv]\d*\.pinimg\.com\//i.test(url) || /^https?:\/\/i\.pinimg\.com\//i.test(url)) {
        urls.add(upgradeToOriginal(url));
      }
    });
  }

  function addPinimgUrlsFromText(urls, text) {
    if (!text) return;
    const re = /https?:\/\/(?:i|v\d*)\.pinimg\.com\/[^"'()<>\s\\]+/gi;
    let match;
    while ((match = re.exec(String(text)))) addPinimgUrl(urls, match[0]);
  }

  function pinimgDedupeKey(url) {
    const clean = String(url || '').split(/[?#]/)[0];
    const imageMatch = clean.match(/pinimg\.com\/(?:originals|\d+x)\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[^/]+)$/i);
    if (imageMatch) return imageMatch[1].toLowerCase();
    const videoMatch = clean.match(/v\d*\.pinimg\.com\/videos\/[^/]+\/(?:expMp4|720p|hls)\/(.+)$/i);
    return videoMatch ? videoMatch[1].toLowerCase() : clean.toLowerCase();
  }

  function pinimgQualityScore(url) {
    const clean = String(url || '');
    if (/\/originals\//i.test(clean)) return 4000;
    const sized = clean.match(/\/(\d+)x\//i);
    return sized ? Number(sized[1]) || 0 : 0;
  }

  function dedupePinimgUrls(values) {
    const order = [];
    const bestByKey = new Map();
    (values || []).forEach(value => {
      if (!value) return;
      const url = upgradeToOriginal(String(value).replace(/&amp;/g, '&'));
      const key = pinimgDedupeKey(url);
      if (!key) return;
      if (!bestByKey.has(key)) order.push(key);
      const current = bestByKey.get(key);
      if (!current || pinimgQualityScore(url) >= pinimgQualityScore(current)) bestByKey.set(key, url);
    });
    return order.map(key => bestByKey.get(key)).filter(Boolean);
  }

  function getElementArea(el) {
    if (!el?.getBoundingClientRect) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function scoreFocusedCloseupRoot(root) {
    if (!root?.querySelector) return -1;
    if (!root.querySelector('[data-test-id="closeup-image"], [data-test-id="closeup-visual-container"], [data-test-id="visual-content-container"]')) return -1;
    let score = 0;
    if (root.matches?.('[data-grid-item-idx], [data-test-id="closeup-body"], [data-test-id="closeup-body-style"]')) score += 6;
    if (root.querySelector('[data-test-id="closeup-action-bar"], [data-test-id="closeup-action-items"]')) score += 6;
    if (root.querySelector('[data-test-id="closeup-visual-container"]')) score += 4;
    if (root.querySelector('[data-test-id="closeup-image"] img, [data-test-id="closeup-image"] video')) score += 4;
    if (isElementActuallyVisible(root.querySelector('[data-test-id="closeup-visual-container"], [data-test-id="closeup-image"]') || root)) score += 8;
    score += Math.min(8, getElementArea(root) / 100000);
    return score;
  }

  function getFocusedCloseupRoot(anchor) {
    if (anchor?.closest) {
      let anchoredRoot = anchor.closest('[data-grid-item-idx], [data-test-id="closeup-body"], [data-test-id="closeup-body-style"]');
      while (anchoredRoot) {
        if (scoreFocusedCloseupRoot(anchoredRoot) >= 0) return anchoredRoot;
        anchoredRoot = anchoredRoot.parentElement?.closest?.('[data-grid-item-idx], [data-test-id="closeup-body"], [data-test-id="closeup-body-style"]');
      }
    }

    const candidates = new Set();
    document.querySelectorAll('[data-test-id="closeup-image"], [data-test-id="closeup-visual-container"]').forEach(el => {
      candidates.add(el);
      const closeupRoot = el.closest('[data-grid-item-idx], [data-test-id="closeup-body"], [data-test-id="closeup-body-style"]');
      if (closeupRoot) candidates.add(closeupRoot);
      const actionRoot = el.closest('[data-test-id="closeup-body-style"], [data-test-id="closeup-body"]');
      if (actionRoot) candidates.add(actionRoot);
    });
    document.querySelectorAll('[data-grid-item-idx], [data-test-id="closeup-body"], [data-test-id="closeup-body-style"]').forEach(el => {
      if (el.querySelector('[data-test-id="closeup-image"], [data-test-id="closeup-visual-container"]')) candidates.add(el);
    });
    return [...candidates]
      .map(el => ({ el, score: scoreFocusedCloseupRoot(el) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function extractFocusedPinTitle(anchor) {
    const focusedRoot = getFocusedCloseupRoot(anchor);
    const focusedTitle = extractPinTitleFromScope(focusedRoot);
    if (focusedTitle) return focusedTitle;
    const documentTitle = extractPinTitleFromScope(document, CLOSEUP_PIN_TITLE_SELECTORS);
    if (documentTitle) return documentTitle;
    const pinId = location.pathname.match(/\/pin\/(\d+)/i)?.[1];
    return pinId ? `Pin - ${pinId}` : makeFallbackPinName();
  }

  function getCloseupScopePart(root, selector) {
    if (!root) return null;
    if (root.matches?.(selector)) return root;
    return root.querySelector?.(selector) || null;
  }

  function getCloseupVisualScope(anchor) {
    const focusedRoot = getFocusedCloseupRoot(anchor);
    if (focusedRoot) {
      return getCloseupScopePart(focusedRoot,
        '[data-test-id="closeup-visual-container"], ' +
        '[data-test-id="visual-content-container"], ' +
        '[data-test-id="pin-closeup-image"], ' +
        '[data-test-id="closeup-image"]'
      ) || focusedRoot;
    }
    return document.querySelector(
      '[data-test-id="closeup-visual-container"], ' +
      '[data-test-id="visual-content-container"], ' +
      '[data-test-id="pin-closeup-image"], ' +
      '[data-test-id="closeup-image"]'
    ) || document;
  }

  function getCurrentCarouselSlide(scope) {
    const root = scope?.querySelectorAll ? scope : document;
    const scroller = root.querySelector(
      '[data-test-id="closeup-image"] ul[class*="carousel"], ' +
      '[data-test-id="closeup-image"] ul, ' +
      'ul[class*="carousel"]'
    );
    if (!scroller) return null;
    const slides = [...scroller.children].filter(slide =>
      slide.querySelector?.('img[src*="pinimg.com"], img[srcset*="pinimg.com"], video, [style*="pinimg.com"]')
    );
    if (!slides.length) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    const hasLayout = scrollerRect.width > 0 && scrollerRect.height > 0;
    if (hasLayout) {
      const centerX = scrollerRect.left + scrollerRect.width / 2;
      const visible = slides.map(slide => {
        const rect = slide.getBoundingClientRect();
        const overlapWidth = Math.max(0, Math.min(rect.right, scrollerRect.right) - Math.max(rect.left, scrollerRect.left));
        const overlapHeight = Math.max(0, Math.min(rect.bottom, scrollerRect.bottom) - Math.max(rect.top, scrollerRect.top));
        const visibleArea = overlapWidth * overlapHeight;
        const centerDistance = Math.abs((rect.left + rect.width / 2) - centerX);
        return { slide, visibleArea, centerDistance };
      }).sort((a, b) => (b.visibleArea - a.visibleArea) || (a.centerDistance - b.centerDistance));
      if (visible[0]?.visibleArea > 0) return visible[0].slide;
    }

    const transitionSlide = slides.find(slide => slide.querySelector('[style*="view-transition-name: image"]'));
    if (transitionSlide) return transitionSlide;

    const scrollLeft = scroller.scrollLeft || 0;
    return slides
      .map(slide => ({ slide, distance: Math.abs((slide.offsetLeft || 0) - scrollLeft) }))
      .sort((a, b) => a.distance - b.distance)[0]?.slide || slides[0];
  }

  function getLargestVisibleCloseupImage(scope) {
    const root = scope?.querySelectorAll ? scope : document;
    return [...root.querySelectorAll('[data-test-id="closeup-image"] img, [data-test-id="closeup-visual-container"] img, [data-test-id="visual-content-container"] img')]
      .map(img => ({ img, area: isElementActuallyVisible(img) ? getElementArea(img) : 0 }))
      .filter(item => item.area > 0)
      .sort((a, b) => b.area - a.area)[0]?.img || null;
  }

  function findCurrentCloseupImageUrl(anchor) {
    const urls = new Set();
    const scope = getCloseupVisualScope(anchor);
    const currentSlide = getCurrentCarouselSlide(scope);
    if (currentSlide) {
      collectImageUrlsFromScope(currentSlide, urls);
      const currentSlideUrl = dedupePinimgUrls([...urls])[0];
      if (currentSlideUrl) return currentSlideUrl;
    }

    const currentImage = getLargestVisibleCloseupImage(scope);
    if (currentImage) {
      addPinimgUrl(urls, getBestCloseupImageUrl(currentImage));
      addPinimgUrl(urls, currentImage.currentSrc);
      addPinimgUrl(urls, currentImage.src);
      addPinimgUrl(urls, currentImage.getAttribute('srcset'));
      const currentImageUrl = dedupePinimgUrls([...urls])[0];
      if (currentImageUrl) return currentImageUrl;
    }

    collectImageUrlsFromScope(scope, urls);
    return dedupePinimgUrls([...urls])[0] || null;
  }

  function collectFocusedCarouselSlideUrls(scope, urls) {
    const root = scope?.querySelectorAll ? scope : document;
    root.querySelectorAll('[data-test-id="closeup-image"] ul li, ul[class*="carousel"] li').forEach(slide => {
      collectImageUrlsFromScope(slide, urls);
    });
    return urls;
  }

  function collectImageUrlsFromScope(scope, urls = new Set()) {
    if (!scope) return urls;
    const root = scope.querySelectorAll ? scope : document;
    root.querySelectorAll(
      '[data-test-id="pin-closeup-image"] video, ' +
      '[data-test-id="closeup-image"] video, ' +
      '[elementtiming*="MainPinImage"] ~ video, video'
    ).forEach(video => {
      addPinimgUrl(urls, video.poster);
      addPinimgUrl(urls, video.currentSrc);
      addPinimgUrl(urls, video.src);
    });

    const imgs = new Set();
    if (scope.matches?.('img')) imgs.add(scope);
    [
      '[data-test-id="closeup-image"] img',
      '[data-test-id="closeup-visual-container"] img',
      '[data-test-id="visual-content-container"] img',
      '[data-test-id="pin-closeup-image"] img',
      'img[elementtiming*="MainPinImage"]',
      'img[fetchpriority="high"]',
      'img[src*="pinimg.com"]',
      'img[srcset*="pinimg.com"]',
    ].forEach(selector => {
      root.querySelectorAll(selector).forEach(img => imgs.add(img));
    });

    imgs.forEach(img => {
      addPinimgUrl(urls, getBestCloseupImageUrl(img));
      addPinimgUrl(urls, img.currentSrc);
      addPinimgUrl(urls, img.src);
      addPinimgUrl(urls, img.getAttribute('src'));
      addPinimgUrl(urls, img.getAttribute('srcset'));
      addPinimgUrl(urls, img.getAttribute('data-src'));
      addPinimgUrl(urls, img.getAttribute('data-srcset'));
      [...img.attributes].forEach(attr => {
        if (/src|url|image/i.test(attr.name)) addPinimgUrlsFromText(urls, attr.value);
      });
    });

    root.querySelectorAll?.('[style*="pinimg.com"], source[srcset*="pinimg.com"], source[src*="pinimg.com"], [data-src*="pinimg.com"], [data-srcset*="pinimg.com"]').forEach(el => {
      addPinimgUrl(urls, el.getAttribute('src'));
      addPinimgUrl(urls, el.getAttribute('srcset'));
      addPinimgUrl(urls, el.getAttribute('data-src'));
      addPinimgUrl(urls, el.getAttribute('data-srcset'));
      addPinimgUrlsFromText(urls, el.getAttribute('style'));
    });
    addPinimgUrlsFromText(urls, root.innerHTML);
    return urls;
  }

  function findCarouselScroller(scope) {
    const root = scope?.querySelectorAll ? scope : document;
    const preferred = root.querySelector(
      '[data-test-id="closeup-image"] ul[class*="carousel"], ' +
      '[data-test-id="closeup-image"] ul, ' +
      'ul[class*="carousel"], ' +
      '[data-test-id="closeup-image"] [style*="overflow-x"]'
    );
    if (preferred && preferred.scrollWidth > preferred.clientWidth + 4) return preferred;
    return [...root.querySelectorAll('*')].find(el => {
      const style = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(style.overflowX || '');
    }) || null;
  }

  function collectCloseupImageUrlsSync() {
    const urls = new Set();
    const scope = getCloseupVisualScope();
    collectFocusedCarouselSlideUrls(scope, urls);
    collectImageUrlsFromScope(scope, urls);
    if (!urls.size && scope !== document && !getFocusedCloseupRoot()) collectImageUrlsFromScope(document, urls);
    return dedupePinimgUrls([...urls]);
  }

  async function collectCloseupImageUrls() {
    const scope = getCloseupVisualScope();
    const urls = new Set(collectCloseupImageUrlsSync());
    collectFocusedCarouselSlideUrls(scope, urls);
    collectImageUrlsFromScope(scope, urls);
    return dedupePinimgUrls([...urls]);
  }

  function findMainImageUrl(anchor) {
    return findCurrentCloseupImageUrl(anchor);
  }

  function fetchBinary(url) {
    return new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'arraybuffer',
        // Referer is required — without it Pinterest's CDN returns 403
        headers: {
          'Referer': location.href,
          'Accept':  'image/webp,image/apng,image/*,*/*;q=0.8',
        },
        onload:  r => (r.status >= 200 && r.status < 300)
          ? res(r.response)
          : rej(new Error('HTTP ' + r.status)),
        onerror: e => rej(new Error('Network error: ' + (e && e.error || e))),
      });
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Build a descending-quality URL queue for a pinimg.com image.
  // Tries originals first, then 736x, then 564x so we always get *something*
  // even when the /originals/ path is access-restricted for a given pin.
  // Converts any v1.pinimg.com video URL to the highest reliably available quality.
  // mc channel → 720p direct MP4; iht channel (Idea Pins) → 720w expMp4.
  function getHighestQualityVideoUrl(src) {
    const m = src.match(/v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i);
    if (!m) return src;
    const [, channel, hash] = m;
    return channel === 'iht'
      ? `https://v1.pinimg.com/videos/iht/expMp4/${hash}_720w.mp4`
      : `https://v1.pinimg.com/videos/mc/720p/${hash}.mp4`;
  }

  function pinimgFallbackQueue(url) {
    if (!url) return [url];
    const m = url.match(
      /^(https?:\/\/i\.pinimg\.com)\/(?:originals|\d+x)(\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/.+)$/i
    );
    if (!m) return [url];
    const [, base, path] = m;
    // Deduplicate while preserving order
    return [
      base + '/originals' + path,
      base + '/736x'      + path,
      base + '/564x'      + path,
    ].filter((u, i, a) => a.indexOf(u) === i);
  }

  async function fetchBestImageBuffer(imageUrl) {
    for (const u of pinimgFallbackQueue(imageUrl)) {
      try { return await fetchBinary(u); } catch (_) {}
    }
    return null;
  }

  function buildImageDownloadName(buf, filename) {
    const ext = detectFileType(new Uint8Array(buf));
    const explicitTitle = stripKnownExt(sanitizeFilename(filename || ''));
    const pageTitle = stripKnownExt(extractPinTitle() || '');
    const basePart = explicitTitle || pageTitle || makeFallbackPinName();
    return basePart + ext;
  }

  function saveImageBuffer(buf, filename) {
    if (!buf) return false;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf]));
      a.download = buildImageDownloadName(buf, filename);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function downloadSingle(imageUrl, filename) {
    if (!imageUrl) return false;
    const buf = await fetchBestImageBuffer(imageUrl);
    return saveImageBuffer(buf, filename);
  }

  async function downloadCloseupImages(urls, title, onProgress) {
    urls = dedupePinimgUrls((urls || []).filter(Boolean));
    if (!urls.length) return 0;
    const base = stripKnownExt(sanitizeFilename(title || extractPinTitle() || makeFallbackPinName()));
    let saved = 0;
    for (let i = 0; i < urls.length; i++) {
      const name = urls.length > 1 ? `${base} - ${i + 1}` : base;
      onProgress?.('fetch', i + 1, urls.length);
      if (await downloadSingle(urls[i], name)) saved++;
      onProgress?.('saved', saved, urls.length);
      if (urls.length > 1) await wait(300);
    }
    onProgress?.('done', saved, urls.length);
    return saved;
  }

  function initDownloadFixer() {
    if (!get('downloadFixer')) return;
    document.addEventListener('click', e => {
      if (isPowerMenuEvent(e)) return;
      if (!get('downloadFixer')) return;
      const target = e.target.closest(
        '[data-test-id*="download"], [aria-label*="ownload" i], ' +
        'button[id*="download"], [role="menuitem"]'
      );
      if (!target) return;
      if (target.closest('#pe-closeup-image-dl-slot, #pe-reverse-image-search-slot, #pe-reverse-image-search-menu')) return;
      const text   = (target.textContent || '').toLowerCase();
      const testId = target.getAttribute('data-test-id') || '';
      const aria   = (target.getAttribute('aria-label') || '').toLowerCase();
      const isDownload = text.includes('download') || testId.includes('download') || aria.includes('download');
      if (!isDownload) return;
      const url = findMainImageUrl(target);
      // Only intercept if we found the image URL; otherwise let Pinterest's native handler work
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        downloadSingle(url, extractFocusedPinTitle(target));
      }
    }, true);
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: QUICK DOWNLOAD BUTTON
  // ═══════════════════════════════════════════════════════════════════
  let _closeupImageDlObs = null;
  let _mobileCloseupActionObs = null;
  let _mobileCloseupActionObservedRoot = null;
  let _mobileCloseupActionRefresh = null;
  let _mobileCloseupActionSignature = '';
  let _pinCardQuickDownloadObs = null;
  let _pinCardQuickDownloadRescan = null;
  let _pinCardQuickDownloadPendingRoots = new Set();

  const PIN_CARD_QUICK_DOWNLOAD_SELECTOR = '[data-test-id="pin"], [data-grid-item="true"], [data-test-id="pinWrapper"]';
  const MOBILE_DEFAULT_ACTION_SLOT_SELECTORS = [
    '[data-test-id="react-button"], [data-test-id="reaction-count"]',
    '[data-test-id="comment-button"]',
    '[data-test-id="share-button-group"], [data-test-id="share-button-no-animation"]',
    '[data-test-id="context-menu-button"], [data-test-id="ellipsis-button"], [data-test-id="more-actions-button"]',
  ];

  function getDesktopCloseupActionItems() {
    return document.querySelector(
      '[data-test-id="closeup-action-items"][role="list"], ' +
      '[data-test-id="closeup-action-items"], ' +
      '[data-test-id="closeupActionBar"] [role="list"]'
    );
  }

  function getMobileCloseupActionItems() {
    return document.querySelector('[data-test-id="closeup-pin-action-items"]');
  }

  function getCloseupActionItems() {
    return IS_MOBILE ? getMobileCloseupActionItems() : getDesktopCloseupActionItems();
  }

  function supportsCloseupActionBarEnhancements() {
    return /\/pin\/\d/i.test(location.pathname);
  }

  function getCloseupActionIconRow() {
    const actionItems = getCloseupActionItems();
    if (!actionItems) return null;
    if (IS_MOBILE) return actionItems;
    const rows = [...actionItems.children].filter(el => el.querySelector?.('[role="listitem"]'));
    return rows.find(row => row.querySelector(
      '[data-test-id="react-button"], button[aria-label="Comments"], ' +
      '[data-test-id="closeup-share-button"], [data-test-id="closeup-more-options"]'
    )) || rows[0] || actionItems;
  }

  function findCloseupActionSlot(row, selector) {
    if (!row?.querySelectorAll) return null;
    for (const slot of row.querySelectorAll(':scope > .oRZ5_s')) {
      if (slot.querySelector(selector)) return slot;
    }
    const found = row.querySelector(selector)?.closest('.oRZ5_s, [role="listitem"]') || null;
    if (!found) return null;
    let direct = found;
    while (direct && direct.parentElement !== row) direct = direct.parentElement;
    return direct || null;
  }

  function isMobileCloseupActionRow(row) {
    return IS_MOBILE && !!row?.matches?.('[data-test-id="closeup-pin-action-items"]');
  }

  function isVisibleActionSlot(slot) {
    if (!slot?.isConnected) return false;
    const style = getComputedStyle(slot);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = slot.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getMobileVisibleDefaultActionSlotCount(row = getMobileCloseupActionItems()) {
    if (!isMobileCloseupActionRow(row)) return 0;
    return MOBILE_DEFAULT_ACTION_SLOT_SELECTORS.reduce((count, selector) => {
      const slot = findCloseupActionSlot(row, selector);
      return count + (isVisibleActionSlot(slot) ? 1 : 0);
    }, 0);
  }

  function getMobileCloseupActionSignature(row = getMobileCloseupActionItems(), wantsDownload = true, wantsReverse = true, showReverse = false) {
    if (!isMobileCloseupActionRow(row)) return 'no-row';
    const defaultCount = getMobileVisibleDefaultActionSlotCount(row);
    const hasDownload = !!document.getElementById('pe-closeup-image-dl-slot');
    const hasReverse = !!document.getElementById('pe-reverse-image-search-slot');
    return [
      defaultCount,
      wantsDownload ? 1 : 0,
      wantsReverse ? 1 : 0,
      showReverse ? 1 : 0,
      hasDownload ? 1 : 0,
      hasReverse ? 1 : 0,
      row.childElementCount,
    ].join(':');
  }

  function shouldShowMobileReverseImageSearchButton(row = getMobileCloseupActionItems()) {
    if (!IS_MOBILE) return true;
    if (!supportsCloseupActionBarEnhancements()) return false;
    if (!get('reverseImageSearchButton') || get('hideReverseImageSearchButton')) return false;
    if (!isMobileCloseupActionRow(row)) return false;
    return getMobileVisibleDefaultActionSlotCount(row) < MOBILE_DEFAULT_ACTION_SLOT_SELECTORS.length;
  }

  function findMobileMoreActionSlot(row) {
    return findCloseupActionSlot(row,
      '[data-test-id="context-menu-button"], [data-test-id="ellipsis-button"], [data-test-id="more-actions-button"], button[aria-label="More actions"]'
    );
  }

  function insertCloseupActionSlot(iconRow, slot, kind) {
    if (isMobileCloseupActionRow(iconRow)) {
      const moreSlot = findMobileMoreActionSlot(iconRow);
      if (kind === 'reverse') {
        const downloadSlot = document.getElementById('pe-closeup-image-dl-slot');
        if (downloadSlot && downloadSlot.parentElement === iconRow) {
          iconRow.insertBefore(slot, downloadSlot.nextSibling);
          return;
        }
      } else {
        const reverseSlot = document.getElementById('pe-reverse-image-search-slot');
        if (reverseSlot && reverseSlot.parentElement === iconRow) {
          iconRow.insertBefore(slot, reverseSlot);
          return;
        }
      }
      iconRow.insertBefore(slot, moreSlot || null);
      return;
    }

    const shareSlot = findCloseupActionSlot(iconRow,
      '[data-test-id="closeup-share-button"], button[aria-label*="Share" i], div[aria-label="Share"]'
    );
    const moreSlot = findCloseupActionSlot(iconRow,
      '[data-test-id="closeup-more-options"], [data-test-id="closeup-action-bar-button"], button[aria-label="More actions"]'
    );
    iconRow.insertBefore(slot, shareSlot || moreSlot || null);
  }

  function stopCloseupActionEvent(e) {
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  function absorbCloseupActionEvents(el) {
    if (!el || el.__peActionEventsAbsorbed) return;
    el.__peActionEventsAbsorbed = true;
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(type => {
      el.addEventListener(type, stopCloseupActionEvent, { capture: true });
    });
  }

  function removeCloseupImageDownloadButton() {
    const el = document.getElementById('pe-closeup-image-dl-slot');
    if (el) el.remove();
  }

  function getFocusedCloseupVideoScope(anchor) {
    const focusedRoot = getFocusedCloseupRoot(anchor);
    if (!focusedRoot) return null;
    return getCloseupScopePart(focusedRoot,
      '[data-test-id="closeup-visual-container"], ' +
      '[data-test-id="visual-content-container"], ' +
      '[data-test-id="story-pin-video-block"], ' +
      '[data-test-id="pin-closeup-image"], ' +
      '[data-test-id="closeup-image"]'
    ) || focusedRoot;
  }

  function getFocusedVideoHash(vid) {
    if (!vid) return '';
    const values = [
      vid.closest?.('[data-video-signature]')?.getAttribute('data-video-signature'),
      vid.getAttribute?.('data-video-signature'),
      vid.getAttribute?.('poster'),
      vid.poster,
      findPinterestVideoSrc(vid),
      getVideoSrc(vid),
    ];
    for (const source of vid.querySelectorAll?.('source') || []) {
      values.push(source.getAttribute('src'), source.getAttribute('data-src'));
    }
    for (const value of values) {
      const hash = extractPinterestVideoHashFromText(value);
      if (hash) return hash;
    }
    return '';
  }

  function getMatchingInterceptedVideoUrls(focusedHash) {
    if (!focusedHash) return [];
    return (_interceptedVideoUrlsByHash.get(focusedHash) || [])
      .filter(url => extractPinterestVideoHashFromText(url) === focusedHash)
      .map(url => getHighestQualityVideoUrl(url))
      .filter((url, i, arr) => url && !/\.m3u8/i.test(url) && arr.indexOf(url) === i);
  }

  function getFocusedCloseupVideoElement(anchor) {
    const scope = getFocusedCloseupVideoScope(anchor);
    if (!scope) return null;
    const selectors = [
      'video[data-test-id="duplo-hls-video"]',
      '[data-test-id="pin-closeup-image"] video',
      '[data-test-id="duplo-hls-video"] video',
      '[data-test-id="story-pin-video-block"] video',
      '[data-test-id="pinrep-video"] video',
      '[data-test-id="closeup-expanded-view"] video',
      '[data-test-id="closeup-image"] video',
      '[data-test-id="closeup-visual-container"] video',
      'video',
    ].join(', ');
    return [...(scope.querySelectorAll?.(selectors) || [])]
      .map(vid => ({
        vid,
        area: getElementArea(vid),
        hasHash: !!getFocusedVideoHash(vid),
        hasUsableSrc: !!(findPinterestVideoSrc(vid) || getVideoSrc(vid)),
        visible: isElementActuallyVisible(vid),
      }))
      .filter(item => item.hasHash || item.hasUsableSrc)
      .sort((a, b) => Number(b.visible) - Number(a.visible) || b.area - a.area)[0]?.vid || null;
  }

  function buildPinterestVideoDownloadUrlsFromHash(focusedHash, preferredBucket) {
    if (!focusedHash) return [];
    const buckets = preferredBucket ? [preferredBucket] : ['mc', 'iht'];
    const urls = [];
    buckets.forEach(bucket => {
      const variants = IS_MOBILE
        ? [
            ...(bucket === 'iht' ? [`https://v1.pinimg.com/videos/iht/expMp4/${focusedHash}_720w.mp4`] : []),
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t1.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t2.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t3.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t4.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/720p/${focusedHash}.mp4`,
          ]
        : [
            `https://v1.pinimg.com/videos/${bucket}/720p/${focusedHash}.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t4.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t3.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t2.mp4`,
            `https://v1.pinimg.com/videos/${bucket}/expMp4/${focusedHash}_t1.mp4`,
          ];
      urls.push(...variants);
    });
    return urls.filter((u, i, a) => u && a.indexOf(u) === i);
  }

  function buildPinterestVideoDownloadUrls(rawSrc) {
    const rawText = String(rawSrc || '');
    if (!rawText || (/i\.pinimg\.com/i.test(rawText) && !rawText.toLowerCase().includes('videos/thumbnails/originals'))) return [];
    const bestUrl = getHighestQualityVideoUrl(rawText);
    const safeRawSrc = rawText && !/\.m3u8/i.test(rawText) ? rawText : null;
    const m = rawText.match(/v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i);
    const focusedHash = extractPinterestVideoHashFromText(rawText);
    const bucket = getPinterestVideoCdnBucket(rawText);
    if (m && m[1] === 'mc') {
      return (IS_MOBILE
        ? [
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t1.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t2.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t3.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t4.mp4`,
            `https://v1.pinimg.com/videos/mc/720p/${m[2]}.mp4`,
            safeRawSrc,
          ]
        : [
            `https://v1.pinimg.com/videos/mc/720p/${m[2]}.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t4.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t3.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t2.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t1.mp4`,
            safeRawSrc,
          ]).filter((u, i, a) => u && a.indexOf(u) === i);
    }
    if (focusedHash) {
      return [...buildPinterestVideoDownloadUrlsFromHash(focusedHash, bucket), bestUrl, safeRawSrc]
        .filter((u, i, a) => u && !/\.m3u8/i.test(u) && !/i\.pinimg\.com/i.test(u) && a.indexOf(u) === i);
    }
    return [bestUrl, safeRawSrc].filter((u, i, a) => u && !/\.m3u8/i.test(u) && a.indexOf(u) === i);
  }

  function getCurrentPinIdFromLocation() {
    return String(location.pathname || '').match(/\/pin\/(\d+)/i)?.[1] || '';
  }

  function parsePinterestRelayCompletedCall(text) {
    const raw = String(text || '');
    const marker = '__PWS_RELAY_REGISTER_COMPLETED_REQUEST__(';
    const start = raw.indexOf(marker);
    if (start === -1) return null;

    const args = [];
    let depth = 0;
    let quote = '';
    let escaped = false;
    let argStart = start + marker.length;

    for (let i = argStart; i < raw.length; i += 1) {
      const ch = raw[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === '}' || ch === ']' || ch === ')') {
        if (ch === ')' && depth === 0) {
          args.push(raw.slice(argStart, i).trim());
          break;
        }
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (ch === ',' && depth === 0) {
        args.push(raw.slice(argStart, i).trim());
        argStart = i + 1;
      }
    }

    if (args.length < 2) return null;
    try {
      const requestArg = JSON.parse(args[0]);
      const requestText = typeof requestArg === 'string' ? decodeURIComponent(requestArg) : JSON.stringify(requestArg);
      const request = JSON.parse(requestText);
      const response = JSON.parse(args[1]);
      return { request, variables: request?.variables || {}, response };
    } catch {
      return null;
    }
  }

  function findCurrentPinDataFromRelayScripts(pinId) {
    if (!pinId) return null;
    for (const script of document.querySelectorAll('script[data-relay-completed-request="true"]')) {
      const parsed = parsePinterestRelayCompletedCall(script.textContent || '');
      const variables = parsed?.variables;
      if (String(variables?.pinId || '') !== pinId) continue;
      const candidates = [
        parsed.response?.data?.v3GetPinQueryv2?.data,
        parsed.response?.data?.v3GetPinQuery?.data,
        parsed.response?.data?.pin,
        parsed.response?.resource_response?.data,
      ].filter(Boolean);
      for (const candidate of candidates) {
        if (candidate?.entityId && String(candidate.entityId) !== pinId) continue;
        return candidate;
      }
    }
    return null;
  }

  function collectPinterestDataStrings(pinData) {
    const strings = [];
    const seenObjects = new WeakSet();

    function walk(value) {
      if (!value) return;
      if (typeof value === 'string') {
        strings.push(value);
        return;
      }
      if (typeof value !== 'object') return;
      if (seenObjects.has(value)) return;
      seenObjects.add(value);
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      Object.keys(value).forEach(key => walk(value[key]));
    }

    walk(pinData);
    return strings;
  }

  function collectVideoDownloadUrlsFromPinterestData(pinData) {
    if (!pinData) return [];
    const roots = [
      pinData.videoList720P,
      pinData.videoDataV2?.videoList720P,
      pinData.storyPinData,
      pinData.videoDataV2,
      pinData.videos,
      pinData.video,
    ].filter(Boolean);
    const strings = roots.flatMap(collectPinterestDataStrings);

    const directUrls = [];
    const fallbackUrls = [];
    strings.forEach(value => {
      const text = String(value || '');
      if (/v1\.pinimg\.com\/videos/i.test(text)) {
        if (/\.mp4(?:[?#]|$)/i.test(text)) {
          directUrls.push(text, ...buildPinterestVideoDownloadUrls(text));
        } else {
          fallbackUrls.push(...buildPinterestVideoDownloadUrls(text));
        }
      }
      if (/videos\/thumbnails\/originals/i.test(text)) {
        const hash = extractPinterestVideoHashFromText(text);
        if (hash) {
          fallbackUrls.push(
            ...buildPinterestVideoDownloadUrlsFromHash(hash, 'iht'),
            ...buildPinterestVideoDownloadUrlsFromHash(hash, 'mc')
          );
        }
      }
    });

    return [...directUrls, ...fallbackUrls]
      .filter((url, i, arr) => url && !/^blob:/i.test(url) && !/\.m3u8(?:[?#]|$)/i.test(url) && !/i\.pinimg\.com/i.test(url) && arr.indexOf(url) === i);
  }

  // ── Real network API (SPA-safe) ─────────────────────────────────────
  // Embedded relay scripts only describe the originally-loaded pin, so after
  // in-app navigation they have nothing for the tapped pin and the closeup
  // <video> is often not rendered yet. The pin id in the URL is always
  // correct, so fetching Pinterest's own PinResource API by that id resolves
  // the real video regardless of DOM/relay staleness.
  const _apiPinDataCache = new Map();

  function readCsrfCookie() {
    const m = String(document.cookie || '').match(/(?:^|;\s*)csrftoken=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function fetchPinResourceData(pinId) {
    return new Promise(resolve => {
      if (!pinId) { resolve(null); return; }
      if (_apiPinDataCache.has(pinId)) { resolve(_apiPinDataCache.get(pinId)); return; }
      const data = JSON.stringify({
        options: { id: String(pinId), field_set_key: 'detailed' }, context: {}
      });
      const url = location.origin +
        '/resource/PinResource/get/?source_url=' +
        encodeURIComponent('/pin/' + pinId + '/') +
        '&data=' + encodeURIComponent(data);
      GM_xmlhttpRequest({
        method: 'GET', url,
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': readCsrfCookie(),
        },
        onload: r => {
          let parsed = null;
          try {
            if (r.status >= 200 && r.status < 300) {
              const json = JSON.parse(r.responseText);
              parsed = (json && json.resource_response && json.resource_response.data) || null;
            }
          } catch (_) { parsed = null; }
          if (parsed) _apiPinDataCache.set(pinId, parsed);
          resolve(parsed);
        },
        onerror:   () => resolve(null),
        ontimeout: () => resolve(null),
        timeout: 4000,
      });
    });
  }

  // True when the API data clearly describes a video/idea-video pin (used to
  // refuse the poster-image fallback for a confirmed video).
  function apiDataIsVideoPin(pinData) {
    if (!pinData) return false;
    if (collectVideoDownloadUrlsFromPinterestData(pinData).length) return true;
    return collectPinterestDataStrings(pinData).some(text =>
      /videos\/thumbnails\/originals|v1\.pinimg\.com\/videos|videoDataV2|videoList720P/i.test(String(text || '')));
  }

  async function fetchApiVideoDownload(pinId) {
    const pinData = await fetchPinResourceData(pinId);
    if (!pinData) return null;
    const urls = collectVideoDownloadUrlsFromPinterestData(pinData);
    if (!urls.length) return null;
    return { urls, rawSrc: urls[0], pinId, source: 'api' };
  }

  function cacheMobilePinVideoDownload(pinId, download) {
    if (!pinId || !download?.urls?.length) return download;
    _mobilePinVideoDownloadCache.set(pinId, download);
    while (_mobilePinVideoDownloadCache.size > 6) {
      const oldestKey = _mobilePinVideoDownloadCache.keys().next().value;
      _mobilePinVideoDownloadCache.delete(oldestKey);
    }
    return download;
  }

  function findMobileCurrentPinVideoDownload(anchor) {
    if (!IS_MOBILE) return null;
    const pinId = getCurrentPinIdFromLocation();
    if (!pinId) return null;
    const cached = _mobilePinVideoDownloadCache.get(pinId);
    if (cached?.urls?.length) return cached;

    const pinData = findCurrentPinDataFromRelayScripts(pinId);
    const urls = collectVideoDownloadUrlsFromPinterestData(pinData);
    if (!urls.length) return null;
    return cacheMobilePinVideoDownload(pinId, {
      urls,
      rawSrc: urls[0],
      pinId,
      source: 'mobile-relay',
      anchor,
    });
  }

  function findCurrentCloseupVideoDownload(anchor) {
    const vid = getFocusedCloseupVideoElement(anchor);
    if (!vid) return null;
    const rawSrc = findPinterestVideoSrc(vid);
    const focusedHash = getFocusedVideoHash(vid);
    const urls = [
      ...getMatchingInterceptedVideoUrls(focusedHash),
      ...buildPinterestVideoDownloadUrls(rawSrc),
      ...buildPinterestVideoDownloadUrlsFromHash(focusedHash, getPinterestVideoCdnBucket(rawSrc)),
    ].filter((u, i, a) => u && !/^blob:/i.test(u) && !/i\.pinimg\.com/i.test(u) && a.indexOf(u) === i);
    return urls.length ? { urls, rawSrc: rawSrc || urls[0], element: vid, focusedHash } : null;
  }

  function focusedScopeHasGifSignal(scope) {
    if (!scope?.querySelector) return false;
    if (isMobileGifPin(scope)) return true;
    const gifVideo = scope.querySelector('video');
    if (gifVideo && isGifVideo(gifVideo, scope)) return true;
    return false;
  }

  function focusedPinDataHasVideoSignal() {
    const pinId = getCurrentPinIdFromLocation();
    const pinData = findCurrentPinDataFromRelayScripts(pinId);
    if (!pinData) return false;
    if (collectVideoDownloadUrlsFromPinterestData(pinData).length) return true;
    return collectPinterestDataStrings(pinData).some(text => /videos\/thumbnails\/originals|v1\.pinimg\.com\/videos|videoDataV2|videoList720P/i.test(text));
  }

  // Is the focused closeup a video pin? Uses signals available *before* the
  // HLS blob attaches so we can block poster-image fallback while video data resolves.
  function focusedCloseupIsVideoPin(anchor) {
    const scope = getFocusedCloseupVideoScope(anchor) || getFocusedCloseupRoot(anchor);
    if (!scope || !scope.querySelector) return false;
    if (focusedScopeHasGifSignal(scope)) return false;
    if (scope.querySelector(
      'video[data-test-id="duplo-hls-video"], ' +
      '[data-test-id="duplo-hls-video"], ' +
      '[data-video-signature], ' +
      'video[poster], ' +
      'img[src*="/videos/thumbnails/"], ' +
      'img[srcset*="/videos/thumbnails/"]'
    )) return true;
    const badge = scope.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (badge && /video|watch/i.test(badge.textContent || '')) return true;
    try { if (isVideoPin(scope)) return true; } catch (_) {}
    return focusedPinDataHasVideoSignal();
  }

  // Derive the Pinterest video hash from the focused closeup scope directly
  // (signature attr / video poster / thumbnail URL) — synchronously available
  // even before getFocusedCloseupVideoElement can resolve a usable <video>.
  function deriveFocusedCloseupVideoHash(anchor) {
    const scope = getFocusedCloseupVideoScope(anchor) || getFocusedCloseupRoot(anchor);
    if (!scope || !scope.querySelectorAll) return '';
    const vidEl = scope.querySelector('video[data-test-id="duplo-hls-video"], video');
    if (vidEl) { const h = getFocusedVideoHash(vidEl); if (h) return h; }
    const texts = [];
    scope.querySelectorAll('[data-video-signature]')
      .forEach(el => texts.push(el.getAttribute('data-video-signature')));
    scope.querySelectorAll('video[poster], img[src*="/videos/"]')
      .forEach(el => texts.push(el.getAttribute('poster') || el.getAttribute('src')));
    for (const t of texts) { const h = extractPinterestVideoHashFromText(t); if (h) return h; }
    return '';
  }

  // Confirmed-video pins must never fall through to the poster still. Retry
  // briefly: the hash/relay data and the HLS src often appear a few hundred ms
  // after the closeup opens, which is exactly the race that produced random
  // still-frame downloads on mobile.
  async function resolveFocusedVideoDownloadWithRetry(anchor) {
    const pinId = getCurrentPinIdFromLocation();
    for (let attempt = 0; attempt < 6; attempt++) {
      const direct = (IS_MOBILE ? findMobileCurrentPinVideoDownload(anchor) : null)
        || findCurrentCloseupVideoDownload(anchor);
      if (direct?.urls?.length) return direct;
      const hash = deriveFocusedCloseupVideoHash(anchor);
      if (hash) {
        const urls = [
          ...getMatchingInterceptedVideoUrls(hash),
          ...buildPinterestVideoDownloadUrlsFromHash(hash),
        ].filter((u, i, a) => u && !/^blob:/i.test(u) && !/i\.pinimg\.com/i.test(u) && a.indexOf(u) === i);
        if (urls.length) return { urls, rawSrc: urls[0], focusedHash: hash };
      }
      // The in-page hash path covers nearly all cases instantly. Only fall
      // back to the network API on the final attempts so a slow/dead API
      // never stalls the fast path (pin id from URL is SPA-safe).
      if (attempt >= 4) {
        const apiDownload = await fetchApiVideoDownload(pinId);
        if (apiDownload?.urls?.length) return apiDownload;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  async function downloadCurrentCloseupMedia(btn) {
    const title = extractFocusedPinTitle(btn);

    // Fast path: a real <video>/intercepted URL already in the DOM.
    let videoDownload = (IS_MOBILE ? findMobileCurrentPinVideoDownload(btn) : null) || findCurrentCloseupVideoDownload(btn);

    // No DOM video yet: use the resolver that derives the video hash straight
    // from the page (signature/poster/thumbnail) and the in-page interceptor,
    // converting the HLS hash to mp4 with no dependence on the network API.
    if (!videoDownload) {
      videoDownload = await resolveFocusedVideoDownloadWithRetry(btn);
    }
    if (videoDownload?.urls?.length) {
      await downloadVideoFile(videoDownload.urls, title, (loaded, total) => {
        if (total > 0 && btn?.isConnected) btn.title = `${Math.round(loaded / total * 100)}%`;
      });
      return true;
    }

    const currentImageUrl = findCurrentCloseupImageUrl(btn);
    // Never silently save the poster of something that is actually a video.
    const isVideo = focusedCloseupIsVideoPin(btn) ||
      (!!currentImageUrl && /\/videos\/thumbnails\//i.test(currentImageUrl)) ||
      !currentImageUrl;
    if (isVideo) {
      showPowerMenuToast('Could not get the video — tap download again');
      return false;
    }
    return currentImageUrl ? downloadSingle(currentImageUrl, title) : false;
  }

  function isEligiblePinCardQuickDownloadCard(card) {
    if (IS_MOBILE || !card?.querySelector) return false;
    if (!card.matches?.('[data-test-id="pin"], [data-test-id="pinWrapper"]') &&
        !card.querySelector?.('[data-test-id="pin"], [data-test-id="pinWrapper"], a[href*="/pin/"]')) return false;
    if (card.closest?.(
      '[data-test-id="closeup-action-items"], ' +
      '[data-test-id="closeup-pin-action-items"], ' +
      '[data-test-id="closeup-visual-container"], ' +
      '[data-test-id="closeup-image"]'
    )) return false;
    return !!card.querySelector('img[src*="pinimg.com"], img[srcset*="pinimg.com"], video, [style*="pinimg.com"]');
  }

  function getPinCardQuickDownloadCard(node) {
    if (!node?.closest && !node?.matches) return null;
    const card = node.matches?.('[data-test-id="pin"]')
      ? node
      : node.closest?.('[data-test-id="pin"]') ||
        node.closest?.('[data-grid-item="true"]') ||
        node.closest?.('[data-test-id="pinWrapper"]') ||
        null;
    return isEligiblePinCardQuickDownloadCard(card) ? card : null;
  }

  function getPinCardQuickDownloadCards(root = document) {
    if (IS_MOBILE) return [];
    const cards = new Set();
    const scope = root?.querySelectorAll ? root : document;
    const add = node => {
      const card = getPinCardQuickDownloadCard(node);
      if (card) cards.add(card);
    };
    if (scope.matches?.(PIN_CARD_QUICK_DOWNLOAD_SELECTOR)) add(scope);
    scope.querySelectorAll?.(PIN_CARD_QUICK_DOWNLOAD_SELECTOR).forEach(add);
    return [...cards];
  }

  function getPinCardMediaWrapper(card) {
    if (!card?.querySelector) return null;
    return card.querySelector(
      '.PinCard__imageWrapper, ' +
      '[data-test-id="pinWrapper"], ' +
      '[data-test-id^="pincard-gif"], ' +
      '[data-test-id="pinrep-image"], ' +
      '[data-test-id="non-story-pin-image"]'
    ) || card.querySelector('img[src*="pinimg.com"], img[srcset*="pinimg.com"]')?.closest?.(
      '.PinCard__imageWrapper, [data-test-id="pinWrapper"], [data-test-id="pinrep-image"], [data-test-id="non-story-pin-image"], a'
    ) || null;
  }

  function getPinCardFromDownloadButton(anchor) {
    return anchor?.closest?.('[data-pe-pin-card-download-card="true"]') ||
      getPinCardQuickDownloadCard(anchor) ||
      null;
  }

  function getPinCardVideoElement(anchor) {
    const card = getPinCardFromDownloadButton(anchor);
    if (!card) return null;
    const selectors = [
      'video[data-test-id="duplo-hls-video"]',
      '[data-test-id="duplo-hls-video"] video',
      '[data-test-id="pinrep-video"] video',
      '[data-test-id^="pincard-gif"] video',
      'video',
    ].join(', ');
    return [...card.querySelectorAll(selectors)]
      .map(vid => ({
        vid,
        area: getElementArea(vid),
        hasHash: !!getFocusedVideoHash(vid),
        hasUsableSrc: !!(findPinterestVideoSrc(vid) || getVideoSrc(vid)),
        visible: isElementActuallyVisible(vid),
      }))
      .filter(item => item.hasHash || item.hasUsableSrc)
      .sort((a, b) => Number(b.visible) - Number(a.visible) || b.area - a.area)[0]?.vid || null;
  }

  function findCurrentPinCardVideoDownload(anchor) {
    const vid = getPinCardVideoElement(anchor);
    if (!vid) return null;
    const rawSrc = findPinterestVideoSrc(vid);
    const focusedHash = getFocusedVideoHash(vid);
    const urls = [
      ...getMatchingInterceptedVideoUrls(focusedHash),
      ...buildPinterestVideoDownloadUrls(rawSrc),
      ...buildPinterestVideoDownloadUrlsFromHash(focusedHash, getPinterestVideoCdnBucket(rawSrc)),
    ].filter((u, i, a) => u && !/^blob:/i.test(u) && !/i\.pinimg\.com/i.test(u) && a.indexOf(u) === i);
    return urls.length ? { urls, rawSrc: rawSrc || urls[0], element: vid, focusedHash } : null;
  }

  function findCurrentPinCardImageUrl(anchor) {
    const card = getPinCardFromDownloadButton(anchor);
    if (!card) return null;
    const urls = new Set();
    collectImageUrlsFromScope(card, urls);
    return dedupePinimgUrls([...urls])[0] || null;
  }

  async function downloadCurrentPinCardMedia(btn) {
    const card = getPinCardFromDownloadButton(btn);
    if (!card) return false;
    const title = extractPinTitleFromScope(card) || makeFallbackPinName();
    const videoDownload = findCurrentPinCardVideoDownload(btn);
    if (videoDownload) {
      await downloadVideoFile(videoDownload.urls, title, (loaded, total) => {
        if (total > 0 && btn?.isConnected) btn.title = `${Math.round(loaded / total * 100)}%`;
      });
      return true;
    }
    const currentUrl = findCurrentPinCardImageUrl(btn);
    return currentUrl ? downloadSingle(currentUrl, title) : false;
  }

  function stopPinCardQuickDownloadPointerEvent(e) {
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  function absorbPinCardQuickDownloadEvents(el) {
    if (!el || el.__pePinCardDownloadEventsAbsorbed) return;
    el.__pePinCardDownloadEventsAbsorbed = true;
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(type => {
      el.addEventListener(type, stopPinCardQuickDownloadPointerEvent, { capture: true });
    });
  }

  function createPinCardQuickDownloadButton(card) {
    if (!isEligiblePinCardQuickDownloadCard(card)) return false;
    const host = getPinCardMediaWrapper(card);
    if (!host) return false;
    card.dataset.pePinCardDownloadCard = 'true';
    host.classList.add('pe-pin-card-download-host');

    const existing = card.querySelector('.pe-pin-card-download-wrap');
    if (existing && existing.parentElement === host) return true;
    existing?.remove();

    const wrap = document.createElement('div');
    wrap.className = 'pe-pin-card-download-wrap';
    wrap.setAttribute('data-pe-ui', 'true');
    absorbPinCardQuickDownloadEvents(wrap);

    const btn = document.createElement('button');
    btn.className = 'pe-pin-card-download-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Download');
    btn.title = 'Download';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path d="M11 4h2v8.59l2.3-2.3L16.7 11.7 12 16.4l-4.7-4.7 1.4-1.41 2.3 2.3V4zM5 19h14v2H5z"/>
      </svg>
    `;
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.title = 'Downloading...';
      let saved = false;
      try {
        saved = await downloadCurrentPinCardMedia(btn);
      } catch (_) {}
      if (!saved) {
        btn.classList.add('pe-missing');
        btn.title = 'No media found';
        setTimeout(() => {
          btn.classList.remove('pe-missing');
          btn.title = 'Download';
        }, 1200);
        btn.disabled = false;
        return;
      }
      btn.title = 'Downloaded';
      btn.disabled = false;
      setTimeout(() => { if (btn.isConnected) btn.title = 'Download'; }, 1500);
    }, true);
    wrap.appendChild(btn);
    host.appendChild(wrap);
    return true;
  }

  function refreshDesktopPinCardQuickDownloadButtons(root = document) {
    if (IS_MOBILE) return;
    getPinCardQuickDownloadCards(root).forEach(createPinCardQuickDownloadButton);
  }

  function initDesktopPinCardQuickDownloadButton() {
    if (IS_MOBILE) return;
    refreshDesktopPinCardQuickDownloadButtons();
    if (_pinCardQuickDownloadObs) return;
    _pinCardQuickDownloadRescan = debounce(() => {
      const roots = [..._pinCardQuickDownloadPendingRoots];
      _pinCardQuickDownloadPendingRoots.clear();
      roots.forEach(root => refreshDesktopPinCardQuickDownloadButtons(root));
    }, 120);
    _pinCardQuickDownloadObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      records.forEach(record => {
        record.addedNodes?.forEach(node => {
          if (node?.nodeType === 1) _pinCardQuickDownloadPendingRoots.add(node);
        });
      });
      if (!_pinCardQuickDownloadPendingRoots.size) return;
      _pinCardQuickDownloadRescan();
    });
    _pinCardQuickDownloadObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function createCloseupImageDownloadButton() {
    if (!supportsCloseupActionBarEnhancements()) {
      removeCloseupImageDownloadButton();
      return;
    }

    const iconRow = getCloseupActionIconRow();
    if (!iconRow) return;

    const existing = document.getElementById('pe-closeup-image-dl-slot');
    if (existing && iconRow.contains(existing)) return;
    if (existing) existing.remove();

    const slot = document.createElement('div');
    slot.id = 'pe-closeup-image-dl-slot';
    slot.className = 'oRZ5_s';
    slot.classList.add('pe-closeup-action-slot');
    if (IS_MOBILE) slot.classList.add('pe-mobile-closeup-action-slot');
    slot.dataset.peCloseupAction = 'download';
    slot.setAttribute('data-pe-ui', 'true');
    absorbCloseupActionEvents(slot);

    const item = document.createElement('div');
    item.className = 'ADXRXN';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <button id="pe-closeup-image-dl-btn" class="euRXRl" type="button" aria-label="Download" title="Download">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M11 4h2v8.59l2.3-2.3L16.7 11.7 12 16.4l-4.7-4.7 1.4-1.41 2.3 2.3V4zM5 19h14v2H5z"/>
        </svg>
      </button>
    `;
    slot.appendChild(item);

    const btn = slot.querySelector('#pe-closeup-image-dl-btn');
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.title = 'Downloading...';
      let saved = false;
      try {
        saved = await downloadCurrentCloseupMedia(btn);
      } catch (_) {}
      if (!saved) {
        btn.classList.add('pe-missing');
        btn.title = 'No media found';
        setTimeout(() => {
          btn.classList.remove('pe-missing');
          btn.title = 'Download';
        }, 1200);
        btn.disabled = false;
        return;
      }
      btn.title = 'Downloaded';
      btn.disabled = false;
      setTimeout(() => { if (btn.isConnected) btn.title = 'Download'; }, 1500);
    }, true);

    insertCloseupActionSlot(iconRow, slot, 'download');
  }

  function refreshMobileCloseupActionButtons() {
    if (!IS_MOBILE) return;
    if (!supportsCloseupActionBarEnhancements()) {
      removeCloseupImageDownloadButton();
      removeReverseImageSearchButton();
      disconnectMobileCloseupActionObserver();
      _mobileCloseupActionSignature = '';
      return;
    }
    const wantsDownload = true;
    const wantsReverse = !!get('reverseImageSearchButton') && !get('hideReverseImageSearchButton');
    const row = getMobileCloseupActionItems();
    const showReverse = wantsReverse && shouldShowMobileReverseImageSearchButton(row);
    const signature = getMobileCloseupActionSignature(row, wantsDownload, wantsReverse, showReverse);
    if (signature === _mobileCloseupActionSignature) return;
    createCloseupImageDownloadButton();
    if (showReverse) createReverseImageSearchButton();
    else removeReverseImageSearchButton();
    observeMobileCloseupActionBar();
    _mobileCloseupActionSignature = getMobileCloseupActionSignature(row, wantsDownload, wantsReverse, showReverse);
  }

  function scheduleMobileCloseupActionButtonsRefresh() {
    if (!IS_MOBILE) return;
    if (!_mobileCloseupActionRefresh)
      _mobileCloseupActionRefresh = debounce(refreshMobileCloseupActionButtons, 250);
    _mobileCloseupActionRefresh();
  }

  function disconnectMobileCloseupActionObserver() {
    if (_mobileCloseupActionObs) _mobileCloseupActionObs.disconnect();
    _mobileCloseupActionObs = null;
    _mobileCloseupActionObservedRoot = null;
    _mobileCloseupActionSignature = '';
  }

  function observeMobileCloseupActionBar() {
    if (!IS_MOBILE) return false;
    const row = getMobileCloseupActionItems();
    const root = row?.closest?.('[data-test-id="closeup-pin-action-bar-container"]') || row;
    if (!root) return false;
    if (_mobileCloseupActionObs && _mobileCloseupActionObservedRoot === root) return true;
    disconnectMobileCloseupActionObserver();
    _mobileCloseupActionObservedRoot = root;
    _mobileCloseupActionObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      scheduleMobileCloseupActionButtonsRefresh();
    });
    _mobileCloseupActionObs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
    return true;
  }

  function initMobileCloseupActionButtons() {
    refreshMobileCloseupActionButtons();
    observeMobileCloseupActionBar();
  }

  function initCloseupImageDownloadButton() {
    if (!supportsCloseupActionBarEnhancements()) {
      removeCloseupImageDownloadButton();
      return;
    }
    if (IS_MOBILE) {
      initMobileCloseupActionButtons();
      return;
    }
    createCloseupImageDownloadButton();
    if (_closeupImageDlObs) return;
    const retry = debounce(createCloseupImageDownloadButton, 150);
    _closeupImageDlObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      retry();
    });
    _closeupImageDlObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  const REVERSE_IMAGE_SEARCH_PROVIDERS = [
    {
      id: 'google-lens',
      name: 'Google Lens',
      mode: 'open',
      build: url => 'https://www.google.com/searchbyimage?image_url=' + encodeURIComponent(url) + '&hl=' + encodeURIComponent(USER_LANG || 'en'),
    },
    {
      id: 'yandex',
      name: 'Yandex',
      mode: 'open',
      build: url => 'https://yandex.com/images/search?rpt=imageview&url=' + encodeURIComponent(url),
    },
    {
      id: 'saucenao',
      name: 'SauceNAO (copy URL)',
      mode: 'copy-open',
      homeUrl: 'https://saucenao.com/',
      copiedMessage: 'SauceNAO opened. Image URL copied.',
    },
    {
      id: 'tineye',
      name: 'TinEye (copy URL)',
      mode: 'copy-open',
      homeUrl: 'https://tineye.com/',
      copiedMessage: 'TinEye opened. Image URL copied.',
    },
  ];
  let _reverseImageSearchObs = null;

  function getReverseImageSearchProvider(providerId) {
    return REVERSE_IMAGE_SEARCH_PROVIDERS.find(p => p.id === providerId) || REVERSE_IMAGE_SEARCH_PROVIDERS[0];
  }

  function copyTextToClipboard(text) {
    if (!text) return Promise.resolve(false);
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return Promise.resolve(true);
      }
    } catch (_) {}
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return Promise.resolve(!!ok);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function showPowerMenuToast(message) {
    if (!message) return;
    document.getElementById('pe-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'pe-toast';
    toast.setAttribute('data-pe-ui', 'true');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  async function openReverseImageSearchProvider(providerId, imageUrl) {
    const provider = getReverseImageSearchProvider(providerId);
    if (provider.mode === 'copy-open') {
      window.open(provider.homeUrl, '_blank', 'noopener');
      await copyTextToClipboard(imageUrl);
      showPowerMenuToast(provider.copiedMessage || 'Image URL copied.');
      return;
    }
    window.open(provider.build(imageUrl), '_blank', 'noopener');
  }

  function removeReverseImageSearchMenu() {
    document.getElementById('pe-reverse-image-search-menu')?.remove();
  }

  function removeReverseImageSearchButton() {
    removeReverseImageSearchMenu();
    document.getElementById('pe-reverse-image-search-slot')?.remove();
  }

  function showReverseImageSearchMenu(anchor, imageUrl) {
    removeReverseImageSearchMenu();
    if (!imageUrl) return;
    const menu = document.createElement('div');
    menu.id = 'pe-reverse-image-search-menu';
    menu.setAttribute('data-pe-ui', 'true');
    menu.innerHTML = REVERSE_IMAGE_SEARCH_PROVIDERS.map(provider => `
      <button type="button" data-provider="${provider.id}">${provider.name}</button>
    `).join('');
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = Math.max(8, rect.bottom + 6) + 'px';
    menu.style.left = Math.max(8, Math.min(Math.max(8, window.innerWidth - 184), rect.left - 64)) + 'px';
    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        await openReverseImageSearchProvider(btn.dataset.provider, imageUrl);
        removeReverseImageSearchMenu();
      });
    });
    setTimeout(() => {
      document.addEventListener('click', removeReverseImageSearchMenu, { once: true, capture: true });
    }, 0);
  }

  function createReverseImageSearchButton() {
    if (!supportsCloseupActionBarEnhancements() || !get('reverseImageSearchButton') || get('hideReverseImageSearchButton')) {
      removeReverseImageSearchButton();
      return;
    }

    const iconRow = getCloseupActionIconRow();
    if (!iconRow) return;
    if (IS_MOBILE && !shouldShowMobileReverseImageSearchButton(iconRow)) {
      removeReverseImageSearchButton();
      return;
    }

    const existing = document.getElementById('pe-reverse-image-search-slot');
    if (existing && iconRow.contains(existing)) return;
    if (existing) existing.remove();

    const slot = document.createElement('div');
    slot.id = 'pe-reverse-image-search-slot';
    slot.className = 'oRZ5_s';
    slot.classList.add('pe-closeup-action-slot');
    if (IS_MOBILE) slot.classList.add('pe-mobile-closeup-action-slot');
    slot.dataset.peCloseupAction = 'reverse-search';
    slot.setAttribute('data-pe-ui', 'true');
    absorbCloseupActionEvents(slot);

    const item = document.createElement('div');
    item.className = 'ADXRXN';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <button id="pe-reverse-image-search-btn" class="euRXRl" type="button" aria-label="Reverse image search" title="Reverse image search">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M10.5 4a6.5 6.5 0 0 1 5.17 10.44l4.45 4.45-1.41 1.41-4.45-4.45A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm8.5-4 .46 1.54L21 4l-1.54.46L19 6l-.46-1.54L17 4l1.54-.46z"/>
        </svg>
      </button>
    `;
    slot.appendChild(item);

    const btn = slot.querySelector('#pe-reverse-image-search-btn');
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const imageUrl = findCurrentCloseupImageUrl(btn);
        if (imageUrl) showReverseImageSearchMenu(btn, imageUrl);
      } finally {
        btn.disabled = false;
      }
    }, true);

    insertCloseupActionSlot(iconRow, slot, 'reverse');
  }

  function initReverseImageSearchButton() {
    if (!supportsCloseupActionBarEnhancements()) {
      removeReverseImageSearchButton();
      return;
    }
    if (IS_MOBILE) {
      initMobileCloseupActionButtons();
      return;
    }
    if (!get('reverseImageSearchButton') || get('hideReverseImageSearchButton')) {
      removeReverseImageSearchButton();
      return;
    }
    createReverseImageSearchButton();
    if (_reverseImageSearchObs) return;
    const retry = debounce(createReverseImageSearchButton, 150);
    _reverseImageSearchObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      retry();
    });
    _reverseImageSearchObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: BOARD DOWNLOADER
  // ═══════════════════════════════════════════════════════════════════
  function isBoardPage() {
    // URL heuristic: /username/boardname/  (exactly 2 non-empty path segments)
    const parts = location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const skip  = new Set([
      'search','pin','_','settings','ideas','today','following',
      'explore','business','login','logout','create','about',
      'help','careers','news','collage-creation-tool',
    ]);
    const urlMatch = parts.length === 2 && !skip.has(parts[0]);
    // DOM confirmation: Pinterest board header is present
    const domMatch = !!document.querySelector(
      '[data-test-id="board-header-with-image"], [data-test-id="board-header-details"], [data-test-id="board-tools"]'
    );
    return urlMatch || domMatch;
  }

  // Snapshot whatever pin images are currently in the DOM into the
  // accumulator set.  Called repeatedly while scrolling so we catch
  // images before Pinterest's virtual list recycles those DOM nodes.
  // Also captures pin titles from title elements in each pin card.
  function snapshotPinUrls(seen, urls, names) {
    document.querySelectorAll('img[src*="i.pinimg.com"]').forEach(img => {
      // Skip tiny avatars/icons
      const w = img.naturalWidth || img.width;
      if (w && w < 80) return;
      // Skip images inside the "More Ideas" / suggested section at the bottom of boards
      if (img.closest('.moreIdeasOnBoard, [href*="more-ideas"], [href*="/_tools/"]')) return;
      let url = img.src;
      const m = url.match(OQ_RE);
      if (m) url = m[1] + '/originals' + m[2];
      if (!seen.has(url)) {
        const pinScope = img.closest(
          '[data-test-id="pinWrapper"], [data-grid-item="true"], [data-test-id="pin"], div[role="listitem"]'
        );
        seen.add(url);
        urls.push(url);
        names.set(url, extractPinTitleFromScope(pinScope));
      }
    });
  }

  // Snapshot video pins currently in the DOM into the accumulator.
  // Called alongside snapshotPinUrls so videos are captured before virtual-list recycling.
  function snapshotVideoUrls(vidSeen, vidItems) {
    document.querySelectorAll('video').forEach(vid => {
      const src = findPinterestVideoSrc(vid);
      if (!src || /i\.pinimg\.com/.test(src)) return; // skip GIFs
      const m = src.match(/v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i);
      if (!m) return;
      const key = m[1] + '/' + m[2];
      if (vidSeen.has(key)) return;
      vidSeen.add(key);
      const pinScope = vid.closest(
        '[data-test-id="pinWrapper"], [data-grid-item="true"], [data-test-id="pin"], div[role="listitem"]'
      );
      vidItems.push({ channel: m[1], hash: m[2], title: extractPinTitleFromScope(pinScope) });
    });
  }

  // Scroll to the bottom, snapshotting URLs at each tick so virtualised
  // DOM nodes are captured before they get removed.  Returns accumulated
  // URL array.  Stall threshold is intentionally generous (12 × 900ms =
  // 10.8 s) because Pinterest's lazy load can pause for several seconds.
  async function autoScrollAndCollect(setStatus) {
    const seen     = new Set();
    const urls     = [];
    const names    = new Map();
    const vidSeen  = new Set();
    const vidItems = [];
    return new Promise(resolve => {
      let lastH = 0, stall = 0;
      const t = setInterval(() => {
        snapshotPinUrls(seen, urls, names);            // grab current DOM before scroll
        snapshotVideoUrls(vidSeen, vidItems);
        window.scrollTo(0, document.body.scrollHeight);
        const h = document.body.scrollHeight;
        setStatus('scroll', urls.length + vidItems.length, 0);
        if (h === lastH) {
          stall++;
          if (stall >= 12) {
            snapshotPinUrls(seen, urls, names);        // final grab
            snapshotVideoUrls(vidSeen, vidItems);
            clearInterval(t);
            window.scrollTo(0, 0);
            resolve({ urls, names, vidItems });
          }
        } else {
          stall = 0;
          lastH = h;
        }
      }, 900);
    });
  }

  // ─── collect + scroll helpers (shared by both download modes) ──────
  async function collectAllPins(setStatus) {
    setStatus('scroll', 0, 0);
    return autoScrollAndCollect(setStatus);
  }

  // Fetch up to `concurrency` URLs in parallel, calling onProgress after each.
  async function fetchParallel(urls, concurrency, onProgress) {
    const results = new Array(urls.length).fill(null);
    let nextIdx = 0, finished = 0;
    async function worker() {
      while (nextIdx < urls.length) {
        const i = nextIdx++;
        try { results[i] = await fetchBinary(urls[i]); } catch (_) {}
        onProgress(++finished, urls.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
    return results;
  }

  // ─── Save all board images + videos as named downloads ──────────
  async function downloadBoardFolder(setStatus) {
    const { urls, names, vidItems } = await collectAllPins(setStatus);
    const totalItems = urls.length + vidItems.length;
    if (!totalItems) { alert('[Pinterest Power Menu] No images or videos found on this board.'); return; }

    // Use pin title only. If unavailable, use: "Pin - 12345678".
    function makeFileName(url, ext) {
      let pinName = stripKnownExt(sanitizeFilename(names.get(url) || ''));
      if (!pinName) pinName = makeFallbackPinName();
      if (pinName.length > 120) pinName = pinName.slice(0, 120).trimEnd();
      return `${pinName}${ext}`;
    }

    // ── Download board image files ────────────────────────────────
    const bufs = await fetchParallel(urls, 5, (done, _) =>
      setStatus('fetch', done, totalItems)
    );

    let saved = 0;
    for (let i = 0; i < bufs.length; i++) {
      const buf = bufs[i];
      if (!buf) continue;
      const ext      = detectFileType(new Uint8Array(buf));
      const fileName = makeFileName(urls[i], ext);
      try {
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(new Blob([buf]));
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
        await new Promise(r => setTimeout(r, 300));
        saved++;
      } catch (_) {}
      setStatus('fetch', saved, totalItems);
    }

    // ── Download videos ───────────────────────────────────────────
    for (const vi of vidItems) {
      const fallbackUrls = vi.channel === 'mc'
        ? [
            `https://v1.pinimg.com/videos/mc/720p/${vi.hash}.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t4.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t3.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t2.mp4`,
            `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t1.mp4`,
          ]
        : [`https://v1.pinimg.com/videos/iht/expMp4/${vi.hash}_720w.mp4`];
      const title = stripKnownExt(sanitizeFilename(vi.title || '')) || makeFallbackPinName();
      try {
        await downloadVideoFile(fallbackUrls, title, null);
        saved++;
      } catch (_) {}
      setStatus('fetch', saved, totalItems);
    }

    setStatus('done', saved, totalItems);
  }

  // ─── Board downloader button (lives inside #pe-settings-wrap) ───
  function removeBoardDownloaderUI() {
    // Remove button, menu, and any legacy outer wrapper
    ['pe-bd-btn', 'pe-bd-menu', 'pe-bd-fab'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { if (el._bdCleanup) el._bdCleanup(); el.remove(); }
    });
  }

  function createBoardDownloaderUI() {
    if (document.getElementById('pe-bd-fab')) return;
    if (!get('boardDownloader') || !isBoardPage()) return;
    removeBoardDownloaderUI();

    // Standalone fixed container — independent of #pe-settings-wrap to avoid
    // timing/race issues with the MutationObserver that calls this function.
    const fab = document.createElement('div');
    fab.id = 'pe-bd-fab';
    fab.setAttribute('data-pe-ui', 'true');

    // Popup menu (appears above the button)
    const menu = document.createElement('div');
    menu.id = 'pe-bd-menu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div id="pe-bd-status" style="display:none"></div>
      <button class="pe-bd-opt" id="pe-bd-folder">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 19v2h14v-2H5z"/>
        </svg>
        Download All
      </button>
    `;

    // Circular board download button
    const btn = document.createElement('button');
    btn.id = 'pe-bd-btn';
    btn.title = 'Download Board';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 19v2h14v-2H5z"/></svg>`;

    fab.appendChild(menu);
    fab.appendChild(btn);
    document.body.appendChild(fab);

    const status = menu.querySelector('#pe-bd-status');
    const dirBtn = menu.querySelector('#pe-bd-folder');

    let menuOpen = false;
    function toggleMenu() {
      menuOpen = !menuOpen;
      menu.style.display = menuOpen ? 'block' : 'none';
    }
    btn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });

    function onOutsideClick(e) {
      if (isPowerMenuEvent(e) && !fab.contains(e.target)) return;
      if (menuOpen && !fab.contains(e.target)) { menuOpen = false; menu.style.display = 'none'; }
    }
    document.addEventListener('click', onOutsideClick);
    // Store cleanup on fab so removeBoardDownloaderUI can detach the listener
    fab._bdCleanup = () => document.removeEventListener('click', onOutsideClick);

    function setStatus(phase, a, b) {
      if (phase === 'cancelled') {
        status.style.display = 'none';
        dirBtn.disabled = false;
        return;
      }
      status.style.display = 'block';
      if (phase === 'scroll')      status.textContent = `Scrolling… ${a} items found`;
      else if (phase === 'fetch')  status.textContent = `Saving ${a}/${b} (${b ? Math.round(a/b*100) : 0}%)`;
      else if (phase === 'done') {
        status.textContent = `✓ Done – ${a} files saved`;
        setTimeout(() => {
          status.style.display = 'none';
          dirBtn.disabled = false;
          menuOpen = false; menu.style.display = 'none';
        }, 3000);
      }
    }

    dirBtn.addEventListener('click', async () => {
      dirBtn.disabled = true;
      await downloadBoardFolder(setStatus);
    });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: QUICK DOWNLOAD HELPERS
  //  Reuses Pinterest video URLs for the row Download button.
  // ═══════════════════════════════════════════════════════════════════

  // Find the best downloadable video URL from a <video> element.
  // Checks all <source> elements and attributes; prefers direct MP4 over HLS.
  function findPinterestVideoSrc(vid) {
    const candidates = [];
    // Collect all <source> src attrs first (more reliable than currentSrc when HLS.js is active)
    vid.querySelectorAll('source').forEach(s => {
      const u = s.getAttribute('src') || s.getAttribute('data-src') || '';
      if (u) candidates.push(u);
    });
    // Then currentSrc / src attributes
    candidates.push(vid.currentSrc || '', vid.getAttribute('src') || '', vid.getAttribute('data-src') || '');
    // Prefer direct v1.pinimg.com MP4 (non-m3u8)
    for (const u of candidates) {
      if (/v1\.pinimg\.com\/videos/.test(u) && !/\.m3u8/.test(u)) return u;
    }
    // Fall back to any v1.pinimg.com URL (incl. HLS, so we can still extract hash)
    for (const u of candidates) {
      if (/v1\.pinimg\.com\/videos/.test(u)) return u;
    }
    return null;
  }

  // Download a video file with progress feedback.
  // Tries every URL in order; on any error (network, timeout, or non-2xx) moves to the next.
  // Mobile uses responseType:'blob' (streamed to disk) to avoid loading the whole file into RAM.
  function downloadVideoFile(urls, filename, onProgress) {
    return new Promise((resolve, reject) => {
      let idx = 0;
      function tryNext() {
        if (idx >= urls.length) { reject(new Error('all URLs failed')); return; }
        const url = urls[idx++];
        // settled + timer prevent double-calls when abort races with onerror/ontimeout
        let settled = false;
        let timer;
        function finish(fn) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        }
        const req = GM_xmlhttpRequest({
          method: 'GET', url,
          // blob for mobile — wider support on iOS/Android userscript managers than arraybuffer
          responseType: IS_MOBILE ? 'blob' : 'arraybuffer',
          // Spoof desktop UA so Pinterest CDN doesn't reject the request based on mobile UA
          headers: {
            'Referer':    location.href,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':     'video/mp4,video/*;q=0.9,*/*;q=0.8',
          },
          onprogress: e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); },
          onload: r => {
            if (r.status >= 200 && r.status < 300) {
              finish(() => {
                const base = stripKnownExt(sanitizeFilename(filename || '')) || makeFallbackPinName();
                const blob = IS_MOBILE ? r.response : new Blob([r.response], { type: 'video/mp4' });
                const a    = document.createElement('a');
                a.href     = URL.createObjectURL(blob);
                a.download = base + '.mp4';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
                resolve();
              });
            } else {
              finish(tryNext);
            }
          },
          onerror:   () => finish(tryNext),
          ontimeout: () => finish(tryNext),
        });
        // Manual 45s deadline — mobile connections sometimes hang indefinitely
        timer = setTimeout(() => finish(() => { try { req.abort(); } catch(_){} tryNext(); }), 45000);
      }
      tryNext();
    });
  }

  // When the XHR interceptor captures a video URL, lightly refresh the row button.
  // The button is already visible; this only helps late-rendered closeup rows.
  _onVideoUrlCapture = function () {
    if (!/\/pin\/\d/i.test(location.pathname)) return;
    if (IS_MOBILE) scheduleMobileCloseupActionButtonsRefresh();
    else if (supportsCloseupActionBarEnhancements() && !document.getElementById('pe-closeup-image-dl-slot'))
      setTimeout(createCloseupImageDownloadButton, 50);
  };


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: CUSTOM PINTEREST LOGO
  // ═══════════════════════════════════════════════════════════════════
  let _customLogoObs = null;
  let _customLogoRescan = null;

  function normalizeCustomLogoUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(url)) return url;
    return '';
  }

  function getCustomPinterestLogoSize() {
    const size = Number(get('customPinterestLogoSize'));
    return Number.isFinite(size) ? Math.max(8, Math.round(size)) : 32;
  }

  function getCustomPinterestLogoSizeFromInput(input) {
    const size = Number(input?.value);
    return Number.isFinite(size) ? Math.max(8, Math.round(size)) : 32;
  }

  function removeCustomPinterestLogo(root = document) {
    root.querySelectorAll?.('.pe-custom-logo-img').forEach(img => img.remove());
    root.querySelectorAll?.('[data-test-id="pinterest-logo-home-button"] svg').forEach(svg => {
      svg.style.removeProperty('display');
    });
  }

  function applyCustomPinterestLogo(root = document) {
    const url = normalizeCustomLogoUrl(get('customPinterestLogoUrl'));
    if (!url) {
      removeCustomPinterestLogo(root);
      return;
    }

    const buttons = root.querySelectorAll?.(
      '[data-test-id="pinterest-logo-home-button"] a[aria-label="Home"], ' +
      '[data-test-id="pinterest-logo-home-button"] [aria-label="Home"]'
    ) || [];
    const size = getCustomPinterestLogoSize();
    const circle = !!get('customPinterestLogoCircle');
    buttons.forEach(home => {
      const frame = home.querySelector('.VHreRh') || home.firstElementChild || home;
      frame.style.setProperty('--pe-custom-logo-size', size + 'px');
      frame.querySelectorAll('svg').forEach(svg => {
        svg.style.setProperty('display', 'none', 'important');
      });
      let img = frame.querySelector(':scope > .pe-custom-logo-img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'pe-custom-logo-img';
        img.alt = 'Home';
        frame.appendChild(img);
      }
      if (img.src !== url) img.src = url;
      img.style.setProperty('--pe-custom-logo-size', size + 'px');
      img.classList.toggle('pe-custom-logo-circle', circle);
    });
  }

  function stopCustomPinterestLogo() {
    if (_customLogoObs) { _customLogoObs.disconnect(); _customLogoObs = null; }
    removeCustomPinterestLogo(document);
  }

  function initCustomPinterestLogo() {
    if (IS_MOBILE) {
      stopCustomPinterestLogo();
      return;
    }
    const url = normalizeCustomLogoUrl(get('customPinterestLogoUrl'));
    if (!url) {
      stopCustomPinterestLogo();
      return;
    }
    applyCustomPinterestLogo(document);
    if (_customLogoObs) return;
    _customLogoRescan = debounce(() => applyCustomPinterestLogo(document), 250);
    _customLogoObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      _customLogoRescan();
    });
    _customLogoObs.observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS PANEL UI  –  circle gear FAB, popup above it
  // ═══════════════════════════════════════════════════════════════════
  const FEATURES = [
    { key: 'originalQuality', label: 'Original Quality',       desc: 'Full-res images instead of thumbnails',                    reload: true  },
    { key: 'downloadFixer',   label: 'Download Fixer',         desc: 'Proper filenames & format detection',                      reload: true  },
    { key: 'gifHover',        label: 'GIF Hover Play',         desc: 'GIFs play on hover, pause on leave',                       reload: false },
    { key: 'gifAutoPlay',     label: 'Auto-Play Visible GIFs', desc: 'Auto-play all GIFs on screen, stop when scrolled away',    reload: false },
    { key: 'videoAutoPlay',   label: 'Auto-Play Visible Videos', desc: 'Auto-play all pin videos on screen (muted), pause when scrolled away', reload: false },
    { key: 'infiniteLoopVideo', label: 'Loop Closeup Videos',  desc: 'Auto-replay closeup videos instead of showing the "Watch again" button', reload: false },
    { key: 'boardDownloader', label: 'Board Downloader',       desc: 'Download all images from the current board',              reload: true  },
    { key: 'declutter',       label: 'Declutter',              desc: 'Remove ads, quizzes, sponsored & shopping pins',           reload: false },
    { key: 'removeVideos',    label: 'Remove Videos',          desc: 'Remove all video pins from the feed',                      reload: false },
    { key: 'contextMenu',     label: 'Image Context Menu',     desc: 'Right-click pins to copy, open or save the original',      reload: false },
    { key: 'reverseImageSearchButton', label: 'Reverse Image Search Button', desc: 'Show reverse search providers above closeup images', reload: false },
  ];
  const VISIBLE_FEATURES = FEATURES;

  const DECLUTTER_FEATURES = [
    { key: 'declutterShopTheLook', label: 'Hide Shop The Look Modules', desc: 'Collapse Shop the Look shopping carousels and product modules', reload: false },
    { key: 'declutterSearchAdvisory', label: 'Hide Search Support Advisory', desc: 'Collapse Pinterest support advisory cards in search results', reload: false },
    { key: 'hideShopPosts', label: 'Hide Shop Posts', desc: 'Collapse pins from shops (Amazon, Etsy, eBay, TeePublic, Redbubble, AliExpress)', reload: false },
  ];

  const TRANSLATE_FEATURES = [
    { key: 'autoTranslateTitles', label: 'Translate Pin Titles', desc: 'Auto-translate visible closeup titles', reload: false },
    { key: 'autoTranslateDescriptions', label: 'Translate Pin Descriptions', desc: 'Auto-translate visible pin descriptions', reload: false },
    { key: 'autoTranslateComments', label: 'Translate Comments', desc: 'Auto-translate visible expanded comments', reload: false },
  ];

  const TRANSLATE_LANG_OPTIONS = [
    { value: 'browser', label: 'Browser default' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'zh', label: 'Chinese' },
  ];

  const TITLE_TRANSLATION_DISPLAY_OPTIONS = [
    { value: 'translated', label: 'Translated only', mode: 'translated-only' },
    { value: 'both', label: 'Original + translated', mode: 'original + translated' },
  ];

  const COMMENT_TRANSLATION_MODE_OPTIONS = [
    { value: 'visible', label: 'Visible comments only (current)' },
    { value: 'conservative', label: 'Conservative / fewer at once' },
  ];

  const DARK_MODE_OPTIONS = [
    { value: 'auto',  label: 'Auto (follow Pinterest)' },
    { value: 'light', label: 'Light' },
    { value: 'dark',  label: 'Dark' },
  ];

  const HIDE_FEATURES = [
    { key: 'hideVisitSite',  label: 'Hide Visit Site',          desc: 'Remove all "Visit site" buttons',                         reload: false },
    { key: 'hideUpdates',    label: 'Hide Updates Bell',        desc: 'Hide the Updates / notifications button',                 reload: false },
    { key: 'hideMessages',   label: 'Hide Messages Button',     desc: 'Hide the Messages / notifications button in the nav',     reload: false },
    { key: 'hideShare',      label: 'Hide Share Button',        desc: 'Hide the Share / Send button on pins',                    reload: false },
    { key: 'hideReactButton', label: 'Hide React Button',        desc: 'Hide the heart and reaction count above closeup images',  reload: false },
    { key: 'hideReactionCount', label: 'Hide Reaction Count',    desc: 'Hide only the numeric reaction count beside React',       reload: false },
    { key: 'hideUploadImageButton', label: 'Hide Upload Image Button', desc: 'Hide the Lens upload image button in search',      reload: false },
    { key: 'hideSearchImageButton', label: 'Hide Search Image Button', desc: 'Hide the visual search overlay button on images',  reload: false },
    { key: 'hideSearchSuggestions', label: 'Hide Search Suggestions', desc: 'Hide related search suggestion chips and cards',    reload: false },
    { key: 'hideViewLargerButton', label: 'Hide View Larger Button', desc: 'Hide the media viewer overlay button on images',     reload: false },
    { key: 'hideMoreOptionsButton', label: 'Hide More Options Button', desc: 'Hide the closeup More actions button',             reload: false },
    { key: 'hideReverseImageSearchButton', label: 'Hide Reverse Image Search Button', desc: 'Hide the custom reverse image search button', reload: false },
    { key: 'hideCommentButton', label: 'Hide Comment Button',   desc: 'Hide only the Comments button in action rows',           reload: false },
    { key: 'hideComments',   label: 'Hide Comment Section',     desc: 'Hide comment sections and comment input on pins',        reload: false },
    { key: 'hideCommentEmojiButton', label: 'Hide Comment Emoji Button', desc: 'Hide the emoji picker in comment composer',      reload: false },
    { key: 'hideCommentStickerButton', label: 'Hide Comment Sticker Button', desc: 'Hide the sticker picker in comment composer', reload: false },
    { key: 'hideCommentPhotoButton', label: 'Hide Comment Photo Button', desc: 'Hide the photo picker in comment composer',      reload: false },
  ];
  const VISIBLE_HIDE_FEATURES = IS_MOBILE ? HIDE_FEATURES.filter(f => f.key !== 'hideUploadImageButton') : HIDE_FEATURES;

  function escapeAttr(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function renderOptions(options, currentValue) {
    return options.map(opt =>
      `<option value="${opt.value}" data-mode="${opt.mode || ''}" ${currentValue === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('');
  }

  function createSettingsPanel() {
    if (document.getElementById('pe-settings-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'pe-settings-wrap';
    wrap.setAttribute('data-pe-ui', 'true');
    const customizeGroupHtml = IS_MOBILE ? '' : `
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-customize-hdr">
            <div class="pe-info">
              <span class="pe-name">Customize</span>
              <span class="pe-desc">Change the Pinterest logo image</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-customize-body" style="display:none">
            <div class="pe-row pe-sub-row pe-input-row">
              <div class="pe-info">
                <span class="pe-name">Pinterest Logo URL</span>
                <span class="pe-desc">Paste an image link, or clear it to restore</span>
              </div>
              <input id="pe-custom-logo-input" class="pe-setting-input" type="url" placeholder="https://example.com/logo.png" value="${escapeAttr(get('customPinterestLogoUrl'))}">
            </div>
            <div class="pe-row pe-sub-row pe-input-row">
              <div class="pe-info">
                <span class="pe-name">Logo Size</span>
                <span class="pe-desc">Pixel size for the custom logo</span>
              </div>
              <input id="pe-custom-logo-size" class="pe-setting-input pe-setting-number" type="number" min="8" step="1" value="${escapeAttr(getCustomPinterestLogoSize())}">
            </div>
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Circle Logo Crop</span>
                <span class="pe-desc">Crop boxy images into a round logo</span>
              </div>
              <label class="pe-switch">
                <input id="pe-custom-logo-circle" type="checkbox" data-key="customPinterestLogoCircle" data-reload="false" ${get('customPinterestLogoCircle') ? 'checked' : ''}>
                <span class="pe-knob"></span>
              </label>
            </div>
          </div>
        </div>`;
    wrap.innerHTML = `
      <div id="pe-settings-panel" style="display:none">
        <div id="pe-settings-title">Pinterest Power Menu <span id="pe-settings-by">By <a id="pe-settings-author" href="https://github.com/Angel2mp3" target="_blank" rel="noopener">Angel</a></span></div>
        ${VISIBLE_FEATURES.map(f => `
          <div class="pe-row">
            <div class="pe-info">
              <span class="pe-name">${f.label}</span>
              <span class="pe-desc">${f.desc}</span>
            </div>
            <label class="pe-switch">
              <input type="checkbox" data-key="${f.key}" data-reload="${f.reload}" ${get(f.key) ? 'checked' : ''}>
              <span class="pe-knob"></span>
            </label>
          </div>`).join('')}
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-declutter-hdr">
            <div class="pe-info">
              <span class="pe-name">Declutter Options</span>
              <span class="pe-desc">Extra cleanup controlled by Declutter</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-declutter-body" style="display:none">
            ${DECLUTTER_FEATURES.map(f => `
              <div class="pe-row pe-sub-row">
                <div class="pe-info">
                  <span class="pe-name">${f.label}</span>
                  <span class="pe-desc">${f.desc}</span>
                </div>
                <label class="pe-switch">
                  <input type="checkbox" data-key="${f.key}" data-reload="${f.reload}" ${get(f.key) ? 'checked' : ''}>
                  <span class="pe-knob"></span>
                </label>
              </div>`).join('')}
          </div>
        </div>
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-translate-hdr">
            <div class="pe-info">
              <span class="pe-name">Translate</span>
              <span class="pe-desc">Auto translation controls</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-translate-body" style="display:none">
            ${TRANSLATE_FEATURES.map(f => `
              <div class="pe-row pe-sub-row">
                <div class="pe-info">
                  <span class="pe-name">${f.label}</span>
                  <span class="pe-desc">${f.desc}</span>
                </div>
                <label class="pe-switch">
                  <input type="checkbox" data-key="${f.key}" data-reload="${f.reload}" ${get(f.key) ? 'checked' : ''}>
                  <span class="pe-knob"></span>
                </label>
              </div>`).join('')}
            <div class="pe-row pe-sub-row pe-select-row">
              <div class="pe-info">
                <span class="pe-name">Target Language</span>
                <span class="pe-desc">Browser language by default</span>
              </div>
              <select class="pe-setting-select" data-key="autoTranslateTarget">
                ${renderOptions(TRANSLATE_LANG_OPTIONS, get('autoTranslateTarget'))}
              </select>
            </div>
            <div class="pe-row pe-sub-row pe-select-row">
              <div class="pe-info">
                <span class="pe-name">Title Display</span>
                <span class="pe-desc">Choose translated-only or original + translated</span>
              </div>
              <select class="pe-setting-select" data-key="titleTranslationDisplay">
                ${renderOptions(TITLE_TRANSLATION_DISPLAY_OPTIONS, get('titleTranslationDisplay'))}
              </select>
            </div>
            <div class="pe-row pe-sub-row pe-select-row">
              <div class="pe-info">
                <span class="pe-name">Comment Translation Mode</span>
                <span class="pe-desc">Control how aggressively comments are queued</span>
              </div>
              <select class="pe-setting-select" data-key="autoTranslateCommentMode">
                ${renderOptions(COMMENT_TRANSLATION_MODE_OPTIONS, get('autoTranslateCommentMode'))}
              </select>
            </div>
          </div>
        </div>
        ${customizeGroupHtml}
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-hide-hdr">
            <div class="pe-info">
              <span class="pe-name">Hide UI Elements</span>
              <span class="pe-desc">Hide buttons & interface elements</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-hide-body" style="display:none">
            ${VISIBLE_HIDE_FEATURES.map(f => `
              <div class="pe-row pe-sub-row">
                <div class="pe-info">
                  <span class="pe-name">${f.label}</span>
                  <span class="pe-desc">${f.desc}</span>
                </div>
                <label class="pe-switch">
                  <input type="checkbox" data-key="${f.key}" data-reload="${f.reload}" ${get(f.key) ? 'checked' : ''}>
                  <span class="pe-knob"></span>
                </label>
              </div>`).join('')}
          </div>
        </div>
        <div class="pe-row pe-select-row">
          <div class="pe-info">
            <span class="pe-name">Dark Mode</span>
            <span class="pe-desc">Appearance of the settings panel and FAB</span>
          </div>
          <select class="pe-setting-select" data-key="darkMode">
            ${renderOptions(DARK_MODE_OPTIONS, get('darkMode'))}
          </select>
        </div>
        <div id="pe-notice" style="display:none">
          <span>↺ Reload to apply</span>
          <button id="pe-reload-btn">Reload now</button>
        </div>
      </div>
      <button id="pe-settings-btn" title="Pinterest Power Menu Settings">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
          <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.36.07-.72.07-1.08s-.03-.73-.07-1.08l2.32-1.82c.21-.16.27-.45.13-.69l-2.2-3.81a.51.51 0 0 0-.63-.22l-2.74 1.1c-.57-.44-1.18-.81-1.85-1.09l-.42-2.91A.51.51 0 0 0 13.5 1h-3c-.27 0-.5.19-.54.46l-.41 2.91c-.67.28-1.28.64-1.85 1.09L4.97 4.37a.51.51 0 0 0-.63.22L2.14 8.4c-.14.24-.08.53.13.69l2.32 1.82C4.55 11.27 4.5 11.63 4.5 12s.04.73.09 1.08l-2.32 1.82c-.21.16-.27.45-.13.69l2.2 3.81c.13.24.42.32.63.22l2.74-1.1c.57.44 1.18.8 1.85 1.09l.41 2.91c.04.27.27.46.54.46h3c.27 0 .5-.19.54-.46l.41-2.91c.67-.28 1.28-.65 1.85-1.09l2.74 1.1a.5.5 0 0 0 .63-.22l2.2-3.81c.14-.24.08-.53-.13-.69z"/>
        </svg>
      </button>
    `;
    document.body.appendChild(wrap);

    const panel  = wrap.querySelector('#pe-settings-panel');
    const btn    = wrap.querySelector('#pe-settings-btn');
    let panelOpen = false;

    function stopSettingsPanelEventBubble(e) {
      e.stopPropagation();
    }

    function togglePanel() {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'block' : 'none';
      btn.classList.toggle('pe-settings-open', panelOpen);
    }
    panel.addEventListener('wheel', stopSettingsPanelEventBubble, { passive: true });
    panel.addEventListener('touchmove', stopSettingsPanelEventBubble, { passive: true });
    wrap.addEventListener('click', stopSettingsPanelEventBubble);
    wrap.addEventListener('pointerdown', stopSettingsPanelEventBubble);
    wrap.addEventListener('touchstart', stopSettingsPanelEventBubble, { passive: true });
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
    document.addEventListener('click', e => {
      if (panelOpen && !wrap.contains(e.target)) { panelOpen = false; panel.style.display = 'none'; btn.classList.remove('pe-settings-open'); }
    });

    // Collapsible settings groups
    const declutterHdr  = wrap.querySelector('#pe-group-declutter-hdr');
    const declutterBody = wrap.querySelector('#pe-group-declutter-body');
    declutterHdr.addEventListener('click', () => {
      const open = declutterBody.style.display !== 'none';
      declutterBody.style.display = open ? 'none' : 'block';
      declutterHdr.classList.toggle('pe-group-open', !open);
    });

    const translateHdr  = wrap.querySelector('#pe-group-translate-hdr');
    const translateBody = wrap.querySelector('#pe-group-translate-body');
    translateHdr.addEventListener('click', () => {
      const open = translateBody.style.display !== 'none';
      translateBody.style.display = open ? 'none' : 'block';
      translateHdr.classList.toggle('pe-group-open', !open);
    });

    const customizeHdr  = wrap.querySelector('#pe-group-customize-hdr');
    const customizeBody = wrap.querySelector('#pe-group-customize-body');
    if (customizeHdr && customizeBody) {
      customizeHdr.addEventListener('click', () => {
        const open = customizeBody.style.display !== 'none';
        customizeBody.style.display = open ? 'none' : 'block';
        customizeHdr.classList.toggle('pe-group-open', !open);
      });
    }

    const hideHdr  = wrap.querySelector('#pe-group-hide-hdr');
    const hideBody = wrap.querySelector('#pe-group-hide-body');
    hideHdr.addEventListener('click', () => {
      const open = hideBody.style.display !== 'none';
      hideBody.style.display = open ? 'none' : 'block';
      hideHdr.classList.toggle('pe-group-open', !open);
    });

    // Toggle switches
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.key;
        set(key, cb.checked);
        if (key === 'hideVisitSite') applyVisitSiteToggle();
        if (key === 'gifHover') { pauseActiveGif(); document.querySelectorAll('video').forEach(pauseVidOnAdd); }
        if (key === 'gifAutoPlay') { if (cb.checked) initGifAutoPlay(); else stopGifAutoPlay(); }
        if (key === 'videoAutoPlay') {
          if (cb.checked) initVideoAutoPlay();
          else { stopVideoAutoPlay(); document.querySelectorAll('video').forEach(pauseVidOnAdd); }
        }
        if (key === 'infiniteLoopVideo') {
          applyInfiniteLoopVideoToggle();
          if (cb.checked) initInfiniteLoopVideo(); else stopInfiniteLoopVideo();
        }
        if (key === 'declutter') { applyDeclutterToggle(); if (cb.checked) { hideShopTheLookModules(document); hideDeclutterMobileInlineVisitButtons(document); initDeclutter(); if (get('hideShopPosts')) initHideShopPosts(); } else stopHideShopPosts({ restore: true }); }
        if (key === 'declutterShopTheLook') { applyDeclutterToggle(); if (get('declutter')) hideShopTheLookModules(document); }
        if (key === 'declutterSearchAdvisory') applyDeclutterToggle();
        if (key === 'removeVideos') { if (cb.checked) initRemoveVideos(); }
        if (key === 'contextMenu') { if (cb.checked) initImageContextMenu(); else stopImageContextMenu(); }
        if (key === 'hideUpdates' || key === 'hideMessages' || key === 'hideShare' || key === 'hideReactButton' || key === 'hideUploadImageButton' || key === 'hideSearchImageButton' || key === 'hideViewLargerButton' || key === 'hideMoreOptionsButton' || key === 'hideReverseImageSearchButton' || key === 'hideCommentButton') {
          applyNavToggles();
          scheduleMobileCloseupActionButtonsRefresh();
        }
        if (key === 'hideReactionCount' || key === 'hideSearchSuggestions' || key === 'hideCommentEmojiButton' || key === 'hideCommentStickerButton' || key === 'hideCommentPhotoButton') {
          applyNavToggles();
          scheduleMobileCloseupActionButtonsRefresh();
        }
        if (key === 'hideMessages' && cb.checked) initMessagesRemover();
        if (key === 'hideShopPosts') { if (cb.checked && get('declutter')) initHideShopPosts(); else stopHideShopPosts({ restore: true }); }
        if (key === 'hideComments') { applyNavToggles(); if (cb.checked) initHideComments(); }
        if (TRANSLATE_FEATURES.some(f => f.key === key)) refreshTranslationFeatures();
        if (key === 'reverseImageSearchButton') { if (cb.checked) initReverseImageSearchButton(); else { removeReverseImageSearchButton(); scheduleMobileCloseupActionButtonsRefresh(); } }
        if (key === 'hideReverseImageSearchButton') { if (cb.checked) removeReverseImageSearchButton(); else if (get('reverseImageSearchButton')) initReverseImageSearchButton(); scheduleMobileCloseupActionButtonsRefresh(); }
        if (key === 'customPinterestLogoCircle') initCustomPinterestLogo();
        if (cb.dataset.reload === 'true')
          wrap.querySelector('#pe-notice').style.display = 'flex';
      });
    });

    wrap.querySelectorAll('.pe-setting-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const k = sel.dataset.key;
        set(k, sel.value);
        if (k === 'darkMode') applyDarkMode();
        else refreshTranslationFeatures();
      });
    });

    const logoInput = wrap.querySelector('#pe-custom-logo-input');
    if (logoInput) {
      const saveLogoUrl = debounce(() => {
        set('customPinterestLogoUrl', logoInput.value.trim());
        initCustomPinterestLogo();
      }, 350);
      logoInput.addEventListener('input', saveLogoUrl);
      logoInput.addEventListener('change', () => {
        set('customPinterestLogoUrl', logoInput.value.trim());
        initCustomPinterestLogo();
      });
    }

    const logoSizeInput = wrap.querySelector('#pe-custom-logo-size');
    if (logoSizeInput) {
      const saveLogoSize = debounce(() => {
        set('customPinterestLogoSize', getCustomPinterestLogoSizeFromInput(logoSizeInput));
        initCustomPinterestLogo();
      }, 150);
      logoSizeInput.addEventListener('input', saveLogoSize);
      logoSizeInput.addEventListener('change', () => {
        set('customPinterestLogoSize', getCustomPinterestLogoSizeFromInput(logoSizeInput));
        initCustomPinterestLogo();
      });
    }

    wrap.querySelector('#pe-reload-btn').addEventListener('click', () => location.reload());
    applyDarkMode();
  }

  let _peDarkMql = null;
  let _peDarkObs = null;

  function isPinterestDarkTheme() {
    const html = document.documentElement;
    if (!html) return false;
    const scheme = html.getAttribute('data-color-scheme') || html.getAttribute('data-theme') || '';
    if (/dark/i.test(scheme)) return true;
    if (html.classList && (html.classList.contains('darkMode') || html.classList.contains('dark-mode') || html.classList.contains('dark'))) return true;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
  }

  function applyDarkMode() {
    const wrap = document.getElementById('pe-settings-wrap');
    if (!wrap) return;
    const mode = get('darkMode');
    let dark = false;
    if (mode === 'dark') dark = true;
    else if (mode === 'auto') dark = isPinterestDarkTheme();
    wrap.classList.toggle('pe-dark', dark);

    if (!_peDarkMql) {
      try {
        _peDarkMql = window.matchMedia('(prefers-color-scheme: dark)');
        _peDarkMql.addEventListener('change', () => { if (get('darkMode') === 'auto') applyDarkMode(); });
      } catch (_) {}
    }
    if (!_peDarkObs) {
      _peDarkObs = new MutationObserver(() => { if (get('darkMode') === 'auto') applyDarkMode(); });
      _peDarkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme', 'data-theme', 'class'] });
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: IMAGE RIGHT-CLICK CONTEXT MENU
  // ═══════════════════════════════════════════════════════════════════
  // Intercepts right-clicks on (or near) any pinimg.com image and shows
  // a custom menu with options to copy/save the original-quality version.
  // Replaces the native browser menu only when a Pinterest image is
  // under the cursor; other right-clicks fall through normally.

  let _imageContextMenuStop = null;

  function initImageContextMenu() {
    // The custom context menu is mouse-only. On mobile the long-press handler
    // would compete with native browser actions (text selection, system menus),
    // so we skip the entire module on touch devices.
    if (IS_MOBILE) return;
    if (_imageContextMenuStop || !get('contextMenu')) return;

    let _ctxMenu = null;
    let _cleanupCtxMenu = null;

    function removeCtxMenu() {
      if (_cleanupCtxMenu) _cleanupCtxMenu();
      if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
    }

    function getMediaInfo(target) {
      let card = target.closest ? target.closest('[data-test-id="pin"], [data-grid-item="true"], [data-test-id="pin-closeup-image"], .PinCard') : null;
      let wrap = target.closest ? target.closest('[data-test-id="pinWrapper"], [data-test-id="pin-closeup-image"]') : null;
      let title = extractPinTitleFromScope(card || wrap);

      if (wrap) {
        // Video
        const vid = wrap.querySelector('video');
        if (vid) {
          const src = vid.src || (vid.querySelector('source') && vid.querySelector('source').src);
          if (src && !/i\.pinimg\.com/.test(src)) return { url: getHighestQualityVideoUrl(src), type: 'video', title };
        }
      }

      // Try finding nearest image
      let img = target;
      for (let i = 0; i < 15 && img && img !== document.body; i++) {
        if (img.tagName === 'IMG' && img.src && /pinimg\.com/i.test(img.src)) {
          break;
        }
        img = img.parentElement;
      }
      
      if (!img || img.tagName !== 'IMG' || !/pinimg\.com/i.test(img.src)) {
        if (wrap) {
           img = wrap.querySelector('img[src*="pinimg.com"]');
        } else if (card) {
           img = card.querySelector('img[src*="pinimg.com"]');
        } else {
           img = null;
        }
      }

      if (!img) return null;

      // Now determine if it's a GIF or Image
      // 1. Is it actively playing a GIF? (hover/auto-play swaps src)
      if (/\.gif(\?|$)/i.test(img.src)) {
        return { url: img.src, type: 'gif', title };
      }
      
      // 2. Does it have a GIF in its original srcset?
      const origSrcset = img.__peAutoOrigSrcset || img.getAttribute('srcset') || '';
      for (const part of origSrcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url && /\.gif(\?|$)/i.test(url)) return { url: url, type: 'gif', title };
      }

      // Otherwise, it's a standard image. Return original quality URL.
      return { url: getBestUrl(img), type: 'image', title };
    }

    // Return the best original-quality URL for an img element.
    function getBestUrl(img) {
      const base = img.__peAutoOrigSrc || img.src;
      const m = base.match(OQ_RE);
      return m ? m[1] + '/originals' + m[2] : base;
    }

    async function copyMediaToClipboard(origUrl, type) {
      const fallbackToText = () => copyTextToClipboard(origUrl);

      if (type === 'video' || type === 'gif') {
        // We cannot reliably put video or animated gif binaries into the OS clipboard 
        // without causing bugs like Discord pasting "message.txt".
        // Instead, copy the direct URL so it auto-embeds natively.
        fallbackToText();
        return;
      }

      const buf  = await fetchBinary(origUrl);
      const arr  = new Uint8Array(buf);
      const ext  = detectFileType(arr);
      const mime = ext === '.png' ? 'image/png'
                 : ext === '.gif' ? 'image/gif'
                 : ext === '.webp' ? 'image/webp'
                 : 'image/jpeg';

      if (mime === 'image/gif' || mime === 'image/webp') {
        fallbackToText();
        return;
      }

      let blob = new Blob([buf], { type: mime });

      if (mime !== 'image/png') {
        blob = await new Promise(res => {
          const bUrl = URL.createObjectURL(blob);
          const tmp  = new Image();
          tmp.crossOrigin = 'anonymous';
          tmp.onload = () => {
            const cv = document.createElement('canvas');
            cv.width  = tmp.naturalWidth;
            cv.height = tmp.naturalHeight;
            cv.getContext('2d').drawImage(tmp, 0, 0);
            cv.toBlob(b => { URL.revokeObjectURL(bUrl); res(b); }, 'image/png');
          };
          tmp.onerror = () => { URL.revokeObjectURL(bUrl); res(null); };
          tmp.src = bUrl;
        });
      }

      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch (_) {
          fallbackToText();
        }
      } else {
        fallbackToText();
      }
    }

    // Long-press state for mobile context menu
    let _lpJustShown = false;
    let _lpTimer     = null;
    let _lpScrolled  = false;
    let _lpStartX = 0, _lpStartY = 0;

    // Extracted so both right-click and long-press can reuse the same menu logic.
    // isTouch = true adds a longer grace period before outside-click dismissal,
    // preventing the finger-lift tap from instantly closing the menu.
    function showCtxMenuAt(x, y, media, isTouch) {
      removeCtxMenu();
      const { url: origUrl, type, title } = media;
      const menuX = Math.min(x, window.innerWidth  - 236);
      const menuY = Math.min(y, window.innerHeight - 200);

      const menu = document.createElement('div');
      menu.id = 'pe-ctx-menu';
      menu.style.cssText = `left:${menuX}px;top:${menuY}px`;

      function addItem(svgD, label, action) {
        const item = document.createElement('button');
        item.className = 'pe-ctx-item';
        item.innerHTML =
          `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">${svgD}</svg>` +
          `<span>${label}</span>`;
        item.addEventListener('click', e => { e.stopPropagation(); action(); removeCtxMenu(); });
        menu.appendChild(item);
      }

      // ── Copy media ──────────────────────────────────────────────────
      addItem(
        '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        'Copy Original Media',
        async () => {
          try {
            await copyMediaToClipboard(origUrl, type);
          } catch (_) {}
        }
      );

      // ── Copy URL ────────────────────────────────────────────────────
      addItem(
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        'Copy Media URL',
        () => { copyTextToClipboard(origUrl); }
      );

      // ── Open in new tab ─────────────────────────────────────────────
      addItem(
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
        'Open Media in New Tab',
        () => window.open(origUrl, '_blank', 'noopener')
      );

      // ── Save / download ─────────────────────────────────────────────
      addItem(
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        'Save Original Media',
        () => downloadSingle(origUrl, title)
      );

      _ctxMenu = menu;
      document.body.appendChild(menu);

      const onClose = ev => {
        if (menu.contains(ev.target)) return;
        removeCtxMenu();
      };

      const onEsc = ev => {
        if (ev.key === 'Escape') removeCtxMenu();
      };

      _cleanupCtxMenu = () => {
        document.removeEventListener('click',       onClose);
        document.removeEventListener('contextmenu', onClose);
        document.removeEventListener('keydown',     onEsc);
        _cleanupCtxMenu = null;
      };

      // On touch, use a longer delay so the finger-lift tap doesn't
      // immediately close the menu before the user can read it.
      setTimeout(() => {
        if (!_cleanupCtxMenu) return;
        document.addEventListener('click',       onClose);
        document.addEventListener('contextmenu', onClose);
        document.addEventListener('keydown',     onEsc);
      }, isTouch ? 300 : 0);
    }

    const onContextMenu = e => {
      if (isPowerMenuEvent(e)) return;
      if (!get('contextMenu')) { removeCtxMenu(); return; }
      // Suppress native contextmenu on Android when our long-press already fired
      if (_lpJustShown) { e.preventDefault(); return; }
      const media = getMediaInfo(e.target);
      if (!media) { removeCtxMenu(); return; }
      e.preventDefault();
      showCtxMenuAt(e.clientX, e.clientY, media, false);
    };

    const onTouchStart = e => {
      if (!get('contextMenu')) return;
      const touch = e.touches[0];
      _lpStartX   = touch.clientX;
      _lpStartY   = touch.clientY;
      _lpScrolled = false;
      clearTimeout(_lpTimer);
      _lpTimer = setTimeout(() => {
        _lpTimer = null;
        if (_lpScrolled) return;
        const el = document.elementFromPoint(_lpStartX, _lpStartY);
        if (!el) return;
        const media = getMediaInfo(el);
        if (!media) return;
        // Prevent the Android contextmenu event (fired ~20 ms later) from
        // duplicating the menu we're about to show.
        _lpJustShown = true;
        setTimeout(() => { _lpJustShown = false; }, 400);
        showCtxMenuAt(_lpStartX, _lpStartY, media, true);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 600);
    };

    const onTouchMove = e => {
      if (_lpScrolled) return;
      const touch = e.changedTouches[0];
      if (Math.abs(touch.clientX - _lpStartX) > 10 || Math.abs(touch.clientY - _lpStartY) > 10) {
        _lpScrolled = true;
        clearTimeout(_lpTimer);
        _lpTimer = null;
      }
    };

    const onTouchEnd = () => {
      clearTimeout(_lpTimer);
      _lpTimer = null;
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    _imageContextMenuStop = () => {
      removeCtxMenu();
      clearTimeout(_lpTimer);
      _lpTimer = null;
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      _imageContextMenuStop = null;
    };
  }

  function stopImageContextMenu() {
    if (_imageContextMenuStop) _imageContextMenuStop();
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: MOBILE LAZY-LOAD FIX
  // ═══════════════════════════════════════════════════════════════════
  // Pinterest on mobile aggressively defers image loading via loading="lazy"
  // and data-src attributes. On large feeds or slow devices many images that
  // are already visible on screen never actually load.
  // Uses IntersectionObserver with a generous 600 px rootMargin so images
  // are fetched well before reaching the viewport edge.
  // Also force-copies data-src → src for GIF images that are already
  // visible but whose lazy-loader hasn't fired yet.
  function initMobileLazyFix() {
    if (!IS_MOBILE) return;

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;

        if (el.tagName === 'IMG') {
          // Lift native lazy-loading so the browser fetches immediately
          if (el.getAttribute('loading') === 'lazy') el.setAttribute('loading', 'eager');
          // Copy data-src → src if Pinterest's own lazy-loader hasn't fired yet
          const ds = el.getAttribute('data-src');
          if (ds && (!el.src || el.src === location.href)) el.src = ds;
          io.unobserve(el);
          return;
        }

        if (el.tagName === 'VIDEO') {
          // Mobile GIFs are often <video> with lazy data-src values.
          hydrateVideoSource(el);
          el.preload = 'auto';
          el.playsInline = true;
          if (el.readyState === 0) {
            try { el.load(); } catch (_) {}
          }
          // Mark as GIF-video when applicable so GIF modules can manage it.
          if (isGifVideo(el, findGifContainer(el))) el.__peGifVid = true;
          io.unobserve(el);
        }
      });
    }, { rootMargin: '600px 0px', threshold: 0 });

    function observeMedia(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('img[loading="lazy"], img[data-src*="pinimg.com"], video').forEach(el => {
        // Only observe videos that look like Pinterest GIF media.
        if (el.tagName === 'VIDEO') {
          const hasLazySource = !!el.querySelector('source[data-src]');
          const src = getVideoSrc(el);
          if (!hasLazySource && !/pinimg\.com/i.test(src)) return;
        }
        if (el.__peLazyObs) return;
        el.__peLazyObs = true;
        io.observe(el);
      });
    }

    observeMedia(document);

    new MutationObserver(records => {
      records.forEach(r => r.addedNodes.forEach(n => {
        if (!n || n.nodeType !== 1) return;
        if (n.tagName === 'IMG') {
          if (!n.__peLazyObs) { n.__peLazyObs = true; io.observe(n); }
        } else if (n.tagName === 'VIDEO') {
          const hasLazySource = !!n.querySelector('source[data-src]');
          const src = getVideoSrc(n);
          if ((hasLazySource || /pinimg\.com/i.test(src)) && !n.__peLazyObs) {
            n.__peLazyObs = true;
            io.observe(n);
          }
        } else {
          observeMedia(n);
        }
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  STYLES
  // ═══════════════════════════════════════════════════════════════════
  function injectStyles() {
    const s = document.createElement('style');
    s.id = 'pe-styles';
    s.textContent = `
      /* ──────── Theme variables (settings panel + FAB) ──────── */
      #pe-settings-wrap {
        --pe-bg:            #fff;
        --pe-surface:       #fafafa;
        --pe-text:          #111;
        --pe-text-muted:    #767676;
        --pe-border:        #f2f2f2;
        --pe-row-hover:     #f5f5f5;
        --pe-accent:        #e60023;
        --pe-accent-hover:  #b5001b;
        --pe-knob-off:      #d1d1d1;
        --pe-input-bg:      #fff;
        --pe-input-border:  #ddd;
        --pe-notice-bg:     #fff9e6;
        --pe-notice-border: #ffe180;
        --pe-notice-text:   #7a5800;
        --pe-title-text:    #fff;
        color: var(--pe-text);
      }
      #pe-settings-wrap.pe-dark {
        --pe-bg:            #1e1e1e;
        --pe-surface:       #2a2a2a;
        --pe-text:          #e8e8e8;
        --pe-text-muted:    #9a9a9a;
        --pe-border:        rgba(255,255,255,.08);
        --pe-row-hover:     #333;
        --pe-accent:        #e60023;
        --pe-accent-hover:  #ff3355;
        --pe-knob-off:      #555;
        --pe-input-bg:      #2a2a2a;
        --pe-input-border:  #444;
        --pe-notice-bg:     #332b00;
        --pe-notice-border: #665500;
        --pe-notice-text:   #ffd54f;
      }

      /* ──────── Fix browser flash of black on <video> elements ──────── */
      video { background: transparent !important; }

      /* ──────── Hide Pinterest "Watch again" overlay when looping ──────── */
      body.pe-loop-video [data-test-id="story-pin-closeup-replay"],
      body.pe-loop-video [data-test-id="closeup-replay-button"],
      body.pe-loop-video [aria-label="Watch again"],
      body.pe-loop-video [aria-label="Replay"] {
        display: none !important;
      }
      /* Mobile end-screen: the desktop selectors above only kill the button.
         Mobile renders a full-cover overlay (a still <img>, a black backdrop,
         and a Share + Watch-again row) that the JS ended-event fallback drops
         by replaying — but collapse the whole overlay so it never flashes.
         Identified by the unique pairing of a Watch-again AND a Share control,
         scoped under the known closeup containers so it can't escape upward.
         pointer-events:none keeps any momentary frame non-interactive. */
      body.pe-loop-video :is(
        [data-test-id="visual-content-container"],
        [data-test-id="story-pin-video-block"],
        [data-test-id="closeup-body-image-container"],
        [data-test-id="pin-closeup-image"],
        [data-video-signature]
      ) div:has(> * [aria-label="Watch again"]):has(> * [aria-label="Share"]) {
        display: none !important;
        pointer-events: none !important;
      }

      /* ──────── Always hide "Open app" search autocomplete suggestions ──────── */
      [data-test-type="app_upsell_autocomplete"] { display: none !important; }

      /* ──────── Hide Visit Site ──────── */
      body.pe-hide-visit [data-test-id="visit-button"],
      body.pe-hide-visit .domain-link-button,
      body.pe-hide-visit [aria-label="Visit site"],
      body.pe-hide-visit a[rel="nofollow"][href*="://"] {
        display: none !important;
      }

      /* ──────── Hide Updates bell ──────── */
      body.pe-hide-updates [role="listitem"]:has([data-test-id="bell-icon"]),
      body.pe-hide-updates [data-test-id="bell-icon"] {
        display: none !important;
      }

      /* ──────── Hide Messages nav button ──────── */
      body.pe-hide-messages [role="listitem"]:has(div[aria-label="Messages"]),
      body.pe-hide-messages [role="listitem"]:has([data-test-id="nav-bar-speech-ellipsis"]),
      body.pe-hide-messages div[aria-label="Messages"],
      body.pe-hide-messages [data-test-id="notifications-button"],
      body.pe-hide-messages [data-test-id="nav-bar-speech-ellipsis"],
      body.pe-hide-messages a[href="/notifications/"] {
        display: none !important;
      }

      /* ──────── Hide Share / Send button ──────── */
      body.pe-hide-share [data-test-id="mobile-modal-heading"]:has(.WuRgKB),
      body.pe-hide-share .H2DtUH:has(a[aria-label^="Share via"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="copy-link-share-icon"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="copy-link-share-icon-auth"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="message-share-button"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="fbmessenger-share-icon"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="whatsapp-share-icon"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="facebook-share-icon"]),
      body.pe-hide-share .H2DtUH:has([data-test-id="twitter-share-icon"]),
      body.pe-hide-share .BVzdUh.Nt6yCq.i1hWBD:has(> hr.V619SU.FlxG2v),
      body.pe-hide-share [data-test-id="closeup-action-items"] .oRZ5_s:has([data-test-id="closeup-share-button"]),
      body.pe-hide-share [data-test-id="closeup-action-items"] .oRZ5_s:has(button[aria-label*="Share" i]),
      body.pe-hide-share [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="share-button-group"]),
      body.pe-hide-share [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="share-button-no-animation"]),
      body.pe-hide-share [role="listitem"]:has([data-test-id="sendPinButton"]),
      body.pe-hide-share [data-test-id="closeup-share-button"],
      body.pe-hide-share div[aria-label="Share"],
      body.pe-hide-share button[aria-label="Send"],
      body.pe-hide-share [data-test-id="sendPinButton"],
      body.pe-hide-share [aria-label="Send"][role="button"],
      body.pe-hide-share [data-test-id="share-button-no-animation"],
      body.pe-hide-share [style*="ANIMATE_SHARE_container"] {
        display: none !important;
      }

      /* ──────── Hide closeup React heart ──────── */
      body.pe-hide-react [data-test-id="closeup-action-items"] .oRZ5_s:has([data-test-id="react-button"]),
      body.pe-hide-react [data-test-id="closeup-action-items"] [role="listitem"]:has(button[data-test-id="react-button"]),
      body.pe-hide-react [data-test-id="closeup-action-items"] [role="listitem"]:has(button[aria-label="React"][aria-pressed]),
      body.pe-hide-react [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="react-button"]),
      body.pe-hide-react [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="reaction-count"]),
      body.pe-hide-react [data-test-id="closeup-action-items"] [data-test-id="reactions-count"] {
        display: none !important;
      }

      body.pe-hide-reaction-count [data-test-id="closeup-action-items"] [data-test-id="reactions-count"],
      body.pe-hide-reaction-count [data-test-id="closeup-pin-action-items"] [data-test-id="reactions-count"] {
        display: none !important;
      }

      body.pe-hide-search-suggestions [data-root-margin="search-one-bar"] .oRZ5_s:has([data-test-id="one-bar-module-3"]),
      body.pe-hide-search-suggestions [data-test-id="scrollable-one-bar-root"] .oRZ5_s:has([data-test-id="one-bar-module-3"]) {
        display: none !important;
      }

      body.pe-hide-search-suggestions div[role="listitem"]:has([data-test-id="search-suggestion"]),
      body.pe-hide-search-suggestions div[data-grid-item="true"]:has([data-test-id="search-suggestion"]) {
        height: 0 !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        opacity: 0 !important;
        min-height: 0 !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }

      /* ──────── Hide Lens upload image button ──────── */
      body.pe-hide-upload-image [aria-label="Upload image"] {
        display: none !important;
      }

      /* ──────── Hide closeup overlay/action buttons ──────── */
      body.pe-hide-search-image [data-test-id="visual-search-icon"],
      body.pe-hide-search-image [data-test-id="closeup-image-overlay-layer-flashlight-button"],
      body.pe-hide-search-image [data-test-id="flashlight"],
      body.pe-hide-search-image [aria-label="Search image"][role="button"],
      body.pe-hide-search-image [data-test-id="shop-button"] {
        display: none !important;
      }
      body.pe-hide-view-larger [data-test-id="closeup-image-overlay-layer-media-viewer-button-overlay"],
      body.pe-hide-view-larger [aria-label="View larger"][role="button"],
      body.pe-hide-view-larger [data-test-id="media-viewer-button"] {
        display: none !important;
      }
      body.pe-hide-more-options [data-test-id="closeup-action-items"] .oRZ5_s:has([data-test-id="closeup-more-options"]),
      body.pe-hide-more-options [data-test-id="closeup-action-items"] .oRZ5_s:has(button[aria-label="More actions"]),
      body.pe-hide-more-options [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="context-menu-button"]),
      body.pe-hide-more-options [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="ellipsis-button"]),
      body.pe-hide-more-options [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="more-actions-button"]),
      body.pe-hide-more-options [data-test-id="closeup-more-options"] {
        display: none !important;
      }
      body.pe-hide-reverse-image-search #pe-reverse-image-search-slot {
        display: none !important;
      }

      /* ──────── Hide Comments ──────── */
      body.pe-hide-comments #canonical-card,
      body.pe-hide-comments [data-test-id="comment-editor-container"],
      body.pe-hide-comments [data-test-id="editor-with-mentions"],
      body.pe-hide-comments #dweb-comment-editor-container,
      body.pe-hide-comments #mweb-comment-editor-container,
      body.pe-hide-comments [data-test-id="closeup-metadata-details-divider"] {
        display: none !important;
      }

      body.pe-hide-comment-emoji [data-test-id="inline-comment-composer-container"] [data-test-id="emoji-selector"],
      body.pe-hide-comment-sticker [data-test-id="inline-comment-composer-container"] button[aria-label="Select a sticker"],
      body.pe-hide-comment-photo [data-test-id="inline-comment-composer-container"] button[aria-label="Select a photo"] {
        display: none !important;
      }

      /* ──────── Hide Comment Button ──────── */
      body.pe-hide-comment-button [data-test-id="closeup-action-items"] .oRZ5_s:has(button[aria-label="Comments"]),
      body.pe-hide-comment-button [data-test-id="closeup-action-items"] [role="listitem"]:has(button[aria-label="Comments"]),
      body.pe-hide-comment-button [data-test-id="closeup-pin-action-items"] .oRZ5_s:has([data-test-id="comment-button"]),
      body.pe-hide-comment-button [data-test-id="closeup-pin-action-items"] [data-test-id="comment-button"],
      body.pe-hide-comment-button button[aria-label="Comments"],
      body.pe-hide-comment-button button[aria-label="comments"] {
        display: none !important;
      }

      @media (hover: hover) and (pointer: fine) {
        /* ──────── Remove dark hover overlay on desktop pin cards ──────── */
        /* The overlay is an empty div that siblings [data-test-id="pinrep-image"] */
        [data-test-id="pinrep-image"] ~ div:not([data-test-id]) {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          opacity: 0 !important;
          display: none !important;
        }
        /* contentLayer gradient (the hover tint behind buttons) */
        [data-test-id="contentLayer"],
        [data-test-id="contentLayer"]::before,
        [data-test-id="contentLayer"]::after {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        /* Any divs inside the image wrapper that could be overlays */
        [data-test-id^="pincard-gif"] > div > [data-test-id="pinrep-image"] ~ * {
          background: transparent !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .pe-pin-card-download-host {
          position: relative !important;
        }
        .pe-pin-card-download-wrap {
          position: absolute;
          bottom: 8px;
          left: 8px;
          z-index: 40;
          opacity: 0;
          pointer-events: none;
          transition: opacity .14s ease;
        }
        .pe-pin-card-download-host:hover .pe-pin-card-download-wrap,
        .pe-pin-card-download-host:focus-within .pe-pin-card-download-wrap,
        [data-pe-pin-card-download-card="true"]:hover .pe-pin-card-download-wrap,
        [data-pe-pin-card-download-card="true"]:focus-within .pe-pin-card-download-wrap {
          opacity: 1;
          pointer-events: auto;
        }
        .pe-pin-card-download-host:hover .pe-pin-card-download-btn,
        .pe-pin-card-download-host:focus-within .pe-pin-card-download-btn {
          opacity: 1;
        }
        .pe-pin-card-download-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: #fff;
          color: #111;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,.22);
          opacity: .98;
          padding: 0;
          touch-action: manipulation;
        }
        .pe-pin-card-download-btn:hover {
          background: #f1f1f1;
        }
        .pe-pin-card-download-btn:active {
          transform: scale(.94);
        }
        .pe-pin-card-download-btn:disabled {
          opacity: .65;
          cursor: wait;
          transform: none !important;
        }
        .pe-pin-card-download-btn.pe-missing {
          color: #e60023;
        }
        .pe-pin-card-download-btn svg {
          width: 24px;
          height: 24px;
        }
        /* Remove the desktop hover gradient on pin image wrappers. */
        [data-test-id^="pincard"] > div > div:last-child:not([data-test-id]),
        .PinCard__imageWrapper > div > div:last-child:empty {
          display: none !important;
        }
      }

      /* ──────── Settings circle FAB ──────── */
      #pe-settings-wrap {
        position: fixed;
        bottom: 6px;
        right: 6px;
        z-index: 2147483647;
        contain: layout style paint;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        user-select: none;
      }
      #pe-settings-btn {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: var(--pe-accent); color: #fff; border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 18px rgba(230,0,35,.45);
        transition: background .18s, box-shadow .18s, transform .25s;
        flex-shrink: 0;
      }
      #pe-settings-btn:hover { background: var(--pe-accent-hover); box-shadow: 0 6px 24px rgba(230,0,35,.55); transform: scale(1.08); }
      #pe-settings-btn:active { transform: scale(.92); }
      #pe-settings-btn.pe-settings-open { transform: rotate(45deg); }
      #pe-settings-btn.pe-settings-open:hover { transform: rotate(45deg) scale(1.08); }

      #pe-settings-panel {
        background: var(--pe-bg);
        color: var(--pe-text);
        border-radius: 12px;
        box-shadow: 0 4px 28px rgba(0,0,0,.16), 0 1px 4px rgba(0,0,0,.08);
        border: 1px solid var(--pe-border);
        min-width: 230px;
        max-height: min(70dvh, 520px);
        contain: layout style paint;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        animation: pe-bd-pop .15s ease-out;
      }
      #pe-settings-title {
        padding: 8px 12px 7px;
        background: var(--pe-accent);
        color: #fff;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: .02em;
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      #pe-settings-by {
        font-weight: 700;
        font-size: 11px;
        opacity: .85;
        margin-left: auto;
      }
      #pe-settings-author {
        color: #fff;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      #pe-settings-author:hover { opacity: .75; }

      .pe-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 12px; gap: 10px;
        transition: background .12s;
        border-top: 1px solid var(--pe-border);
      }
      .pe-row:hover { background: var(--pe-row-hover); }

      .pe-info { flex: 1; min-width: 0; }
      .pe-name {
        display: block; font-weight: 600; color: var(--pe-text);
        font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pe-desc {
        display: block; font-size: 10px; color: var(--pe-text-muted); margin-top: 1px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* Toggle switch */
      .pe-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
      .pe-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
      .pe-knob {
        position: absolute; inset: 0; background: var(--pe-knob-off);
        border-radius: 20px; cursor: pointer;
        transition: background .2s;
      }
      .pe-knob::before {
        content: ''; position: absolute;
        width: 14px; height: 14px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%;
        transition: transform .2s;
        box-shadow: 0 1px 3px rgba(0,0,0,.22);
      }
      .pe-switch input:checked ~ .pe-knob { background: var(--pe-accent); }
      .pe-switch input:checked ~ .pe-knob::before { transform: translateX(16px); }
      .pe-switch input:focus-visible ~ .pe-knob { outline: 2px solid var(--pe-accent); outline-offset: 2px; }

      /* ──────── Collapsible settings group ──────── */
      .pe-group { border-top: 1px solid var(--pe-border); }
      .pe-group-body { contain: layout style paint; }
      .pe-group-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 12px; gap: 10px; cursor: pointer; transition: background .12s;
      }
      .pe-group-header:hover { background: var(--pe-row-hover); }
      .pe-chevron { transition: transform .2s; flex-shrink: 0; color: var(--pe-text-muted); }
      .pe-group-open .pe-chevron { transform: rotate(180deg); }
      #pe-group-hide-body {
        max-height: min(42dvh, 320px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      #pe-group-declutter-body {
        max-height: min(32dvh, 220px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      #pe-group-translate-body {
        max-height: min(42dvh, 320px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      #pe-group-customize-body {
        max-height: min(36dvh, 260px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .pe-group-body { border-top: 1px solid var(--pe-border); }
      .pe-sub-row { padding-left: 28px !important; background: var(--pe-surface); }
      .pe-sub-row:hover { background: var(--pe-row-hover) !important; }
      .pe-select-row { align-items: center; }
      .pe-input-row { align-items: center; }
      .pe-setting-select {
        max-width: 110px;
        min-width: 94px;
        border: 1px solid var(--pe-input-border);
        border-radius: 7px;
        background: var(--pe-input-bg);
        color: var(--pe-text);
        font-size: 11px;
        font-weight: 600;
        padding: 4px 6px;
        outline: none;
      }
      .pe-setting-select:focus-visible {
        border-color: var(--pe-accent);
        box-shadow: 0 0 0 2px rgba(230,0,35,.16);
      }
      .pe-setting-input {
        width: 128px;
        border: 1px solid var(--pe-input-border);
        border-radius: 7px;
        background: var(--pe-input-bg);
        color: var(--pe-text);
        font-size: 11px;
        padding: 4px 6px;
        outline: none;
      }
      .pe-setting-input:focus-visible {
        border-color: var(--pe-accent);
        box-shadow: 0 0 0 2px rgba(230,0,35,.16);
      }
      .pe-setting-number {
        width: 64px;
      }

      /* Reload notice */
      #pe-notice {
        display: flex; align-items: center; justify-content: space-between;
        background: var(--pe-notice-bg); border-top: 1px solid var(--pe-notice-border);
        padding: 7px 14px; gap: 8px;
        font-size: 12px; color: var(--pe-notice-text);
      }
      #pe-reload-btn {
        background: var(--pe-accent); color: #fff; border: none;
        border-radius: 6px; font-size: 11px; font-weight: 700;
        padding: 3px 10px; cursor: pointer; white-space: nowrap;
        transition: background .15s;
      }
      #pe-reload-btn:hover { background: var(--pe-accent-hover); }

      /* ──────── Board Downloader FAB (standalone, above #pe-settings-wrap) ──────── */
      #pe-bd-fab {
        position: fixed;
        bottom: 56px;
        right: 6px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        user-select: none;
      }
      #pe-bd-btn {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: #e60023; color: #fff; border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 18px rgba(230,0,35,.45);
        transition: background .18s, box-shadow .18s, transform .12s;
        flex-shrink: 0;
        touch-action: manipulation;
      }
      #pe-bd-btn:hover {
        background: #b5001b;
        box-shadow: 0 6px 24px rgba(230,0,35,.55);
        transform: scale(1.08);
      }
      #pe-bd-btn:active { transform: scale(.92); }

      /* ──────── Closeup image action-bar download ──────── */
      #pe-closeup-image-dl-slot,
      #pe-reverse-image-search-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }
      #pe-closeup-image-dl-btn,
      #pe-reverse-image-search-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: currentColor;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        touch-action: manipulation;
      }
      #pe-closeup-image-dl-btn:hover { background: rgba(0,0,0,.06); }
      #pe-closeup-image-dl-btn:active { transform: scale(.94); }
      #pe-closeup-image-dl-btn:disabled { opacity: .55; cursor: wait; transform: none !important; }
      #pe-closeup-image-dl-btn.pe-missing { color: #e60023; }
      #pe-closeup-image-dl-btn svg {
        width: 26px;
        height: 26px;
      }
      #pe-reverse-image-search-btn svg {
        width: 26px;
        height: 26px;
      }
      #pe-reverse-image-search-btn:hover { background: rgba(0,0,0,.06); }
      #pe-reverse-image-search-btn:active { transform: scale(.94); }
      #pe-reverse-image-search-btn:disabled { opacity: .55; cursor: wait; transform: none !important; }
      [data-test-id="closeup-pin-action-items"] #pe-closeup-image-dl-slot,
      [data-test-id="closeup-pin-action-items"] #pe-reverse-image-search-slot {
        min-width: 40px;
        flex: 0 0 auto;
      }
      [data-test-id="closeup-pin-action-items"] #pe-closeup-image-dl-btn,
      [data-test-id="closeup-pin-action-items"] #pe-reverse-image-search-btn {
        width: 40px;
        height: 40px;
      }
      [data-test-id="closeup-pin-action-items"] #pe-closeup-image-dl-btn svg {
        width: 26px;
        height: 26px;
      }
      [data-test-id="closeup-pin-action-items"] #pe-reverse-image-search-btn svg {
        width: 26px;
        height: 26px;
      }
      #pe-reverse-image-search-menu {
        position: fixed;
        z-index: 2147483647;
        min-width: 176px;
        padding: 6px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 6px 24px rgba(0,0,0,.16);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      #pe-reverse-image-search-menu button {
        width: 100%;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #111;
        cursor: pointer;
        display: block;
        font-size: 12px;
        font-weight: 600;
        padding: 7px 8px;
        text-align: left;
      }
      #pe-reverse-image-search-menu button:hover { background: #f3f3f3; }
      #pe-toast {
        position: fixed;
        z-index: 2147483647;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%);
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(17,17,17,.92);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        box-shadow: 0 8px 28px rgba(0,0,0,.22);
        pointer-events: none;
        text-align: center;
      }
      #pe-update-notes-layer {
        position: fixed;
        z-index: 2147483647;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 18px;
        pointer-events: auto;
        background: transparent;
        box-sizing: border-box;
      }
      @keyframes pe-update-notes-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #pe-update-notes-card {
        --pe-un-bg:        #fff;
        --pe-un-text:      #111;
        --pe-un-muted:     #767676;
        --pe-un-border:    rgba(0,0,0,.08);
        --pe-un-divider:   rgba(0,0,0,.06);
        --pe-un-btn-bg:    transparent;
        --pe-un-btn-hover: #f5f5f5;
        --pe-un-shadow:    0 12px 36px rgba(0,0,0,.12);
        position: relative;
        width: 100%;
        max-width: min(360px, calc(100vw - 32px));
        padding: 16px 16px 14px;
        border: 1px solid var(--pe-un-border);
        border-radius: 16px;
        background: var(--pe-un-bg);
        color: var(--pe-un-text);
        box-shadow: var(--pe-un-shadow);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        animation: pe-update-notes-in 180ms ease-out;
      }
      #pe-update-notes-card.pe-dark {
        --pe-un-bg:        #1e1e1e;
        --pe-un-text:      #e8e8e8;
        --pe-un-muted:     #9a9a9a;
        --pe-un-border:    rgba(255,255,255,.10);
        --pe-un-divider:   rgba(255,255,255,.08);
        --pe-un-btn-bg:    transparent;
        --pe-un-btn-hover: rgba(255,255,255,.06);
        --pe-un-shadow:    0 12px 36px rgba(0,0,0,.45);
      }
      #pe-update-notes-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        background: var(--pe-un-btn-bg);
        color: var(--pe-un-muted);
        cursor: pointer;
        padding: 0;
        line-height: 0;
        transition: background-color 120ms ease, color 120ms ease;
      }
      #pe-update-notes-close svg { display: block; }
      #pe-update-notes-close:hover { background: var(--pe-un-btn-hover); color: var(--pe-un-text); }
      #pe-update-notes-eyebrow {
        margin-right: 32px;
        color: #e60023;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      #pe-update-notes-title {
        margin: 4px 32px 10px 0;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--pe-un-divider);
        font-size: 16px;
        font-weight: 700;
        color: var(--pe-un-text);
      }
      #pe-update-notes-list {
        margin: 0 0 14px;
        padding-left: 18px;
        color: var(--pe-un-text);
      }
      #pe-update-notes-list li { margin: 6px 0; line-height: 1.45; }
      #pe-update-notes-never {
        width: 100%;
        min-height: 34px;
        border: 1px solid var(--pe-un-border);
        border-radius: 999px;
        background: transparent;
        color: var(--pe-un-muted);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: background-color 120ms ease, color 120ms ease;
      }
      #pe-update-notes-never:hover { background: var(--pe-un-btn-hover); color: var(--pe-un-text); }
      @media (max-width: 600px) {
        #pe-update-notes-layer {
          align-items: flex-end;
          justify-content: center;
          padding: 12px;
        }
        #pe-update-notes-card {
          max-width: calc(100vw - 24px);
          padding: 14px 14px 12px;
          border-radius: 14px;
          font-size: 12px;
        }
        #pe-update-notes-title { font-size: 15px; }
      }

      .pe-custom-logo-img {
        width: var(--pe-custom-logo-size, 32px);
        height: var(--pe-custom-logo-size, 32px);
        object-fit: contain;
        display: block;
        pointer-events: none;
      }
      .pe-custom-logo-img.pe-custom-logo-circle {
        border-radius: 50%;
        object-fit: cover;
      }

      .pe-translated-text {
        overflow-wrap: anywhere;
      }
      .pe-title-original-line {
        display: block;
        margin-top: 4px;
        font-size: .55em;
        font-weight: 500;
        line-height: 1.25;
        color: #767676;
      }
      .pe-manual-translate-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin: 0 0 0 6px;
        border: 1px solid rgba(0,0,0,.1);
        border-radius: 999px;
        background: #fff;
        color: #555;
        box-shadow: 0 1px 3px rgba(0,0,0,.08);
        cursor: pointer;
        vertical-align: middle;
        touch-action: manipulation;
      }
      .pe-manual-translate-btn:hover { color: #e60023; background: #fff5f7; }
      .pe-manual-translate-btn:disabled { opacity: .58; cursor: wait; }
      .pe-manual-translate-mount {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
      }

      #pe-bd-menu {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,.15), 0 1px 4px rgba(0,0,0,.07);
        border: 1px solid rgba(0,0,0,.07);
        overflow: hidden;
        min-width: 192px;
        animation: pe-bd-pop .15s ease-out;
      }
      @keyframes pe-bd-pop {
        from { opacity:0; transform: scale(.9) translateY(6px); }
        to   { opacity:1; transform: scale(1) translateY(0); }
      }
      #pe-bd-status {
        padding: 7px 14px;
        font-size: 11px;
        color: #555;
        background: #f8f8f8;
        border-bottom: 1px solid #eee;
        white-space: nowrap;
      }
      .pe-bd-opt {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 16px;
        font-size: 13px; font-weight: 600; color: #111;
        background: none; border: none; width: 100%;
        cursor: pointer; text-align: left;
        transition: background .12s;
      }
      .pe-bd-opt:hover { background: #f5f5f5; }
      .pe-bd-opt:disabled { color: #aaa; cursor: not-allowed; background: none; }
      .pe-bd-opt + .pe-bd-opt { border-top: 1px solid #f0f0f0; }

      /* ──────── Image right-click context menu ──────── */
      #pe-ctx-menu {
        position: fixed;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 4px 28px rgba(0,0,0,.18), 0 1px 6px rgba(0,0,0,.1);
        border: 1px solid rgba(0,0,0,.09);
        z-index: 2147483647;
        min-width: 220px;
        overflow: hidden;
        padding: 4px 0;
        animation: pe-bd-pop .12s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        user-select: none;
      }
      .pe-ctx-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px;
        font-size: 13px; font-weight: 500; color: #111;
        background: none; border: none; width: 100%;
        cursor: pointer; text-align: left;
        transition: background .1s;
      }
      .pe-ctx-item:hover { background: #f5f5f5; }
      .pe-ctx-item + .pe-ctx-item { border-top: 1px solid #f0f0f0; }
      .pe-ctx-item svg { flex-shrink: 0; color: #555; }

      /* ──────── Mobile / Touch support ──────── */
      /* Remove 300ms tap delay on all interactive elements */
      #pe-settings-btn, #pe-bd-btn, #pe-reload-btn,
      .pe-ctx-item, .pe-row, .pe-bd-opt, .pe-group-header, .pe-switch {
        touch-action: manipulation;
      }

      #pe-settings-panel { max-width: calc(100vw - 12px); }

      /* Board downloader menu: same treatment */
      #pe-bd-menu {
        max-height: calc(100dvh - 130px);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        max-width: calc(100vw - 12px);
      }

      /* ──────── Touch / mobile overrides ──────── */
      @media (pointer: coarse) {
        /* Slightly smaller FABs on touch so they don't obscure pins */
        #pe-settings-btn { width: 32px; height: 32px; }
        #pe-bd-btn        { width: 32px; height: 32px; }
        /* Adjust board fab bottom: 32px (mobile settings btn) + 6px + 10px gap = 48px */
        #pe-bd-fab        { bottom: 48px; }

        /* ── Compact settings panel on mobile ── */
        /* Cap height to ~62% of screen and use a narrower width */
        #pe-settings-panel {
          max-height: min(62dvh, 420px);
          min-width: 220px;
          max-width: calc(100vw - 14px);
          border-radius: 12px;
        }
        #pe-group-hide-body { max-height: min(34dvh, 260px); }
        /* Smaller title bar */
        #pe-settings-title {
          font-size: 13px;
          padding: 8px 12px 7px;
        }
        #pe-settings-by { font-size: 10px; }

        /* Compact rows — still large enough to tap, but not 48px tall */
        .pe-row {
          padding: 6px 12px;
          min-height: 38px;
          gap: 10px;
        }
        .pe-group-header {
          padding: 6px 12px;
          min-height: 38px;
          gap: 10px;
        }
        .pe-sub-row {
          min-height: 36px;
          padding-left: 20px !important;
        }

        /* Smaller text inside the settings panel */
        .pe-name  { font-size: 12px; }
        .pe-desc  { font-size: 10px; }

        /* Slightly smaller toggle switch */
        .pe-switch { width: 30px; height: 17px; }
        .pe-knob::before { width: 11px; height: 11px; left: 3px; bottom: 3px; }
        .pe-switch input:checked ~ .pe-knob::before { transform: translateX(13px); }

        /* Compact reload notice */
        #pe-notice { padding: 5px 12px; font-size: 11px; }
        #pe-reload-btn { font-size: 10px; padding: 3px 8px; }

        /* Context menu + board downloader keep generous tap targets */
        .pe-ctx-item { padding: 13px 16px; min-height: 48px; }
        .pe-bd-opt   { min-height: 48px; padding: 13px 16px; }
      }

      /* Prevent panels exceeding viewport width on very narrow screens */
      /* Backup compact panel for narrow screens where pointer:coarse may not fire */
      @media (max-width: 600px) {
        #pe-settings-panel {
          max-height: min(62dvh, 420px);
          min-width: 220px;
          max-width: calc(100vw - 14px);
        }
        #pe-group-hide-body { max-height: min(34dvh, 260px); }
      }

      @media (max-width: 320px) {
        #pe-settings-panel { min-width: unset; width: calc(100vw - 12px); }
        #pe-ctx-menu       { min-width: unset; width: calc(100vw - 24px); }
      }

      /* ──────── Mobile performance: reduce GPU over-composition ──────── */
      @media (pointer: coarse) {
        /* Pinterest promotes every pin card to its own GPU compositing layer
           via will-change, which exhausts GPU memory and causes scroll jank.
           Resetting it lets the browser decide when a layer is actually needed. */
        [data-test-id="pinWrapper"] {
          will-change: auto !important;
        }
        /* Async image decoding keeps the main thread free while the user scrolls */
        [data-test-id="pinWrapper"] img {
          decoding: async;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }


  // ═══════════════════════════════════════════════════════════════════
  //  INIT – run on DOMContentLoaded (UI) while OQ/modal observers
  //         are already running from document-start.
  // ═══════════════════════════════════════════════════════════════════
  function safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      console.warn('[Pinterest Power Menu] Feature startup failed:', name, err);
    }
  }

  function ensureSettingsPanel() {
    if (!document.body) return;
    if (!document.getElementById('pe-styles')) injectStyles();
    createSettingsPanel();
  }

  function onReady() {
    safeInit('settingsPanel', ensureSettingsPanel);
    safeInit('updateNotesPopup', createUpdateNotesPopup);

    // Upgrade any images already in DOM
    safeInit('originalQuality', () => {
      if (!get('originalQuality')) return;
      document.querySelectorAll('img[src*="pinimg.com"]').forEach(upgradeImg);
    });

    // GIF hover – pause any videos already in DOM, start delegation
    safeInit('gifHover', () => {
      document.querySelectorAll('video').forEach(pauseVidOnAdd);
      initGifHover();
    });

    // Apply hide-visit-site + nav-hide CSS classes
    safeInit('uiToggles', () => {
      applyVisitSiteToggle();
      applyNavToggles();
      initVisitSiteHider();
      initMessagesRemover();
      initShareOverride();
    });

    // Declutter
    safeInit('declutter', initDeclutter);

    // Remove videos
    safeInit('removeVideos', initRemoveVideos);

    // GIF auto-play
    safeInit('gifAutoPlay', () => { if (get('gifAutoPlay')) initGifAutoPlay(); });

    // Video auto-play (non-GIF <video> elements)
    safeInit('videoAutoPlay', () => { if (get('videoAutoPlay')) initVideoAutoPlay(); });

    // Track user's mute state so "Watch again" doesn't strip audio
    safeInit('videoMuteState', trackCloseupVideoMuteState);

    // Optional: loop closeup videos instead of showing "Watch again"
    safeInit('infiniteLoopVideo', () => { if (get('infiniteLoopVideo')) initInfiniteLoopVideo(); });
    applyInfiniteLoopVideoToggle();

    // Image right-click context menu
    safeInit('contextMenu', initImageContextMenu);

    // Download fixer event listener
    safeInit('downloadFixer', initDownloadFixer);

    // Board downloader button
    safeInit('boardDownloader', createBoardDownloaderUI);

    // Closeup action-bar buttons use separate desktop and mobile row resolvers.
    safeInit('closeupDownload', initCloseupImageDownloadButton);
    safeInit('reverseImageSearchButton', initReverseImageSearchButton);
    safeInit('pinCardQuickDownload', initDesktopPinCardQuickDownloadButton);

    // Custom nav logo
    if (!IS_MOBILE) safeInit('customPinterestLogo', initCustomPinterestLogo);

    // Hide shop posts
    safeInit('hideShopPosts', initHideShopPosts);

    // Hide comments
    safeInit('hideComments', initHideComments);

    // Visible text translation
    safeInit('autoTranslate', initAutoTranslate);
    safeInit('manualTranslateButtons', initManualTranslateButtons);

    // Scroll preservation (restores position on browser back)
    safeInit('scrollPreservation', initScrollPreservation);

    // Mobile: pre-load lazy images and fix GIF loading
    safeInit('mobileLazyFix', initMobileLazyFix);

    setTimeout(() => safeInit('settingsPanelRetry', ensureSettingsPanel), 1000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', onReady);
  else
    onReady();

  // ═══════════════════════════════════════════════════════════════════
  //  SPA NAVIGATION WATCHER
  //  Pinterest never does a real page reload when you navigate.
  //  Intercept history.pushState / replaceState and popstate so we
  //  can show/hide the board FAB whenever the URL changes.
  // ═══════════════════════════════════════════════════════════════════
  (function () {
    let _lastPath = location.pathname;

    function onNavigate() {
      const newPath = location.pathname;
      if (newPath === _lastPath) return;
      _lastPath = newPath;

      // Clear stale intercepted video URLs from the previous pin so they
      // can't be picked up by the row Download button on the new pin page
      _interceptedVideoUrls.length = 0;
      _interceptedVideoUrlsByHash.clear();

      // Give Pinterest's React a moment to render the new page
      setTimeout(() => {
        removeBoardDownloaderUI();
        if (get('boardDownloader') && isBoardPage()) createBoardDownloaderUI();
        removeCloseupImageDownloadButton();
        removeReverseImageSearchButton();
        if (IS_MOBILE) {
          scheduleMobileCloseupActionButtonsRefresh();
        } else if (supportsCloseupActionBarEnhancements()) {
          createCloseupImageDownloadButton();
          if (get('reverseImageSearchButton')) createReverseImageSearchButton();
        }
        if (hasAnyAutoTranslateEnabled()) scanAutoTranslateCandidates(document);
        if (get('showManualTranslateButtons')) scanManualTranslateCandidates(document);
      }, 600);

      // Further attempts with increasing delays — mobile video src can arrive late
      [1800, 3500].forEach(ms => setTimeout(() => {
        if (!document.getElementById('pe-bd-btn') && get('boardDownloader') && isBoardPage())
          createBoardDownloaderUI();
        if (IS_MOBILE) {
          scheduleMobileCloseupActionButtonsRefresh();
        } else {
          if (supportsCloseupActionBarEnhancements() && !document.getElementById('pe-closeup-image-dl-slot'))
            createCloseupImageDownloadButton();
          if (supportsCloseupActionBarEnhancements() && !document.getElementById('pe-reverse-image-search-slot') && get('reverseImageSearchButton'))
            createReverseImageSearchButton();
        }
        if (hasAnyAutoTranslateEnabled()) scanAutoTranslateCandidates(document);
        if (get('showManualTranslateButtons')) scanManualTranslateCandidates(document);
      }, ms));
    }

    // Wrap history methods
    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState    = function (...a) { _push(...a);    onNavigate(); };
    history.replaceState = function (...a) { _replace(...a); onNavigate(); };
    window.addEventListener('popstate', onNavigate);

    // Also watch for the board header / video element appearing in the DOM (handles cases
    // where the URL change fires before React has rendered the new page content)
    new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      if (!document.getElementById('pe-bd-btn') && get('boardDownloader') && isBoardPage())
        createBoardDownloaderUI();
      if (IS_MOBILE) {
        if (getMobileCloseupActionItems()) scheduleMobileCloseupActionButtonsRefresh();
      } else {
        if (supportsCloseupActionBarEnhancements() && !document.getElementById('pe-closeup-image-dl-slot'))
          createCloseupImageDownloadButton();
        if (supportsCloseupActionBarEnhancements() && !document.getElementById('pe-reverse-image-search-slot') && get('reverseImageSearchButton'))
          createReverseImageSearchButton();
      }
      if (hasAnyAutoTranslateEnabled() && _autoTranslateRescan) _autoTranslateRescan();
      if (get('showManualTranslateButtons') && _manualTranslateRescan) _manualTranslateRescan();
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();

})();
