// ==UserScript==
// @name         Pinterest Power Menu
// @namespace    https://github.com/Angel2mp3
// @version      1.0.0
// @description  All-in-one Pinterest power tool: original quality, no registration walls, download fixer, board folder downloader, GIF hover/auto-play, remove videos, hide Visit Site, declutter, hide UI elements
// @author       Angel2mp3
// @match        https://www.pinterest.com/*
// @match        https://pinterest.com/*
// @match        https://*.pinterest.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  const SETTINGS_KEY = 'pe_settings_v1';
  const DEFAULTS = {
    originalQuality:  true,
    noRegistration:   true,
    downloadFixer:    true,
    gifHover:         true,
    hideVisitSite:    true,
    boardDownloader:  true,
    declutter:        true,
    hideUpdates:      false,
    hideMessages:     false,
    hideShare:        false,
    hideUnavailable:  false,
    gifAutoPlay:      false,
    removeVideos:     false,
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
    records.forEach(r => {
      if (r.attributeName === 'src') upgradeImg(r.target);
      else r.addedNodes.forEach(scanOQ);
    });
  });
  oqObs.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
  });


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: NO REGISTRATION WALL
  // ═══════════════════════════════════════════════════════════════════
  const MODAL_SELS = [
    'div[data-test-id="signup"]',
    'div[data-test-id="fullPageSignupModal"]',
    'div[data-test-id="giftWrap"]',
    'div[data-test-id="register-view"]',
    '[data-test-id="RegisterModal"]',
    '.RegisterModal',
    'div[data-test-id="unauth-home-feed"]',
  ];

  function removeModals() {
    if (!get('noRegistration')) return;
    MODAL_SELS.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
    if (document.body && document.body.style.overflow === 'hidden')
      document.body.style.overflow = '';
  }

  new MutationObserver(removeModals)
    .observe(document.documentElement, { childList: true, subtree: true });


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
    document.body.classList.toggle('pe-hide-updates',  get('hideUpdates'));
    document.body.classList.toggle('pe-hide-messages', get('hideMessages'));
    document.body.classList.toggle('pe-hide-share',    get('hideShare'));
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

  let _gifActiveImg     = null;   // <img> currently showing a .gif
  let _gifOrigSrc       = null;   // original src to restore on leave
  let _gifOrigSrcset    = null;   // original srcset to restore on leave
  let _gifActiveCont    = null;   // pinWrapper of the active gif

  // Extract the .gif URL from an img's srcset attribute
  function getGifSrcFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute('srcset') || '';
    for (const part of srcset.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url && /\.gif(\?|$)/i.test(url)) return url;
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
    if (v.__pePaused) return;
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

      // Walk up to [data-test-id="pinWrapper"] (max 20 levels)
      let cur = e.target, pinWrapper = null;
      for (let i = 0; i < 20 && cur && cur !== document.body; i++) {
        if (cur.getAttribute && cur.getAttribute('data-test-id') === 'pinWrapper') {
          pinWrapper = cur; break;
        }
        cur = cur.parentElement;
      }
      if (!pinWrapper || pinWrapper === _gifActiveCont) return;

      // Look for a GIF image inside this pin card
      const img = pinWrapper.querySelector('img[srcset*=".gif"]');
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
  }


  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: GIF AUTO-PLAY (viewport-based)
  // ═══════════════════════════════════════════════════════════════════
  // Uses IntersectionObserver to play all GIFs currently visible on
  // screen and stop them when scrolled out of view to save CPU/memory.

  let _gifAutoIO = null;   // IntersectionObserver
  let _gifAutoMO = null;   // MutationObserver for new pins

  function startGifInView(wrapper) {
    const img = wrapper.querySelector('img[srcset*=".gif"]');
    if (!img || img.__peAutoPlaying) return;
    const gifUrl = getGifSrcFromImg(img);
    if (!gifUrl) return;
    img.__peAutoOrigSrc    = img.src;
    img.__peAutoOrigSrcset = img.getAttribute('srcset');
    img.removeAttribute('srcset');
    img.src = gifUrl;
    img.__peAutoPlaying = true;
  }

  function stopGifInView(wrapper) {
    const imgs = wrapper.querySelectorAll('img');
    imgs.forEach(img => {
      if (!img.__peAutoPlaying) return;
      // Don't interfere if hover is currently managing this img
      if (img === _gifActiveImg) {
        img.__peAutoPlaying = false;
        return;
      }
      if (img.__peAutoOrigSrcset) img.setAttribute('srcset', img.__peAutoOrigSrcset);
      if (img.__peAutoOrigSrc)    img.src = img.__peAutoOrigSrc;
      img.__peAutoPlaying = false;
    });
  }

  function observeGifPins() {
    if (!_gifAutoIO) return;
    document.querySelectorAll('[data-test-id="pinWrapper"]').forEach(wrapper => {
      if (wrapper.__peAutoObs) return;
      if (!wrapper.querySelector('img[srcset*=".gif"]')) return;
      wrapper.__peAutoObs = true;
      _gifAutoIO.observe(wrapper);
    });
  }

  function initGifAutoPlay() {
    if (_gifAutoIO) return;
    _gifAutoIO = new IntersectionObserver(entries => {
      if (!get('gifAutoPlay')) return;
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
    document.querySelectorAll('[data-test-id="pinWrapper"]').forEach(wrapper => {
      stopGifInView(wrapper);
      wrapper.__peAutoObs = false;
    });
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
  }

  let _declutterListObs = null;

  function initDeclutter() {
    if (!get('declutter')) return;

    // Observe the pin grid list(s) for new list items
    function attachListObserver(listEl) {
      if (listEl.__peDeclutterObs) return;
      listEl.__peDeclutterObs = true;
      filterPins(listEl);
      new MutationObserver(() => filterPins(listEl))
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
      new MutationObserver(() => filterVideoPins(listEl))
        .observe(listEl, { childList: true, subtree: true });
    }

    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);

    _removeVideosObs = new MutationObserver(() => {
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    });
    _removeVideosObs.observe(document.documentElement, { childList: true, subtree: true });
  }




  // ═══════════════════════════════════════════════════════════════════
  //  MODULE: HIDE UNAVAILABLE POSTS
  // ═══════════════════════════════════════════════════════════════════
  // Detects deleted/unavailable pins via [data-test-id="unavailable-pin"]
  // and collapses them using the same technique as Declutter.

  function isUnavailablePin(pin) {
    return !!pin.querySelector('[data-test-id="unavailable-pin"]');
  }

  function filterUnavailablePins(container) {
    if (!get('hideUnavailable')) return;
    container.querySelectorAll('div[role="listitem"]').forEach(pin => {
      if (!pin.__peUnavailRemoved && isUnavailablePin(pin)) {
        pin.__peUnavailRemoved = true;
        collapseEl(pin);
      }
    });
  }

  let _hideUnavailObs = null;

  function initHideUnavailable() {
    if (!get('hideUnavailable') || _hideUnavailObs) return;

    function attachListObserver(listEl) {
      if (listEl.__peUnavailObs) return;
      listEl.__peUnavailObs = true;
      filterUnavailablePins(listEl);
      new MutationObserver(() => filterUnavailablePins(listEl))
        .observe(listEl, { childList: true, subtree: true });
    }

    document.querySelectorAll('div[role="list"]').forEach(attachListObserver);

    _hideUnavailObs = new MutationObserver(() => {
      document.querySelectorAll('div[role="list"]').forEach(attachListObserver);
    });
    _hideUnavailObs.observe(document.documentElement, { childList: true, subtree: true });
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
    return '.jpg';
  }

  function sanitizeFilename(n) {
    if (!n) return null;
    let s = n.replace(/[<>:"/\\|?*\x00-\x1f\x80-\x9f]/g, '').trim();
    if (s.length > 200) s = s.slice(0, 200);
    return s.length ? s : null;
  }

  function randStr(len) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
  }

  function extractPinTitle() {
    for (const s of [
      '[data-test-id="closeup-title"] h1',
      '[data-test-id="pin-title"]',
      'h1[itemprop="name"]',
    ]) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return sanitizeFilename(el.textContent.trim());
    }
    const meta = document.querySelector('meta[property="og:title"]');
    if (meta?.content) return sanitizeFilename(meta.content.trim());
    return null;
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
        onload:  r => (r.status >= 200 && r.status < 300) ? res(r.response) : rej(r.status),
        onerror: rej,
      });
    });
  }

  async function downloadSingle(imageUrl, filename) {
    if (!imageUrl) return;
    try {
      const buf  = await fetchBinary(imageUrl);
      const ext  = detectFileType(new Uint8Array(buf));
      const name = (filename || extractPinTitle() || `pin-${randStr(15)}`) + ext;
      const blob = new Blob([buf]);
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 100);
    } catch (e) {
      console.error('[Pinterest Power Menu] Download failed:', e);
    }
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
    const urlMatch = parts.length === 2 && !skip.has(parts[0]) && !skip.has(parts[1]);
    // DOM confirmation: Pinterest board header is present
    const domMatch = !!document.querySelector(
      '[data-test-id="board-header-with-image"], [data-test-id="board-header-details"], [data-test-id="board-tools"]'
    );
    return urlMatch || domMatch;
  }

  // Snapshot whatever pin images are currently in the DOM into the
  // accumulator set.  Called repeatedly while scrolling so we catch
  // images before Pinterest's virtual list recycles those DOM nodes.
  // Also captures pin names (from img.alt) into the names Map.
  function snapshotPinUrls(seen, urls, names) {
    document.querySelectorAll('img[src*="i.pinimg.com"]').forEach(img => {
      // Skip tiny avatars/icons
      const w = img.naturalWidth || img.width;
      if (w && w < 80) return;
      let url = img.src;
      const m = url.match(OQ_RE);
      if (m) url = m[1] + '/originals' + m[2];
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
        // Use img alt text as the pin name (Pinterest puts the title/desc there)
        const alt = (img.alt || '').trim();
        names.set(url, alt ? sanitizeFilename(alt) : null);
      }
    });
  }

  // Scroll to the bottom, snapshotting URLs at each tick so virtualised
  // DOM nodes are captured before they get removed.  Returns accumulated
  // URL array.  Stall threshold is intentionally generous (12 × 900ms =
  // 10.8 s) because Pinterest's lazy load can pause for several seconds.
  async function autoScrollAndCollect(setStatus) {
    const seen  = new Set();
    const urls  = [];
    const names = new Map();
    return new Promise(resolve => {
      let lastH = 0, stall = 0;
      const t = setInterval(() => {
        snapshotPinUrls(seen, urls, names);    // grab current DOM before scroll
        window.scrollTo(0, document.body.scrollHeight);
        const h = document.body.scrollHeight;
        setStatus('scroll', urls.length, 0);
        if (h === lastH) {
          stall++;
          if (stall >= 12) {
            snapshotPinUrls(seen, urls, names); // final grab
            clearInterval(t);
            window.scrollTo(0, 0);
            resolve({ urls, names });
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

  function getBoardName() {
    return sanitizeFilename(
      document.title.replace(/\s*[-–|].*$/, '').trim()
    ) || 'pinterest-board';
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

  // ─── Save images to a chosen folder (or named downloads) ────────
  async function downloadBoardFolder(setStatus) {
    const { urls, names } = await collectAllPins(setStatus);
    if (!urls.length) { alert('[Pinterest Power Menu] No images found on this board.'); return; }

    const boardName = getBoardName();

    // Build per-file names: "BoardName - PinTitle" or "BoardName - xxxxxxxx"
    // Cap pinName at 80 chars so full path stays filesystem-safe.
    function makeFileName(url, ext) {
      let pinName = names.get(url) || randStr(8);
      if (pinName.length > 80) pinName = pinName.slice(0, 80).trimEnd();
      return `${boardName} - ${pinName}${ext}`;
    }

    let dirHandle = null;

    // Try the File System Access API so the user can pick a folder
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
      } catch (e) {
        if (e.name === 'AbortError') { setStatus('cancelled', 0, 0); return; }
        dirHandle = null;
      }
    }

    if (!dirHandle && typeof window.showDirectoryPicker !== 'function') {
      // Fallback: individual <a download> links
      const bufs = await fetchParallel(urls, 5, (done, total) =>
        setStatus('fetch', done, total)
      );
      let saved = 0;
      for (let i = 0; i < bufs.length; i++) {
        const buf = bufs[i];
        if (!buf) continue;
        const ext      = detectFileType(new Uint8Array(buf));
        const fileName = `${boardName}/${makeFileName(urls[i], ext)}`;
        try {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([buf]));
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 200);
          await new Promise(r => setTimeout(r, 300));
          saved++;
        } catch (_) {}
      }
      setStatus('done', saved, urls.length);
      return;
    }

    // We have a dirHandle – save directly into the chosen folder
    const bufs = await fetchParallel(urls, 5, (done, total) =>
      setStatus('fetch', done, total)
    );

    let saved = 0;
    for (let i = 0; i < bufs.length; i++) {
      const buf = bufs[i];
      if (!buf) continue;
      const ext      = detectFileType(new Uint8Array(buf));
      const fileName = makeFileName(urls[i], ext);
      try {
        const fh = await dirHandle.getFileHandle(fileName, { create: true });
        const wr = await fh.createWritable();
        await wr.write(new Blob([buf]));
        await wr.close();
        saved++;
      } catch (_) {}
    }
    setStatus('done', saved, urls.length);
  }

  // ─── FAB + popup UI ──────────────────────────────────────────────
  function removeBoardDownloaderUI() {
    const el = document.getElementById('pe-bd-fab');
    if (el) el.remove();
  }

  function createBoardDownloaderUI() {
    removeBoardDownloaderUI();          // always clean up first
    if (!get('boardDownloader') || !isBoardPage()) return;

    const fab = document.createElement('div');
    fab.id = 'pe-bd-fab';
    fab.innerHTML = `
      <div id="pe-bd-menu" style="display:none">
        <div id="pe-bd-status" style="display:none"></div>
        <button class="pe-bd-opt" id="pe-bd-folder">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
          </svg>
          Save to Folder
        </button>
      </div>
      <button id="pe-bd-btn" title="Download Board">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 19v2h14v-2H5z"/>
        </svg>
      </button>
    `;
    document.body.appendChild(fab);

    const btn    = fab.querySelector('#pe-bd-btn');
    const menu   = fab.querySelector('#pe-bd-menu');
    const status = fab.querySelector('#pe-bd-status');
    const dirBtn = fab.querySelector('#pe-bd-folder');

    let menuOpen = false;
    function toggleMenu() {
      menuOpen = !menuOpen;
      menu.style.display = menuOpen ? 'block' : 'none';
    }
    btn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', e => {
      if (menuOpen && !fab.contains(e.target)) { menuOpen = false; menu.style.display = 'none'; }
    });

    function setStatus(phase, a, b) {
      if (phase === 'cancelled') {
        status.style.display = 'none';
        dirBtn.disabled = false;
        return;
      }
      status.style.display = 'block';
      if (phase === 'scroll')  status.textContent = `Scrolling… ${a} pins loaded`;
      else if (phase === 'fetch') status.textContent = `Fetching ${a}/${b} (${b ? Math.round(a/b*100) : 0}%)`;
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
  //  SETTINGS PANEL UI  –  circle gear FAB, popup above it
  // ═══════════════════════════════════════════════════════════════════
  const FEATURES = [
    { key: 'originalQuality', label: 'Original Quality',       desc: 'Full-res images instead of thumbnails',                    reload: true  },
    { key: 'noRegistration',  label: 'No Registration Wall',   desc: 'Auto-remove login / signup popups',                        reload: false },
    { key: 'downloadFixer',   label: 'Download Fixer',         desc: 'Proper filenames & format detection',                      reload: true  },
    { key: 'gifHover',        label: 'GIF Hover Play',         desc: 'GIFs play on hover, pause on leave',                       reload: false },
    { key: 'gifAutoPlay',     label: 'Auto-Play Visible GIFs', desc: 'Auto-play all GIFs on screen, stop when scrolled away',    reload: false },
    { key: 'boardDownloader', label: 'Board Downloader',       desc: 'Save board images to a folder',                           reload: true  },
    { key: 'declutter',       label: 'Declutter',              desc: 'Remove ads, quizzes, sponsored & shopping pins',           reload: false },
    { key: 'removeVideos',    label: 'Remove Videos',          desc: 'Remove all video pins from the feed',                      reload: false },
  ];

  const HIDE_FEATURES = [
    { key: 'hideVisitSite',  label: 'Hide Visit Site',      desc: 'Remove all "Visit site" buttons',             reload: false },
    { key: 'hideUpdates',    label: 'Hide Updates Bell',     desc: 'Hide the Updates / notifications button',     reload: false },
    { key: 'hideMessages',   label: 'Hide Messages Button', desc: 'Hide the Messages chat button in the nav',    reload: false },
    { key: 'hideShare',      label: 'Hide Share Button',    desc: 'Hide the Share / Send button on pins',        reload: false },
    { key: 'hideUnavailable', label: 'Hide Unavailable Posts', desc: 'Remove deleted/removed-by-creator pins',         reload: false },
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
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
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
        if (key === 'noRegistration' && cb.checked) removeModals();
        if (key === 'gifHover') { pauseActiveGif(); document.querySelectorAll('video').forEach(pauseVidOnAdd); }
        if (key === 'gifAutoPlay') { if (cb.checked) initGifAutoPlay(); else stopGifAutoPlay(); }
        if (key === 'declutter') { if (cb.checked) initDeclutter(); }
        if (key === 'removeVideos') { if (cb.checked) initRemoveVideos(); }
        if (key === 'hideUnavailable') { if (cb.checked) initHideUnavailable(); }
        if (key === 'hideUpdates' || key === 'hideMessages' || key === 'hideShare') applyNavToggles();
        if (cb.dataset.reload === 'true')
          wrap.querySelector('#pe-notice').style.display = 'flex';
      });
    });

    wrap.querySelector('#pe-reload-btn').addEventListener('click', () => location.reload());
  }


  // ═══════════════════════════════════════════════════════════════════
  //  STYLES
  // ═══════════════════════════════════════════════════════════════════
  function injectStyles() {
    const s = document.createElement('style');
    s.id = 'pe-styles';
    s.textContent = `
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
      body.pe-hide-messages [data-test-id="notifications-button"] {
        display: none !important;
      }

      /* ──────── Hide Share / Send button ──────── */
      body.pe-hide-share [data-test-id="closeup-share-button"],
      body.pe-hide-share div[aria-label="Share"],
      body.pe-hide-share button[aria-label="Send"],
      body.pe-hide-share [data-test-id="sendPinButton"] {
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
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        user-select: none;
      }
      #pe-settings-btn {
        width: 52px; height: 52px;
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

      /* ──────── Board Downloader FAB ──────── */
      #pe-bd-fab {
        position: fixed;
        bottom: 86px;
        right: 20px;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #pe-bd-btn {
        width: 52px; height: 52px;
        border-radius: 50%;
        background: #e60023; color: #fff; border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 18px rgba(230,0,35,.45);
        transition: background .18s, box-shadow .18s, transform .12s;
        flex-shrink: 0;
      }
      #pe-bd-btn:hover {
        background: #b5001b;
        box-shadow: 0 6px 24px rgba(230,0,35,.55);
        transform: scale(1.08);
      }
      #pe-bd-btn:active { transform: scale(.92); }
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

    // Remove any modals already in DOM
    removeModals();

    // GIF hover – pause any videos already in DOM, start delegation
    document.querySelectorAll('video').forEach(pauseVidOnAdd);
    initGifHover();

    // Apply hide-visit-site + nav-hide CSS classes
    applyVisitSiteToggle();
    applyNavToggles();
    initVisitSiteHider();
    initShareOverride();

    // Declutter
    initDeclutter();

    // Remove videos
    initRemoveVideos();

    // Hide unavailable posts
    initHideUnavailable();

    // GIF auto-play
    if (get('gifAutoPlay')) initGifAutoPlay();

    // Download fixer event listener
    initDownloadFixer();

    // Board downloader button
    createBoardDownloaderUI();

    // Settings panel
    createSettingsPanel();

    console.log('[Pinterest Power Menu] v2.1.0 loaded ✓');
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
      }, 600);

      // Second attempt after a longer delay in case lazy-loaded DOM is slow
      setTimeout(() => {
        if (!document.getElementById('pe-bd-fab') && get('boardDownloader') && isBoardPage())
          createBoardDownloaderUI();
      }, 1800);
    }

    // Wrap history methods
    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState    = function (...a) { _push(...a);    onNavigate(); };
    history.replaceState = function (...a) { _replace(...a); onNavigate(); };
    window.addEventListener('popstate', onNavigate);

    // Also watch for the board header appearing in the DOM (handles cases
    // where the URL change fires before React has rendered the board)
    new MutationObserver(() => {
      if (document.getElementById('pe-bd-fab')) return;   // already present
      if (get('boardDownloader') && isBoardPage()) createBoardDownloaderUI();
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();

})();
