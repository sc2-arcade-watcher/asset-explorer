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
 *   instead of opening the anchor href in a new tab (useful for in-page lightbox wiring).
 * @param {Function} [options.renderItemFn] - Escape hatch: full custom renderer (item) => HTMLElement.
 *   When provided, overrides thumbnail/hrefBuilder/onItemClick.
 * @param {number} [options.batchSize=200] - Items appended per infinite-scroll batch.
 * @param {string} [options.previewSize] - Sets container `data-preview-size` for CSS to consume
 *   (Phase 3 size picker hooks into this).
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
  renderItemFn,
  onRendered,
  debounceDelay = 300,
  batchSize = 200,
  previewSize,
}) {
  const container = document.querySelector(containerSelector);
  const searchInput = document.querySelector(searchInputSelector);

  if (previewSize) container.dataset.previewSize = previewSize;

  // Sentinel below the grid drives infinite-scroll batch appends
  const sentinel = document.createElement('div');
  sentinel.className = 'grid-sentinel';
  container.after(sentinel);

  // Default renderer composed from thumbnail/hrefBuilder/onItemClick
  const render = renderItemFn ?? ((item) => {
    const href = hrefBuilder(item);
    const imgSrc = thumbUrl(item.icon, thumbnail.size);
    const div = document.createElement('div');
    div.className = 'icon-item';
    div.innerHTML = `
      <a href="${href}"${onItemClick ? '' : ' target="_blank"'}>
        <img src="${imgSrc}" alt="${item.name}" loading="lazy">
      </a>
      <span class="tooltip">${item.name}</span>
      <span class="btn copy-btn" data-copy="${item.name}">⎘</span>`;
    if (onItemClick) {
      div.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        onItemClick(item, e);
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
    }, { rootMargin: '200px 0px' });

    renderNextBatch();

    // Sentinel observer — wider rootMargin than the image one so we never stall
    sentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && rendered < filteredItems.length) {
        renderNextBatch();
      }
    }, { rootMargin: '400px 0px' });
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
