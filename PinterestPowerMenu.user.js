// ==UserScript==
// @name         Pinterest Power Menu
// @description  All-in-one Pinterest power tool: original quality, download fixer, closeup image/video downloads, visible text translation, GIF hover/auto-play, remove videos, hide UI elements, declutter, AI content filter
// @version      1.8.0
// @author       Angel
// @namespace    https://github.com/Angel2mp3
// @homepageURL  https://angelmakes.software
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
  const SCRIPT_VERSION = '1.8.0';
  const UPDATE_NOTES_HIGHLIGHTS = [
    'Version 1.8.0',
    'Hide Pin button + native "More options" menu entry',
    'Comment Keyword Blocker',
    'Reworked solid-color Background Theme (Beta)',
    'Custom Nav Button Images (desktop)',
    'Real ZIP board downloads + "Download New" modes',
    'Backup & Restore, and a settings menu cleanup pass',
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
    filenameStrategy:      'title',  // grid + closeup single-pin downloads
    boardFilenameStrategy: 'title',  // board downloader batch
    boardDownloadTrack:   false,     // opt-in: remember which pins were downloaded per board
    convertWebpToPng: false,         // re-encode WebP image downloads as PNG before saving
    gifHover:         true,
    hideVisitSite:    false,
    boardDownloader:  true,
    declutter:        true,
    declutterShopTheLook: false,
    declutterSearchAdvisory: false,
    contextMenu:      !IS_MOBILE,  // mouse-only feature; off by default on mobile
    hideUpdates:      false,
    hideMessages:     false,
    hideShare:        false,
    gifAutoPlay:      false,
    videoAutoPlay:    false,
    infiniteLoopVideo: false,
    removeVideos:     false,
    hideShopPosts:    false,
    hideAiContent:    false,
    aiContentAggressiveness: 'balanced',  // 'conservative' | 'balanced' | 'aggressive'
    aiContentKeywords: '',                 // comma-separated, user-supplied
    titleBlockEnabled: false,              // hide pins whose title/auto-name matches
    titleBlockKeywords: '',                // comma-separated blocklist words
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
    hideProactiveOutreach: false,
    commentBlockEnabled: false,            // hide comments that contain listed phrases
    commentBlockKeywords: '',              // comma-separated phrases
    autoTranslateTitles: false,
    autoTranslateDescriptions: false,
    autoTranslateComments: false,
    autoTranslateCommentMode: 'visible',
    autoTranslateTarget: 'browser',
    titleTranslationDisplay: 'translated',
    customPinterestLogoUrl: '',
    customPinterestLogoSize: 32,
    customPinterestLogoCircle: true,
    // Per-button custom images. Keyed by NAV_BUTTONS id ->
    // { url:'', size:32, circle:true }. Nested so adding buttons doesn't bloat
    // DEFAULTS; loadCfg/get/set serialize the whole config so no extra plumbing.
    customNavImages: {},
    // Custom site background / theme (solid color only, experimental / beta).
    themeEnabled: false,     // master switch; off by default
    themePreset: 'default',  // 'default' | THEME_PRESETS id
    themeColor: '#0f2027', // solid hex color used when theme is enabled
    reverseImageSearchButton: true,
    updateNotesDisabled: false,
    lastUpdateNotesVersion: '',
    // Debug logging toggle (off by default).
    debugLogging: false,
    // Hide specific pins by their numeric pin ID.
    hideByPinIdEnabled: false,
    // Hide pins the user has already opened/viewed.
    hideSeenPins: false,
    // All-time statistics. Each stat is opt-in (off by default); counting only
    // happens while its show flag is on. Counts are cumulative across sessions.
    statShowAdsBlocked: false,
    statShowAiBlocked: false,
    statShowImagesDownloaded: false,
    statShowVideosDownloaded: false,
    statShowCommentsTranslated: false,
    statCountAdsBlocked: 0,
    statCountAiBlocked: 0,
    statCountImagesDownloaded: 0,
    statCountVideosDownloaded: 0,
    statCountCommentsTranslated: 0,
  };

  let _cfg = null;

  // Persistence with a localStorage fallback.  Some userscript engines (notably
  // Hermit on Android) declare @grant for GM_setValue/GM_getValue but don't
  // actually persist them across page loads, so settings + the changelog-dismiss
  // flag would reset every time.  We prefer GM storage when it returns a value
  // and always mirror to localStorage (Pinterest is a single origin, so it
  // survives reloads).  The PE_ prefix avoids colliding with Pinterest's keys.
  function storageRead(key) {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(key, null);
        if (v != null) return v;
      }
    } catch (_) {}
    try { return localStorage.getItem('PE_' + key); } catch (_) { return null; }
  }

  function storageWrite(key, val) {
    try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (_) {}
    try { localStorage.setItem('PE_' + key, val); } catch (_) {}
  }

  function loadCfg() {
    try {
      const raw = storageRead(SETTINGS_KEY);
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
      // The old "Keep Visit Site Button" / "Hide Visit Site Button" declutter-scoped
      // toggles were folded into the global "Hide Visit Site" setting; drop the old keys.
      if (Object.prototype.hasOwnProperty.call(saved, 'declutterKeepVisitSite') ||
          Object.prototype.hasOwnProperty.call(saved, 'declutterHideVisitSite')) {
        delete _cfg.declutterKeepVisitSite;
        delete _cfg.declutterHideVisitSite;
        saveCfg();
      }
      _cfg.showManualTranslateButtons = false;
      rememberMissingDefaultPrefs(saved);
    } catch (_) {
      _cfg = { ...DEFAULTS };
    }
  }

  function saveCfg() {
    try { storageWrite(SETTINGS_KEY, JSON.stringify(_cfg)); } catch (_) {}
  }

  // Export / import a JSON backup of settings, hidden pin IDs, and board history.
  // Useful when a userscript engine or iOS WebView does not persist GM_/localStorage
  // data across launches.
  function exportPowerMenuData() {
    loadCfg();
    return {
      version: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: { ..._cfg },
      hiddenPinIds: [...getHiddenPinIds()],
      boardHistory: getBoardHistory(),
    };
  }

  function importPowerMenuData(jsonString, { merge = false } = {}) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, error: 'Invalid JSON: ' + e.message };
    }
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Backup file is not a JSON object.' };
    }
    if (!data.settings || typeof data.settings !== 'object') {
      return { success: false, error: 'Backup file does not contain settings.' };
    }
    if (data.version && typeof data.version !== 'string') {
      return { success: false, error: 'Backup version is not a string.' };
    }

    if (merge) {
      _cfg = { ...DEFAULTS, ..._cfg, ...data.settings };
    } else {
      _cfg = { ...DEFAULTS, ...data.settings };
    }
    saveCfg();

    if (Array.isArray(data.hiddenPinIds)) {
      const existing = merge ? getHiddenPinIds() : new Set();
      data.hiddenPinIds.forEach(id => existing.add(String(id)));
      saveHiddenPinIds(existing);
    }

    if (data.boardHistory && typeof data.boardHistory === 'object' && !Array.isArray(data.boardHistory)) {
      const existing = merge ? getBoardHistory() : {};
      const merged = { ...existing, ...data.boardHistory };
      storageWrite(BOARD_HISTORY_KEY, JSON.stringify(merged));
    }

    return {
      success: true,
      imported: {
        settings: true,
        hiddenPinIds: Array.isArray(data.hiddenPinIds),
        boardHistory: !!(data.boardHistory && typeof data.boardHistory === 'object' && !Array.isArray(data.boardHistory)),
      },
    };
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

  // Debug logging helper. Only emits when the debugLogging setting is enabled.
  function debugLog(level, ...args) {
    if (!get('debugLogging')) return;
    const fn = console[level] || console.log;
    try { fn('[Pinterest Power Menu]', ...args); } catch (_) {}
  }

  // ── All-time statistics counters ──────────────────────────────────
  // Updates the live count shown in the settings panel, if it's open.
  // Keep the counter cell compact at high counts: commas under 100k, then a
  // compact "12.3K" / "1.2M" form so the row never grows or wraps. The exact
  // number is preserved in the element's title.
  function formatStatCount(n) {
    const num = Number(n) || 0;
    if (num < 100000) return num.toLocaleString();
    try {
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(num);
    } catch (_) {
      return String(num);
    }
  }

  function updateStatDisplay(countKey) {
    const el = document.getElementById('pe-stat-val-' + countKey);
    if (el) {
      const num = Number(get(countKey)) || 0;
      el.textContent = formatStatCount(num);
      el.title = num.toLocaleString();
    }
  }

  // Increment a counter only while its stat is enabled. Persistence is
  // debounced so high-frequency events (filtering, translating) don't
  // serialize the whole config on every hit.
  let _statsSaveTimer = null;
  function bumpStat(showKey, countKey) {
    if (!get(showKey)) return;
    if (!_cfg) loadCfg();
    _cfg[countKey] = (Number(get(countKey)) || 0) + 1;
    updateStatDisplay(countKey);
    clearTimeout(_statsSaveTimer);
    _statsSaveTimer = setTimeout(saveCfg, 1000);
  }

  // Flush any pending stat save immediately so counts are not lost when the
  // user closes or background the tab.
  function flushPendingStats() {
    if (!_statsSaveTimer) return;
    clearTimeout(_statsSaveTimer);
    _statsSaveTimer = null;
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

    layer.querySelector('#pe-update-notes-card')?.classList.add('pe-dark');
  }

  loadCfg();

  function injectEarlyDeclutterStyles() {
    if (document.getElementById('pe-declutter-early-styles')) return;
    const style = document.createElement('style');
    style.id = 'pe-declutter-early-styles';
    style.textContent = `
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has(div[title="Sponsored"]),
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has(div[title="Partner Content"]),
      html.pe-declutter-enabled div[role="list"] > div[role="listitem"]:has(div[title="Sponsored Content"]),
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

  // Yield to the browser's event loop. Uses the modern scheduler.yield() when
  // available; otherwise falls back to a zero-timeout so long tasks can break
  // up their work without blocking scroll / paint.
  function schedulerYield() {
    if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
      return scheduler.yield();
    }
    return new Promise(resolve => setTimeout(resolve, 0));
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

  // Development aid: warn when brittle obfuscated-class selectors no longer
  // match anything. These classes change every Pinterest deploy, so a zero-match
  // is a strong signal that a hide rule needs updating.
  const _BRITTLE_SELECTORS = [
    { sel: 'body.pe-hide-share .WuRgKB', setting: 'hideShare' },
    { sel: 'body.pe-hide-share .H2DtUH', setting: 'hideShare' },
    { sel: 'body.pe-hide-share .BVzdUh.Nt6yCq.i1hWBD', setting: 'hideShare' },
    { sel: 'body.pe-hide-share .oRZ5_s', setting: 'hideShare' },
    { sel: 'body.pe-hide-react .oRZ5_s', setting: 'hideReactButton' },
    { sel: 'body.pe-hide-search-suggestions .oRZ5_s', setting: 'hideSearchSuggestions' },
    { sel: 'body.pe-hide-more-options .oRZ5_s', setting: 'hideMoreOptionsButton' },
    { sel: 'body.pe-hide-comment-button .oRZ5_s', setting: 'hideCommentButton' },
    { sel: '.PinCard__imageWrapper', setting: 'boardDownloader' },
  ];
  function checkSelectorHealth() {
    if (!document.querySelectorAll) return;
    _BRITTLE_SELECTORS.forEach(({ sel, setting }) => {
      if (!get(setting)) return;
      try {
        if (document.querySelectorAll(sel).length === 0) {
          debugLog('warn', 'Selector matched zero elements (may need update):', sel);
        }
      } catch (_) {}
    });
    learnActionBarClasses();
    debugLog('log', 'Action-bar slot class learned:', _learnedActionSlotClass || '(not yet learned)');
  }

  // Shared mutation bus: one observer on document.documentElement notifies all
  // subscribers. This avoids the cost of running many independent observers.
  const _sharedMutationSubscribers = [];
  let _sharedMutationObs = null;
  function subscribeSharedMutations(callback) {
    if (!_sharedMutationObs) {
      _sharedMutationObs = new MutationObserver(records => {
        if (hasOnlyPowerMenuMutations(records)) return;
        _sharedMutationSubscribers.slice().forEach(cb => {
          try { cb(records); } catch (_) {}
        });
      });
      _sharedMutationObs.observe(document.documentElement, { childList: true, subtree: true });
      registerObserver('sharedMutationBus', _sharedMutationObs, { target: document.documentElement, persistent: true });
    }
    _sharedMutationSubscribers.push(callback);
    return () => {
      const idx = _sharedMutationSubscribers.indexOf(callback);
      if (idx !== -1) _sharedMutationSubscribers.splice(idx, 1);
    };
  }

  // Observer registry: track every MutationObserver so SPA navigation can
  // disconnect per-route observers and recreate them cleanly. Persistent
  // observers (shared bus, original quality) survive navigation.
  const _observerRegistry = new Map();
  function registerObserver(name, observer, options = {}) {
    const { target = null, persistent = false } = options;
    const existing = _observerRegistry.get(name);
    if (existing && existing.observer !== observer) {
      try { existing.observer.disconnect(); } catch (_) {}
    }
    _observerRegistry.set(name, { observer, target, persistent });
    return observer;
  }
  function unregisterObserver(name) {
    const entry = _observerRegistry.get(name);
    if (!entry) return;
    try { entry.observer.disconnect(); } catch (_) {}
    _observerRegistry.delete(name);
  }
  function hasObserver(name) {
    const entry = _observerRegistry.get(name);
    return !!(entry && entry.observer);
  }
  function isObserverConnected(name) {
    const entry = _observerRegistry.get(name);
    if (!entry || !entry.observer) return false;
    // MutationObserver has no isConnected; we approximate by checking whether
    // the observed target is still in the document and the observer is in the map.
    return true;
  }
  function disconnectObservers({ persistent = false } = {}) {
    for (const [name, entry] of _observerRegistry) {
      if (entry.persistent && !persistent) continue;
      try { entry.observer.disconnect(); } catch (_) {}
      _observerRegistry.delete(name);
    }
  }
  function disconnectAllOnNavigation() {
    disconnectObservers({ persistent: false });
    if (get('debugLogging')) {
      debugLog('log', 'Observers after navigation cleanup:', [..._observerRegistry.keys()]);
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: ORIGINAL QUALITY  (fast – no probe, no popup)
  // ═══════════════════════════════════════════════════════════════════
  // Directly rewrite pinimg.com thumbnail URLs → /originals/ with
  // an inline onerror fallback to /736x/ so zero extra requests are
  // made upfront and the "Optimizing…" overlay is never shown.

  const OQ_RE = /^(https?:\/\/i\.pinimg\.com)\/\d+x(\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:jpg|jpeg|png|gif|webp))$/i;

  // Build a list of /originals/ URLs to try for a sized thumbnail path.
  // Pinterest sometimes stores the original as PNG/WebP even though the
  // thumbnail URL ends in .jpg, so we try the original extension first,
  // then PNG, then WebP, before falling back to the sized thumbnail.
  function pinimgOriginalCandidates(base, path) {
    const currentExt = (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || 'jpg').toLowerCase();
    const exts = new Set([currentExt === 'jpeg' ? 'jpg' : currentExt, 'png', 'webp', 'jpg']);
    const candidates = [];
    exts.forEach(ext => {
      if (ext === 'jpeg') ext = 'jpg';
      candidates.push(base + '/originals' + path.replace(/\.[^.]+$/, '.' + ext));
    });
    candidates.push(base + '/736x' + path);
    return candidates.filter((u, i, a) => a.indexOf(u) === i);
  }

  function upgradeImg(img) {
    if (!get('originalQuality')) return;
    if (img.__peOQ || img.tagName !== 'IMG' || !img.src) return;
    const m = img.src.match(OQ_RE);
    if (!m) return;
    img.__peOQ = true;
    const candidates = pinimgOriginalCandidates(m[1], m[2]);
    img.__peOQCandidates = candidates;
    img.__peOQIdx = 0;
    img.onerror = function () {
      let next = (img.__peOQIdx || 0) + 1;
      if (next >= candidates.length) { img.onerror = null; return; }
      img.__peOQIdx = next;
      img.src = candidates[next];
    };
    if (img.getAttribute('data-src') === img.src) img.setAttribute('data-src', candidates[0]);
    img.src = candidates[0];
  }

  function scanOQ(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IMG') upgradeImg(node);
    else node.querySelectorAll('img[src*="pinimg.com"]').forEach(upgradeImg);
  }

  // Start MutationObserver immediately (document-start) so we catch
  // images before they fire their first load event.
  const oqObs = new MutationObserver(async records => {
    if (!get('originalQuality')) return;
    // On mobile, batch-process records and yield between chunks so long feeds
    // don't jank scroll / paint. Desktop keeps the synchronous fast path.
    if (IS_MOBILE) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(async () => {
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            if (r.attributeName === 'src') upgradeImg(r.target);
            else r.addedNodes.forEach(scanOQ);
            if (i % 4 === 3) await schedulerYield();
          }
        }, { timeout: 300 });
      } else {
        await schedulerYield();
        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (r.attributeName === 'src') upgradeImg(r.target);
          else r.addedNodes.forEach(scanOQ);
          if (i % 4 === 3) await schedulerYield();
        }
      }
      return;
    }
    records.forEach(r => {
      if (r.attributeName === 'src') upgradeImg(r.target);
      else r.addedNodes.forEach(scanOQ);
    });
  });
  oqObs.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
  });
  registerObserver('originalQuality', oqObs, { target: document.documentElement, persistent: true });


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
    document.body.classList.toggle('pe-hide-proactive-outreach', get('hideProactiveOutreach'));
  }

  // Physically removes the Messages nav button from the DOM (not just hidden with CSS).
  // Subscribes to the shared mutation bus so it re-removes whenever Pinterest
  // re-renders the nav (SPA navigation).
  let _messagesRemoverUnsub = null;
  function initMessagesRemover() {
    if (!get('hideMessages')) return;
    if (_messagesRemoverUnsub) return; // already running
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
    _messagesRemoverUnsub = subscribeSharedMutations(recs => {
      if (!get('hideMessages')) {
        if (_messagesRemoverUnsub) { _messagesRemoverUnsub(); _messagesRemoverUnsub = null; }
        return;
      }
      recs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) removeNow(n); }));
    });
  }

  // JS-based "Visit site" link removal – catches links that CSS alone misses
  // (e.g. <a rel="nofollow"><div>Visit site</div></a>)
  let _visitSiteHiderUnsub = null;
  function initVisitSiteHider() {
    if (_visitSiteHiderUnsub) return;
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
    _visitSiteHiderUnsub = subscribeSharedMutations(recs => {
      if (!get('hideVisitSite')) return;
      recs.forEach(r => r.addedNodes.forEach(n => {
        if (n.nodeType === 1) hideInTree(n);
      }));
    });
  }
  function stopVisitSiteHider() {
    if (_visitSiteHiderUnsub) { _visitSiteHiderUnsub(); _visitSiteHiderUnsub = null; }
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: SHARE URL OVERRIDE
  // ═══════════════════════════════════════════════════════════════════
  // Replaces Pinterest's shortened pin.it URLs in the share dialog
  // with the actual pin URL.  On closeup pages that's location.href;
  // on the grid we walk up from the share button to find the pin link.
  // Also intercepts "Copy link" and clicks on the URL input box.

  function initShareOverride() {
    // Some userscript sandboxes restrict access to native prototype descriptors.
    // Fall back to direct property assignment if the native setter is unavailable.
    function setInputValue(input, value) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (descriptor && typeof descriptor.set === 'function') {
          descriptor.set.call(input, value);
          return;
        }
      } catch (_) {}
      input.value = value;
    }

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
          setInputValue(input, realUrl);
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
              setInputValue(input, url);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }).observe(input, { attributes: true, attributeFilter: ['value'] });
        }
      });
    }

    const shareOverrideObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      fixShareInputs();
    });
    shareOverrideObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('shareOverride', shareOverrideObs, { target: document.documentElement });

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

  const videoPauseObs = new MutationObserver(records => {
    if (hasOnlyPowerMenuMutations(records)) return;
    records.forEach(r => r.addedNodes.forEach(function scan(n) {
      if (!n || n.nodeType !== 1) return;
      if (n.tagName === 'VIDEO') pauseVidOnAdd(n);
      n.querySelectorAll && n.querySelectorAll('video').forEach(pauseVidOnAdd);
    }));
  });
  videoPauseObs.observe(document.documentElement, { childList: true, subtree: true });
  registerObserver('videoPause', videoPauseObs, { target: document.documentElement });

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
    if (hasObserver('gifAutoIO')) return;
    _gifAutoIO = new IntersectionObserver(entries => {
      // Skip when feature is off or tab is hidden (avoids playing on inactive tabs)
      if (!get('gifAutoPlay') || document.hidden) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) startGifInView(entry.target);
        else                      stopGifInView(entry.target);
      });
    }, { threshold: 0.1 });
    registerObserver('gifAutoIO', _gifAutoIO);

    observeGifPins();
    _gifAutoMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      records.forEach(r => r.addedNodes.forEach(n => {
        if (n && n.nodeType === 1) observeGifPins(n);
      }));
    });
    _gifAutoMO.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('gifAutoMO', _gifAutoMO, { target: document.documentElement });
  }

  function stopGifAutoPlay() {
    if (_gifAutoIO) { _gifAutoIO.disconnect(); _gifAutoIO = null; }
    if (_gifAutoMO) { _gifAutoMO.disconnect(); _gifAutoMO = null; }
    unregisterObserver('gifAutoIO');
    unregisterObserver('gifAutoMO');
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
    if (hasObserver('vidAutoIO')) return;
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
    registerObserver('vidAutoIO', _vidAutoIO);

    observeVideos();
    _vidAutoMO = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      records.forEach(r => r.addedNodes.forEach(n => {
        if (n && n.nodeType === 1) observeVideos(n);
      }));
    });
    _vidAutoMO.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('vidAutoMO', _vidAutoMO, { target: document.documentElement });
  }

  function stopVideoAutoPlay() {
    if (_vidAutoIO) { _vidAutoIO.disconnect(); _vidAutoIO = null; }
    if (_vidAutoMO) { _vidAutoMO.disconnect(); _vidAutoMO = null; }
    unregisterObserver('vidAutoIO');
    unregisterObserver('vidAutoMO');
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
    if (hasObserver('loopVideo')) return;
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
    registerObserver('loopVideo', _loopVideoObs, { target: document.documentElement });
  }

  function stopInfiniteLoopVideo() {
    if (_loopVideoObs) { _loopVideoObs.disconnect(); _loopVideoObs = null; }
    unregisterObserver('loopVideo');
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

  // True only for genuine ads (Sponsored / Partner / Promoted), used by the
  // "Ads blocked" stat — a stricter subset of isDeclutterPin.
  function isSponsoredPin(pin) {
    if (pin.querySelector('div[title="Sponsored"]')) return true;
    if (pin.querySelector('div[title="Partner Content"], div[title="Sponsored Content"], div[title="Promoted"]')) return true;
    const typeId = pin.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (typeId && /partner content|sponsored content|promoted|sponsored/i.test(typeId.textContent || '')) return true;
    return false;
  }

  function isDeclutterPin(pin) {
    // Sponsored
    if (pin.querySelector('div[title="Sponsored"]')) return true;
    // Partner / Sponsored Content pin-type labels
    if (pin.querySelector('div[title="Partner Content"], div[title="Sponsored Content"]')) return true;
    const typeId = pin.querySelector('[data-test-id="PinTypeIdentifier"]');
    if (typeId && /partner content|sponsored content/i.test(typeId.textContent || '')) return true;
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
    if (isSponsoredPin(pin)) bumpStat('statShowAdsBlocked', 'statCountAdsBlocked');
    collapseEl(pin);
    return true;
  }

  function scanDeclutterNode(node) {
    if (!node || node.nodeType !== 1) return false;
    let matched = false;
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
  let _declutterListCounter = 0;

  function initDeclutter() {
    if (!get('declutter')) return;

    // Observe the pin grid list(s) for new list items
    function attachListObserver(listEl) {
      if (listEl.__peDeclutterObs) return;
      listEl.__peDeclutterObs = true;
      filterPins(listEl);
      const onMutate = IS_MOBILE ? debounce(() => filterPins(listEl), 350) : () => filterPins(listEl);
      const listObs = new MutationObserver(records => {
        if (hasOnlyPowerMenuMutations(records)) return;
        const matched = scanDeclutterMutationRecords(records);
        if (matched) return;
        onMutate();
      });
      listObs.observe(listEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'data-test-id'],
      });
      const listName = 'declutter-list-' + (++_declutterListCounter);
      listEl.__peDeclutterObserverName = listName;
      registerObserver(listName, listObs, { target: listEl });
    }

    // Attach to any already-present lists
    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    removeDeclutterOneoffs();

    // Watch for new lists added by SPA navigation or lazy load
    if (hasObserver('declutter')) return;
    _declutterListObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
      removeDeclutterOneoffs();
    });
    _declutterListObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('declutter', _declutterListObs, { target: document.documentElement });
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
    if (!get('removeVideos') || hasObserver('removeVideos')) return;

    function attachListObserver(listEl) {
      if (listEl.__peVideoObs) return;
      listEl.__peVideoObs = true;
      filterVideoPins(listEl);
      const onMutate = IS_MOBILE ? debounce(() => filterVideoPins(listEl), 350) : () => filterVideoPins(listEl);
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
    registerObserver('removeVideos', _removeVideosObs, { target: document.documentElement });
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
  let _hideShopPostsListCounter = 0;

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
    const listName = 'hideshopposts-list-' + (++_hideShopPostsListCounter);
    listEl.__peShopObserverName = listName;
    registerObserver(listName, obs, { target: listEl });
    _hideShopPostListObservers.set(listEl, obs);
  }

  function stopHideShopPosts({ restore = true } = {}) {
    if (_hideShopPostsObs) { _hideShopPostsObs.disconnect(); _hideShopPostsObs = null; unregisterObserver('hideShopPosts'); }
    _hideShopPostListObservers.forEach((obs, listEl) => {
      obs.disconnect();
      if (listEl) {
        if (listEl.__peShopObserverName) unregisterObserver(listEl.__peShopObserverName);
        delete listEl.__peShopObs;
        delete listEl.__peShopObserverName;
      }
    });
    _hideShopPostListObservers.clear();
    if (restore) restoreShopPosts();
  }

  function initHideShopPosts() {
    if (!get('hideShopPosts') || !get('declutter')) return;

    document.querySelectorAll('div[role="list"]').forEach(attachShopPostListObserver);

    if (hasObserver('hideShopPosts')) return;
    _hideShopPostsObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachShopPostListObserver);
    });
    _hideShopPostsObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('hideShopPosts', _hideShopPostsObs, { target: document.documentElement });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: CONTENT FILTER  (hide AI pins + custom title-keyword blocklist)
  // ═══════════════════════════════════════════════════════════════════
  // A userscript cannot inspect image pixels, so AI detection is heuristic:
  // Pinterest's own AI-disclosure labels (where present in the DOM) plus
  // keyword/hashtag/alt-text matching. Higher aggressiveness = broader
  // matching = more false positives. The same scan engine also powers a
  // user-defined keyword blocklist that hides any pin whose title / Pinterest
  // auto-generated description contains one of the listed words.

  const AI_OPTIONS = [
    { value: 'conservative', label: 'Conservative (labels + explicit tags)' },
    { value: 'balanced',     label: 'Balanced (+ common AI tools/terms)' },
    { value: 'aggressive',   label: 'Aggressive (+ loose signals, more false positives)' },
  ];

  // Substring phrases — specific enough to match directly.
  const AI_PHRASES_CONSERVATIVE = [
    '#aigenerated', 'ai generated', 'ai-generated', 'aigenerated',
    'generative ai', 'genai', 'made with ai', 'created with ai',
    'created using ai', 'ai created', 'generated with ai', 'generated by ai',
  ];
  const AI_PHRASES_BALANCED = [
    'midjourney', 'dall-e', 'dall·e', 'dalle', 'stable diffusion',
    'ai art', 'ai-art', 'aiart', 'ai image', 'ai images', 'ai artwork',
    'ai generated art', 'ai illustration', 'adobe firefly', 'nightcafe',
    'leonardo ai', 'leonardo.ai', 'ai model', 'text to image', 'text-to-image',
    'sora ai', 'flux ai', 'comfyui', 'automatic1111', 'gpt image',
  ];
  // Aggressive-only loose signals (word-boundary regex to limit false hits).
  const AI_REGEX_AGGRESSIVE = [
    /\bai\b/, /#ai\b/, /\ba\.i\.\b/, /\bprompt:/, /\bai prompt\b/, /\bai tool\b/,
  ];

  function getAiKeywordSets() {
    const level = get('aiContentAggressiveness');
    const phrases = [...AI_PHRASES_CONSERVATIVE];
    if (level === 'balanced' || level === 'aggressive') phrases.push(...AI_PHRASES_BALANCED);
    String(get('aiContentKeywords') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      .forEach(kw => phrases.push(kw));
    const regexes = level === 'aggressive' ? AI_REGEX_AGGRESSIVE : [];
    return { phrases, regexes };
  }

  // Pinterest's own AI-disclosure label (strongest signal, used at every tier).
  function findAiDisclosureLabel(pin) {
    if (pin.querySelector(
      '[data-test-id*="gen-ai" i],[data-test-id*="genai" i],' +
      '[data-test-id*="ai-label" i],[data-test-id*="ai-disclosure" i],' +
      '[data-test-id*="generative-ai" i]'
    )) return true;
    const labelRe = /\b(ai[\s-]?generated|generative ai|made with ai|created with ai|ai[\s-]?modified)\b/i;
    for (const el of pin.querySelectorAll('[aria-label],[title]')) {
      if (labelRe.test(el.getAttribute('aria-label') || '') || labelRe.test(el.getAttribute('title') || '')) {
        return true;
      }
    }
    return false;
  }

  // Pinterest auto-names many pins (image alt / link aria-label) with a short
  // machine description of the media even when the user set no title — e.g.
  // "a picture of a cake with a blue background". We harvest those so keyword
  // matching works on title-less pins too.
  function getPinTitleText(pin) {
    const parts = [];
    // Scope to pin-page links only — board/profile/avatar links also carry
    // aria-label/alt text (board names, usernames) that would trigger aggressive
    // mode on pins that have nothing to do with AI.
    pin.querySelectorAll('a[href*="/pin/"][aria-label]').forEach(a => {
      parts.push((a.getAttribute('aria-label') || '').replace(/\s*pin page\s*$/i, ''));
    });
    pin.querySelectorAll('img[alt]').forEach(img => {
      // Comment avatars / user images inside comment sections can have alt text
      // that matches AI keywords or the title blocklist, which would collapse the
      // whole closeup post when comments open.
      if (img.closest('[data-test-id*="comment"], [data-test-id="closeup-comments"], [data-test-id="comment-list"], [data-test-id="comment-feed"], #canonical-card, [data-test-id="comment-editor-container"]')) return;
      parts.push(img.getAttribute('alt') || '');
    });
    return parts.join(' \n ').toLowerCase();
  }

  function collectAiText(pin) {
    // Use only attribute-based text (alt, aria-label, title) so comments written
    // by other users never contribute to AI detection and cause false positives.
    return getPinTitleText(pin);
  }

  function isAiPin(pin) {
    if (!pin || pin.nodeType !== 1) return false;
    if (findAiDisclosureLabel(pin)) return true;
    const { phrases, regexes } = getAiKeywordSets();
    if (!phrases.length && !regexes.length) return false;
    const text = collectAiText(pin);
    if (!text) return false;
    if (phrases.some(p => text.includes(p))) return true;
    if (regexes.some(r => r.test(text))) return true;
    return false;
  }

  // User-defined title/keyword blocklist (independent of the AI filter).
  function getTitleBlockWords() {
    if (!get('titleBlockEnabled')) return [];
    return String(get('titleBlockKeywords') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  function matchesTitleBlock(pin) {
    const words = getTitleBlockWords();
    if (!words.length) return false;
    const text = getPinTitleText(pin);
    if (!text) return false;
    return words.some(w => text.includes(w));
  }

  function isContentFilterActive() {
    return !!get('hideAiContent') ||
      getTitleBlockWords().length > 0 ||
      !!get('hideByPinIdEnabled') ||
      !!get('hideSeenPins');
  }

  // Persist opened pin IDs across React re-renders. React replaces feed card
  // DOM elements when the URL changes (closeup opens/closes), so a per-element
  // flag alone doesn't survive. Storing the numeric pin ID in a Set means a
  // freshly-rendered card for the same pin is still protected.
  const _openedPinIds = new Set();
  let _pinClickTrackerAdded = false;

  const CLOSEUP_ROOT_SELECTORS = [
    '[data-test-id="pin-closeup-image"]',
    '[data-test-id="closeup-body-image-container"]',
    '[data-test-id="visual-content-container"]',
    '[data-test-id="story-pin-closeup"]',
    '[data-test-id="closeup-image"]',
    '[data-test-id="pin-closeup"]',
    '#canonical-card',
  ].join(', ');

  function isInsideCloseupRoot(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(CLOSEUP_ROOT_SELECTORS);
  }

  function protectCurrentCloseupPinId() {
    const m = location.pathname.match(/\/pin\/(\d+)/);
    if (m) _openedPinIds.add(m[1]);
  }

  function ensurePinClickTracker() {
    if (_pinClickTrackerAdded) return;
    _pinClickTrackerAdded = true;
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href*="/pin/"]');
      if (!link) return;
      const m = (link.getAttribute('href') || '').match(/\/pin\/(\d+)/);
      if (m) _openedPinIds.add(m[1]);
      const listitem = link.closest('div[role="listitem"]');
      if (listitem) listitem.__peUserOpened = true;
    }, true);
    // Direct navigation to a pin URL should also protect that pin.
    protectCurrentCloseupPinId();
    window.addEventListener('popstate', protectCurrentCloseupPinId);
  }

  function getPinIdFromCard(pin) {
    const a = pin.querySelector('a[href*="/pin/"]');
    if (!a) return null;
    const m = (a.getAttribute('href') || '').match(/\/pin\/(\d+)/);
    return m ? m[1] : null;
  }

  function shouldHideForFilter(pin) {
    if (pin.__peUserOpened) return false;
    const id = getPinIdFromCard(pin);
    if (id && _openedPinIds.has(id)) return false;
    // Never hide the main closeup pin on a /pin/ page. Comments and related
    // content rendered inside/near that container should not collapse the post
    // the user explicitly opened.
    if (/\/pin\/\d+/.test(location.pathname) && isInsideCloseupRoot(pin)) return false;

    if (get('hideByPinIdEnabled') && id && isPinIdHidden(id)) {
      return true;
    }

    if (get('hideSeenPins') && id && _openedPinIds.has(id)) {
      return true;
    }

    if (get('hideAiContent') && isAiPin(pin)) {
      bumpStat('statShowAiBlocked', 'statCountAiBlocked');
      return true;
    }
    if (matchesTitleBlock(pin)) return true;
    return false;
  }

  const _hiddenFilterPosts = new Map();
  const _contentFilterListObservers = new Map();
  let _contentFilterObs = null;
  let _contentFilterListCounter = 0;

  function hideFilteredPin(pin) {
    if (pin.__peFilterHidden) return;
    pin.__peFilterHidden = true;
    _hiddenFilterPosts.set(pin, {
      display: pin.style.display,
      visibility: pin.style.visibility,
      height: pin.style.height,
      minHeight: pin.style.minHeight,
      overflow: pin.style.overflow,
    });
    collapseEl(pin);
  }

  function restoreFilteredPosts() {
    _hiddenFilterPosts.forEach((style, pin) => {
      if (!pin || !pin.style) return;
      pin.style.display = style.display;
      pin.style.visibility = style.visibility;
      pin.style.height = style.height;
      pin.style.minHeight = style.minHeight;
      pin.style.overflow = style.overflow;
      delete pin.__peFilterHidden;
    });
    _hiddenFilterPosts.clear();
  }

  async function filterContentPosts(container) {
    if (!isContentFilterActive()) return;

    // Safety restore: anything that was already hidden inside the closeup root
    // should never stay hidden once the user is viewing the pin.
    if (/\/pin\/\d+/.test(location.pathname)) {
      _hiddenFilterPosts.forEach((style, pin) => {
        if (pin && pin.isConnected && isInsideCloseupRoot(pin)) {
          pin.style.display = style.display;
          pin.style.visibility = style.visibility;
          pin.style.height = style.height;
          pin.style.minHeight = style.minHeight;
          pin.style.overflow = style.overflow;
          delete pin.__peFilterHidden;
          _hiddenFilterPosts.delete(pin);
        }
      });
    }

    const pins = container.querySelectorAll('div[role="listitem"]');
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      if (pin.__peFilterHidden) continue;
      // Skip list items that are actually comments or comment threads, and skip
      // any list item that doesn't link to a pin (so comments aren't treated as pins).
      if (pin.closest('[data-test-id*="comment"], [data-test-id="closeup-comments"], [data-test-id="comment-list"], [data-test-id="comment-feed"], #canonical-card, [data-test-id="comment-editor-container"]')) continue;
      // Skip anything rendered inside the main closeup container on a pin page.
      if (/\/pin\/\d+/.test(location.pathname) && isInsideCloseupRoot(pin)) continue;
      if (!pin.querySelector('a[href*="/pin/"]')) continue;
      if (shouldHideForFilter(pin)) hideFilteredPin(pin);
      if (IS_MOBILE && i % 8 === 7) await schedulerYield();
    }
  }

  function attachContentFilterListObserver(listEl) {
    if (_contentFilterListObservers.has(listEl)) return;
    // Don't observe comment sections — comment text / author names would cause
    // aggressive-mode false positives that collapse the whole post.
    if (listEl.closest(
      '[data-test-id*="comment"],[data-test-id="closeup-comments"],' +
      '[data-test-id="comment-list"],[data-test-id="comment-feed"]'
    )) return;
    filterContentPosts(listEl);
    // On mobile, throttle more aggressively and let the filter work yield;
    // attribute changes are still observed so lazy-filled titles are caught,
    // but the debounce keeps the cost off the critical scroll path.
    const onMutate = IS_MOBILE ? debounce(() => filterContentPosts(listEl), 350) : () => filterContentPosts(listEl);
    const obs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      onMutate();
    });
    // Watch attribute changes too: Pinterest lazily fills in alt / aria-label /
    // title after the card mounts, so a childList-only observer would miss pins
    // until something else re-rendered them (the "only hides after I click it" bug).
    obs.observe(listEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['alt', 'aria-label', 'title', 'data-test-id'],
    });
    const listName = 'contentfilter-list-' + (++_contentFilterListCounter);
    listEl.__peFilterObserverName = listName;
    registerObserver(listName, obs, { target: listEl });
    _contentFilterListObservers.set(listEl, obs);
  }

  function stopContentFilter({ restore = true } = {}) {
    if (_contentFilterObs) { _contentFilterObs.disconnect(); _contentFilterObs = null; unregisterObserver('contentFilter'); }
    _contentFilterListObservers.forEach((obs, listEl) => {
      obs.disconnect();
      if (listEl && listEl.__peFilterObserverName) unregisterObserver(listEl.__peFilterObserverName);
      if (listEl) delete listEl.__peFilterObserverName;
    });
    _contentFilterListObservers.clear();
    if (restore) restoreFilteredPosts();
  }

  function initContentFilter() {
    if (!isContentFilterActive()) return;
    ensurePinClickTracker();

    document.querySelectorAll('div[role="list"]').forEach(attachContentFilterListObserver);

    if (hasObserver('contentFilter')) return;
    _contentFilterObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      document.querySelectorAll('div[role="list"]').forEach(attachContentFilterListObserver);
    });
    _contentFilterObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('contentFilter', _contentFilterObs, { target: document.documentElement });
  }

  // Re-evaluate every pin after a toggle / aggressiveness / keyword change.
  function refreshContentFilter() {
    stopContentFilter({ restore: true });
    if (isContentFilterActive()) initContentFilter();
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
    if (hasObserver('hideComments')) return;
    _hideCommentsObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      scheduleHideComments();
    });
    _hideCommentsObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('hideComments', _hideCommentsObs, { target: document.documentElement });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: COMMENT KEYWORD BLOCKER
  // ═══════════════════════════════════════════════════════════════════
  // Hides individual comments that contain user-defined words/phrases.
  // Checks both the original text (if auto-translate stored it) and the
  // currently displayed text so it works before or after translation.

  const COMMENT_BLOCK_SELECTOR = '[data-test-id="commentThread-comment"]';
  const _blockedComments = new Map();
  let _commentBlockerObs = null;
  let _commentBlockerTextObs = null;

  function getCommentBlockPhrases() {
    if (!get('commentBlockEnabled')) return [];
    return String(get('commentBlockKeywords') || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }

  function isCommentBlocked(comment, phrases) {
    if (!phrases.length) return false;
    // The auto-translate module stores the original on the text container child;
    // look there, then fall back to the comment itself.
    const translatedEl = comment.querySelector('[data-pe-auto-translate-original]');
    const original = (
      (comment.getAttribute('data-pe-auto-translate-original') || '') +
      ' ' + (translatedEl?.getAttribute('data-pe-auto-translate-original') || '')
    ).toLowerCase();
    const current = (comment.textContent || '').toLowerCase();
    return phrases.some(p => original.includes(p) || current.includes(p));
  }

  function applyCommentBlock(comment) {
    if (comment.__peCommentBlocked) return;
    comment.__peCommentBlocked = true;
    _blockedComments.set(comment, {
      display: comment.style.display,
    });
    comment.style.setProperty('display', 'none', 'important');
  }

  function restoreBlockedComments() {
    _blockedComments.forEach((style, comment) => {
      if (!comment || !comment.style) return;
      comment.style.display = style.display;
      delete comment.__peCommentBlocked;
    });
    _blockedComments.clear();
  }

  function restoreComment(comment) {
    const style = _blockedComments.get(comment);
    if (!style) return;
    comment.style.display = style.display;
    delete comment.__peCommentBlocked;
    _blockedComments.delete(comment);
  }

  function evaluateComment(comment, phrases) {
    if (!phrases) phrases = getCommentBlockPhrases();
    if (!phrases.length) {
      if (comment.__peCommentBlocked) restoreComment(comment);
      return;
    }
    if (isCommentBlocked(comment, phrases)) {
      applyCommentBlock(comment);
    } else if (comment.__peCommentBlocked) {
      restoreComment(comment);
    }
  }

  function scanCommentBlocker(root = document) {
    const phrases = getCommentBlockPhrases();
    if (!phrases.length) {
      restoreBlockedComments();
      return;
    }
    root.querySelectorAll(COMMENT_BLOCK_SELECTOR).forEach(comment => evaluateComment(comment, phrases));
  }

  function stopCommentBlocker() {
    if (_commentBlockerObs) { _commentBlockerObs.disconnect(); _commentBlockerObs = null; unregisterObserver('commentBlocker'); }
    if (_commentBlockerTextObs) { _commentBlockerTextObs.disconnect(); _commentBlockerTextObs = null; unregisterObserver('commentBlockerText'); }
    restoreBlockedComments();
  }

  function refreshCommentBlocker() {
    if (!get('commentBlockEnabled')) {
      stopCommentBlocker();
      return;
    }
    scanCommentBlocker(document);
    if (hasObserver('commentBlocker')) return;
    _commentBlockerObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      const phrases = getCommentBlockPhrases();
      if (!phrases.length) { restoreBlockedComments(); return; }
      records.forEach(r => r.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches(COMMENT_BLOCK_SELECTOR)) evaluateComment(n, phrases);
        if (n.querySelectorAll) n.querySelectorAll(COMMENT_BLOCK_SELECTOR).forEach(c => evaluateComment(c, phrases));
      }));
    });
    _commentBlockerObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('commentBlocker', _commentBlockerObs, { target: document.documentElement });

    // Re-check when comment text changes (including after auto-translation).
    if (hasObserver('commentBlockerText')) return;
    _commentBlockerTextObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      const phrases = getCommentBlockPhrases();
      const comments = new Set();
      records.forEach(r => {
        const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        const comment = target?.closest?.(COMMENT_BLOCK_SELECTOR);
        if (comment) comments.add(comment);
      });
      comments.forEach(c => evaluateComment(c, phrases));
    });
    _commentBlockerTextObs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    registerObserver('commentBlockerText', _commentBlockerTextObs, { target: document.documentElement });
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
  // Exponential backoff for translation rate limits (429) and network errors.
  let _translateBackoffUntil = 0;
  let _translateBackoffMs = 2000;
  const TRANSLATE_MAX_BACKOFF_MS = 60000;

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

    // Respect rate-limit / error backoff so we don't hammer Google.
    if (Date.now() < _translateBackoffUntil) {
      return Promise.resolve({ translatedText: text, detectedLanguage: '', targetLanguage: target, status: 'error' });
    }

    function onTranslationError() {
      _translateBackoffUntil = Date.now() + _translateBackoffMs;
      _translateBackoffMs = Math.min(_translateBackoffMs * 2, TRANSLATE_MAX_BACKOFF_MS);
    }

    function onTranslationSuccess() {
      _translateBackoffMs = 2000;
    }

    return new Promise(resolve => {
      const url = 'https://translate.googleapis.com/translate_a/single' +
        '?client=gtx&sl=auto&tl=' + encodeURIComponent(target) +
        '&dt=t&q=' + encodeURIComponent(text);
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: r => {
          // 429 / 5xx from Google should back off just like network errors.
          if (r.status >= 429 && r.status < 600) {
            onTranslationError();
            resolve({ translatedText: text, detectedLanguage: '', targetLanguage: target, status: 'error' });
            return;
          }
          onTranslationSuccess();
          const result = normalizeTranslationResponse(text, target, r.responseText);
          rememberTranslation(key, result);
          resolve(result);
        },
        onerror: () => {
          onTranslationError();
          resolve({ translatedText: text, detectedLanguage: '', targetLanguage: target, status: 'error' });
        },
        ontimeout: () => {
          onTranslationError();
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
    if (type === 'comment') bumpStat('statShowCommentsTranslated', 'statCountCommentsTranslated');
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
    if (_autoTranslateIO) { _autoTranslateIO.disconnect(); _autoTranslateIO = null; unregisterObserver('autoTranslateIO'); }
    if (_autoTranslateMO) { _autoTranslateMO.disconnect(); _autoTranslateMO = null; unregisterObserver('autoTranslateMO'); }
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
      registerObserver('autoTranslateIO', _autoTranslateIO, {});
    }
    scanAutoTranslateCandidates(document);
    if (hasObserver('autoTranslateMO')) return;
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
    registerObserver('autoTranslateMO', _autoTranslateMO, { target: document.documentElement });
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
    if (_manualTranslateMO) { _manualTranslateMO.disconnect(); _manualTranslateMO = null; unregisterObserver('manualTranslateMO'); }
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
    if (hasObserver('manualTranslateMO')) return;
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
    registerObserver('manualTranslateMO', _manualTranslateMO, { target: document.documentElement });
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
  //  MODULE: DOWNLOAD FIXER
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

  // Convert an image ArrayBuffer from one raster format to another using a canvas.
  // Falls back to the original buffer on any error (CORS taint, canvas size limits,
  // unsupported source, etc.) so downloads never fail because of conversion.
  async function convertImageBuffer(buf, sourceExt, targetExt) {
    if (!buf || sourceExt === targetExt) return buf;
    if (sourceExt !== '.webp' || targetExt !== '.png') return buf;
    let url = null;
    try {
      const blob = new Blob([buf], { type: 'image/webp' });
      url = URL.createObjectURL(blob);
      const img = new Image();
      // Blob URLs are same-origin; adding crossOrigin can taint the canvas in some
      // browsers, so leave it off for the object-URL path.
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const outBlob = await new Promise((res, rej) => {
        canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), 'image/png');
      });
      return await outBlob.arrayBuffer();
    } catch (_) {
      return buf;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  function sanitizeFilename(n) {
    if (!n) return null;
    let s = String(n).replace(/[<>:"/\|?*\x00-\x1f\x80-\x9f]/g, '').trim();
    // Windows reserves these base names regardless of extension.
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reserved.test(s)) s = '_' + s;
    // Trailing dots or spaces confuse Windows Explorer / FAT/NTFS.
    s = s.replace(/[\.\s]+$/, '');
    if (s.length > 200) s = s.slice(0, 200).replace(/[\.\s]+$/, '');
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
    return `Pin-${randDigits(12)}`;
  }

  const FILENAME_STRATEGY_OPTIONS = [
    { value: 'title',   label: 'Pin name' },
    { value: 'pinCode', label: 'Pin code' },
    { value: 'random',  label: 'Random number' },
  ];

  // Build a download filename per the chosen strategy, with auto-fallback.
  // title: sanitized pin title or '' ; id: pin id string or '' ; strategy: chosen value.
  // When the chosen source is missing it falls through to the other real
  // identifier before finally using a random number.
  function buildPinFilename(title, id, strategy) {
    const code = id ? `Pin-${id}` : '';
    switch (strategy) {
      case 'random':  return makeFallbackPinName();
      case 'pinCode': return code || title || makeFallbackPinName();
      case 'title':
      default:        return title || code || makeFallbackPinName();
    }
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
    return m ? pinimgOriginalCandidates(m[1], m[2])[0] : url;
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

  // Pinterest's closeup container test-ids differ by surface and have drifted
  // over time. Desktop uses closeup-body / closeup-image / closeup-visual-container.
  // Current mobile (m-web) nests the focused pin as
  //   CloseupMainPin > closeup-body-portrait > closeup-container >
  //   story-pin-full-bleed-slideshow-mweb
  // and renders the pin video as video[data-test-id="duplo-hls-video"]. The old
  // selectors matched none of these, so on mobile getFocusedCloseupRoot returned
  // null — which killed video detection and the in-DOM video element lookup, and
  // forced document-wide image fallbacks that grabbed the wrong pin's media.
  // Recognise both layouts so the focused-pin scope works everywhere.
  const FOCUSED_CLOSEUP_ROOT_SELECTOR =
    '[data-grid-item-idx], ' +
    '[data-test-id="closeup-body"], ' +
    '[data-test-id="closeup-body-style"], ' +
    '[data-test-id="closeup-body-portrait"], ' +
    '[data-test-id="CloseupMainPin"], ' +
    '[data-test-id="closeup-container"]';

  const CLOSEUP_VISUAL_SIGNAL_SELECTOR =
    '[data-test-id="closeup-image"], ' +
    '[data-test-id="closeup-visual-container"], ' +
    '[data-test-id="visual-content-container"], ' +
    '[data-test-id="pin-closeup-image"], ' +
    '[data-test-id="story-pin-full-bleed-slideshow-mweb"], ' +
    '[data-test-id="story-pin-video-block"], ' +
    '[data-test-id="duplo-hls-video"]';

  // Tightest "the pin media lives here" wrapper, used to scope image/video
  // collection to the focused pin (never the whole document, never related pins).
  const CLOSEUP_VISUAL_PART_SELECTOR =
    '[data-test-id="closeup-visual-container"], ' +
    '[data-test-id="visual-content-container"], ' +
    '[data-test-id="story-pin-full-bleed-slideshow-mweb"], ' +
    '[data-test-id="pin-closeup-image"], ' +
    '[data-test-id="closeup-image"]';

  function scoreFocusedCloseupRoot(root) {
    if (!root?.querySelector) return -1;
    if (!root.querySelector(CLOSEUP_VISUAL_SIGNAL_SELECTOR)) return -1;
    let score = 0;
    if (root.matches?.(FOCUSED_CLOSEUP_ROOT_SELECTOR)) score += 6;
    if (root.querySelector('[data-test-id="closeup-action-bar"], [data-test-id="closeup-action-items"], [data-test-id="closeup-pin-action-items"]')) score += 6;
    if (root.querySelector('[data-test-id="closeup-visual-container"], [data-test-id="story-pin-full-bleed-slideshow-mweb"]')) score += 4;
    if (root.querySelector('[data-test-id="closeup-image"] img, [data-test-id="closeup-image"] video, [data-test-id="duplo-hls-video"]')) score += 4;
    if (isElementActuallyVisible(root.querySelector(CLOSEUP_VISUAL_SIGNAL_SELECTOR) || root)) score += 8;
    score += Math.min(8, getElementArea(root) / 100000);
    return score;
  }

  function getFocusedCloseupRoot(anchor) {
    if (anchor?.closest) {
      let anchoredRoot = anchor.closest(FOCUSED_CLOSEUP_ROOT_SELECTOR);
      while (anchoredRoot) {
        if (scoreFocusedCloseupRoot(anchoredRoot) >= 0) return anchoredRoot;
        anchoredRoot = anchoredRoot.parentElement?.closest?.(FOCUSED_CLOSEUP_ROOT_SELECTOR);
      }
    }

    const candidates = new Set();
    document.querySelectorAll(CLOSEUP_VISUAL_SIGNAL_SELECTOR).forEach(el => {
      candidates.add(el);
      const closeupRoot = el.closest(FOCUSED_CLOSEUP_ROOT_SELECTOR);
      if (closeupRoot) candidates.add(closeupRoot);
    });
    document.querySelectorAll(FOCUSED_CLOSEUP_ROOT_SELECTOR).forEach(el => {
      if (el.querySelector(CLOSEUP_VISUAL_SIGNAL_SELECTOR)) candidates.add(el);
    });
    return [...candidates]
      .map(el => ({ el, score: scoreFocusedCloseupRoot(el) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function extractFocusedPinTitle(anchor) {
    const focusedRoot = getFocusedCloseupRoot(anchor);
    const title = extractPinTitleFromScope(focusedRoot) ||
      extractPinTitleFromScope(document, CLOSEUP_PIN_TITLE_SELECTORS) || '';
    const pinId = location.pathname.match(/\/pin\/(\d+)/i)?.[1] || '';
    return buildPinFilename(title, pinId, get('filenameStrategy'));
  }

  function getCloseupScopePart(root, selector) {
    if (!root) return null;
    if (root.matches?.(selector)) return root;
    return root.querySelector?.(selector) || null;
  }

  function getCloseupVisualScope(anchor) {
    const focusedRoot = getFocusedCloseupRoot(anchor);
    if (focusedRoot) {
      return getCloseupScopePart(focusedRoot, CLOSEUP_VISUAL_PART_SELECTOR) || focusedRoot;
    }
    return document.querySelector(CLOSEUP_VISUAL_PART_SELECTOR) || document;
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

  // Trigger an <a download> click. On iOS Safari / many WebViews the download
  // attribute is ignored for blob URLs, so we also open the URL in a new tab
  // so the user can Share → Save to Files. `revokeMs` controls how long the
  // blob URL is kept alive for that fallback.
  function triggerAnchorDownload(a, url, revokeMs = 10000) {
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } catch (_) {}
    if (IS_MOBILE && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      try { window.open(url, '_blank', 'noopener'); } catch (_) {}
    }
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, revokeMs);
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
    // Try alternate original extensions before falling back to sized versions.
    return [...new Set([...pinimgOriginalCandidates(base, path), base + '/564x' + path])];
  }

  async function fetchBestImageBuffer(imageUrl) {
    for (const u of pinimgFallbackQueue(imageUrl)) {
      try { return await fetchBinary(u); } catch (_) {}
    }
    return null;
  }

  function buildImageDownloadName(buf, filename, finalExt) {
    const ext = finalExt || detectFileType(new Uint8Array(buf));
    const explicitTitle = stripKnownExt(sanitizeFilename(filename || ''));
    const pageTitle = stripKnownExt(extractPinTitle() || '');
    const basePart = explicitTitle || pageTitle || makeFallbackPinName();
    return basePart + ext;
  }

  async function saveImageBuffer(buf, filename) {
    if (!buf) return false;
    const rawExt = detectFileType(new Uint8Array(buf));
    let finalBuf = buf;
    let finalExt = rawExt;
    if (get('convertWebpToPng') && rawExt === '.webp') {
      finalBuf = await convertImageBuffer(buf, '.webp', '.png');
      if (finalBuf !== buf) finalExt = '.png';
    }
    try {
      const a = document.createElement('a');
      const url = URL.createObjectURL(new Blob([finalBuf]));
      a.href = url;
      a.download = buildImageDownloadName(finalBuf, filename, finalExt);
      triggerAnchorDownload(a, url, 10000);
      bumpStat('statShowImagesDownloaded', 'statCountImagesDownloaded');
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

  // Pinterest's obfuscated action-bar class names change every deploy. Learn the
  // current slot wrapper class from a known native button instead of hard-coding
  // .oRZ5_s. Falls back to .oRZ5_s and then to [role="listitem"] if learning fails.
  let _learnedActionSlotClass = '';
  const NATIVE_ACTION_BUTTON_SELECTORS = [
    '[data-test-id="react-button"]',
    '[data-test-id="comment-button"]',
    'button[aria-label="Comments"]',
    '[data-test-id="closeup-share-button"]',
    '[data-test-id="closeup-more-options"]',
    '[data-test-id="context-menu-button"]',
    '[data-test-id="ellipsis-button"]',
    '[data-test-id="more-actions-button"]',
    'button[aria-label="More actions"]',
  ];

  function learnActionBarClasses() {
    if (_learnedActionSlotClass) return;
    const row = getCloseupActionIconRow();
    if (!row) return;
    for (const child of row.children) {
      if (!child.querySelector) continue;
      if (NATIVE_ACTION_BUTTON_SELECTORS.some(sel => child.querySelector(sel))) {
        const firstClass = (child.className || '').split(/\s+/).filter(Boolean)[0];
        if (firstClass) {
          _learnedActionSlotClass = firstClass;
          debugLog('log', 'Learned action-bar slot class:', _learnedActionSlotClass);
        }
        break;
      }
    }
  }

  function getActionSlotSelector() {
    if (_learnedActionSlotClass) return '.' + _learnedActionSlotClass;
    return '.oRZ5_s';
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
    learnActionBarClasses();
    const slotSelector = getActionSlotSelector();
    for (const slot of row.querySelectorAll(`:scope > ${slotSelector}`)) {
      if (slot.querySelector(selector)) return slot;
    }
    const found = row.querySelector(selector)?.closest(`${slotSelector}, [role="listitem"]`) || null;
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
      '[data-test-id="story-pin-full-bleed-slideshow-mweb"], ' +
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

  // Mobile gif closeups render the pin as a static JPEG <img> — no gif badge or
  // test-id distinguishes them from a photo — while the animated file lives at
  // /originals/<hash>.gif. Detect a gif from any available page signal so the
  // download can prefer the animated file instead of saving the still frame.
  function focusedCloseupLooksLikeGif(scope) {
    const root = scope?.querySelectorAll ? scope : null;
    if (root) {
      if (isMobileGifPin(root)) return true;
      for (const img of root.querySelectorAll('img')) {
        const attrs = (img.getAttribute('srcset') || '') + ' ' + (img.currentSrc || '') + ' ' +
          (img.getAttribute('src') || '') + ' ' + (img.getAttribute('data-src') || '');
        if (/\.gif(?:[?"\s]|$)/i.test(attrs)) return true;
      }
      if (/i\.pinimg\.com\/[^"'\\)\s]*\.gif/i.test(root.innerHTML || '')) return true;
      const badge = root.querySelector('[data-test-id="PinTypeIdentifier"]');
      if (badge && /gif|animated/i.test(badge.textContent || '')) return true;
    }
    const pinData = findCurrentPinDataFromRelayScripts(getCurrentPinIdFromLocation());
    if (pinData && collectPinterestDataStrings(pinData).some(s => /\.gif(?:[?"\\]|$)/i.test(String(s || '')))) return true;
    return false;
  }

  // Returns the animated .gif URL to prefer for a gif closeup, or null. Only the
  // /originals/<hash>.gif derived from the still is returned; callers must keep
  // the still as a fallback so a false positive can never break a photo download.
  function resolveFocusedCloseupGifUrl(scope, imageUrl) {
    if (!imageUrl) return null;
    if (/\.gif(?:[?#]|$)/i.test(imageUrl)) return imageUrl; // closeup already exposes the gif
    const derived = deriveGifUrl(imageUrl);
    if (!derived) return null;
    return focusedCloseupLooksLikeGif(scope) ? derived : null;
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
    if (!currentImageUrl) return false;
    // GIF pins: prefer the animated /originals/.gif, but fall back to the still
    // frame if the derived gif isn't actually available (false positive safety).
    const gifUrl = resolveFocusedCloseupGifUrl(getCloseupVisualScope(btn), currentImageUrl);
    if (gifUrl && gifUrl !== currentImageUrl && await downloadSingle(gifUrl, title)) return true;
    return downloadSingle(currentImageUrl, title);
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
    const title = buildPinFilename(
      extractPinTitleFromScope(card) || '', getPinIdFromCard(card) || '', get('filenameStrategy'));
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
    if (hasObserver('pinCardQuickDownload')) return;
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
    registerObserver('pinCardQuickDownload', _pinCardQuickDownloadObs, { target: document.documentElement });
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
    slot.className = 'pe-closeup-action-slot';
    if (IS_MOBILE) slot.classList.add('pe-mobile-closeup-action-slot');
    slot.dataset.peCloseupAction = 'download';
    slot.setAttribute('data-pe-ui', 'true');
    absorbCloseupActionEvents(slot);

    const item = document.createElement('div');
    item.className = 'pe-closeup-action-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <button id="pe-closeup-image-dl-btn" class="pe-closeup-action-button" type="button" aria-label="Download" title="Download">
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
    unregisterObserver('mobileCloseupAction');
  }

  function observeMobileCloseupActionBar() {
    if (!IS_MOBILE) return false;
    const row = getMobileCloseupActionItems();
    const root = row?.closest?.('[data-test-id="closeup-pin-action-bar-container"]') || row;
    if (!root) return false;
    if (hasObserver('mobileCloseupAction') && _mobileCloseupActionObservedRoot === root) return true;
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
    registerObserver('mobileCloseupAction', _mobileCloseupActionObs, { target: root });
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
    if (hasObserver('closeupImageDl')) return;
    const retry = debounce(createCloseupImageDownloadButton, 150);
    _closeupImageDlObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      retry();
    });
    _closeupImageDlObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('closeupImageDl', _closeupImageDlObs, { target: document.documentElement });
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

  // ─── Inject Hide/Unhide item into Pinterest native 3-dot/More menus ───
  const NATIVE_MENU_TRIGGER_SELECTOR = [
    '[data-test-id="context-menu-button"]',
    '[data-test-id="ellipsis-button"]',
    '[data-test-id="more-actions-button"]',
    '[data-test-id="closeup-more-options"]',
    '[data-test-id="closeup-action-bar-button"]',
    'button[aria-label="More actions"]',
  ].join(', ');

  let _nativeMenuHideObs = null;
  let _nativeMenuHideScan = null;
  let _lastNativeMenuTrigger = null;

  function isNativeMenuVisible(menu) {
    if (!menu?.isConnected) return false;
    const style = getComputedStyle(menu);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function cleanupNativeMenuHideItems(root) {
    root.querySelectorAll?.('[data-pe-native-menu-item="hide-pin"]').forEach(el => el.remove());
  }

  function resolveNativeMenuPinId(trigger) {
    if (!trigger) return currentPinIdFromLocation();
    const card = trigger.closest?.('[data-test-id="pin"], [data-test-id="pinWrapper"], [data-grid-item="true"]');
    if (card) return getPinIdFromCard(card) || currentPinIdFromLocation();
    if (trigger.closest?.(
      '[data-test-id="closeup-action-items"], ' +
      '[data-test-id="closeup-pin-action-items"], ' +
      '[data-test-id="closeup-visual-container"], ' +
      '[data-test-id="closeup-image"]'
    )) return currentPinIdFromLocation();
    return currentPinIdFromLocation();
  }

  function injectHidePinNativeMenuItem(menu) {
    if (!menu?.querySelector) return;
    if (!isNativeMenuVisible(menu)) return;
    cleanupNativeMenuHideItems(menu);

    const pinId = resolveNativeMenuPinId(_lastNativeMenuTrigger);
    if (!pinId) return;

    const hidden = isPinIdHidden(pinId);
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-pe-ui', 'true');
    item.setAttribute('data-pe-native-menu-item', 'hide-pin');
    item.className = 'pe-native-menu-item';
    item.innerHTML = `
      <div class="pe-native-menu-item-inner">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="4.22" y1="4.22" x2="19.78" y2="19.78"/>
        </svg>
        <span>${hidden ? 'Unhide pin' : 'Hide pin'}</span>
      </div>
    `;

    function doAction(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (hidden) unhidePinId(pinId);
      else {
        hidePinId(pinId);
        if (!get('hideByPinIdEnabled')) set('hideByPinIdEnabled', true);
      }
      refreshContentFilter();
      showPowerMenuToast(hidden ? 'Pin unhidden' : 'Pin hidden');
      // Close the native menu by dispatching Escape and blurring focus.
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.activeElement?.blur();
    }

    item.addEventListener('click', doAction, true);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doAction(e);
      }
    });

    // Append at the end of the menu, inside a list if one exists.
    const list = menu.matches('[role="menu"]') ? menu : menu.querySelector('[role="menu"]');
    if (list) list.appendChild(item);
  }

  function scanNativeMenusForHideItem() {
    const seen = new Set();
    document.querySelectorAll('[role="menu"]').forEach(menu => {
      seen.add(menu);
      injectHidePinNativeMenuItem(menu);
    });
    // Some Pinterest menus expose menuitems without a wrapping role="menu".
    document.querySelectorAll('[role="menuitem"]').forEach(item => {
      const menu = item.closest('[role="menu"], [data-test-id*="menu"], [data-test-id*="dropdown"]') || item.parentElement;
      if (menu && !seen.has(menu)) {
        seen.add(menu);
        injectHidePinNativeMenuItem(menu);
      }
    });
  }

  function resolveNativeMenuTrigger(target) {
    if (!target) return null;
    // 1) Hard-coded Pinterest selectors (current)
    const direct = target.closest?.(NATIVE_MENU_TRIGGER_SELECTOR);
    if (direct) return direct;
    // 2) Structural fallback: a button inside a closeup action bar whose label
    //    or text suggests "More actions". Pinterest changes data-test-ids often,
    //    but the action-bar context and aria-label are more stable.
    const actionBar = target.closest?.('[data-test-id="closeup-action-items"], [data-test-id="closeup-pin-action-items"]');
    if (actionBar) {
      const btn = target.closest?.('button');
      if (btn) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('more') || aria.includes('actions')) return btn;
      }
    }
    // 3) Heuristic fallback: any button whose visible text or aria-label says More.
    const btn = target.closest?.('button');
    if (btn) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      if (aria.includes('more actions') || text === 'more' || text === '...' || text === '…') return btn;
    }
    return null;
  }

  function initNativeMenuHideItem() {
    if (hasObserver('nativeMenuHide')) return;
    document.addEventListener('click', e => {
      const trigger = resolveNativeMenuTrigger(e.target);
      if (!trigger) return;
      _lastNativeMenuTrigger = trigger;
      if (!_nativeMenuHideScan) _nativeMenuHideScan = debounce(scanNativeMenusForHideItem, 50);
      _nativeMenuHideScan();
    }, true);
    _nativeMenuHideObs = new MutationObserver(records => {
      let shouldScan = false;
      records.forEach(record => {
        record.addedNodes?.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('[role="menu"]') ||
              node.querySelector?.('[role="menu"]') ||
              node.querySelector?.('[role="menuitem"]')) {
            shouldScan = true;
          }
        });
      });
      if (shouldScan) {
        if (!_nativeMenuHideScan) _nativeMenuHideScan = debounce(scanNativeMenusForHideItem, 50);
        _nativeMenuHideScan();
      }
    });
    _nativeMenuHideObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('nativeMenuHide', _nativeMenuHideObs, { target: document.documentElement });
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
    slot.className = 'pe-closeup-action-slot';
    if (IS_MOBILE) slot.classList.add('pe-mobile-closeup-action-slot');
    slot.dataset.peCloseupAction = 'reverse-search';
    slot.setAttribute('data-pe-ui', 'true');
    absorbCloseupActionEvents(slot);

    const item = document.createElement('div');
    item.className = 'pe-closeup-action-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <button id="pe-reverse-image-search-btn" class="pe-closeup-action-button" type="button" aria-label="Reverse image search" title="Reverse image search">
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
    if (hasObserver('reverseImageSearch')) return;
    const retry = debounce(createReverseImageSearchButton, 150);
    _reverseImageSearchObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      retry();
    });
    _reverseImageSearchObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('reverseImageSearch', _reverseImageSearchObs, { target: document.documentElement });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: BOARD DOWNLOADER
  // ═══════════════════════════════════════════════════════════════════
  // ─── Board download history (separate from pe_settings_v1 to stay small) ───
  const BOARD_HISTORY_KEY = 'pe_board_history';

  function getBoardHistory() {
    try { return JSON.parse(storageRead(BOARD_HISTORY_KEY) || '{}'); } catch { return {}; }
  }

  function saveBoardHistory(boardKey, newIds) {
    const hist = getBoardHistory();
    const existing = new Set(hist[boardKey] || []);
    for (const id of newIds) if (id) existing.add(id);
    hist[boardKey] = [...existing];
    storageWrite(BOARD_HISTORY_KEY, JSON.stringify(hist));
  }

  // ─── Hidden pin IDs ("Don't show again") ───
  const HIDDEN_PIN_IDS_KEY = 'pe_hidden_pin_ids';
  let _hiddenPinIdsCache = null;

  function loadHiddenPinIdsCache() {
    try {
      const arr = JSON.parse(storageRead(HIDDEN_PIN_IDS_KEY) || '[]');
      _hiddenPinIdsCache = new Set(Array.isArray(arr) ? arr : []);
    } catch { _hiddenPinIdsCache = new Set(); }
    return _hiddenPinIdsCache;
  }

  function getHiddenPinIds() {
    return _hiddenPinIdsCache || loadHiddenPinIdsCache();
  }

  function saveHiddenPinIds(set) {
    try {
      _hiddenPinIdsCache = new Set([...set].filter(Boolean));
      storageWrite(HIDDEN_PIN_IDS_KEY, JSON.stringify([..._hiddenPinIdsCache]));
    } catch (_) {}
  }

  function hidePinId(id) {
    if (!id) return;
    const set = getHiddenPinIds();
    if (set.has(id)) return;
    set.add(id);
    saveHiddenPinIds(set);
  }

  function unhidePinId(id) {
    if (!id) return;
    const set = getHiddenPinIds();
    if (!set.has(id)) return;
    set.delete(id);
    saveHiddenPinIds(set);
  }

  function isPinIdHidden(id) {
    if (!id) return false;
    return getHiddenPinIds().has(id);
  }

  function clearHiddenPinIds() {
    saveHiddenPinIds(new Set());
  }

  function currentPinIdFromLocation() {
    return location.pathname.match(/\/pin\/(\d+)/i)?.[1] || '';
  }

  function currentBoardKey() {
    return location.pathname.replace(/\/$/, '').split('/').filter(Boolean).slice(0, 2).join('/');
  }

  function getBoardDisplayName() {
    const header = document.querySelector(
      '[data-test-id="board-header-with-image"] h1, [data-test-id="board-header-details"] h1, [data-test-id="board-tools"] h1'
    );
    const fromDom = header?.textContent?.trim();
    if (fromDom) return sanitizeFilename(fromDom) || currentBoardKey();
    return currentBoardKey();
  }

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

  // Pick the highest-quality pinimg URL available for an <img>:
  // prefer srcset (largest descriptor), then data-src, then current src.
  function getBestPinimgUrl(img) {
    const candidates = [];
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      let bestUrl = '', bestVal = 0;
      srcset.split(',').forEach(part => {
        const [url, desc] = part.trim().split(/\s+/);
        if (!url || !url.includes('i.pinimg.com')) return;
        const val = parseFloat(desc) || 0;
        if (val > bestVal) { bestVal = val; bestUrl = url; }
      });
      if (bestUrl) candidates.push(bestUrl);
    }
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc && dataSrc.includes('i.pinimg.com')) candidates.push(dataSrc);
    if (img.src && img.src.includes('i.pinimg.com')) candidates.push(img.src);

    // Prefer the largest dimensions in the URL path among the candidates.
    let best = candidates[0] || '';
    let bestSize = 0;
    for (const url of candidates) {
      const sizeMatch = url.match(/\/i\.pinimg\.com\/(\d+)x/);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      if (size > bestSize) { bestSize = size; best = url; }
    }

    // Upgrade sized URL to /originals/.
    const m = best.match(OQ_RE);
    return m ? m[1] + '/originals' + m[2] : best;
  }

  // Snapshot whatever pin images are currently in the DOM into the
  // accumulator set.  Called repeatedly while scrolling so we catch
  // images before Pinterest's virtual list recycles those DOM nodes.
  // Also captures pin titles from title elements in each pin card.
  function snapshotPinUrls(seen, urls, names, ids) {
    document.querySelectorAll('img[src*="i.pinimg.com"], img[data-src*="i.pinimg.com"]').forEach(img => {
      // Skip tiny avatars/icons
      const w = img.naturalWidth || img.width;
      if (w && w < 80) return;
      // Skip images inside the "More Ideas" / suggested section at the bottom of boards
      if (img.closest('.moreIdeasOnBoard, [href*="more-ideas"], [href*="/_tools/"]')) return;
      const url = getBestPinimgUrl(img);
      if (!url || seen.has(url)) return;
      const pinScope = img.closest(
        '[data-test-id="pinWrapper"], [data-grid-item="true"], [data-test-id="pin"], div[role="listitem"]'
      );
      seen.add(url);
      urls.push(url);
      names.set(url, extractPinTitleFromScope(pinScope));
      if (ids) ids.set(url, pinScope ? getPinIdFromCard(pinScope) : null);
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
      vidItems.push({ channel: m[1], hash: m[2], title: extractPinTitleFromScope(pinScope), pinId: pinScope ? getPinIdFromCard(pinScope) : null });
    });
  }

  // Scroll to the bottom, snapshotting URLs as the DOM changes so virtualised
  // DOM nodes are captured before they get removed. Uses MutationObserver to
  // react to Pinterest's lazy loading instead of polling on a fixed interval.
  // Stall threshold is intentionally generous (12 idle scrolls) because lazy
  // load can pause for several seconds.
  async function autoScrollAndCollect(setStatus) {
    const seen     = new Set();
    const urls     = [];
    const names    = new Map();
    const ids      = new Map();
    const vidSeen  = new Set();
    const vidItems = [];
    return new Promise(resolve => {
      let lastH = 0, stall = 0;
      let idleTimer = null;
      let finished = false;

      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(idleTimer);
        obs.disconnect();
        snapshotPinUrls(seen, urls, names, ids);   // final grab
        snapshotVideoUrls(vidSeen, vidItems);
        window.scrollTo(0, 0);
        resolve({ urls, names, ids, vidItems });
      }

      function tick() {
        if (finished) return;
        clearTimeout(idleTimer);
        snapshotPinUrls(seen, urls, names, ids);
        snapshotVideoUrls(vidSeen, vidItems);
        window.scrollTo(0, document.body.scrollHeight);
        const h = document.body.scrollHeight;
        setStatus('scroll', urls.length + vidItems.length, 0);
        if (h === lastH) {
          stall++;
          if (stall >= 12) { finish(); return; }
        } else {
          stall = 0;
          lastH = h;
        }
        idleTimer = setTimeout(tick, 1200);
      }

      // Snapshot immediately when Pinterest adds new nodes, then wait briefly
      // for the lazy-load batch to settle before scrolling again.
      const obs = new MutationObserver(() => {
        if (finished) return;
        clearTimeout(idleTimer);
        snapshotPinUrls(seen, urls, names, ids);
        snapshotVideoUrls(vidSeen, vidItems);
        idleTimer = setTimeout(tick, 400);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      tick();
    });
  }

  // ─── collect + scroll helpers (shared by both download modes) ──────
  async function collectAllPins(setStatus) {
    setStatus('scroll', 0, 0);
    return autoScrollAndCollect(setStatus);
  }

  // Fetch up to `concurrency` image URLs in parallel, trying originals first
  // and falling back to smaller sizes when the original is unavailable.
  async function fetchParallel(urls, concurrency, onProgress) {
    const results = new Array(urls.length).fill(null);
    let nextIdx = 0, finished = 0;
    async function worker() {
      while (nextIdx < urls.length) {
        const i = nextIdx++;
        try { results[i] = await fetchBestImageBuffer(urls[i]); } catch (_) {}
        onProgress(++finished, urls.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MINIMAL ZIP WRITER (STORE + raw DEFLATE when available)
  // ═══════════════════════════════════════════════════════════════════
  // Generates a valid .zip file from an array of { name, buffer } entries.
  // Uses STORE (compression method 0) by default, but compresses with raw
  // DEFLATE (method 8) via CompressionStream when the browser supports it
  // and the result is smaller. Falls back to STORE on older browsers.

  function makeCrc32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  }
  const _crc32Table = makeCrc32Table();

  function crc32(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = _crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function writeUint16(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
  function writeUint32(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }

  // Normalize a value from GM_xmlhttpRequest / fetch to an ArrayBuffer.
  function toArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (value?.buffer instanceof ArrayBuffer) return value.buffer;
    return null;
  }

  function concatArrays(arrays) {
    let total = 0;
    arrays.forEach(a => { total += a.byteLength || a.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    arrays.forEach(a => {
      const src = a instanceof Uint8Array ? a : new Uint8Array(a);
      out.set(src, offset);
      offset += src.byteLength;
    });
    return out;
  }

  // Compress a single entry using the browser's raw DEFLATE stream when
  // available and when it actually reduces size. Falls back to STORE.
  function supportsRawDeflate() {
    if (typeof CompressionStream !== 'function') return false;
    try {
      new CompressionStream('deflate-raw');
      return true;
    } catch (_) {
      return false;
    }
  }

  async function compressZipEntry(data) {
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();
        const chunks = [];
        const reader = cs.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const compressed = concatArrays(chunks);
        if (compressed.byteLength < data.byteLength) {
          return { data: compressed, method: 8 };
        }
      } catch (_) {}
    }
    return { data, method: 0 };
  }

  // Streaming ZIP writer: add entries one at a time and finalize at the end.
  // This keeps peak memory low because source buffers can be released between
  // chunks instead of holding every file in memory until the archive is built.
  class StreamingZipWriter {
    constructor() {
      this.parts = [];
      this.centralHeaders = [];
      this.centralOffset = 0;
      this.entryCount = 0;
      this.totalUncompressed = 0;
    }

    async addEntry(name, buffer) {
      const nameBytes = new TextEncoder().encode(name);
      const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const uncompressedSize = raw.byteLength;
      this.totalUncompressed += uncompressedSize;
      const checksum = crc32(raw);
      const { data: compressedData, method } = await compressZipEntry(raw);
      const compressedSize = compressedData.byteLength;

      const localHeader = concatArrays([
        writeUint32(0x04034B50),
        writeUint16(20),
        writeUint16(method === 8 ? 2 : 0),
        writeUint16(method),
        writeUint16(0),
        writeUint16(0),
        writeUint32(checksum),
        writeUint32(compressedSize),
        writeUint32(uncompressedSize),
        writeUint16(nameBytes.length),
        writeUint16(0),
        nameBytes,
      ]);
      this.parts.push(localHeader, compressedData);

      const centralHeader = concatArrays([
        writeUint32(0x02014B50),
        writeUint16(20),
        writeUint16(20),
        writeUint16(method === 8 ? 2 : 0),
        writeUint16(method),
        writeUint16(0),
        writeUint16(0),
        writeUint32(checksum),
        writeUint32(compressedSize),
        writeUint32(uncompressedSize),
        writeUint16(nameBytes.length),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint32(0),
        writeUint32(this.centralOffset),
        nameBytes,
      ]);
      this.centralHeaders.push(centralHeader);
      this.centralOffset += localHeader.byteLength + compressedSize;
      this.entryCount++;
    }

    finalize() {
      const centralDir = concatArrays(this.centralHeaders);
      const eocd = concatArrays([
        writeUint32(0x06054B50),
        writeUint16(0),
        writeUint16(0),
        writeUint16(this.entryCount),
        writeUint16(this.entryCount),
        writeUint32(centralDir.byteLength),
        writeUint32(this.centralOffset),
        writeUint16(0),
      ]);
      this.parts.push(centralDir, eocd);
      return new Blob(this.parts, { type: 'application/zip' });
    }
  }

  // Build a zip Blob from entries. Names should be forward-slash paths.
  // Uses Blob parts instead of one giant Uint8Array to avoid memory mishaps.
  // Compresses entries with raw DEFLATE when supported, otherwise STORE.
  async function createZip(entries) {
    const parts = [];
    const centralHeaders = [];
    let centralOffset = 0;

    for (const entry of entries) {
      const nameBytes = new TextEncoder().encode(entry.name);
      const buf = toArrayBuffer(entry.buffer);
      if (!buf) throw new Error('invalid buffer for ' + entry.name);
      const raw = new Uint8Array(buf);
      const uncompressedSize = raw.byteLength;
      const checksum = crc32(raw);
      const { data: compressedData, method } = await compressZipEntry(raw);
      const compressedSize = compressedData.byteLength;

      const localHeader = concatArrays([
        writeUint32(0x04034B50),      // Local file header signature
        writeUint16(20),              // Version needed (2.0)
        writeUint16(method === 8 ? 2 : 0), // General purpose bit flag
        writeUint16(method),          // Compression method
        writeUint16(0),               // File last modification time
        writeUint16(0),               // File last modification date
        writeUint32(checksum),        // CRC-32
        writeUint32(compressedSize),  // Compressed size
        writeUint32(uncompressedSize),// Uncompressed size
        writeUint16(nameBytes.length),// File name length
        writeUint16(0),               // Extra field length
        nameBytes,
      ]);
      parts.push(localHeader, compressedData);

      const centralHeader = concatArrays([
        writeUint32(0x02014B50),      // Central directory header signature
        writeUint16(20),              // Version made by
        writeUint16(20),              // Version needed
        writeUint16(method === 8 ? 2 : 0), // Flags
        writeUint16(method),          // Compression method
        writeUint16(0),               // Modification time
        writeUint16(0),               // Modification date
        writeUint32(checksum),
        writeUint32(compressedSize),
        writeUint32(uncompressedSize),
        writeUint16(nameBytes.length),
        writeUint16(0),               // Extra field length
        writeUint16(0),               // Comment length
        writeUint16(0),               // Disk number start
        writeUint16(0),               // Internal file attributes
        writeUint32(0),               // External file attributes
        writeUint32(centralOffset),   // Relative offset of local header
        nameBytes,
      ]);
      centralHeaders.push(centralHeader);
      centralOffset += localHeader.byteLength + compressedSize;
    }

    const centralDir = concatArrays(centralHeaders);
    const eocd = concatArrays([
      writeUint32(0x06054B50),        // EOCD signature
      writeUint16(0),                 // Disk number
      writeUint16(0),                 // Disk with central directory
      writeUint16(entries.length),    // Central directory entries on this disk
      writeUint16(entries.length),    // Total central directory entries
      writeUint32(centralDir.byteLength),
      writeUint32(centralOffset),
      writeUint16(0),                 // Comment length
    ]);

    parts.push(centralDir, eocd);
    return new Blob(parts, { type: 'application/zip' });
  }


  // Large-board safety limits.
  const BOARD_ZIP_MAX_PINS = 2000;
  const BOARD_ZIP_MAX_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB uncompressed
  const BOARD_ZIP_CHUNK_SIZE = 100;

  // ─── Save all board images + videos as named downloads ──────────
  async function downloadBoardFolder(setStatus, { newOnly = false, zip = false } = {}) {
    const { urls, names, ids, vidItems } = await collectAllPins(setStatus);
    if (!urls.length && !vidItems.length) { alert('[Pinterest Power Menu] No images or videos found on this board.'); return; }

    // Filter to only new pins when requested and tracking is enabled
    const tracking = get('boardDownloadTrack');
    let dlUrls = urls, dlVids = vidItems, skipped = 0;
    if (newOnly && tracking) {
      const boardKey = currentBoardKey();
      const seen = new Set(getBoardHistory()[boardKey] || []);
      dlUrls = urls.filter(u => { const id = ids.get(u); if (id && seen.has(id)) { skipped++; return false; } return true; });
      dlVids = vidItems.filter(vi => { if (vi.pinId && seen.has(vi.pinId)) { skipped++; return false; } return true; });
    }

    const totalItems = dlUrls.length + dlVids.length;
    if (!totalItems && skipped > 0) { setStatus('done', { saved: 0, failed: 0, skipped }); return; }
    if (!totalItems) { alert('[Pinterest Power Menu] No images or videos found on this board.'); return; }

    if (totalItems > BOARD_ZIP_MAX_PINS) {
      alert(`[Pinterest Power Menu] This board has ${totalItems} items, which exceeds the safety limit of ${BOARD_ZIP_MAX_PINS}. Please use "Download All" to save files individually, or narrow the board.`);
      setStatus('done', { saved: 0, failed: 0, skipped });
      return;
    }

    let useZip = zip;

    // On mobile, if raw DEFLATE is unsupported we fall back to individual
    // downloads rather than produce a potentially broken zip.
    if (useZip && IS_MOBILE && !supportsRawDeflate()) {
      useZip = false;
      showPowerMenuToast('ZIP compression is not supported on this browser. Downloading files individually.');
    }

    // Prefer the pin title. If unavailable, fall back to the pin's real ID
    // ("Pin - 901212575447549382") taken from its grid card link, matching the
    // single-pin page. Only use a random name when neither title nor ID exists.
    function makeFileName(url, ext) {
      let pinName = buildPinFilename(
        stripKnownExt(sanitizeFilename(names.get(url) || '')) || '',
        ids.get(url) || '', get('boardFilenameStrategy'));
      if (pinName.length > 120) pinName = pinName.slice(0, 120).trimEnd();
      return `${pinName}${ext}`;
    }
    function makeVideoFileName(vi) {
      let pinName = buildPinFilename(
        stripKnownExt(sanitizeFilename(vi.title || '')) || '',
        vi.pinId || '', get('boardFilenameStrategy'));
      if (pinName.length > 120) pinName = pinName.slice(0, 120).trimEnd();
      return `${pinName}.mp4`;
    }

    // Ensure unique filenames inside a zip by appending (1), (2), etc.
    function uniqueFileName(name, used) {
      if (!used.has(name)) { used.add(name); return name; }
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
      const base = ext ? name.slice(0, -ext.length) : name;
      let n = 1;
      let candidate;
      do { candidate = `${base} (${n++})${ext}`; } while (used.has(candidate));
      used.add(candidate);
      return candidate;
    }

    let saved = 0, failed = 0;
    const savedIds = [];

    if (useZip) {
      // ── Streaming ZIP: process images and videos in chunks so we never hold
      //    every file in memory at once. Source buffers go out of scope after
      //    each chunk.
      const writer = new StreamingZipWriter();
      const usedNames = new Set();

      for (let start = 0; start < dlUrls.length; start += BOARD_ZIP_CHUNK_SIZE) {
        const chunk = dlUrls.slice(start, start + BOARD_ZIP_CHUNK_SIZE);
        const bufs = await fetchParallel(chunk, IS_MOBILE ? 2 : 5, (done, _) =>
          setStatus('fetch', saved + done, totalItems)
        );
        for (let i = 0; i < bufs.length; i++) {
          const url = chunk[i];
          let buf = toArrayBuffer(bufs[i]);
          if (!buf) { failed++; continue; }
          const ext = detectFileType(new Uint8Array(buf));
          // Skip WebP→PNG conversion in ZIP mode to save memory; keep originals.
          const name = uniqueFileName(makeFileName(url, ext), usedNames);
          try {
            await writer.addEntry(name, buf);
            saved++;
            const pinId = ids.get(url);
            if (pinId) savedIds.push(pinId);
            bumpStat('statShowImagesDownloaded', 'statCountImagesDownloaded');
          } catch (_) { failed++; }
          setStatus('fetch', saved, totalItems);
          if (writer.totalUncompressed > BOARD_ZIP_MAX_BYTES) {
            alert(`[Pinterest Power Menu] Board exceeds the ${(BOARD_ZIP_MAX_BYTES / 1024 / 1024 / 1024).toFixed(1)} GB uncompressed size limit. Stopping ZIP download.`);
            setStatus('done', { saved, failed, skipped });
            return;
          }
        }
        if (IS_MOBILE) await schedulerYield();
      }

      for (let start = 0; start < dlVids.length; start += BOARD_ZIP_CHUNK_SIZE) {
        const chunk = dlVids.slice(start, start + BOARD_ZIP_CHUNK_SIZE);
        for (const vi of chunk) {
          const fallbackUrls = vi.channel === 'mc'
            ? [
                `https://v1.pinimg.com/videos/mc/720p/${vi.hash}.mp4`,
                `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t4.mp4`,
                `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t3.mp4`,
                `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t2.mp4`,
                `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t1.mp4`,
              ]
            : [`https://v1.pinimg.com/videos/iht/expMp4/${vi.hash}_720w.mp4`];
          try {
            const vbuf = toArrayBuffer(await fetchVideoBuffer(fallbackUrls, null));
            if (!vbuf) { failed++; continue; }
            const name = uniqueFileName(makeVideoFileName(vi), usedNames);
            await writer.addEntry(name, vbuf);
            saved++;
            if (vi.pinId) savedIds.push(vi.pinId);
            setStatus('fetch', saved, totalItems);
            if (writer.totalUncompressed > BOARD_ZIP_MAX_BYTES) {
              alert(`[Pinterest Power Menu] Board exceeds the ${(BOARD_ZIP_MAX_BYTES / 1024 / 1024 / 1024).toFixed(1)} GB uncompressed size limit. Stopping ZIP download.`);
              setStatus('done', { saved, failed, skipped });
              return;
            }
          } catch (_) { failed++; }
          setStatus('fetch', saved, totalItems);
        }
        if (IS_MOBILE) await schedulerYield();
      }

      if (writer.entryCount) {
        try {
          const zipBlob = writer.finalize();
          const boardName = getBoardDisplayName() || 'board';
          const zipName = `${boardName}.zip`;
          const a = document.createElement('a');
          const url = URL.createObjectURL(zipBlob);
          a.href = url;
          a.download = zipName;
          triggerAnchorDownload(a, url, 10000);
          bumpStat('statShowVideosDownloaded', 'statCountVideosDownloaded');
        } catch (_) { failed += writer.entryCount; saved -= writer.entryCount; }
      }
    } else {
      // ── Download board image files ────────────────────────────────
      const bufs = await fetchParallel(dlUrls, IS_MOBILE ? 2 : 5, (done, _) =>
        setStatus('fetch', done, totalItems)
      );

      // Process images: detect extension and optionally convert WebP → PNG
      const imageItems = [];
      for (let i = 0; i < bufs.length; i++) {
        let buf = toArrayBuffer(bufs[i]);
        if (!buf) { failed++; continue; }
        let ext = detectFileType(new Uint8Array(buf));
        if (get('convertWebpToPng') && ext === '.webp') {
          const converted = toArrayBuffer(await convertImageBuffer(buf, '.webp', '.png'));
          if (converted && converted !== buf) {
            buf = converted;
            ext = '.png';
          }
        }
        imageItems.push({ url: dlUrls[i], buf, ext });
        if (IS_MOBILE && i % 4 === 3) await schedulerYield();
      }

      // ── Save images one by one ──────────────────────────────────
      for (const item of imageItems) {
        const fileName = makeFileName(item.url, item.ext);
        try {
          const a = document.createElement('a');
          const url = URL.createObjectURL(new Blob([item.buf]));
          a.href = url;
          a.download = fileName;
          triggerAnchorDownload(a, url, IS_MOBILE ? 2000 : 200);
          await new Promise(r => setTimeout(r, 300));
          saved++;
          const pinId = ids.get(item.url);
          if (pinId) savedIds.push(pinId);
          bumpStat('statShowImagesDownloaded', 'statCountImagesDownloaded');
          if (IS_MOBILE) await schedulerYield();
        } catch (_) { failed++; }
        setStatus('fetch', saved, totalItems);
      }

      // ── Save videos one by one (preserves mobile blob streaming) ─
      for (let i = 0; i < dlVids.length; i++) {
        const vi = dlVids[i];
        const fallbackUrls = vi.channel === 'mc'
          ? [
              `https://v1.pinimg.com/videos/mc/720p/${vi.hash}.mp4`,
              `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t4.mp4`,
              `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t3.mp4`,
              `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t2.mp4`,
              `https://v1.pinimg.com/videos/mc/expMp4/${vi.hash}_t1.mp4`,
            ]
          : [`https://v1.pinimg.com/videos/iht/expMp4/${vi.hash}_720w.mp4`];
        const title = makeVideoFileName(vi);
        try {
          await downloadVideoFile(fallbackUrls, title, null);
          saved++;
          if (vi.pinId) savedIds.push(vi.pinId);
        } catch (_) { failed++; }
        setStatus('fetch', saved, totalItems);
        if (IS_MOBILE) await schedulerYield();
      }
    }

    if (tracking && savedIds.length) saveBoardHistory(currentBoardKey(), savedIds);
    setStatus('done', { saved, failed, skipped });
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

    const DL_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 19v2h14v-2H5z"/></svg>`;
    const SPARK_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`;

    // Popup menu (appears above the button)
    const menu = document.createElement('div');
    menu.id = 'pe-bd-menu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div id="pe-bd-status" style="display:none"></div>
      <button class="pe-bd-opt" id="pe-bd-folder">
        ${DL_ICON}
        Download All
      </button>
      <button class="pe-bd-opt" id="pe-bd-folder-zip">
        ${DL_ICON}
        Download All as ZIP
      </button>
      <button class="pe-bd-opt" id="pe-bd-new" style="display:none">
        ${SPARK_ICON}
        Download New
      </button>
      <button class="pe-bd-opt" id="pe-bd-new-zip" style="display:none">
        ${SPARK_ICON}
        Download New as ZIP
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

    const statusEl = menu.querySelector('#pe-bd-status');
    const dirBtn   = menu.querySelector('#pe-bd-folder');
    const dirZipBtn = menu.querySelector('#pe-bd-folder-zip');
    const newBtn   = menu.querySelector('#pe-bd-new');
    const newZipBtn = menu.querySelector('#pe-bd-new-zip');
    const allBtns = [dirBtn, dirZipBtn, newBtn, newZipBtn];

    // Show "Download New" buttons only when tracking is enabled
    function syncNewBtns() {
      const show = get('boardDownloadTrack') ? '' : 'none';
      newBtn.style.display = show;
      newZipBtn.style.display = show;
    }
    syncNewBtns();

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

    // Re-sync "Download New" visibility when the tracking setting changes
    function onSettingChange(e) {
      if (e.detail && e.detail.key === 'boardDownloadTrack') syncNewBtns();
    }
    document.addEventListener('pe-setting-change', onSettingChange);

    // Store cleanup on fab so removeBoardDownloaderUI can detach the listeners
    fab._bdCleanup = () => {
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('pe-setting-change', onSettingChange);
    };

    let doneTimer = null;

    function setStatus(phase, a, b) {
      if (phase === 'cancelled') {
        statusEl.style.display = 'none';
        allBtns.forEach(b => b.disabled = false);
        return;
      }
      statusEl.style.display = 'block';
      if (phase === 'scroll') {
        statusEl.innerHTML = '';
        statusEl.style.cssText = 'display:block;background:#f8f8f8;font-size:11px;text-align:center;padding:6px 10px;color:#555';
        statusEl.textContent = `Scrolling… ${a} items found`;
      } else if (phase === 'fetch') {
        statusEl.style.cssText = 'display:block;background:#f8f8f8;font-size:11px;text-align:center;padding:6px 10px;color:#555';
        statusEl.textContent = `Saving ${a}/${b} (${b ? Math.round(a/b*100) : 0}%)`;
      } else if (phase === 'done') {
        const { saved, failed, skipped } = typeof a === 'object' ? a : { saved: a, failed: 0, skipped: 0 };
        if (doneTimer) clearTimeout(doneTimer);

        // Build popup HTML
        let statsHtml = `<span style="color:#2e7d32">✓ ${saved} saved</span>`;
        if (failed > 0)  statsHtml += `&ensp;<span style="color:#c62828">✗ ${failed} failed</span>`;
        if (skipped > 0) statsHtml += `&ensp;<span style="color:#888">⊘ ${skipped} already downloaded</span>`;

        statusEl.style.cssText = 'display:block;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:10px 12px;position:relative;margin-bottom:6px';
        statusEl.innerHTML = `
          <button id="pe-bd-close" title="Close" style="position:absolute;top:4px;right:6px;background:none;border:none;cursor:pointer;font-size:14px;color:#999;line-height:1;padding:0">✕</button>
          <div style="font-weight:600;font-size:12px;color:#333;margin-bottom:4px">Download Complete</div>
          <div style="font-size:11px;line-height:1.5">${statsHtml}</div>
        `;

        statusEl.querySelector('#pe-bd-close').addEventListener('click', () => {
          if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
          closePopup();
        });

        function closePopup() {
          statusEl.style.display = 'none';
          allBtns.forEach(b => b.disabled = false);
          menuOpen = false;
          menu.style.display = 'none';
        }

        doneTimer = setTimeout(closePopup, 5000);
      }
    }

    dirBtn.addEventListener('click', async () => {
      allBtns.forEach(b => b.disabled = true);
      await downloadBoardFolder(setStatus, { newOnly: false, zip: false });
      allBtns.forEach(b => b.disabled = false);
    });

    dirZipBtn.addEventListener('click', async () => {
      allBtns.forEach(b => b.disabled = true);
      await downloadBoardFolder(setStatus, { newOnly: false, zip: true });
      allBtns.forEach(b => b.disabled = false);
    });

    newBtn.addEventListener('click', async () => {
      allBtns.forEach(b => b.disabled = true);
      await downloadBoardFolder(setStatus, { newOnly: true, zip: false });
      allBtns.forEach(b => b.disabled = false);
    });

    newZipBtn.addEventListener('click', async () => {
      allBtns.forEach(b => b.disabled = true);
      await downloadBoardFolder(setStatus, { newOnly: true, zip: true });
      allBtns.forEach(b => b.disabled = false);
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

  // Fetch a video file into memory, trying URLs in order.
  // Returns the ArrayBuffer on success; rejects if every URL fails.
  function fetchVideoBuffer(urls, onProgress) {
    return new Promise((resolve, reject) => {
      let idx = 0;
      function tryNext() {
        if (idx >= urls.length) { reject(new Error('all URLs failed')); return; }
        const url = urls[idx++];
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
          responseType: 'arraybuffer',
          headers: {
            'Referer':    location.href,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':     'video/mp4,video/*;q=0.9,*/*;q=0.8',
          },
          onprogress: e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); },
          onload: r => {
            if (r.status >= 200 && r.status < 300) {
              finish(() => resolve(r.response));
            } else {
              finish(tryNext);
            }
          },
          onerror:   () => finish(tryNext),
          ontimeout: () => finish(tryNext),
        });
        timer = setTimeout(() => finish(() => { try { req.abort(); } catch(_){} tryNext(); }), 45000);
      }
      tryNext();
    });
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
                const url  = URL.createObjectURL(blob);
                a.href     = url;
                a.download = base + '.mp4';
                triggerAnchorDownload(a, url, 10000);
                bumpStat('statShowVideosDownloaded', 'statCountVideosDownloaded');
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

  // Accepts only http(s), data:image and blob: URLs; everything else -> ''.
  // Shared by the logo swap, per-button images and theme backgrounds.
  function normalizeImageUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(url)) return url;
    return '';
  }
  const normalizeCustomLogoUrl = normalizeImageUrl;

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
    if (_customLogoObs) { _customLogoObs.disconnect(); _customLogoObs = null; unregisterObserver('customLogo'); }
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
    if (hasObserver('customLogo')) return;
    _customLogoRescan = debounce(() => applyCustomPinterestLogo(document), 250);
    _customLogoObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      _customLogoRescan();
    });
    _customLogoObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('customLogo', _customLogoObs, { target: document.documentElement });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: CUSTOM NAV-BUTTON IMAGES
  // ═══════════════════════════════════════════════════════════════════
  // Generalizes the logo swap to every nav button: hides the button's <svg>
  // and overlays a user-chosen <img>. Each button has its own url/size/circle,
  // stored under the customNavImages config object. Works on desktop + mobile.
  //
  // selector  = element whose icon frame holds the <svg> (desktop & mobile)
  // frameSel  = the inner box to size the image to (varies desktop vs mobile)
  const NAV_BUTTONS = [
    { id: 'home',     label: 'Home',        desktop: '[data-test-id="home-tab"]',                          mobile: '[data-test-id="nav-bar-home"]' },
    { id: 'explore',  label: 'Explore',     desktop: '[data-test-id="today-tab"]',                         mobile: null },
    { id: 'search',   label: 'Search',      desktop: null,                                                 mobile: '[data-test-id="nav-bar-magnifying-glass"]' },
    { id: 'boards',   label: 'Your boards', desktop: '[data-test-id="boards-tab"]',                        mobile: null },
    { id: 'create',   label: 'Create',      desktop: '[data-test-id="create-tab"]',                        mobile: null },
    { id: 'updates',  label: 'Updates',     desktop: '[data-test-id="bell-icon"] button[aria-label="Updates"]', mobile: null },
    { id: 'messages', label: 'Messages',    desktop: '[data-test-id="notifications-button"]',              mobile: '[data-test-id="nav-bar-speech-ellipsis"]' },
    { id: 'settings', label: 'Settings',    desktop: '[data-test-id="vertical-nav-settings-button"]',      mobile: null },
  ];

  // Buttons that exist on the current platform, in display order.
  const VISIBLE_NAV_BUTTONS = NAV_BUTTONS.filter(b => (IS_MOBILE ? b.mobile : b.desktop));

  let _customNavObs = null;
  let _customNavRescan = null;

  function navButtonSelector(btn) {
    return IS_MOBILE ? btn.mobile : btn.desktop;
  }

  // Returns { url, size, circle } for a button id, merged over sane defaults.
  function getNavImageCfg(id) {
    const all = get('customNavImages') || {};
    const raw = all[id] || {};
    const size = Number(raw.size);
    return {
      url: normalizeImageUrl(raw.url),
      size: Number.isFinite(size) ? Math.max(8, Math.round(size)) : 32,
      circle: raw.circle !== false,
    };
  }

  // Persists a single field for one button without disturbing the others.
  function setNavImageField(id, field, value) {
    const all = { ...(get('customNavImages') || {}) };
    all[id] = { ...(all[id] || {}), [field]: value };
    set('customNavImages', all);
  }

  function anyNavImageSet() {
    return VISIBLE_NAV_BUTTONS.some(b => getNavImageCfg(b.id).url);
  }

  function removeCustomNavImages(root = document) {
    root.querySelectorAll?.('.pe-custom-nav-img').forEach(img => img.remove());
    // Restore any <svg> we hid inside a nav button frame.
    NAV_BUTTONS.forEach(btn => {
      const sel = navButtonSelector(btn);
      if (!sel) return;
      root.querySelectorAll?.(sel).forEach(el => {
        el.querySelectorAll('svg').forEach(svg => {
          if (svg.dataset.peNavHidden) {
            svg.style.removeProperty('display');
            delete svg.dataset.peNavHidden;
          }
        });
      });
    });
  }

  function applyCustomNavImages(root = document) {
    VISIBLE_NAV_BUTTONS.forEach(btn => {
      const sel = navButtonSelector(btn);
      const { url, size, circle } = getNavImageCfg(btn.id);
      const els = sel ? (root.querySelectorAll?.(sel) || []) : [];
      els.forEach(el => {
        // Icon frame: desktop uses .VHreRh, mobile uses .gSktR2; fall back.
        const frame = el.querySelector('.VHreRh, .gSktR2') || el.querySelector('svg')?.parentElement || el;
        const existing = frame.querySelector(':scope > .pe-custom-nav-img');
        if (!url) {
          if (existing) existing.remove();
          frame.querySelectorAll('svg').forEach(svg => {
            if (svg.dataset.peNavHidden) {
              svg.style.removeProperty('display');
              delete svg.dataset.peNavHidden;
            }
          });
          return;
        }
        frame.style.setProperty('--pe-custom-nav-size', size + 'px');
        frame.querySelectorAll('svg').forEach(svg => {
          svg.style.setProperty('display', 'none', 'important');
          svg.dataset.peNavHidden = '1';
        });
        let img = existing;
        if (!img) {
          img = document.createElement('img');
          img.className = 'pe-custom-nav-img';
          img.alt = btn.label;
          frame.appendChild(img);
        }
        if (img.src !== url) img.src = url;
        img.style.setProperty('--pe-custom-nav-size', size + 'px');
        img.classList.toggle('pe-custom-nav-circle', circle);
      });
    });
  }

  function stopCustomNavImages() {
    if (_customNavObs) { _customNavObs.disconnect(); _customNavObs = null; unregisterObserver('customNav'); }
    removeCustomNavImages(document);
  }

  function initCustomNavImages() {
    if (!anyNavImageSet()) {
      stopCustomNavImages();
      return;
    }
    applyCustomNavImages(document);
    if (hasObserver('customNav')) return;
    _customNavRescan = debounce(() => applyCustomNavImages(document), 250);
    _customNavObs = new MutationObserver(records => {
      if (hasOnlyPowerMenuMutations(records)) return;
      _customNavRescan();
    });
    _customNavObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('customNav', _customNavObs, { target: document.documentElement });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: CUSTOM THEME / BACKGROUND
  // ═══════════════════════════════════════════════════════════════════
  // Injects a dedicated <style id="pe-theme"> that paints the page background
  // (solid color, gradient or image) behind Pinterest's content. Presets just
  // pre-fill the background fields; "Custom" lets the user set their own.

  const THEME_PRESETS = [
    { id: 'default', label: 'Pinterest default', value: '' },
    { id: 'dark', label: 'Dark', value: '#121212' },
    { id: 'midnight', label: 'Midnight', value: '#0f2027' },
    { id: 'forest', label: 'Forest', value: '#1a2f1a' },
    { id: 'rose', label: 'Rose', value: '#d64c7f' },
    { id: 'custom', label: 'Custom color…' },
  ];

  function getAllThemePresets() {
    return THEME_PRESETS;
  }

  function getThemeBgCss() {
    if (!get('themeEnabled')) return '';
    const c = String(get('themeColor') || '').trim();
    return /^#([0-9a-f]{3}){1,2}$/i.test(c) ? `background-color:${c};` : '';
  }

  // Return a CSS `background` value suitable for the small theme preview swatch.
  function getThemePreviewBackground() {
    const id = get('themePreset');
    const preset = THEME_PRESETS.find(p => p.id === id);
    if (preset && preset.value) return preset.value;
    return String(get('themeColor') || '').trim();
  }

  // Active only when the user has explicitly enabled the theme and supplied a color.
  function themeIsActive() {
    return !!getThemeBgCss();
  }

  // Migration from legacy gradient theme to solid-color model.
  function migrateThemeSettings() {
    const savedRaw = storageRead(SETTINGS_KEY);
    const saved = savedRaw ? (() => { try { return JSON.parse(savedRaw); } catch (_) { return {}; } })() : {};
    const validPresets = new Set(THEME_PRESETS.map(p => p.id));
    const oldPreset = saved.themePreset;

    // Convert a saved gradient into a solid color by grabbing its first color token.
    if (Object.prototype.hasOwnProperty.call(saved, 'themeBgGradient')) {
      const extracted = firstColorToken(saved.themeBgGradient);
      if (extracted) set('themeColor', extracted);
    }

    // Existing installs without the new master switch: keep the theme enabled only
    // if they had a non-default preset or a saved custom gradient. Fresh installs
    // default to off.
    if (saved.themeEnabled === undefined) {
      const hadActiveTheme = (oldPreset && oldPreset !== 'default') ||
        String(saved.themeBgGradient || '').trim();
      if (!hadActiveTheme || (oldPreset && !validPresets.has(oldPreset))) {
        set('themePreset', 'default');
        set('themeEnabled', false);
      } else {
        set('themeEnabled', true);
      }
    }
    if (oldPreset && !validPresets.has(oldPreset)) {
      set('themePreset', 'default');
      set('themeEnabled', false);
    }

    // Drop obsolete keys from storage.
    ['themeBgType', 'themeBgColor', 'themeBgImageUrl', 'themeBgImageFit', 'savedThemes', 'themeBgGradient'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(saved, key)) {
        try { delete _cfg[key]; } catch (_) {}
      }
    });
    saveCfg();
  }

  function ensureThemeStyleEl() {
    let el = document.getElementById('pe-theme');
    if (!el) {
      el = document.createElement('style');
      el.id = 'pe-theme';
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function stopCustomTheme() {
    const el = document.getElementById('pe-theme');
    if (el) el.textContent = '';
    stopThemeSurfaceObserver();
    unmarkThemeSurfaces();
  }

  // ── Chrome "surfaces" (top header bar, sticky tags row, left nav rail) ──
  // These ship their own opaque background from Pinterest's obfuscated, per-deploy
  // class names, so the theme stops at them. We can't hard-code those classes, so
  // we walk up from a stable hook to the element that actually carries the opaque
  // background and tag it `pe-themed-surface`; the injected CSS then paints one
  // uniform near-solid colour over all of them (derived from the theme) so the bars
  // match each other and sit slightly off the page background. Runs on both desktop
  // and mobile chrome.
  let _peThemeSurfaceObs = null;

  // Pick the first CSS colour token out of a gradient/string, or '' if none.
  function firstColorToken(str) {
    const m = String(str || '').match(/#[0-9a-f]{3,8}\b|\brgba?\([^)]+\)|\bhsla?\([^)]+\)/i);
    return m ? m[0] : '';
  }

  // One uniform colour for every chrome bar, derived from the active theme and
  // nudged toward the opposite of the current scheme so it reads as "similar but
  // not equal" to the page background (the look the user liked on the sidebar).
  function getChromeColor() {
    const dark = isPinterestDarkTheme();
    let base = String(get('themeColor') || '').trim();
    if (!/^#([0-9a-f]{3}){1,2}$/i.test(base)) base = dark ? '#1c1c1c' : '#ededed';
    return `color-mix(in srgb, ${base} 92%, ${dark ? '#fff' : '#000'} 8%)`;
  }

  function peBgIsOpaque(el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg) return false;
    const m = bg.match(/rgba?\(([^)]+)\)/i);
    if (!m) return false;
    const parts = m[1].split(',');
    const alpha = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    return alpha > 0.05;
  }

  // Nearest wide + short + opaque ancestor of `hook` (the chrome bar that carries
  // the background) — capped in height so we grab the bar, not the whole app shell.
  function peFindBarSurface(hook, maxUp) {
    const minW = window.innerWidth * 0.5;
    const maxH = window.innerHeight * 0.5;
    let el = hook.parentElement;
    for (let i = 0; el && i < maxUp; i++, el = el.parentElement) {
      if (el === document.body || el.id === '__PWS_ROOT__') break;
      if (el.offsetWidth >= minW && el.offsetHeight > 0 &&
          el.offsetHeight <= maxH && peBgIsOpaque(el)) {
        return el;
      }
    }
    return null;
  }

  function markThemeSurfaces() {
    if (!themeIsActive()) return;

    // Top header bar — the full-width bar behind the search box. Pinterest gives
    // it a stable `data-test-id="header-background"`, so paint that directly rather
    // than walking up from the search input (which stops at the search pill, not
    // the bar). Fall back to the heuristic walk if the test-id ever changes.
    const headerBar = document.querySelector('[data-test-id="header-background"]');
    if (headerBar) {
      headerBar.classList.add('pe-themed-surface');
    } else {
      const search = document.querySelector('[data-test-id="search-box-input"]');
      if (search) {
        const bar = peFindBarSurface(search, 6);
        if (bar) bar.classList.add('pe-themed-surface');
      }
    }

    // Left vertical nav rail (stable id) + its opaque wrapper, if the bg is on a parent.
    const rail = document.getElementById('VerticalNavContent');
    if (rail) {
      rail.classList.add('pe-themed-surface');
      let p = rail.parentElement;
      for (let i = 0; p && i < 3; i++, p = p.parentElement) {
        if (p === document.body || p.id === '__PWS_ROOT__') break;
        if (peBgIsOpaque(p)) { p.classList.add('pe-themed-surface'); break; }
      }
    }

    // Secondary tags / filter row — a sticky/fixed, wide, opaque sub-header near the top.
    document.querySelectorAll('[style*="sticky"], [style*="fixed"]').forEach(el => {
      if (el.classList.contains('pe-themed-surface')) return;
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.top <= 140 && r.width >= window.innerWidth * 0.5 &&
          r.height > 0 && r.height <= window.innerHeight * 0.4 && peBgIsOpaque(el)) {
        el.classList.add('pe-themed-surface');
      }
    });
  }

  function unmarkThemeSurfaces() {
    document.querySelectorAll('.pe-themed-surface')
      .forEach(el => el.classList.remove('pe-themed-surface'));
  }

  function ensureThemeSurfaceObserver() {
    if (hasObserver('peThemeSurface')) return;
    // Pinterest re-renders its chrome on SPA navigation, so re-tag after DOM changes.
    const run = debounce(markThemeSurfaces, 300);
    _peThemeSurfaceObs = new MutationObserver(run);
    _peThemeSurfaceObs.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('peThemeSurface', _peThemeSurfaceObs, { target: document.documentElement });
  }

  function stopThemeSurfaceObserver() {
    if (_peThemeSurfaceObs) {
      _peThemeSurfaceObs.disconnect();
      _peThemeSurfaceObs = null;
      unregisterObserver('peThemeSurface');
    }
  }

  function applyCustomTheme() {
    if (!themeIsActive()) {
      stopCustomTheme();
      return;
    }
    const bg = getThemeBgCss();
    const el = ensureThemeStyleEl();
    // One uniform colour for the header / tags row / nav rail so they match each
    // other and sit slightly off the page background.
    const chrome = getChromeColor();
    // Paint the roots, and make Pinterest's own opaque page surfaces
    // transparent so the background shows through. Kept conservative to avoid
    // washing out cards/menus (those keep their own backgrounds).
    el.textContent = `
      html, body { ${bg} }
      body > #__PWS_ROOT__,
      div[data-test-id="leftbar-content"],
      .mainContainer,
      [data-test-id="impression-container"] {
        background: transparent !important;
      }
      .pe-themed-surface,
      .KvKvqR {
        background: ${chrome} !important;
        background-image: none !important;
      }
    `;
    markThemeSurfaces();
    ensureThemeSurfaceObserver();
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
    { key: 'declutter',       label: 'Declutter',              desc: 'Remove ads, quizzes, sponsored, partner & shopping pins',  reload: false },
    { key: 'removeVideos',    label: 'Remove Videos',          desc: 'Remove all video pins from the feed',                      reload: false },
    { key: 'contextMenu',     label: 'Image Context Menu',     desc: 'Right-click pins to copy, open or save the original',      reload: false },
    { key: 'reverseImageSearchButton', label: 'Reverse Image Search Button', desc: 'Show reverse search providers above closeup images', reload: false },
  ];

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

  const HIDE_NAV_ACTION_FEATURES = [
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
  ];
  const HIDE_COMMENT_FEATURES = [
    { key: 'hideCommentButton', label: 'Hide Comment Button',   desc: 'Hide only the Comments button in action rows',           reload: false },
    { key: 'hideComments',   label: 'Hide Comment Section',     desc: 'Hide comment sections and comment input on pins',        reload: false },
    { key: 'hideCommentEmojiButton', label: 'Hide Comment Emoji Button', desc: 'Hide the emoji picker in comment composer',      reload: false },
    { key: 'hideCommentStickerButton', label: 'Hide Comment Sticker Button', desc: 'Hide the sticker picker in comment composer', reload: false },
    { key: 'hideCommentPhotoButton', label: 'Hide Comment Photo Button', desc: 'Hide the photo picker in comment composer',      reload: false },
    { key: 'hideProactiveOutreach', label: 'Hide "See More Like This" Popup', desc: 'Hide the proactive outreach flyout that appears over pins', reload: false },
  ];
  const VISIBLE_HIDE_NAV_ACTION_FEATURES = IS_MOBILE
    ? HIDE_NAV_ACTION_FEATURES.filter(f => f.key !== 'hideUploadImageButton')
    : HIDE_NAV_ACTION_FEATURES;
  const VISIBLE_HIDE_COMMENT_FEATURES = HIDE_COMMENT_FEATURES;

  // All-time statistics rows. Each is opt-in: the toggle both enables counting
  // and reveals the running total.
  const STAT_ITEMS = [
    { show: 'statShowAdsBlocked',         count: 'statCountAdsBlocked',         label: 'Ads Blocked',         desc: 'Sponsored / promoted pins removed' },
    { show: 'statShowAiBlocked',          count: 'statCountAiBlocked',          label: 'AI Content Blocked',  desc: 'Likely AI-generated pins hidden' },
    { show: 'statShowImagesDownloaded',   count: 'statCountImagesDownloaded',   label: 'Images Downloaded',   desc: 'Image files saved by the script' },
    { show: 'statShowVideosDownloaded',   count: 'statCountVideosDownloaded',   label: 'Videos Downloaded',   desc: 'Video files saved by the script' },
    { show: 'statShowCommentsTranslated', count: 'statCountCommentsTranslated', label: 'Comments Translated', desc: 'Comments auto-translated' },
  ];

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

  // <select> built from {id,label} option objects (theme presets, bg type, fit).
  function renderIdSelect(key, options, current) {
    return `<select class="pe-setting-select pe-theme-select" data-key="${key}">` +
      options.map(o => `<option value="${escapeAttr(o.id)}" ${current === o.id ? 'selected' : ''}>${escapeAttr(o.label)}</option>`).join('') +
      `</select>`;
  }

  // One url/size/circle block per platform-visible nav button.
  function renderNavImageBlocks() {
    return VISIBLE_NAV_BUTTONS.map(b => {
      const cfg = getNavImageCfg(b.id);
      return `
        <div class="pe-navimg-block" data-nav-id="${b.id}">
          <div class="pe-row pe-sub-row pe-input-row">
            <div class="pe-info">
              <span class="pe-name">${b.label} Image</span>
              <span class="pe-desc">Paste an image link, or clear to restore</span>
            </div>
            <input class="pe-setting-input pe-navimg-url" data-nav-id="${b.id}" type="url" placeholder="https://example.com/icon.png" value="${escapeAttr(cfg.url)}">
          </div>
          <div class="pe-row pe-sub-row pe-input-row">
            <div class="pe-info">
              <span class="pe-name">${b.label} Size</span>
              <span class="pe-desc">Pixel size for this icon</span>
            </div>
            <input class="pe-setting-input pe-setting-number pe-navimg-size" data-nav-id="${b.id}" type="number" min="8" step="1" value="${escapeAttr(cfg.size)}">
          </div>
          <div class="pe-row pe-sub-row">
            <div class="pe-info">
              <span class="pe-name">${b.label} Circle Crop</span>
              <span class="pe-desc">Crop into a round icon</span>
            </div>
            <label class="pe-switch">
              <input type="checkbox" class="pe-navimg-circle" data-nav-id="${b.id}" ${cfg.circle ? 'checked' : ''}>
              <span class="pe-knob"></span>
            </label>
          </div>
        </div>`;
    }).join('');
  }

  function renderThemeSection() {
    return `
      <div class="pe-row pe-sub-row pe-select-row">
        <div class="pe-info">
          <span class="pe-name">Preset</span>
          <span class="pe-desc">Pick a color, or Pinterest default to restore the original look</span>
        </div>
        ${renderIdSelect('themePreset', getAllThemePresets(), get('themePreset'))}
        <span id="pe-theme-preview" class="pe-theme-preview" aria-hidden="true"></span>
      </div>
      <div class="pe-row pe-sub-row pe-input-row pe-theme-row-color">
        <div class="pe-info">
          <span class="pe-name">Color</span>
          <span class="pe-desc">Hex color code for the custom preset</span>
        </div>
        <input id="pe-theme-color-text" class="pe-setting-input" type="text" placeholder="#0f2027" value="${escapeAttr(get('themeColor'))}">
        <input id="pe-theme-color-picker" type="color" value="${escapeAttr(get('themeColor'))}" aria-label="Pick custom theme color">
      </div>`;
  }

  function createSettingsPanel() {
    if (document.getElementById('pe-settings-wrap')) return;
    migrateThemeSettings();
    const wrap = document.createElement('div');
    wrap.id = 'pe-settings-wrap';
    wrap.setAttribute('data-pe-ui', 'true');
    // Logo and per-button nav image rows are desktop-only; the background theme
    // section works on both desktop and mobile.
    const logoRowsHtml = IS_MOBILE ? '' : `
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
            </div>`;
    const buttonImagesSubsection = IS_MOBILE ? '' : `
            <div class="pe-row pe-sub-row pe-subhead-row">
              <div class="pe-info">
                <span class="pe-name">Button Images</span>
                <span class="pe-desc">Replace each nav button with your own image</span>
              </div>
              <button type="button" id="pe-navimg-chevron" class="pe-inline-chevron" aria-label="Show button image options" aria-expanded="false">
                <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
            </div>
            <div id="pe-navimg-suboptions" style="display:none">
              ${renderNavImageBlocks()}
            </div>`;
    const customizeGroupHtml = `
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-customize-hdr">
            <div class="pe-info">
              <span class="pe-name">Customize</span>
              <span class="pe-desc">Logo, button images &amp; background</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-customize-body" style="display:none">
            ${logoRowsHtml}
            ${buttonImagesSubsection}
            <div class="pe-row pe-sub-row pe-subhead-row">
              <div class="pe-info">
                <span class="pe-name">Background Theme <span class="pe-beta-badge">Beta</span></span>
                <span class="pe-desc">Custom site background color</span>
              </div>
              <button type="button" id="pe-theme-chevron" class="pe-inline-chevron" aria-label="Show theme options" aria-expanded="false">
                <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
            </div>
            <div id="pe-theme-suboptions" style="display:none">
              ${renderThemeSection()}
            </div>
          </div>
        </div>`;

    // Helpers for the new grouped settings layout. Each row keeps the same
    // data-key / data-reload / IDs as before so all existing wiring and saved
    // settings continue to work.
    const featureByKey = key => FEATURES.find(f => f.key === key);
    const featureRow = f => `
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">${f.label}</span>
          <span class="pe-desc">${f.desc}</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="${f.key}" data-reload="${f.reload}" ${get(f.key) ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>`;

    function buildGroup(id, title, desc, bodyHtml) {
      return `
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-${id}-hdr">
            <div class="pe-info">
              <span class="pe-name">${title}</span>
              <span class="pe-desc">${desc}</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-${id}-body" style="display:none">
            ${bodyHtml}
          </div>
        </div>`;
    }

    const essentialsBody = ['originalQuality','downloadFixer','declutter'].map(k => featureRow(featureByKey(k))).join('');
    const mediaBody = ['gifHover','gifAutoPlay','videoAutoPlay','infiniteLoopVideo','removeVideos'].map(k => featureRow(featureByKey(k))).join('');
    const toolsBody = (IS_MOBILE ? ['reverseImageSearchButton'] : ['contextMenu','reverseImageSearchButton'])
      .map(k => featureRow(featureByKey(k))).join('');

    const downloadsBody = `
      <div class="pe-row pe-sub-row pe-select-row">
        <div class="pe-info">
          <span class="pe-name">Download Filename</span>
          <span class="pe-desc">How saved pins are named (auto-falls back)</span>
        </div>
        <select class="pe-setting-select" data-key="filenameStrategy">
          ${renderOptions(FILENAME_STRATEGY_OPTIONS, get('filenameStrategy'))}
        </select>
      </div>
      <div class="pe-row pe-sub-row pe-select-row">
        <div class="pe-info">
          <span class="pe-name">Board Filename</span>
          <span class="pe-desc">Naming for Board Downloader batches</span>
        </div>
        <select class="pe-setting-select" data-key="boardFilenameStrategy">
          ${renderOptions(FILENAME_STRATEGY_OPTIONS, get('boardFilenameStrategy'))}
        </select>
      </div>
      ${featureRow(featureByKey('boardDownloader'))}
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Track Downloaded Pins</span>
          <span class="pe-desc">Remember which pins were saved per board to enable "Download New"</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="boardDownloadTrack" data-reload="false" ${get('boardDownloadTrack') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Convert WebP to PNG</span>
          <span class="pe-desc">Re-encode WebP downloads to PNG before saving</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="convertWebpToPng" data-reload="false" ${get('convertWebpToPng') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>`;

    const contentFilteringBody = `
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Hide AI Content</span>
          <span class="pe-desc">Hide likely AI-generated pins (heuristic)</span>
        </div>
        <button type="button" id="pe-ai-chevron" class="pe-inline-chevron" aria-label="Show AI content options" aria-expanded="false">
          <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
        <label class="pe-switch">
          <input type="checkbox" data-key="hideAiContent" data-reload="false" ${get('hideAiContent') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div id="pe-ai-suboptions" style="display:none">
        <div class="pe-row pe-sub-row pe-select-row">
          <div class="pe-info">
            <span class="pe-name">Aggressiveness</span>
            <span class="pe-desc">Higher catches more, but more false positives</span>
          </div>
          <select class="pe-setting-select" data-key="aiContentAggressiveness">
            ${renderOptions(AI_OPTIONS, get('aiContentAggressiveness'))}
          </select>
        </div>
        <div class="pe-row pe-sub-row pe-input-row">
          <div class="pe-info">
            <span class="pe-name">Custom AI Keywords</span>
            <span class="pe-desc">Comma-separated extra AI terms to match</span>
          </div>
          <input id="pe-ai-keywords-input" class="pe-setting-input" type="text" placeholder="e.g. niji, comfyui" value="${escapeAttr(get('aiContentKeywords'))}">
        </div>
      </div>
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Hide by Keywords</span>
          <span class="pe-desc">Hide any pin whose title/description contains your words</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="titleBlockEnabled" data-reload="false" ${get('titleBlockEnabled') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div id="pe-titleblock-suboptions" style="display:${get('titleBlockEnabled') ? 'block' : 'none'}">
        <div class="pe-row pe-sub-row pe-input-row">
          <div class="pe-info">
            <span class="pe-name">Blocked Words</span>
            <span class="pe-desc">Comma-separated; matched against the pin title</span>
          </div>
          <input id="pe-titleblock-keywords-input" class="pe-setting-input" type="text" placeholder="e.g. politics, spoiler" value="${escapeAttr(get('titleBlockKeywords'))}">
        </div>
      </div>
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Hide Comments by Keywords</span>
          <span class="pe-desc">Collapse comments that contain your phrases</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="commentBlockEnabled" data-reload="false" ${get('commentBlockEnabled') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div id="pe-commentblock-suboptions" style="display:${get('commentBlockEnabled') ? 'block' : 'none'}">
        <div class="pe-row pe-sub-row pe-input-row">
          <div class="pe-info">
            <span class="pe-name">Blocked Phrases</span>
            <span class="pe-desc">Comma-separated; matched against original and translated comment text</span>
          </div>
          <input id="pe-commentblock-keywords-input" class="pe-setting-input" type="text" placeholder="e.g. spam, scam link, follow me" value="${escapeAttr(get('commentBlockKeywords'))}">
        </div>
      </div>
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Hide Pins by ID</span>
          <span class="pe-desc">Enable the "Hide / Don't show again" actions on pins</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="hideByPinIdEnabled" data-reload="false" ${get('hideByPinIdEnabled') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div class="pe-row pe-sub-row">
        <div class="pe-info">
          <span class="pe-name">Hide Already-Seen Pins</span>
          <span class="pe-desc">Collapse pins you have already opened</span>
        </div>
        <label class="pe-switch">
          <input type="checkbox" data-key="hideSeenPins" data-reload="false" ${get('hideSeenPins') ? 'checked' : ''}>
          <span class="pe-knob"></span>
        </label>
      </div>
      <div id="pe-hidepinid-suboptions" style="display:${get('hideByPinIdEnabled') ? 'block' : 'none'}">
        <div class="pe-row pe-sub-row">
          <div class="pe-info">
            <span class="pe-name">Hidden Pin IDs</span>
            <span class="pe-desc">Edit or clear the list of hidden pin IDs</span>
          </div>
          <button type="button" id="pe-hidepinid-clear" class="pe-stats-reset-btn">Clear</button>
        </div>
        <div class="pe-row pe-sub-row">
          <textarea id="pe-hidepinid-textarea" class="pe-setting-input pe-hidepinid-textarea" rows="4" placeholder="comma-separated pin IDs">${escapeAttr([...getHiddenPinIds()].join(', '))}</textarea>
        </div>
      </div>`;
    wrap.innerHTML = `
      <div id="pe-settings-panel" style="display:none">
        <div id="pe-settings-title">Pinterest Power Menu <span id="pe-settings-by">By <a id="pe-settings-author" href="https://github.com/Angel2mp3" target="_blank" rel="noopener">Angel</a></span></div>
        ${buildGroup('essentials', 'Essentials', 'Core power features', essentialsBody)}
        ${buildGroup('media', 'Media Playback', 'GIF and video behavior', mediaBody)}
        ${buildGroup('downloads', 'Downloads', 'Filename and download options', downloadsBody)}
        ${buildGroup('content-filtering', 'Content Filtering', 'AI and keyword filters', contentFilteringBody)}
        ${buildGroup('tools', 'Tools', 'Extra utilities', toolsBody)}
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
            <div class="pe-row pe-sub-row pe-subhead-row">
              <div class="pe-info">
                <span class="pe-name">Navigation &amp; Actions</span>
                <span class="pe-desc">Nav buttons and pin action bar items</span>
              </div>
              <button type="button" id="pe-hide-nav-actions-chevron" class="pe-inline-chevron" aria-label="Show navigation and action options" aria-expanded="false">
                <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
            </div>
            <div id="pe-hide-nav-actions-suboptions" style="display:none">
              ${VISIBLE_HIDE_NAV_ACTION_FEATURES.map(f => `
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
            <div class="pe-row pe-sub-row pe-subhead-row">
              <div class="pe-info">
                <span class="pe-name">Comments &amp; More</span>
                <span class="pe-desc">Comment section and composer controls</span>
              </div>
              <button type="button" id="pe-hide-comments-chevron" class="pe-inline-chevron" aria-label="Show comment options" aria-expanded="false">
                <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
            </div>
            <div id="pe-hide-comments-suboptions" style="display:none">
              ${VISIBLE_HIDE_COMMENT_FEATURES.map(f => `
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
        </div>
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-stats-hdr">
            <div class="pe-info">
              <span class="pe-name">Statistics</span>
              <span class="pe-desc">All-time totals — each is optional &amp; off by default</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-stats-body" style="display:none">
            ${STAT_ITEMS.map(s => `
              <div class="pe-row pe-sub-row">
                <div class="pe-info">
                  <span class="pe-name">${s.label}</span>
                  <span class="pe-desc">${s.desc}</span>
                </div>
                <span class="pe-stat-value" id="pe-stat-val-${s.count}" title="${(Number(get(s.count)) || 0).toLocaleString()}" style="display:${get(s.show) ? 'inline-block' : 'none'}">${formatStatCount(get(s.count))}</span>
                <label class="pe-switch">
                  <input type="checkbox" data-key="${s.show}" data-reload="false" ${get(s.show) ? 'checked' : ''}>
                  <span class="pe-knob"></span>
                </label>
              </div>`).join('')}
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Reset Statistics</span>
                <span class="pe-desc">Clear all counters back to zero</span>
              </div>
              <button type="button" id="pe-stats-reset" class="pe-stats-reset-btn">Reset</button>
            </div>
          </div>
        </div>
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-debug-hdr">
            <div class="pe-info">
              <span class="pe-name">Debugging</span>
              <span class="pe-desc">Developer options</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-debug-body" style="display:none">
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Debug Logging</span>
                <span class="pe-desc">Print diagnostic messages to the browser console</span>
              </div>
              <label class="pe-switch">
                <input type="checkbox" data-key="debugLogging" data-reload="false" ${get('debugLogging') ? 'checked' : ''}>
                <span class="pe-knob"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="pe-group">
          <div class="pe-group-header" id="pe-group-backup-hdr">
            <div class="pe-info">
              <span class="pe-name">Backup &amp; Restore</span>
              <span class="pe-desc">Save or load settings, hidden pins, and board history</span>
            </div>
            <svg class="pe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="pe-group-body" id="pe-group-backup-body" style="display:none">
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Export Backup</span>
                <span class="pe-desc">Download a JSON file with all your data</span>
              </div>
              <button type="button" id="pe-export-btn" class="pe-stats-reset-btn">Export</button>
            </div>
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Import Backup</span>
                <span class="pe-desc">Restore from a previously exported JSON file</span>
              </div>
              <button type="button" id="pe-import-btn" class="pe-stats-reset-btn">Import</button>
              <input type="file" id="pe-import-file" accept="application/json" style="display:none">
            </div>
            <div class="pe-row pe-sub-row">
              <div class="pe-info">
                <span class="pe-name">Copy to Clipboard</span>
                <span class="pe-desc">Copy backup JSON for manual saving on iOS</span>
              </div>
              <button type="button" id="pe-copy-backup-btn" class="pe-stats-reset-btn">Copy</button>
            </div>
            <div id="pe-backup-status" class="pe-row pe-sub-row" style="display:none">
              <span class="pe-desc" id="pe-backup-status-text"></span>
            </div>
          </div>
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

    // Collapse every manually-expanded group/sub-panel so the menu is clean on
    // reopen. (Feature-tied panels like #pe-titleblock-suboptions follow their
    // own toggle and are left alone.)
    function resetPanelCollapsibles() {
      wrap.querySelectorAll('.pe-group-body').forEach(b => { b.style.display = 'none'; });
      wrap.querySelectorAll('.pe-group-header.pe-group-open').forEach(h => h.classList.remove('pe-group-open'));
      ['#pe-ai-suboptions', '#pe-navimg-suboptions', '#pe-theme-suboptions', '#pe-hide-nav-actions-suboptions', '#pe-hide-comments-suboptions'].forEach(sel => {
        const el = wrap.querySelector(sel);
        if (el) el.style.display = 'none';
      });
      wrap.querySelectorAll('.pe-inline-chevron-open').forEach(c => {
        c.classList.remove('pe-inline-chevron-open');
        c.setAttribute('aria-expanded', 'false');
      });
    }

    function closePanel() {
      panelOpen = false;
      panel.style.display = 'none';
      btn.classList.remove('pe-settings-open');
      resetPanelCollapsibles();
    }

    function togglePanel() {
      if (panelOpen) { closePanel(); return; }
      panelOpen = true;
      panel.style.display = 'block';
      btn.classList.add('pe-settings-open');
    }

    // Whole-row click toggles an inline-chevron sub-panel (like the parent groups),
    // while still letting the row's own controls (switch, inputs) work normally.
    function wireRowExpander(chevSel, bodySel) {
      const chev = wrap.querySelector(chevSel);
      const body = wrap.querySelector(bodySel);
      if (!chev || !body) return;
      const row = chev.closest('.pe-row') || chev.parentElement;
      if (!row) return;
      row.classList.add('pe-row-clickable');
      row.addEventListener('click', e => {
        if (e.target.closest('.pe-switch, input, select, a')) return;
        e.stopPropagation();
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        chev.classList.toggle('pe-inline-chevron-open', !open);
        chev.setAttribute('aria-expanded', String(!open));
      });
    }

    panel.addEventListener('wheel', stopSettingsPanelEventBubble, { passive: true });
    panel.addEventListener('touchmove', stopSettingsPanelEventBubble, { passive: true });
    wrap.addEventListener('click', stopSettingsPanelEventBubble);
    wrap.addEventListener('pointerdown', stopSettingsPanelEventBubble);
    wrap.addEventListener('touchstart', stopSettingsPanelEventBubble, { passive: true });
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
    document.addEventListener('click', e => {
      if (panelOpen && !wrap.contains(e.target)) closePanel();
    });

    // Collapsible settings groups
    function wireGroup(hdrSel, bodySel) {
      const hdr = wrap.querySelector(hdrSel);
      const body = wrap.querySelector(bodySel);
      if (!hdr || !body) return;
      hdr.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        hdr.classList.toggle('pe-group-open', !open);
      });
    }

    [
      ['#pe-group-essentials-hdr', '#pe-group-essentials-body'],
      ['#pe-group-media-hdr', '#pe-group-media-body'],
      ['#pe-group-downloads-hdr', '#pe-group-downloads-body'],
      ['#pe-group-content-filtering-hdr', '#pe-group-content-filtering-body'],
      ['#pe-group-tools-hdr', '#pe-group-tools-body'],
      ['#pe-group-declutter-hdr', '#pe-group-declutter-body'],
      ['#pe-group-translate-hdr', '#pe-group-translate-body'],
      ['#pe-group-customize-hdr', '#pe-group-customize-body'],
      ['#pe-group-hide-hdr', '#pe-group-hide-body'],
      ['#pe-group-stats-hdr', '#pe-group-stats-body'],
      ['#pe-group-debug-hdr', '#pe-group-debug-body'],
      ['#pe-group-backup-hdr', '#pe-group-backup-body'],
    ].forEach(([h, b]) => wireGroup(h, b));

    // Inline-chevron sub-panels: the whole row toggles them (Hide AI Content,
    // Button Images, Background Theme), matching the parent group behaviour.
    wireRowExpander('#pe-ai-chevron', '#pe-ai-suboptions');

    const statsReset = wrap.querySelector('#pe-stats-reset');
    if (statsReset) {
      let resetArmed = false;
      let resetTimer = null;
      const disarm = () => {
        resetArmed = false;
        clearTimeout(resetTimer);
        statsReset.textContent = 'Reset';
        statsReset.classList.remove('pe-confirm');
      };
      statsReset.addEventListener('click', e => {
        e.stopPropagation();
        if (!resetArmed) {
          // First click arms a confirmation; reverts after a few seconds.
          resetArmed = true;
          statsReset.textContent = 'Confirm?';
          statsReset.classList.add('pe-confirm');
          clearTimeout(resetTimer);
          resetTimer = setTimeout(disarm, 4000);
          return;
        }
        STAT_ITEMS.forEach(s => { set(s.count, 0); updateStatDisplay(s.count); });
        disarm();
      });
    }

    // Backup & restore handlers
    const exportBtn = wrap.querySelector('#pe-export-btn');
    const importBtn = wrap.querySelector('#pe-import-btn');
    const importFile = wrap.querySelector('#pe-import-file');
    const copyBackupBtn = wrap.querySelector('#pe-copy-backup-btn');
    const backupStatus = wrap.querySelector('#pe-backup-status');
    const backupStatusText = wrap.querySelector('#pe-backup-status-text');

    function showBackupStatus(msg, isError = false) {
      if (!backupStatus || !backupStatusText) return;
      backupStatusText.textContent = msg;
      backupStatusText.style.color = isError ? '#e60023' : '';
      backupStatus.style.display = 'flex';
      setTimeout(() => { backupStatus.style.display = 'none'; }, 5000);
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        const data = exportPowerMenuData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pinterest-power-menu-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showBackupStatus('Backup downloaded');
      });
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', e => {
        e.stopPropagation();
        importFile.click();
      });
      importFile.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const merge = !!e.shiftKey;
          const result = importPowerMenuData(String(reader.result), { merge });
          if (result.success) {
            showBackupStatus('Backup restored' + (merge ? ' (merged)' : ''));
            // Refresh UI to reflect imported settings
            const panel = wrap.querySelector('#pe-settings-panel');
            if (panel) {
              const wasOpen = panel.style.display !== 'none';
              panel.remove();
              ensureSettingsPanel();
              if (wasOpen) {
                const newPanel = document.getElementById('pe-settings-panel');
                if (newPanel) newPanel.style.display = 'block';
              }
            }
            applyVisitSiteToggle();
            applyNavToggles();
            applyDeclutterToggle();
            applyCustomTheme();
          } else {
            showBackupStatus(result.error || 'Import failed', true);
          }
        };
        reader.onerror = () => showBackupStatus('Failed to read file', true);
        reader.readAsText(file);
        importFile.value = '';
      });
    }

    if (copyBackupBtn) {
      copyBackupBtn.addEventListener('click', e => {
        e.stopPropagation();
        const data = exportPowerMenuData();
        const json = JSON.stringify(data);
        navigator.clipboard.writeText(json).then(() => {
          showBackupStatus('Backup copied to clipboard');
        }).catch(() => {
          showBackupStatus('Failed to copy', true);
        });
      });
    }

    // Toggle switches
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.key;
        // Per-button "circle crop" checkboxes carry no data-key (they live in
        // the nested customNavImages object) and are wired separately below.
        if (!key) return;
        set(key, cb.checked);
        document.dispatchEvent(new CustomEvent('pe-setting-change', { detail: { key, value: cb.checked } }));
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
        if (key === 'declutter') { applyDeclutterToggle(); if (cb.checked) { hideShopTheLookModules(document); initDeclutter(); if (get('hideShopPosts')) initHideShopPosts(); } else stopHideShopPosts({ restore: true }); }
        if (key === 'declutterShopTheLook') { applyDeclutterToggle(); if (get('declutter')) hideShopTheLookModules(document); }
        if (key === 'declutterSearchAdvisory') applyDeclutterToggle();
        if (key === 'removeVideos') { if (cb.checked) initRemoveVideos(); }
        if (key === 'titleBlockEnabled') {
          const body = wrap.querySelector('#pe-titleblock-suboptions');
          if (body) body.style.display = cb.checked ? 'block' : 'none';
          refreshContentFilter();
        }
        // AI sub-options visibility is controlled by the #pe-ai-chevron, not the toggle.
        if (key === 'hideAiContent') refreshContentFilter();
        if (key === 'hideByPinIdEnabled') {
          const body = wrap.querySelector('#pe-hidepinid-suboptions');
          if (body) body.style.display = cb.checked ? 'block' : 'none';
          refreshContentFilter();
        }
        if (key === 'hideSeenPins') refreshContentFilter();
        if (key.startsWith('statShow')) {
          const item = STAT_ITEMS.find(s => s.show === key);
          if (item) {
            const valEl = wrap.querySelector('#pe-stat-val-' + item.count);
            if (valEl) {
              valEl.style.display = cb.checked ? 'inline-block' : 'none';
              if (cb.checked) updateStatDisplay(item.count);
            }
          }
        }
        if (key === 'contextMenu') { if (cb.checked) initImageContextMenu(); else stopImageContextMenu(); }
        if (key === 'hideUpdates' || key === 'hideMessages' || key === 'hideShare' || key === 'hideReactButton' || key === 'hideUploadImageButton' || key === 'hideSearchImageButton' || key === 'hideViewLargerButton' || key === 'hideMoreOptionsButton' || key === 'hideReverseImageSearchButton' || key === 'hideCommentButton') {
          applyNavToggles();
          scheduleMobileCloseupActionButtonsRefresh();
        }
        if (key === 'hideReactionCount' || key === 'hideSearchSuggestions' || key === 'hideCommentEmojiButton' || key === 'hideCommentStickerButton' || key === 'hideCommentPhotoButton' || key === 'hideProactiveOutreach') {
          applyNavToggles();
          scheduleMobileCloseupActionButtonsRefresh();
        }
        if (key === 'hideMessages' && cb.checked) initMessagesRemover();
        if (key === 'hideShopPosts') { if (cb.checked && get('declutter')) initHideShopPosts(); else stopHideShopPosts({ restore: true }); }
        if (key === 'hideComments') { applyNavToggles(); if (cb.checked) initHideComments(); }
        if (key === 'commentBlockEnabled') {
          const body = wrap.querySelector('#pe-commentblock-suboptions');
          if (body) body.style.display = cb.checked ? 'block' : 'none';
          refreshCommentBlocker();
        }
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
        if (k === 'aiContentAggressiveness') refreshContentFilter();
        else if (sel.classList.contains('pe-theme-select')) handleThemeSelectChange(k, wrap);
        else if (k === 'autoTranslateTarget' || k === 'titleTranslationDisplay' || k === 'autoTranslateCommentMode') refreshTranslationFeatures();
      });
    });

    // Sync the color inputs + preview to the current config.
    function syncThemeInputs() {
      const colorText = wrap.querySelector('#pe-theme-color-text');
      const colorPicker = wrap.querySelector('#pe-theme-color-picker');
      const color = get('themeColor') || '';
      if (colorText) colorText.value = color;
      if (colorPicker) colorPicker.value = color;
      const preview = wrap.querySelector('#pe-theme-preview');
      if (preview) preview.style.background = getThemePreviewBackground();
    }

    function handleThemeSelectChange(key) {
      if (key === 'themePreset') {
        const id = get('themePreset');
        const preset = THEME_PRESETS.find(p => p.id === id);
        const enabled = id !== 'default';
        set('themeEnabled', enabled);
        if (preset && preset.value) {
          set('themeColor', preset.value);
        }
        syncThemeInputs();
        applyCustomTheme();
      }
    }

    // Color inputs (text + native picker stay in sync)
    const colorText = wrap.querySelector('#pe-theme-color-text');
    const colorPicker = wrap.querySelector('#pe-theme-color-picker');
    if (colorText) {
      const save = debounce(() => {
        const val = colorText.value.trim();
        if (/^#([0-9a-f]{3}){1,2}$/i.test(val)) {
          set('themeColor', val);
          if (colorPicker) colorPicker.value = val;
          applyCustomTheme();
        }
      }, 300);
      colorText.addEventListener('input', save);
      colorText.addEventListener('change', () => {
        const val = colorText.value.trim();
        if (/^#([0-9a-f]{3}){1,2}$/i.test(val)) {
          set('themeColor', val);
          if (colorPicker) colorPicker.value = val;
          applyCustomTheme();
        }
      });
    }
    if (colorPicker) {
      colorPicker.addEventListener('input', () => {
        const val = colorPicker.value;
        set('themeColor', val);
        if (colorText) colorText.value = val;
        applyCustomTheme();
      });
    }

    // Per-button image inputs (url + size) and circle-crop checkboxes.
    wrap.querySelectorAll('.pe-navimg-url').forEach(el => {
      const id = el.dataset.navId;
      const save = debounce(() => { setNavImageField(id, 'url', el.value.trim()); initCustomNavImages(); }, 300);
      el.addEventListener('input', save);
      el.addEventListener('change', () => { setNavImageField(id, 'url', el.value.trim()); initCustomNavImages(); });
    });
    wrap.querySelectorAll('.pe-navimg-size').forEach(el => {
      const id = el.dataset.navId;
      const readSize = () => { const n = Number(el.value); return Number.isFinite(n) ? Math.max(8, Math.round(n)) : 32; };
      const save = debounce(() => { setNavImageField(id, 'size', readSize()); initCustomNavImages(); }, 150);
      el.addEventListener('input', save);
      el.addEventListener('change', () => { setNavImageField(id, 'size', readSize()); initCustomNavImages(); });
    });
    wrap.querySelectorAll('.pe-navimg-circle').forEach(el => {
      const id = el.dataset.navId;
      el.addEventListener('change', () => { setNavImageField(id, 'circle', el.checked); initCustomNavImages(); });
    });

    // Inline chevrons for the Button Images + Background Theme subsections —
    // whole-row click, same as the AI row.
    wireRowExpander('#pe-navimg-chevron', '#pe-navimg-suboptions');
    wireRowExpander('#pe-theme-chevron', '#pe-theme-suboptions');
    wireRowExpander('#pe-hide-nav-actions-chevron', '#pe-hide-nav-actions-suboptions');
    wireRowExpander('#pe-hide-comments-chevron', '#pe-hide-comments-suboptions');

    const aiKeywordsInput = wrap.querySelector('#pe-ai-keywords-input');
    if (aiKeywordsInput) {
      const saveAiKeywords = debounce(() => {
        set('aiContentKeywords', aiKeywordsInput.value);
        refreshContentFilter();
      }, 350);
      aiKeywordsInput.addEventListener('input', saveAiKeywords);
      aiKeywordsInput.addEventListener('change', () => {
        set('aiContentKeywords', aiKeywordsInput.value);
        refreshContentFilter();
      });
    }

    const titleBlockInput = wrap.querySelector('#pe-titleblock-keywords-input');
    if (titleBlockInput) {
      const saveTitleBlock = debounce(() => {
        set('titleBlockKeywords', titleBlockInput.value);
        refreshContentFilter();
      }, 350);
      titleBlockInput.addEventListener('input', saveTitleBlock);
      titleBlockInput.addEventListener('change', () => {
        set('titleBlockKeywords', titleBlockInput.value);
        refreshContentFilter();
      });
    }

    const commentBlockInput = wrap.querySelector('#pe-commentblock-keywords-input');
    if (commentBlockInput) {
      const saveCommentBlock = debounce(() => {
        set('commentBlockKeywords', commentBlockInput.value);
        refreshCommentBlocker();
      }, 350);
      commentBlockInput.addEventListener('input', saveCommentBlock);
      commentBlockInput.addEventListener('change', () => {
        set('commentBlockKeywords', commentBlockInput.value);
        refreshCommentBlocker();
      });
    }

    const hiddenPinTextarea = wrap.querySelector('#pe-hidepinid-textarea');
    const hiddenPinClearBtn = wrap.querySelector('#pe-hidepinid-clear');
    if (hiddenPinTextarea) {
      const parseIds = val => [...val.matchAll(/\d+/g)].map(m => m[0]).filter(Boolean);
      const saveHiddenPinIdsFromText = debounce(() => {
        const ids = parseIds(hiddenPinTextarea.value);
        saveHiddenPinIds(new Set(ids));
        refreshContentFilter();
      }, 350);
      hiddenPinTextarea.addEventListener('input', saveHiddenPinIdsFromText);
      hiddenPinTextarea.addEventListener('change', () => {
        const ids = parseIds(hiddenPinTextarea.value);
        saveHiddenPinIds(new Set(ids));
        hiddenPinTextarea.value = ids.join(', ');
        refreshContentFilter();
      });
      if (hiddenPinClearBtn) {
        let clearArmed = false;
        let clearTimer = null;
        const disarmClear = () => {
          clearArmed = false;
          clearTimeout(clearTimer);
          hiddenPinClearBtn.textContent = 'Clear';
          hiddenPinClearBtn.classList.remove('pe-confirm');
        };
        hiddenPinClearBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (!clearArmed) {
            clearArmed = true;
            hiddenPinClearBtn.textContent = 'Confirm?';
            hiddenPinClearBtn.classList.add('pe-confirm');
            clearTimeout(clearTimer);
            clearTimer = setTimeout(disarmClear, 4000);
            return;
          }
          clearHiddenPinIds();
          hiddenPinTextarea.value = '';
          refreshContentFilter();
          disarmClear();
        });
      }
    }

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
    wrap.classList.add('pe-dark');
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
      const pinScope = card || wrap;
      const pinId = pinScope ? getPinIdFromCard(pinScope) : currentPinIdFromLocation();

      if (wrap) {
        // Video
        const vid = wrap.querySelector('video');
        if (vid) {
          const src = vid.src || (vid.querySelector('source') && vid.querySelector('source').src);
          if (src && !/i\.pinimg\.com/.test(src)) return { url: getHighestQualityVideoUrl(src), type: 'video', title, pinId };
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
        return { url: img.src, type: 'gif', title, pinId };
      }
      
      // 2. Does it have a GIF in its original srcset?
      const origSrcset = img.__peAutoOrigSrcset || img.getAttribute('srcset') || '';
      for (const part of origSrcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url && /\.gif(\?|$)/i.test(url)) return { url: url, type: 'gif', title, pinId };
      }

      // Otherwise, it's a standard image. Return original quality URL.
      return { url: getBestUrl(img), type: 'image', title, pinId };
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

      // ── Hide / unhide pin ───────────────────────────────────────────
      if (media.pinId) {
        const hidden = isPinIdHidden(media.pinId);
        addItem(
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="4.22" y1="4.22" x2="19.78" y2="19.78"/>',
          hidden ? 'Unhide this pin' : 'Hide this pin',
          () => {
            if (hidden) unhidePinId(media.pinId);
            else hidePinId(media.pinId);
            if (!get('hideByPinIdEnabled')) set('hideByPinIdEnabled', true);
            refreshContentFilter();
          }
        );
      }

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
      body.pe-hide-comments [data-test-id="comments-disabled-label"],
      body.pe-hide-comments [data-testid="closeup-metadata-details-flex"]:has([data-test-id="comments-disabled-label"]),
      body.pe-hide-comments [data-test-id="closeup-metadata-details-divider"] {
        display: none !important;
      }

      body.pe-hide-comment-emoji [data-test-id="inline-comment-composer-container"] [data-test-id="emoji-selector"],
      body.pe-hide-comment-sticker [data-test-id="inline-comment-composer-container"] button[aria-label="Select a sticker"],
      body.pe-hide-comment-photo [data-test-id="inline-comment-composer-container"] button[aria-label="Select a photo"] {
        display: none !important;
      }

      /* ──────── Hide "See More Like This" Proactive Outreach Flyout ──────── */
      body.pe-hide-proactive-outreach [data-test-id="proactive-outreach-flyout"] {
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
        max-width: 260px;
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
      /* Inline chevron next to a toggle (e.g. Hide AI Content options) */
      .pe-inline-chevron {
        display: inline-flex; align-items: center; justify-content: center;
        background: none; border: none; padding: 4px; margin: 0;
        cursor: pointer; color: var(--pe-text-muted); flex-shrink: 0;
        border-radius: 6px; transition: background .12s;
      }
      .pe-inline-chevron:hover { background: var(--pe-row-hover); }
      .pe-inline-chevron .pe-chevron { display: block; }
      .pe-inline-chevron-open .pe-chevron { transform: rotate(180deg); }
      /* Rows whose whole surface toggles an inline sub-panel. */
      .pe-row-clickable { cursor: pointer; }
      /* Statistics counters */
      .pe-stat-value {
        font-weight: 700; font-size: 12px; color: var(--pe-accent);
        font-variant-numeric: tabular-nums; flex-shrink: 0;
        min-width: 28px; text-align: right;
      }
      .pe-stats-reset-btn {
        flex-shrink: 0; cursor: pointer;
        background: var(--pe-surface); color: var(--pe-text);
        border: 1px solid var(--pe-border); border-radius: 6px;
        padding: 3px 10px; font-size: 11px; font-weight: 600;
        transition: background .12s;
      }
      .pe-stats-reset-btn.pe-confirm {
        background: var(--pe-accent); color: #fff; border-color: var(--pe-accent);
      }
      .pe-stats-reset-btn:hover { background: var(--pe-row-hover); }
      .pe-stats-reset-btn.pe-confirm:hover { background: var(--pe-accent-hover); }
      /* Color picker swatch + inline button rows (theme color / save theme). */
      .pe-color-field { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .pe-color-swatch {
        width: 28px; height: 24px; padding: 0; flex-shrink: 0; cursor: pointer;
        border: 1px solid var(--pe-border); border-radius: 6px; background: none;
      }
      /* Group bodies flow inside the single #pe-settings-panel scroller (no nested
         scroll containers — those broke scroll-chaining when expanded). */
      .pe-group-body { border-top: 1px solid var(--pe-border); }
      .pe-sub-row { padding-left: 28px !important; background: var(--pe-surface); }
      .pe-sub-row:hover { background: var(--pe-row-hover) !important; }
      /* Hide UI Elements sub-menus nest cleanly under their chevron rows. */
      #pe-hide-nav-actions-suboptions > .pe-row,
      #pe-hide-comments-suboptions > .pe-row {
        border-top: none;
      }
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
      .pe-theme-preview {
        width: 22px; height: 22px;
        border-radius: 5px;
        border: 1px solid rgba(128,128,128,.35);
        background: transparent;
        flex-shrink: 0;
        margin-left: 2px;
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
      .pe-hidepinid-textarea {
        width: 100%;
        resize: vertical;
        min-height: 64px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        line-height: 1.35;
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

      /* Generic action-bar classes — used so injected buttons do not depend on
         Pinterest's obfuscated class names like .oRZ5_s, .ADXRXN, .euRXRl. */
      .pe-closeup-action-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        flex: 0 0 auto;
      }
      .pe-closeup-action-button {
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
      .pe-closeup-action-button:hover { background: rgba(0,0,0,.06); }
      .pe-closeup-action-button:active { transform: scale(.94); }
      .pe-closeup-action-button:disabled { opacity: .55; cursor: wait; transform: none !important; }
      .pe-closeup-action-button svg { width: 26px; height: 26px; }
      [data-test-id="closeup-pin-action-items"] .pe-closeup-action-slot {
        min-width: 40px;
      }
      [data-test-id="closeup-pin-action-items"] .pe-closeup-action-button {
        width: 40px;
        height: 40px;
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
      .pe-native-menu-item {
        display: flex;
        align-items: center;
        width: 100%;
        margin: 0;
        padding: 8px 16px;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        text-align: left;
        cursor: pointer;
        box-sizing: border-box;
      }
      .pe-native-menu-item:hover,
      .pe-native-menu-item:focus {
        background: rgba(0,0,0,.06);
        outline: none;
      }
      .pe-native-menu-item-inner {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        pointer-events: none;
      }
      .pe-native-menu-item-inner svg {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
      }
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

      .pe-custom-nav-img {
        width: var(--pe-custom-nav-size, 32px);
        height: var(--pe-custom-nav-size, 32px);
        object-fit: contain;
        display: block;
        pointer-events: none;
      }
      .pe-custom-nav-img.pe-custom-nav-circle {
        border-radius: 50%;
        object-fit: cover;
      }

      /* Subsection heading rows inside the Customize group */
      .pe-subhead-row .pe-name { font-weight: 600; }
      .pe-beta-badge {
        display: inline-block;
        margin-left: 4px;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--pe-accent);
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        vertical-align: middle;
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
      debugLog('warn', 'Feature startup failed:', name, err);
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
    safeInit('nativeMenuHideItem', initNativeMenuHideItem);

    // Custom nav logo
    if (!IS_MOBILE) safeInit('customPinterestLogo', initCustomPinterestLogo);

    // Per-button custom images (desktop only) and custom background theme
    if (!IS_MOBILE) safeInit('customNavImages', initCustomNavImages);
    safeInit('customTheme', () => { migrateThemeSettings(); applyCustomTheme(); });

    // Hide shop posts
    safeInit('hideShopPosts', initHideShopPosts);

    // Content filter (AI pins + title keyword blocklist)
    safeInit('contentFilter', initContentFilter);

    // Hide comments
    safeInit('hideComments', initHideComments);

    // Comment keyword blocker
    safeInit('commentBlocker', refreshCommentBlocker);

    // Visible text translation
    safeInit('autoTranslate', initAutoTranslate);
    safeInit('manualTranslateButtons', initManualTranslateButtons);

    // Scroll preservation (restores position on browser back)
    safeInit('scrollPreservation', initScrollPreservation);

    // Mobile: pre-load lazy images and fix GIF loading
    safeInit('mobileLazyFix', initMobileLazyFix);

    setTimeout(() => safeInit('settingsPanelRetry', ensureSettingsPanel), 1000);

    // Ensure pending statistics are persisted before the page unloads.
    safeInit('statsFlushListeners', () => {
      window.addEventListener('pagehide', flushPendingStats);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingStats();
      });
    });

    // Development aid: warn if brittle selectors no longer match Pinterest markup.
    // Skipped on mobile to avoid a slow querySelectorAll pass on every load.
    safeInit('selectorHealthCheck', () => {
      if (IS_MOBILE) return;
      setTimeout(checkSelectorHealth, 5000);
    });
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

    function reinitPageModules() {
      // CSS classes on body/html
      applyVisitSiteToggle();
      applyNavToggles();
      initMessagesRemover();
      initVisitSiteHider();

      // Observer-driven modules
      initDeclutter();
      initRemoveVideos();
      if (get('gifAutoPlay')) initGifAutoPlay();
      if (get('videoAutoPlay')) initVideoAutoPlay();
      if (get('infiniteLoopVideo')) initInfiniteLoopVideo();
      applyInfiniteLoopVideoToggle();
      initHideShopPosts();
      initContentFilter();
      initHideComments();
      refreshCommentBlocker();
      initAutoTranslate();
      initManualTranslateButtons();
      initDesktopPinCardQuickDownloadButton();
      initNativeMenuHideItem();
      if (!IS_MOBILE) initCustomPinterestLogo();
      if (!IS_MOBILE) initCustomNavImages();
      applyCustomTheme();

      // UI elements that are recreated per page
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
    }

    function onNavigate() {
      const newPath = location.pathname;
      if (newPath === _lastPath) return;
      _lastPath = newPath;

      // Clear stale intercepted video URLs from the previous pin so they
      // can't be picked up by the row Download button on the new pin page
      _interceptedVideoUrls.length = 0;
      _interceptedVideoUrlsByHash.clear();

      // Disconnect per-route observers before React tears down the old page.
      // Persistent observers (original quality, shared bus, SPA watcher) stay alive.
      disconnectAllOnNavigation();

      // Give Pinterest's React a moment to render the new page
      setTimeout(() => {
        protectCurrentCloseupPinId();
        reinitPageModules();
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
    const _spaWatcher = new MutationObserver(records => {
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
    });
    _spaWatcher.observe(document.documentElement, { childList: true, subtree: true });
    registerObserver('spaWatcher', _spaWatcher, { target: document.documentElement, persistent: true });
  })();

})();
