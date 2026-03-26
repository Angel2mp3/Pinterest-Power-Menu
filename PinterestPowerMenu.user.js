// ==UserScript==
// @name         Pinterest Power Menu
// @namespace    https://github.com/Angel2mp3
// @version      1.3.0
// @description  All-in-one Pinterest power tool: original quality, download fixer, video downloader, board folder downloader, GIF hover/auto-play, remove videos, hide Visit Site, declutter, hide UI elements, hide shop posts, hide comments, scroll preservation
// @author       Angel2mp3
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

  // ── Mobile / touch detection ─────────────────────────────────────────
  // Declared early so DEFAULTS can reference it (contextMenu off on mobile).
  // Gates features that are mouse-only or cause jank on touch devices.
  const IS_MOBILE = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /macintel/i.test(navigator.platform));

  const DEFAULTS = {
    originalQuality:  true,
    downloadFixer:    true,
    gifHover:         true,
    hideVisitSite:    true,
    boardDownloader:  true,
    declutter:        true,
    contextMenu:      !IS_MOBILE,  // mouse-only feature; off by default on mobile
    hideUpdates:      false,
    hideMessages:     false,
    hideShare:        false,
    gifAutoPlay:      false,
    removeVideos:     false,
    hideShopPosts:    false,
    hideComments:     false,
    videoDownloader:  true,
  };

  let _cfg = null;

  function loadCfg() {
    try {
      const raw = GM_getValue(SETTINGS_KEY, null);
      _cfg = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (_) {
      _cfg = { ...DEFAULTS };
    }
  }

  function saveCfg() {
    GM_setValue(SETTINGS_KEY, JSON.stringify(_cfg));
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

  loadCfg();

  // ─── Video URL interceptor ──────────────────────────────────────────────
  // On desktop, Pinterest uses HLS.js which sets video.src to a blob:
  // MediaSource URL — findPinterestVideoSrc() cannot read the actual CDN URL
  // from the DOM.  Intercept XHR/fetch at document-start to capture
  // v1.pinimg.com video URLs as they are requested by HLS.js, then use them
  // as a fallback in createVideoDlFab().
  const _interceptedVideoUrls = [];   // most-recently-seen first
  let _onVideoUrlCapture = null;      // set after createVideoDlFab is defined
  (function () {
    function captureVideoUrl(url) {
      if (typeof url !== 'string') return;
      if (!/v1\.pinimg\.com\/videos/i.test(url)) return;
      const idx = _interceptedVideoUrls.indexOf(url);
      if (idx !== -1) _interceptedVideoUrls.splice(idx, 1);
      _interceptedVideoUrls.unshift(url);                // newest first
      if (_interceptedVideoUrls.length > 20) _interceptedVideoUrls.pop();
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
    document.body.classList.toggle('pe-hide-updates',    get('hideUpdates'));
    document.body.classList.toggle('pe-hide-messages',   get('hideMessages'));
    document.body.classList.toggle('pe-hide-share',      get('hideShare'));
    document.body.classList.toggle('pe-hide-comments',   get('hideComments'));
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

    new MutationObserver(fixShareInputs)
      .observe(document.documentElement, { childList: true, subtree: true });

    // 3) Intercept "Copy link" button clicks
    document.addEventListener('click', e => {
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
    const kill = () => { try { v.pause(); } catch (_) {} };
    kill(); setTimeout(kill, 60); setTimeout(kill, 250);
  }

  new MutationObserver(records => {
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

  function observeGifPins() {
    if (!_gifAutoIO) return;
    document.querySelectorAll(GIF_PIN_CONTAINER_SEL).forEach(wrapper => {
      if (wrapper.__peAutoObs) return;
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
    });
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
    _gifAutoMO = new MutationObserver(observeGifPins);
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

  function isDeclutterPin(pin) {
    // Sponsored
    if (pin.querySelector('div[title="Sponsored"]')) return true;
    // Shoppable Pin indicator
    if (pin.querySelector('[aria-label="Shoppable Pin indicator"]')) return true;
    // Shopping cards / "Shop" headings
    const h2 = pin.querySelector('h2#comments-heading');
    if (h2 && h2.textContent.trim().toLowerCase().startsWith('shop')) return true;
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
    return false;
  }

  function filterPins(container) {
    if (!get('declutter')) return;
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      if (!pin.__peDecluttered && isDeclutterPin(pin)) {
        pin.__peDecluttered = true;
        collapseEl(pin);
      }
    });
  }

  function removeDeclutterOneoffs() {
    if (!get('declutter')) return;
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
    // Curated spotlight section (search page immersive header carousel)
    document.querySelectorAll('[data-test-id="search-story-suggestions-container"]:has([data-test-id="search-suggestion-curated-board-bubble"])').forEach(el => {
      collapseEl(el);
    });
    // Pin action bar: "Read it" / "Visit site" inline button on mobile closeup
    document.querySelectorAll('[data-test-id="pin-action-bar-container"]').forEach(el => {
      collapseEl(el.parentElement || el);
    });
    // Shop similar / Shop the look sections on pin closeup
    document.querySelectorAll(
      '[data-test-id="ShopTheLookSimilarProducts"],' +
      '[data-test-id="visual-search-shopping-bar"],' +
      '[data-test-id="related-products"],' +
      '[data-test-id="ShopTheLookAnnotations"]'
    ).forEach(el => {
      collapseEl(el.closest('div[role="listitem"]') || el.parentElement || el);
    });
    // Shop the look carousel grid items (full-width shopping module in feed)
    document.querySelectorAll('[data-test-id="shopping-module"]').forEach(el => {
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
      new MutationObserver(onMutate)
        .observe(listEl, { childList: true, subtree: true });
    }

    // Attach to any already-present lists
    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    removeDeclutterOneoffs();

    // Watch for new lists added by SPA navigation or lazy load
    if (_declutterListObs) return;
    _declutterListObs = new MutationObserver(() => {
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
      new MutationObserver(onMutate)
        .observe(listEl, { childList: true, subtree: true });
    }

    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);

    _removeVideosObs = new MutationObserver(() => {
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

  function filterShopPosts(container) {
    if (!get('hideShopPosts')) return;
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      if (!pin.__peShopHidden && isShopPost(pin)) {
        pin.__peShopHidden = true;
        collapseEl(pin);
      }
    });
  }

  let _hideShopPostsObs = null;

  function initHideShopPosts() {
    if (!get('hideShopPosts') || _hideShopPostsObs) return;

    function attachListObserver(listEl) {
      if (listEl.__peShopObs) return;
      listEl.__peShopObs = true;
      filterShopPosts(listEl);
      const onMutate = IS_MOBILE ? debounce(() => filterShopPosts(listEl), 200) : () => filterShopPosts(listEl);
      new MutationObserver(onMutate)
        .observe(listEl, { childList: true, subtree: true });
    }

    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);

    _hideShopPostsObs = new MutationObserver(() => {
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
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
  }

  function initHideComments() {
    if (!get('hideComments')) return;
    hideCommentEditorWrapper();
    new MutationObserver(() => hideCommentEditorWrapper())
      .observe(document.documentElement, { childList: true, subtree: true });
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

  const PIN_TITLE_SELECTORS = [
    '[data-test-id="pin-title"]',
    '[data-test-id="closeup-title"] h1',
    '[data-test-id="pinrep-footer-organic-title"] a',
    '[data-test-id="pinrep-footer-organic-title"] h2',
    'h1[itemprop="name"]',
  ];

  function extractPinTitleFromScope(scope) {
    if (!scope || !scope.querySelector) return null;
    for (const s of PIN_TITLE_SELECTORS) {
      const el = scope.querySelector(s);
      const t = sanitizeFilename(el?.textContent?.trim());
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

  function findMainImageUrl() {
    // Check video poster first (GIF/video pins)
    const closeupVid = document.querySelector(
      '[data-test-id="pin-closeup-image"] video, [elementtiming*="MainPinImage"] ~ video'
    );
    if (closeupVid?.poster) return upgradeToOriginal(closeupVid.poster);

    for (const s of [
      'img[elementtiming*="MainPinImage"]',
      '[data-test-id="pin-closeup-image"] img',
      'img.hCL',
      'img[fetchpriority="high"]',
    ]) {
      const img = document.querySelector(s);
      if (!img) continue;

      // ── GIF detection: check srcset/src for a .gif URL first ──────
      const gifUrl = getGifSrcFromImg(img);
      if (gifUrl) return gifUrl;
      // Also handle mobile GIF closeup: PinTypeIdentifier badge says "GIF"
      // but the img only has a JPEG src — derive the originals .gif URL
      if (!gifUrl) {
        const gifBadge = document.querySelector('[data-test-id="PinTypeIdentifier"]');
        if (gifBadge && /gif|animated/i.test(gifBadge.textContent)) {
          const derived = deriveGifUrl(img.currentSrc || img.src);
          if (derived) return derived;
        }
      }

      // Prefer srcset – pick highest declared width
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
    return null;
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

  async function downloadSingle(imageUrl, filename) {
    if (!imageUrl) return;

    // Try originals → 736x → 564x until one succeeds
    let buf = null;
    for (const u of pinimgFallbackQueue(imageUrl)) {
      try { buf = await fetchBinary(u); break; } catch (_) {}
    }

    if (!buf) return;

    try {
      const ext      = detectFileType(new Uint8Array(buf));
      // Use only explicit pin titles. If no title exists, fall back to:
      // "Pin - 12345678".
      const explicitTitle = stripKnownExt(sanitizeFilename(filename || ''));
      const pageTitle     = stripKnownExt(extractPinTitle() || '');
      const basePart      = explicitTitle || pageTitle || makeFallbackPinName();
      const name     = basePart + ext;
      const blob     = new Blob([buf]);
      const a        = document.createElement('a');
      a.href         = URL.createObjectURL(blob);
      a.download     = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (_) {}
  }

  function initDownloadFixer() {
    if (!get('downloadFixer')) return;
    document.addEventListener('click', e => {
      if (!get('downloadFixer')) return;
      const target = e.target.closest(
        '[data-test-id*="download"], [aria-label*="ownload" i], ' +
        'button[id*="download"], [role="menuitem"]'
      );
      if (!target) return;
      const text   = (target.textContent || '').toLowerCase();
      const testId = target.getAttribute('data-test-id') || '';
      const aria   = (target.getAttribute('aria-label') || '').toLowerCase();
      const isDownload = text.includes('download') || testId.includes('download') || aria.includes('download');
      if (!isDownload) return;
      const url = findMainImageUrl();
      // Only intercept if we found the image URL; otherwise let Pinterest's native handler work
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        downloadSingle(url);
      }
    }, true);
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

    // ── Download images ───────────────────────────────────────────
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
  //  MODULE: VIDEO DOWNLOADER FAB
  //  Shows a download button in the widget stack on pin closeup pages.
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
  // Tries urls in order, stopping at first success or non-404 failure.
  function downloadVideoFile(urls, filename, onProgress) {
    return new Promise((resolve, reject) => {
      let idx = 0;
      function tryNext() {
        if (idx >= urls.length) { reject(new Error('all URLs failed')); return; }
        const url = urls[idx++];
        GM_xmlhttpRequest({
          method: 'GET', url, responseType: 'arraybuffer',
          headers: { 'Referer': location.href, 'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8' },
          onprogress: e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); },
          onload: r => {
            if (r.status >= 200 && r.status < 300) {
              const base = stripKnownExt(sanitizeFilename(filename || '')) || makeFallbackPinName();
              const blob = new Blob([r.response], { type: 'video/mp4' });
              const a    = document.createElement('a');
              a.href     = URL.createObjectURL(blob);
              a.download = base + '.mp4';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 10000);
              resolve();
            } else if (r.status === 404) {
              tryNext(); // try next URL in the fallback chain
            } else {
              reject(new Error('HTTP ' + r.status));
            }
          },
          onerror: () => reject(new Error('network error')),
        });
      }
      tryNext();
    });
  }

  function removeVideoDlFab() {
    const el = document.getElementById('pe-vid-dl-fab');
    if (el) el.remove();
  }

  function createVideoDlFab() {
    removeVideoDlFab();
    if (!get('videoDownloader')) return;
    // Only show on pin closeup pages — not on the home feed or boards
    if (!/\/pin\/\d/i.test(location.pathname)) return;

    // Try specific closeup container selectors first
    let vid = document.querySelector(
      '[data-test-id="pin-closeup-image"] video, ' +
      '[data-test-id="duplo-hls-video"] video, ' +
      '[data-test-id="pinrep-video"] video, ' +
      '[data-test-id="closeup-expanded-view"] video, ' +
      '[data-test-id="closeup-image"] video'
    );
    // Fallback: any video on the pin page that resolves to a Pinterest video CDN URL
    if (!vid) {
      for (const v of document.querySelectorAll('video')) {
        const s = findPinterestVideoSrc(v);
        if (s && !/i\.pinimg\.com/.test(s)) { vid = v; break; }
      }
    }
    // Get URL: DOM-based first, then intercepted XHR fallback (desktop HLS.js blob: src)
    let rawSrc = vid ? findPinterestVideoSrc(vid) : null;
    if (!rawSrc && _interceptedVideoUrls.length) rawSrc = _interceptedVideoUrls[0];

    // No URL available yet — watch video elements and retry when src changes or media loads
    if (!rawSrc) {
      const toWatch = vid ? [vid] : [...document.querySelectorAll('video')];
      toWatch.forEach(v => {
        if (v.__peVidDlWatch || /i\.pinimg\.com/.test(getVideoSrc(v))) return;
        v.__peVidDlWatch = true;
        const retry = () => {
          if (document.getElementById('pe-vid-dl-fab') || !/\/pin\/\d/i.test(location.pathname)) return;
          v.__peVidDlWatch = false;
          createVideoDlFab();
        };
        new MutationObserver(retry).observe(v, {
          attributes: true, attributeFilter: ['src'],
          childList: true, subtree: true,
        });
        v.addEventListener('loadedmetadata', retry, { once: true });
        v.addEventListener('canplay',        retry, { once: true });
      });
      return;
    }

    if (/i\.pinimg\.com/.test(rawSrc)) return; // GIF pin — no video download button

    const wrap = document.getElementById('pe-settings-wrap');
    if (!wrap) return;

    // Build fallback URL list: 720p → t4 → t3 → t2 → t1
    const bestUrl = getHighestQualityVideoUrl(rawSrc);
    const m = rawSrc.match(/v1\.pinimg\.com\/videos\/(mc|iht)\/(?:expMp4|720p|hls)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32,})/i);
    const fallbackUrls = m && m[1] === 'mc'
      ? [
          `https://v1.pinimg.com/videos/mc/720p/${m[2]}.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t4.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t3.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t2.mp4`,
          `https://v1.pinimg.com/videos/mc/expMp4/${m[2]}_t1.mp4`,
        ].filter((u, i, a) => a.indexOf(u) === i)
      : [bestUrl];

    const btn = document.createElement('button');
    btn.id    = 'pe-vid-dl-fab';
    btn.title = 'Download Video';
    // Simple downward arrow icon
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z"/></svg>`;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await downloadVideoFile(fallbackUrls, extractPinTitle(), (loaded, total) => {
          if (total > 0) btn.title = `${Math.round(loaded / total * 100)}%`;
        });
      } catch (_) {}
      btn.disabled = false;
      btn.title = 'Download Video';
    });
    wrap.insertBefore(btn, document.getElementById('pe-settings-btn'));
  }

  function initVideoDownloader() {
    if (!get('videoDownloader')) return;
    createVideoDlFab();
  }

  // When the XHR interceptor captures a video URL, try to create the fab immediately
  // (handles desktop HLS.js where no DOM mutations fire after the URL is fetched)
  _onVideoUrlCapture = function () {
    if (!get('videoDownloader') || !/\/pin\/\d/i.test(location.pathname)) return;
    if (document.getElementById('pe-vid-dl-fab')) return;
    setTimeout(createVideoDlFab, 50);
  };


  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS PANEL UI  –  circle gear FAB, popup above it
  // ═══════════════════════════════════════════════════════════════════
  const FEATURES = [
    { key: 'originalQuality', label: 'Original Quality',       desc: 'Full-res images instead of thumbnails',                    reload: true  },
    { key: 'downloadFixer',   label: 'Download Fixer',         desc: 'Proper filenames & format detection',                      reload: true  },
    { key: 'gifHover',        label: 'GIF Hover Play',         desc: 'GIFs play on hover, pause on leave',                       reload: false },
    { key: 'gifAutoPlay',     label: 'Auto-Play Visible GIFs', desc: 'Auto-play all GIFs on screen, stop when scrolled away',    reload: false },
    { key: 'boardDownloader', label: 'Board Downloader',       desc: 'Download all images from the current board',              reload: true  },
    { key: 'declutter',       label: 'Declutter',              desc: 'Remove ads, quizzes, sponsored & shopping pins',           reload: false },
    { key: 'removeVideos',    label: 'Remove Videos',          desc: 'Remove all video pins from the feed',                      reload: false },
    { key: 'contextMenu',     label: 'Image Context Menu',     desc: 'Right-click pins to copy, open or save the original',      reload: false },
    { key: 'videoDownloader', label: 'Video Downloader',       desc: 'Download button on video pins — saves at 720p quality',     reload: false },
  ];

  const HIDE_FEATURES = [
    { key: 'hideVisitSite',  label: 'Hide Visit Site',          desc: 'Remove all "Visit site" buttons',                         reload: false },
    { key: 'hideUpdates',    label: 'Hide Updates Bell',        desc: 'Hide the Updates / notifications button',                 reload: false },
    { key: 'hideMessages',   label: 'Hide Messages Button',     desc: 'Hide the Messages / notifications button in the nav',     reload: false },
    { key: 'hideShare',      label: 'Hide Share Button',        desc: 'Hide the Share / Send button on pins',                    reload: false },
    { key: 'hideShopPosts',  label: 'Hide Shop Posts',          desc: 'Collapse pins from shops (Amazon, Etsy, eBay, TeePublic, Redbubble, AliExpress)', reload: false },
    { key: 'hideComments',   label: 'Hide Comments',            desc: 'Hide comment sections and comment input on pins',         reload: false },
  ];

  function createSettingsPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'pe-settings-wrap';
    wrap.innerHTML = `
      <div id="pe-settings-panel" style="display:none">
        <div id="pe-settings-title">Pinterest Power Menu <span id="pe-settings-by">By <a id="pe-settings-author" href="https://github.com/Angel2mp3" target="_blank" rel="noopener">Angel</a></span></div>
        ${FEATURES.map(f => `
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
            ${HIDE_FEATURES.map(f => `
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

    function togglePanel() {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'block' : 'none';
      btn.classList.toggle('pe-settings-open', panelOpen);
    }
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
    document.addEventListener('click', e => {
      if (panelOpen && !wrap.contains(e.target)) { panelOpen = false; panel.style.display = 'none'; btn.classList.remove('pe-settings-open'); }
    });

    // Collapsible "Hide UI Elements" group
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
        if (key === 'declutter') { if (cb.checked) initDeclutter(); }
        if (key === 'removeVideos') { if (cb.checked) initRemoveVideos(); }
        if (key === 'contextMenu') { if (cb.checked) initImageContextMenu(); }
        if (key === 'hideUpdates' || key === 'hideMessages' || key === 'hideShare') applyNavToggles();
        if (key === 'hideMessages' && cb.checked) initMessagesRemover();
        if (key === 'hideShopPosts') { if (cb.checked) initHideShopPosts(); }
        if (key === 'hideComments') { applyNavToggles(); if (cb.checked) initHideComments(); }
        if (key === 'videoDownloader') { if (cb.checked) createVideoDlFab(); else removeVideoDlFab(); }
        if (cb.dataset.reload === 'true')
          wrap.querySelector('#pe-notice').style.display = 'flex';
      });
    });

    wrap.querySelector('#pe-reload-btn').addEventListener('click', () => location.reload());
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: IMAGE RIGHT-CLICK CONTEXT MENU
  // ═══════════════════════════════════════════════════════════════════
  // Intercepts right-clicks on (or near) any pinimg.com image and shows
  // a custom menu with options to copy/save the original-quality version.
  // Replaces the native browser menu only when a Pinterest image is
  // under the cursor; other right-clicks fall through normally.

  function initImageContextMenu() {
    // The custom context menu is mouse-only. On mobile the long-press handler
    // would compete with native browser actions (text selection, system menus),
    // so we skip the entire module on touch devices.
    if (IS_MOBILE) return;
    if (!get('contextMenu')) return;

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
      function fallbackToText() {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(origUrl, 'text');
        } else {
          const ta = document.createElement('textarea');
          ta.value = origUrl;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
      }

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
        () => {
          if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(origUrl, 'text');
          } else {
            navigator.clipboard.writeText(origUrl).catch(() => {
              const ta = document.createElement('textarea');
              ta.value = origUrl;
              ta.style.cssText = 'position:fixed;left:-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
            });
          }
        }
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

    document.addEventListener('contextmenu', e => {
      if (!get('contextMenu')) { removeCtxMenu(); return; }
      // Suppress native contextmenu on Android when our long-press already fired
      if (_lpJustShown) { e.preventDefault(); return; }
      const media = getMediaInfo(e.target);
      if (!media) { removeCtxMenu(); return; }
      e.preventDefault();
      showCtxMenuAt(e.clientX, e.clientY, media, false);
    }, true);

    // ── Long-press for mobile context menu (iOS + Android fallback) ──
    document.addEventListener('touchstart', e => {
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
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (_lpScrolled) return;
      const touch = e.changedTouches[0];
      if (Math.abs(touch.clientX - _lpStartX) > 10 || Math.abs(touch.clientY - _lpStartY) > 10) {
        _lpScrolled = true;
        clearTimeout(_lpTimer);
        _lpTimer = null;
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      clearTimeout(_lpTimer);
      _lpTimer = null;
    }, { passive: true });
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
      body.pe-hide-updates [data-test-id="bell-icon"] {
        display: none !important;
      }

      /* ──────── Hide Messages nav button ──────── */
      body.pe-hide-messages div[aria-label="Messages"],
      body.pe-hide-messages [data-test-id="notifications-button"],
      body.pe-hide-messages [data-test-id="nav-bar-speech-ellipsis"],
      body.pe-hide-messages a[href="/notifications/"] {
        display: none !important;
      }

      /* ──────── Hide Share / Send button ──────── */
      body.pe-hide-share [data-test-id="closeup-share-button"],
      body.pe-hide-share div[aria-label="Share"],
      body.pe-hide-share button[aria-label="Send"],
      body.pe-hide-share [data-test-id="sendPinButton"],
      body.pe-hide-share [aria-label="Send"][role="button"],
      body.pe-hide-share [data-test-id="share-button-no-animation"],
      body.pe-hide-share [style*="ANIMATE_SHARE_container"] {
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

      /* ──────── Remove dark hover overlay on pin cards ──────── */
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
      /* Kill the dark gradient on ALL pin image wrappers (class-agnostic) */
      [data-test-id^="pincard"] > div > div:last-child:not([data-test-id]),
      .PinCard__imageWrapper > div > div:last-child:empty {
        display: none !important;
      }

      /* ──────── Settings circle FAB ──────── */
      #pe-settings-wrap {
        position: fixed;
        bottom: 6px;
        right: 6px;
        z-index: 2147483647;
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
        background: #e60023; color: #fff; border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 18px rgba(230,0,35,.45);
        transition: background .18s, box-shadow .18s, transform .25s;
        flex-shrink: 0;
      }
      #pe-settings-btn:hover { background: #b5001b; box-shadow: 0 6px 24px rgba(230,0,35,.55); transform: scale(1.08); }
      #pe-settings-btn:active { transform: scale(.92); }
      #pe-settings-btn.pe-settings-open { transform: rotate(45deg); }
      #pe-settings-btn.pe-settings-open:hover { transform: rotate(45deg) scale(1.08); }

      #pe-settings-panel {
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 4px 28px rgba(0,0,0,.16), 0 1px 4px rgba(0,0,0,.08);
        border: 1px solid rgba(0,0,0,.07);
        min-width: 268px;
        overflow: hidden;
        animation: pe-bd-pop .15s ease-out;
      }
      #pe-settings-title {
        padding: 11px 14px 9px;
        background: #e60023;
        color: #fff;
        font-weight: 700;
        font-size: 16px;
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
        padding: 8px 14px; gap: 12px;
        transition: background .12s;
        border-top: 1px solid #f2f2f2;
      }
      .pe-row:hover { background: #fafafa; }

      .pe-info { flex: 1; min-width: 0; }
      .pe-name {
        display: block; font-weight: 600; color: #111;
        font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pe-desc {
        display: block; font-size: 11px; color: #767676; margin-top: 1px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* Toggle switch */
      .pe-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
      .pe-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
      .pe-knob {
        position: absolute; inset: 0; background: #d1d1d1;
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
      .pe-switch input:checked ~ .pe-knob { background: #e60023; }
      .pe-switch input:checked ~ .pe-knob::before { transform: translateX(16px); }
      .pe-switch input:focus-visible ~ .pe-knob { outline: 2px solid #e60023; outline-offset: 2px; }

      /* ──────── Collapsible settings group ──────── */
      .pe-group { border-top: 1px solid #f2f2f2; }
      .pe-group-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 14px; gap: 12px; cursor: pointer; transition: background .12s;
      }
      .pe-group-header:hover { background: #fafafa; }
      .pe-chevron { transition: transform .2s; flex-shrink: 0; color: #767676; }
      .pe-group-open .pe-chevron { transform: rotate(180deg); }
      .pe-group-body { border-top: 1px solid #f2f2f2; }
      .pe-sub-row { padding-left: 28px !important; background: #fafafa; }
      .pe-sub-row:hover { background: #f5f5f5 !important; }

      /* Reload notice */
      #pe-notice {
        display: flex; align-items: center; justify-content: space-between;
        background: #fff9e6; border-top: 1px solid #ffe180;
        padding: 7px 14px; gap: 8px;
        font-size: 12px; color: #7a5800;
      }
      #pe-reload-btn {
        background: #e60023; color: #fff; border: none;
        border-radius: 6px; font-size: 11px; font-weight: 700;
        padding: 3px 10px; cursor: pointer; white-space: nowrap;
        transition: background .15s;
      }
      #pe-reload-btn:hover { background: #b5001b; }

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

      /* ──────── Video Downloader FAB ──────── */
      #pe-vid-dl-fab {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: #e60023; color: #fff; border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 18px rgba(230,0,35,.45);
        transition: background .18s, box-shadow .18s, transform .25s;
        flex-shrink: 0;
        touch-action: manipulation;
      }
      #pe-vid-dl-fab:hover  { background: #b5001b; box-shadow: 0 6px 24px rgba(230,0,35,.55); transform: scale(1.08); }
      #pe-vid-dl-fab:active { transform: scale(.92); }
      #pe-vid-dl-fab:disabled { opacity: .55; cursor: wait; transform: none !important; }

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

      /* Settings panel: scrollable and viewport-safe on small screens */
      #pe-settings-panel {
        max-height: calc(100dvh - 80px);
        overflow-y: auto;
        overscroll-behavior: contain;
        max-width: calc(100vw - 12px);
        -webkit-overflow-scrolling: touch;
      }

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
          max-height: 420px; /* px fallback for browsers without dvh support */
          max-height: min(62dvh, 420px);
          min-width: 220px;
          max-width: calc(100vw - 14px);
          border-radius: 12px;
        }
        #pe-vid-dl-fab { width: 32px; height: 32px; }
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
          max-height: 420px;
          max-height: min(62dvh, 420px);
          min-width: 220px;
          max-width: calc(100vw - 14px);
        }
        #pe-vid-dl-fab { width: 32px; height: 32px; }
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
  function onReady() {
    injectStyles();

    // Upgrade any images already in DOM
    if (get('originalQuality'))
      document.querySelectorAll('img[src*="pinimg.com"]').forEach(upgradeImg);

    // GIF hover – pause any videos already in DOM, start delegation
    document.querySelectorAll('video').forEach(pauseVidOnAdd);
    initGifHover();

    // Apply hide-visit-site + nav-hide CSS classes
    applyVisitSiteToggle();
    applyNavToggles();
    initVisitSiteHider();
    initMessagesRemover();
    initShareOverride();

    // Declutter
    initDeclutter();

    // Remove videos
    initRemoveVideos();

    // GIF auto-play
    if (get('gifAutoPlay')) initGifAutoPlay();

    // Image right-click context menu
    initImageContextMenu();

    // Download fixer event listener
    initDownloadFixer();

    // Settings panel
    createSettingsPanel();

    // Board downloader button
    createBoardDownloaderUI();

    // Hide shop posts
    initHideShopPosts();

    // Hide comments
    initHideComments();

    // Video downloader FAB
    initVideoDownloader();

    // Scroll preservation (restores position on browser back)
    initScrollPreservation();

    // Mobile: pre-load lazy images and fix GIF loading
    initMobileLazyFix();
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

      // Give Pinterest's React a moment to render the new page
      setTimeout(() => {
        removeBoardDownloaderUI();
        if (get('boardDownloader') && isBoardPage()) createBoardDownloaderUI();
        removeVideoDlFab();
        if (get('videoDownloader')) createVideoDlFab();
      }, 600);

      // Second attempt after a longer delay in case lazy-loaded DOM is slow
      setTimeout(() => {
        if (!document.getElementById('pe-bd-btn') && get('boardDownloader') && isBoardPage())
          createBoardDownloaderUI();
        if (!document.getElementById('pe-vid-dl-fab') && get('videoDownloader'))
          createVideoDlFab();
      }, 1800);
    }

    // Wrap history methods
    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState    = function (...a) { _push(...a);    onNavigate(); };
    history.replaceState = function (...a) { _replace(...a); onNavigate(); };
    window.addEventListener('popstate', onNavigate);

    // Also watch for the board header / video element appearing in the DOM (handles cases
    // where the URL change fires before React has rendered the new page content)
    new MutationObserver(() => {
      if (!document.getElementById('pe-bd-btn') && get('boardDownloader') && isBoardPage())
        createBoardDownloaderUI();
      if (!document.getElementById('pe-vid-dl-fab') && get('videoDownloader'))
        createVideoDlFab();
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();

})();
