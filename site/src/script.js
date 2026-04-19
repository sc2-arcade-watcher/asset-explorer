/**
 * Default `assetBase` used when a category JSON omits the field. Every current
 * list ships without the override. Categories can override by setting
 * `assetBase` at the top level of their JSON (e.g. future GitHub-hosted sets).
 */
export const DEFAULT_ASSET_BASE = 'https://dist.sc2arcade.com/star-assets/';

/**
 * Wraps a remote image URL through the local imageproxy for resized thumbnails.
 * Returns the original URL unchanged when running on GitHub Pages (no proxy available).
 *
 * @param {string} url - Full remote image URL
 * @param {string} options - imageproxy option string, e.g. "152x152,fit"
 * @returns {string} Proxied thumbnail URL, or original URL on GitHub Pages
 */
export function thumbUrl(url, options) {
  if (location.hostname.endsWith('.github.io')) return url;
  return `/thumbs/${options}/${url}`;
}

/**
 * Loads a JSON asset list from ./list/{list}.json. See `test/list-schema.js`
 * for the authoritative shape.
 *
 * @param {string} list
 * @param {AbortSignal} [signal]
 * @returns {Promise<{category:string, name:string, assetBase?:string, items:Array<{name:string, download:string, image:string, description?:string}>}>}
 */
export async function loadAssetList(list, signal) {
  const response = await fetch(`./list/${list}.json`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Failed to load ${list}`);
  return response.json();
}

/**
 * Walks up from `el` and returns the nearest ancestor whose overflow establishes
 * a scrolling context. Returns null if there isn't one (i.e. the viewport scrolls).
 *
 * The category pages make `<article>` the scroll container (overflow: auto),
 * which breaks IntersectionObservers that default to the viewport root —
 * thresholds never fire when the window itself doesn't scroll.
 */
function getScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const s = getComputedStyle(node);
    const overflowY = s.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/* SVG icons for the view-size and layout toggle buttons. */
const SIZE_ICONS = {
  small:  `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="6" y="1" width="4" height="4" rx="0.5"/><rect x="11" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="6" width="4" height="4" rx="0.5"/><rect x="6" y="6" width="4" height="4" rx="0.5"/><rect x="11" y="6" width="4" height="4" rx="0.5"/><rect x="1" y="11" width="4" height="4" rx="0.5"/><rect x="6" y="11" width="4" height="4" rx="0.5"/><rect x="11" y="11" width="4" height="4" rx="0.5"/></svg>`,
  medium: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/></svg>`,
  large:  `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="1"/></svg>`,
};
const LAYOUT_ICONS = {
  grid: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/></svg>`,
  list:   `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="1" y="2" width="14" height="3" rx="0.5"/><rect x="1" y="7" width="14" height="3" rx="0.5"/><rect x="1" y="12" width="14" height="3" rx="0.5"/></svg>`,
};

/**
 * Builds a labelled icon-toggle group for the grid toolbar.
 * options: array of {value, label, icon} (icon is an SVG string).
 */
function buildToggleGroup(labelText, value, options, onChange) {
  const group = document.createElement('span');
  group.className = 'toolbar-group';

  const lbl = document.createElement('span');
  lbl.className = 'toolbar-group-label';
  lbl.textContent = labelText;
  group.appendChild(lbl);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'toolbar-toggle-group';
  btnGroup.setAttribute('role', 'group');
  btnGroup.setAttribute('aria-label', labelText);

  for (const opt of options) {
    const { value: v, label: l, icon } = (opt && typeof opt === 'object')
      ? opt
      : { value: opt, label: String(opt), icon: null };
    const btn = document.createElement('button');
    const active = String(v) === String(value);
    btn.className = 'toggle-btn' + (active ? ' active' : '');
    btn.dataset.value = String(v);
    btn.setAttribute('aria-pressed', String(active));
    btn.type = 'button';
    btn.title = l;
    btn.innerHTML = icon || l;
    btn.addEventListener('click', () => {
      btnGroup.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      onChange(String(v));
    });
    btnGroup.appendChild(btn);
  }

  group.appendChild(btnGroup);
  return group;
}

/**
 * Lazily imports PhotoSwipe and injects its stylesheet on first call.
 * Both are fetched only when the user actually opens a preview, so
 * non-clickers pay nothing.
 */
let pswpModulePromise = null;
let pswpCssInjected = false;
function loadPhotoSwipe() {
  if (!pswpCssInjected) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../lib/photoswipe/photoswipe.css', import.meta.url).href;
    document.head.appendChild(link);
    pswpCssInjected = true;
  }
  if (!pswpModulePromise) {
    pswpModulePromise = import('../lib/photoswipe/photoswipe.esm.js').then(m => m.default);
  }
  return pswpModulePromise;
}

// Asset dimensions aren't known until the image loads (thumbnails are served
// through imageproxy at a different size than the source). The documented
// pattern for this is:
//   1. Seed dataSource with a best-effort guess for each slide.
//   2. Preload the clicked image synchronously so the opening animation has
//      the right aspect ratio.
//   3. As each slide's real image loads, mutate dataSource + call
//      pswp.refreshSlideContent(index) so PhotoSwipe recomputes fit/zoom
//      against the true natural dims.
// See https://photoswipe.com/methods/#refreshslidecontentslideindex
function measureImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function openLightbox(items, index, triggerImg, { showDownload = true } = {}) {
  const PhotoSwipe = await loadPhotoSwipe();

  const clickedDims = await measureImage(items[index].image);
  const fallbackW = clickedDims?.width  || triggerImg?.naturalWidth  || 1024;
  const fallbackH = clickedDims?.height || triggerImg?.naturalHeight || 1024;

  const dataSource = items.map((it, i) => ({
    src: it.image,
    width:  i === index && clickedDims ? clickedDims.width  : fallbackW,
    height: i === index && clickedDims ? clickedDims.height : fallbackH,
    alt: it.name,
    name: it.name,
    download: it.download || '',
    ...(i === index && triggerImg?.currentSrc
      ? { msrc: triggerImg.currentSrc }
      : {}),
  }));

  const pswp = new PhotoSwipe({
    dataSource,
    index,
    bgOpacity: 0.95,
    showHideAnimationType: 'fade',
    closeTitle: 'Close',
    zoomTitle: 'Zoom',
    arrowPrevTitle: 'Previous',
    arrowNextTitle: 'Next',
  });

  // As each slide's image loads, correct its dataSource dims and refresh the
  // slide so PhotoSwipe recomputes zoom/pan against the true natural size.
  pswp.on('contentLoad', ({ content }) => {
    const img = content.element;
    if (!img || img.tagName !== 'IMG') return;
    const apply = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) return;
      const d = pswp.options.dataSource[content.index];
      if (!d || (d.width === nw && d.height === nh)) return;
      d.width = nw;
      d.height = nh;
      pswp.refreshSlideContent(content.index);
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once: true });
  });

  pswp.on('uiRegister', () => {
    if (showDownload) {
      pswp.ui.registerElement({
        name: 'custom-download-btn',
        title: 'Download',
        ariaLabel: 'Download',
        order: 8,
        isButton: true,
        html: '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/></svg>',
        onInit: (el) => {
          const update = () => { el.hidden = !pswp.currSlide?.data?.download; };
          update();
          pswp.on('change', update);
        },
        onClick: () => {
          const slide = pswp.currSlide?.data;
          if (!slide?.download) return;
          const a = document.createElement('a');
          a.href = slide.download;
          a.download = slide.name || '';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        },
      });
    }

    pswp.ui.registerElement({
      name: 'custom-copy-btn',
      title: 'Copy name',
      ariaLabel: 'Copy name',
      order: 9,
      isButton: true,
      html: '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
      onClick: (_e, btn) => {
        const name = pswp.currSlide?.data?.name;
        if (!name) return;
        navigator.clipboard.writeText(name).catch(() => {});
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1000);
      },
    });

    pswp.ui.registerElement({
      name: 'custom-caption',
      order: 10,
      isButton: false,
      appendTo: 'root',
      html: '',
      onInit: (el) => {
        const update = () => {
          el.textContent = pswp.currSlide?.data?.name ?? '';
        };
        update();
        pswp.on('change', update);
      },
    });
  });

  pswp.init();
}

/**
 * Watches images in the DOM and applies fade-in class when loaded.
 */
export function watchImages({ selector = 'img', onLoad = null, onError = null, fadeInClass = 'loaded' } = {}) {
  const images = document.querySelectorAll(selector);

  images.forEach(img => {
    if (img.complete && img.naturalWidth !== 0) {
      img.classList.add(fadeInClass);
      onLoad?.(img);
    } else {
      img.addEventListener('load', () => {
        img.classList.add(fadeInClass);
        onLoad?.(img);
      });
      img.addEventListener('error', () => {
        img.classList.remove(fadeInClass);
        onError?.(img);
      });
    }
  });
}

/**
 * Creates an interactive item list with search, infinite scroll, and lazy image loading.
 *
 * Initial render shows `batchSize` items; an IntersectionObserver on a sentinel
 * appended after the grid triggers the next batch when the user scrolls near it.
 * Images are additionally lazy-loaded via a second IntersectionObserver — src is
 * only set when a tile enters the viewport (with a 200px look-ahead), so off-screen
 * tiles never issue network requests.
 *
 * JSON fetches use AbortController so a rapid reload/search won't leave stale
 * network requests queued behind the new one.
 *
 * Default renderer is composed from `thumbnail` + `hrefBuilder` + optional
 * `onItemClick`. Pages needing materially different markup (models.html) pass
 * their own `renderItemFn` as an escape hatch.
 *
 * @param {object} options
 * @param {string} options.list - JSON list key (loads list/{list}.json).
 * @param {Function} [options.loadFn] - Optional custom async loader: (signal) => [{name, download, image}].
 *   When provided, skips the default JSON loading.
 * @param {{size: string}} [options.thumbnail] - imageproxy option string, e.g. {size: '152x152,fit'}.
 *   Required unless `renderItemFn` is provided.
 * @param {(item) => string} [options.hrefBuilder] - URL for the tile's anchor. Defaults to item.download.
 * @param {(item, event) => void} [options.onItemClick] - If provided, preventDefault + call this
 *   instead of opening the anchor href in a new tab. Overrides the default lightbox.
 * @param {boolean} [options.lightbox=true] - When true (the default) and no `onItemClick` is
 *   given, clicking a tile opens `item.image` in a PhotoSwipe overlay. Middle-click and
 *   ctrl/cmd-click open the anchor href (item.image) in a new tab.
 * @param {boolean} [options.lightboxDownload=true] - When true, a download button appears in
 *   the lightbox for slides whose item has a non-empty `download` field.
 * @param {Function} [options.renderItemFn] - Escape hatch: full custom renderer (item) => HTMLElement.
 *   When provided, overrides thumbnail/hrefBuilder/onItemClick/lightbox.
 * @param {string} [options.previewSize='medium'] - Initial tile scale. One of
 *   'small' | 'medium' | 'large'. Stored in localStorage per list.
 * @param {string[]} [options.previewSizeOptions] - Size values for the toolbar picker.
 *   Pass `null` to suppress the size picker. Default ['small','medium','large'].
 * @param {string} [options.layout='grid'] - Structural layout. One of 'grid' | 'list'.
 *   Stored in localStorage per list.
 * @param {string[]} [options.layoutOptions] - Layout values for the toolbar picker.
 *   Pass `null` to suppress the layout picker. Default ['grid','list'].
 */
export function createItemList({
  list,
  loadFn,
  containerSelector,
  searchInputSelector,
  thumbnail,
  hrefBuilder = (item) => item.image || item.download || '#',
  onItemClick,
  lightbox = true,
  lightboxDownload = true,
  renderItemFn,
  onRendered,
  debounceDelay = 300,
  previewSize = 'medium',
  previewSizeOptions = ['small', 'medium', 'large'],
  layout = 'grid',
  layoutOptions = ['grid', 'list'],
}) {
  const container = document.querySelector(containerSelector);
  const searchInput = document.querySelector(searchInputSelector);

  const prefsKey = `grid:${list}`;
  const readPref = (key, fallback) => {
    try { return localStorage.getItem(`${prefsKey}:${key}`) ?? fallback; }
    catch { return fallback; }
  };
  const writePref = (key, val) => {
    try { localStorage.setItem(`${prefsKey}:${key}`, String(val)); } catch { /* ignore */ }
  };

  // Resolve initial prefs: stored value wins if valid, else the caller's default.
  const storedSize = readPref('preview', null);
  if (previewSizeOptions?.includes(storedSize)) previewSize = storedSize;
  container.dataset.previewSize = previewSize;

  const storedLayout = readPref('layout', null);
  if (layoutOptions?.includes(storedLayout)) layout = storedLayout;
  container.dataset.layout = layout;

  // Scroll container — `<article>` has overflow:auto on category pages, so both
  // IntersectionObservers must use it as root (viewport root never fires when
  // window itself doesn't scroll). Null means viewport, which is the correct fallback.
  const scrollRoot = getScrollParent(container);
  const scrollTarget = scrollRoot ?? window;

  // Batch size is inferred from the viewport each time a batch is rendered,
  // targeting ~2 viewport-heights worth of tiles so the sentinel stays off-screen.
  function computeBatchSize() {
    const style = getComputedStyle(container);
    const scale = parseFloat(style.getPropertyValue('--tile-scale')) || 1;
    if (container.dataset.layout === 'list') {
      const rowH = (56 * scale) + 8;
      return Math.max(50, Math.ceil(window.innerHeight / rowH) * 2);
    }
    const tileBase = parseFloat(style.getPropertyValue('--tile-base')) || 76;
    const tileSize = tileBase * scale + 15;
    const tilesPerRow = Math.max(1, Math.floor((container.offsetWidth || window.innerWidth) / tileSize));
    return Math.max(50, Math.ceil(window.innerHeight / tileSize) * tilesPerRow * 2);
  }

  // Toolbar: item count on the left, icon-toggle groups on the right.
  let toolbar = null;
  if (previewSizeOptions || layoutOptions) {
    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    // Count span — updated by resetRender()
    const countEl = document.createElement('span');
    countEl.id = 'icons-count';
    countEl.className = 'grid-toolbar-count';
    toolbar.appendChild(countEl);

    const controls = document.createElement('div');
    controls.className = 'grid-toolbar-controls';

    if (previewSizeOptions) {
      const sizeOpts = previewSizeOptions.map(v => ({
        value: v,
        label: String(v).charAt(0).toUpperCase() + String(v).slice(1),
        icon: SIZE_ICONS[v] ?? null,
      }));
      controls.appendChild(buildToggleGroup('View', previewSize, sizeOpts, (v) => {
        previewSize = v;
        container.dataset.previewSize = v;
        writePref('preview', v);
      }));
    }

    if (layoutOptions) {
      const layOpts = layoutOptions.map(v => ({
        value: v,
        label: String(v).charAt(0).toUpperCase() + String(v).slice(1),
        icon: LAYOUT_ICONS[v] ?? null,
      }));
      controls.appendChild(buildToggleGroup('Layout', layout, layOpts, (v) => {
        layout = v;
        container.dataset.layout = v;
        writePref('layout', v);
      }));
    }

    toolbar.appendChild(controls);
    container.before(toolbar);
  }

  // Sentinel below the grid drives infinite-scroll batch appends
  const sentinel = document.createElement('div');
  sentinel.className = 'grid-sentinel';
  container.after(sentinel);

  // Back-to-top floating button — visible after user scrolls past 800px.
  // Reuse an existing button if a previous createItemList call already added one
  // (category pages only have one grid, but this keeps multi-grid futures safe).
  let backToTop = document.body.querySelector('.grid-back-to-top');
  if (!backToTop) {
    backToTop = document.createElement('button');
    backToTop.className = 'grid-back-to-top';
    backToTop.setAttribute('aria-label', 'Back to top');
    backToTop.textContent = '↑';
    document.body.appendChild(backToTop);
  }
  backToTop.onclick = () => {
    scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const onScroll = () => {
    const y = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
    backToTop.classList.toggle('visible', y > 800);
  };
  scrollTarget.addEventListener('scroll', onScroll, { passive: true });

  // Default renderer composed from thumbnail/hrefBuilder/onItemClick/lightbox.
  // Click wiring: explicit onItemClick wins, else default lightbox if enabled,
  // else plain new-tab anchor. Modifier/middle clicks pass through to the anchor
  // (which points to item.image) so the user can open the full image in a new tab.
  const clickHandler = onItemClick ?? (lightbox ? (item, e) => {
    const img = e.currentTarget.querySelector('img');
    const idx = filteredItems.indexOf(item);
    openLightbox(filteredItems, idx >= 0 ? idx : 0, img, { showDownload: lightboxDownload });
  } : null);
  const render = renderItemFn ?? ((item) => {
    const href = hrefBuilder(item);
    const imgSrc = thumbUrl(item.image, thumbnail.size);
    const div = document.createElement('div');
    div.className = 'icon-item';
    div.innerHTML = `
      <a href="${href}"${clickHandler ? '' : ' target="_blank"'} title="${item.name}">
        <img src="${imgSrc}" alt="${item.name}" title="${item.name}" loading="lazy">
      </a>
      <span class="tooltip" title="${item.name}">${item.name}</span>`;
    if (clickHandler) {
      div.querySelector('a').addEventListener('click', (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        clickHandler(item, e);
      });
    }
    return div;
  });

  let allItems = [];
  let filteredItems = [];
  let rendered = 0;             // count of items currently in DOM

  let debounceTimer = null;
  let loadController = null;    // AbortController for JSON fetch cancellation
  let imageObserver = null;     // IntersectionObserver for lazy image reveal
  let sentinelObserver = null;  // IntersectionObserver for infinite scroll

  async function load() {
    if (loadController) loadController.abort();
    loadController = new AbortController();
    const { signal } = loadController;

    const preloader = document.getElementById('preloader');
    if (preloader) preloader.style.display = 'flex';

    try {
      if (loadFn) {
        allItems = await loadFn(signal);
      } else {
        const data = await loadAssetList(list, signal);
        const base = data.assetBase ?? DEFAULT_ASSET_BASE;
        const join = (p) => !p ? '' : /^https?:\/\//.test(p) ? p : base + p;
        allItems = data.items.map((it) => ({
          name: it.name,
          download: join(it.download),
          image: join(it.image),
          ...(it.description ? { description: it.description } : {}),
        }));
      }

      filteredItems = allItems;
      resetRender();
      attachSearch();
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Error loading items:', e);
    } finally {
      if (preloader) preloader.style.display = 'none';
    }
  }

  function resetRender() {
    if (imageObserver) { imageObserver.disconnect(); imageObserver = null; }
    if (sentinelObserver) { sentinelObserver.disconnect(); sentinelObserver = null; }

    // Cancel any in-flight image requests from the outgoing view
    container.querySelectorAll('img').forEach(img => { img.src = ''; });
    container.innerHTML = '';
    rendered = 0;

    imageObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.dataset.src) {
          img.onload = () => { img.classList.add('loaded'); img.onload = null; };
          img.onerror = () => { img.onerror = null; };
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        obs.unobserve(img);
      });
    }, { root: scrollRoot, rootMargin: '200px 0px' });

    renderNextBatch();

    // Sentinel observer — wider rootMargin than the image one so we never stall
    sentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && rendered < filteredItems.length) {
        renderNextBatch();
      }
    }, { root: scrollRoot, rootMargin: '400px 0px' });
    sentinelObserver.observe(sentinel);

    const countEl = document.getElementById('icons-count');
    if (countEl) countEl.innerHTML = `<b>${filteredItems.length.toLocaleString()}</b> / <b>${allItems.length.toLocaleString()}</b> items`;

    if (onRendered) onRendered(filteredItems, allItems);
  }

  function renderNextBatch() {
    const start = rendered;
    const end = Math.min(rendered + computeBatchSize(), filteredItems.length);
    if (start >= end) return;

    const batch = filteredItems.slice(start, end);
    const fragment = document.createDocumentFragment();
    for (const item of batch) fragment.appendChild(render(item));

    fragment.querySelectorAll('img[src]').forEach(img => {
      img.dataset.src = img.getAttribute('src');
      img.removeAttribute('src');
    });

    container.appendChild(fragment);

    // Observe the newly-appended images only
    const allImgs = container.querySelectorAll('img');
    for (let i = start; i < end; i++) imageObserver.observe(allImgs[i]);

    rendered = end;

    if (rendered >= filteredItems.length && sentinelObserver) {
      sentinelObserver.unobserve(sentinel);
    }
  }

  function attachSearch() {
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim().toLowerCase();
        filteredItems = allItems.filter(item => item.name.toLowerCase().includes(query));
        resetRender();
      }, debounceDelay);
    });
  }

  // Clipboard copy handler for [data-copy]
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-copy]');
    if (el) {
      navigator.clipboard.writeText(el.getAttribute('data-copy'))
        .then(() => {
          el.classList.add('copied');
          setTimeout(() => el.classList.remove('copied'), 1000);
        })
        .catch(err => console.error('Clipboard error:', err));
    }
  });

  return { load };
}
