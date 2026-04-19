/**
 * Renders the shared HTML shell for every category page (header, search,
 * grid container, footer). Keeps the 13 category HTML files down to a
 * minimal stub that only supplies per-page data.
 *
 * SEO/OpenGraph meta tags are rendered server-side via Caddy templates
 * (see site/_partials/seo.html) so crawlers and link-preview unfurlers
 * see them without executing JS. This function only handles the visible
 * DOM shell.
 *
 * Called synchronously at module-evaluation time from the page's inline
 * <script type="module">. Because ES modules execute after the DOM is
 * parsed, document.body is always available here.
 *
 * Idempotent: if the shell is already present (e.g. a double-init or a
 * server that pre-rendered the page) the function is a no-op.
 */

const GITHUB_FOOTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;

/**
 * Render the page shell. See module docstring for behaviour.
 *
 * @param {object} cfg
 * @param {string} cfg.title               Short page name, e.g. "Buttons".
 * @param {string} [cfg.subtitle]          Visible subtitle; defaults to title.
 * @param {string} [cfg.searchPlaceholder='Search...']
 * @param {string} [cfg.searchAriaLabel]   Defaults to searchPlaceholder.
 * @param {string} cfg.gridClass           Extra grid classes, e.g. "art-grid" or "icons-small-grid".
 *                                         The "icons-grid" base class is always applied.
 * @param {string} [cfg.intro]             HTML snippet for the <p> above the grid.
 *                                         "<span id=icons-count>" is appended automatically
 *                                         unless already present in the snippet.
 * @param {string} [cfg.preloaderLabel]    aria-label on the preloader; defaults to
 *                                         `Loading ${title.toLowerCase()}`.
 * @param {boolean} [cfg.wrapMain=false]   If true, wrap <article> in <div class="main"> —
 *                                         used by models.html so the glb-viewer panel can
 *                                         sit alongside the article inside the main flexbox.
 * @param {(ctx:{body:HTMLElement, main:HTMLElement|null, article:HTMLElement})=>void} [cfg.extraBody]
 *                                         Optional hook; called after the shell is inserted.
 *                                         Receives { body, main, article } — `main` is the
 *                                         wrapper div if `wrapMain` was true, else null.
 *                                         Use for pages that need extra DOM (e.g. models.html's
 *                                         <glb-viewer>).
 */
export function initPage(cfg) {
  // Idempotent: if a .small-header is already in the DOM, assume the shell
  // is already rendered and bail out.
  if (document.querySelector('header.small-header')) return;

  const {
    title,
    subtitle = title,
    searchPlaceholder = 'Search...',
    searchAriaLabel,
    gridClass = '',
    intro = '',
    preloaderLabel,
    wrapMain = false,
    extraBody,
  } = cfg;

  const header = document.createElement('header');
  header.className = 'small-header';
  const ariaLbl = searchAriaLabel ?? searchPlaceholder;
  header.innerHTML = `
    <div class="logo-container">
        <a href="./" style="display: flex; align-items: center; text-decoration: none;">
            <img src="img/arc.png" alt="SC2Mapster Asset Explorer Logo" />
            <div><h1>SC2Mapster Asset Explorer</h1>
            <p class="subtitle">${subtitle}</p></div>
        </a>
    </div>
    <input type="search" id="icon-search" placeholder="${searchPlaceholder}" aria-label="${ariaLbl}" />
  `;

  const article = document.createElement('article');
  const introHtml = intro || '';
  // Count is now rendered inside the grid toolbar by createItemList.
  const introPara = introHtml ? `<p>${introHtml}</p>` : '';

  const gridClasses = ['icons-grid', ...gridClass.split(/\s+/).filter(c => c && c !== 'icons-grid')].join(' ');
  const preloadLbl = preloaderLabel || `Loading ${title.toLowerCase()}`;
  article.innerHTML = `
    ${introPara}
    <div class="${gridClasses}" id="icons-grid">
        <div id="preloader" class="grid-preloader" aria-label="${preloadLbl}" role="status" aria-live="polite">
            <div class="spinner"></div>
        </div>
    </div>
  `;

  const footer = document.createElement('footer');
  footer.innerHTML = `
    <a href="https://github.com/sc2-arcade-watcher/asset-explorer" aria-label="GitHub repository" target="_blank" rel="noopener noreferrer">
      ${GITHUB_FOOTER_SVG}
    </a>
  `;

  // Insert at the top of <body> so any extra nodes authored after the
  // inline script tag remain where the author put them.
  const body = document.body;
  const firstExisting = body.firstChild;

  body.insertBefore(header, firstExisting);

  let main = null;
  if (wrapMain) {
    main = document.createElement('div');
    main.className = 'main';
    main.appendChild(article);
    body.insertBefore(main, firstExisting);
  } else {
    body.insertBefore(article, firstExisting);
  }

  body.insertBefore(footer, firstExisting);

  if (typeof extraBody === 'function') {
    extraBody({ body, main, article });
  }
}
