// Import JSZip for ZIP operations
import JSZip from '../lib/jszip.js';

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
 * Downloads a StarCraft 2 model along with its textures into a ZIP file.
 * - Extracts .dds texture names from the model binary.
 * - Matches them with provided texture repositories.
 * - Downloads textures and packs them with the model.
 */
export async function downloadModelWithTextures(modelUrl, texturesMap) {
  const zip = new JSZip();

  // 1. Fetch model as binary
  const modelResp = await fetch(modelUrl);
  if (!modelResp.ok) throw new Error("Failed to fetch model");
  const modelBuffer = await modelResp.arrayBuffer();

  // 2. Extract .dds texture names from model binary
  const modelText = bufferToAscii(modelBuffer);
  const ddsRegex = /([\w\-/\\]+\.(?:dds))/gi;
  const foundTextures = [...modelText.matchAll(ddsRegex)]
    .map(m => m[1].replace(/\\/g, '/').split('/').pop().toLowerCase());

  const uniqueTextures = [...new Set(foundTextures)];

  // 3. Add model to zip
  const modelName = modelUrl.split('/').pop();
  zip.file(modelName, modelBuffer);

  // 4. Download matching textures
  for (const texName of uniqueTextures) {
    const repo = texturesMap[texName];
    if (!repo) {
      console.warn(`Missing repo for texture: ${texName}`);
      continue;
    }

    const texUrl = `${repo}/${texName}`;
    try {
      const texBlob = await fetchAsBlob(texUrl);
      zip.file(texName, texBlob);
    } catch (err) {
      console.warn(`Failed to fetch texture ${texUrl}`, err);
    }
  }

  // 5. Generate ZIP and trigger download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, modelName.replace(/\.m3$/, '') + '_with_textures.zip');
}

/**
 * Converts an ArrayBuffer to an ASCII string (non-printable bytes replaced with spaces).
 */
function bufferToAscii(buffer) {
  const view = new Uint8Array(buffer);
  return Array.from(view, char => (char >= 32 && char <= 126) ? String.fromCharCode(char) : ' ').join('');
}

/**
 * Fetches a binary file as Blob.
 */
async function fetchAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.blob();
}

/**
 * Triggers a browser download of a Blob.
 */
function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  document.body.removeChild(a);
}

/**
 * Parses INI text into an object: { sectionName: [lines...] }
 */
export function parseIniString(iniText) {
  const result = {};
  let currentSection = null;

  const lines = iniText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = [];
    } else if (currentSection) {
      result[currentSection].push(trimmed);
    }
  }

  return result;
}

/**
 * Flattens repo structure {repo: [files]} into array of {file, repo}
 */
export function flattenRepoFiles(repoMap) {
  return Object.entries(repoMap).flatMap(([repo, files]) =>
    files.map(file => ({ file, repo }))
  );
}

/**
 * Loads an INI file from ./list/{list}.ini and parses it.
 * @param {string} list
 * @param {AbortSignal} [signal]
 */
export async function loadIniFile(list, signal) {
  const response = await fetch(`./list/${list}.ini`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Failed to load ${list}`);
  const text = await response.text();
  return parseIniString(text);
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

/**
 * Builds a labelled `<select>` for the grid toolbar. Each option is either a
 * scalar (auto-stringified) or `{value, label}` for human-friendly labels.
 */
let selectIdCounter = 0;
function buildSelect(labelText, value, options, className, onChange) {
  const id = `${className}-${++selectIdCounter}`;
  const label = document.createElement('label');
  label.className = className + '-label';
  label.setAttribute('for', id);
  const span = document.createElement('span');
  span.textContent = labelText;
  const select = document.createElement('select');
  select.id = id;
  select.className = className;
  select.setAttribute('aria-label', labelText);
  for (const opt of options) {
    const { value: v, label: l } = (opt && typeof opt === 'object')
      ? opt
      : { value: opt, label: String(opt).charAt(0).toUpperCase() + String(opt).slice(1) };
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = l;
    if (String(v) === String(value)) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', (e) => onChange(e.target.value));
  label.appendChild(span);
  label.appendChild(select);
  return label;
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

async function openLightbox(items, index, triggerImg) {
  const PhotoSwipe = await loadPhotoSwipe();

  const clickedDims = await measureImage(items[index].icon);
  const fallbackW = clickedDims?.width  || triggerImg?.naturalWidth  || 1024;
  const fallbackH = clickedDims?.height || triggerImg?.naturalHeight || 1024;

  const dataSource = items.map((it, i) => ({
    src: it.icon,
    width:  i === index && clickedDims ? clickedDims.width  : fallbackW,
    height: i === index && clickedDims ? clickedDims.height : fallbackH,
    alt: it.name,
    name: it.name,
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
 * INI file fetches use AbortController so a rapid reload/search won't leave
 * stale network requests queued behind the new one.
 *
 * Default renderer is composed from `thumbnail` + `hrefBuilder` + optional
 * `onItemClick`. Pages needing materially different markup (models.html) pass
 * their own `renderItemFn` as an escape hatch.
 *
 * @param {object} options
 * @param {string} options.list - INI list key (loads list/{list}.ini and list/{list}-png.ini)
 * @param {Function} [options.loadFn] - Optional custom async loader: (signal) => [{file, icon, name}].
 *   When provided, skips the default dual-INI loading and merging.
 * @param {string} [options.assetBase=''] - URL prefix applied to `{repo}/{file}` when using the
 *   default loader. Not used when `loadFn` is provided.
 * @param {{size: string}} [options.thumbnail] - imageproxy option string, e.g. {size: '152x152,fit'}.
 *   Required unless `renderItemFn` is provided.
 * @param {(item) => string} [options.hrefBuilder] - URL for the tile's anchor. Defaults to item.file.
 * @param {(item, event) => void} [options.onItemClick] - If provided, preventDefault + call this
 *   instead of opening the anchor href in a new tab. Overrides the default lightbox.
 * @param {boolean} [options.lightbox=true] - When true (the default) and no `onItemClick` is
 *   given, clicking a tile opens `item.icon` in a PhotoSwipe overlay. Middle-click and
 *   ctrl/cmd-click are left to the browser so the anchor's download still works.
 * @param {Function} [options.renderItemFn] - Escape hatch: full custom renderer (item) => HTMLElement.
 *   When provided, overrides thumbnail/hrefBuilder/onItemClick/lightbox.
 * @param {number} [options.batchSize=200] - Items appended per infinite-scroll batch.
 * @param {Array<number|{value,label}>} [options.batchSizeOptions] - Items-per-batch values for the
 *   toolbar picker. Pass `null` to suppress the batch picker. Default [100, 200, 300, 500].
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
  assetBase = '',
  thumbnail,
  hrefBuilder = (item) => item.file,
  onItemClick,
  lightbox = true,
  renderItemFn,
  onRendered,
  debounceDelay = 300,
  batchSize = 200,
  batchSizeOptions = [100, 200, 300, 500],
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

  const batchValues = (batchSizeOptions ?? []).map(o => (o && typeof o === 'object') ? o.value : o);
  const storedBatch = readPref('batch', null);
  if (storedBatch !== null) {
    const parsed = Number(storedBatch);
    if (Number.isFinite(parsed) && batchValues.includes(parsed)) batchSize = parsed;
  }

  // Scroll container — `<article>` has overflow:auto on category pages, so both
  // IntersectionObservers must use it as root (viewport root never fires when
  // window itself doesn't scroll). Null means viewport, which is the correct fallback.
  const scrollRoot = getScrollParent(container);
  const scrollTarget = scrollRoot ?? window;

  // Toolbar with view-size, layout, and batch-size selects injected above the grid.
  let toolbar = null;
  if (previewSizeOptions || layoutOptions || batchSizeOptions) {
    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';
    if (previewSizeOptions) toolbar.appendChild(buildSelect('View', previewSize, previewSizeOptions, 'grid-size-select', (v) => {
      previewSize = v;
      container.dataset.previewSize = v;
      writePref('preview', v);
    }));
    if (layoutOptions) toolbar.appendChild(buildSelect('Layout', layout, layoutOptions, 'grid-layout-select', (v) => {
      layout = v;
      container.dataset.layout = v;
      writePref('layout', v);
    }));
    if (batchSizeOptions) toolbar.appendChild(buildSelect('Per batch', batchSize, batchSizeOptions, 'grid-batch-select', (v) => {
      batchSize = Number(v);
      writePref('batch', batchSize);
      // If scrolled past the sentinel already, render more now; otherwise next
      // scroll trigger will use the new size.
      if (rendered < filteredItems.length) renderNextBatch();
    }));
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
  // else plain new-tab anchor. Modifier/middle clicks are always passed through
  // so the anchor's download still works via ctrl/cmd/middle-click.
  const clickHandler = onItemClick ?? (lightbox ? (item, e) => {
    const img = e.currentTarget.querySelector('img');
    const idx = filteredItems.indexOf(item);
    openLightbox(filteredItems, idx >= 0 ? idx : 0, img);
  } : null);
  const render = renderItemFn ?? ((item) => {
    const href = hrefBuilder(item);
    const imgSrc = thumbUrl(item.icon, thumbnail.size);
    const div = document.createElement('div');
    div.className = 'icon-item';
    div.innerHTML = `
      <a href="${href}"${clickHandler ? '' : ' target="_blank"'}>
        <img src="${imgSrc}" alt="${item.name}" loading="lazy">
      </a>
      <span class="tooltip">${item.name}</span>
      <span class="btn copy-btn" data-copy="${item.name}">⎘</span>`;
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
  let loadController = null;    // AbortController for INI fetch cancellation
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
        const [ddsFiles, pngFiles] = await Promise.all([
          loadIniFile(list, signal),
          loadIniFile(`${list}-png`, signal)
        ]);

        const ddsList = flattenRepoFiles(ddsFiles);
        const pngList = flattenRepoFiles(pngFiles);

        const ddsIndex = Object.fromEntries(ddsList.map(({ file, repo }) => [file.toLowerCase(), { file, repo }]));
        const pngIndex = Object.fromEntries(pngList.map(({ file, repo }) => [file.toLowerCase(), { file, repo }]));

        allItems = Object.keys(ddsIndex).map(key => {
          const dds = ddsIndex[key];
          const png = pngIndex[key];
          if (!png) return null;
          return {
            file: `${assetBase}${dds.repo}/${dds.file}.dds`,
            icon: `${assetBase}${png.repo}/${png.file}.png`,
            name: png.file
          };
        }).filter(Boolean);
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
    if (countEl) countEl.textContent = `${filteredItems.length} / ${allItems.length} icons`;

    if (onRendered) onRendered(filteredItems, allItems);
  }

  function renderNextBatch() {
    const start = rendered;
    const end = Math.min(rendered + batchSize, filteredItems.length);
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

/**
 * Variant of createItemList for locally-hosted single-file assets (e.g. JPGs in assets/).
 * Loads a single INI file where the section header is the folder path and entries are
 * filenames without extension. Produces items with file === icon === "{folder}/{name}.jpg".
 */
export function createLocalItemList({ list, ext = 'jpg', baseUrl = '', ...rest }) {
  return createItemList({
    ...rest,
    list,
    loadFn: async (signal) => {
      const iniData = await loadIniFile(list, signal);
      return Object.entries(iniData).flatMap(([folder, files]) =>
        files.map(name => {
          const path = `${folder}/${encodeURIComponent(name)}.${ext}`;
          const url = baseUrl ? `${baseUrl}/${path}` : path;
          return { file: url, icon: url, name };
        })
      );
    },
  });
}
