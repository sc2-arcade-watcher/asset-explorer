function measureImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function initLightbox() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../lib/photoswipe/photoswipe.css', import.meta.url).href;
  document.head.appendChild(link);

  const pswpReady = import('../lib/photoswipe/photoswipe.esm.js').then(m => m.default);

  return { open };

  async function open(items, index, triggerImg, { showDownload = true } = {}) {
    const PhotoSwipe = await pswpReady;

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
      description: it.description || '',
      ...(i === index && triggerImg?.currentSrc
        ? { msrc: triggerImg.currentSrc }
        : {}),
    }));

    const pswp = new PhotoSwipe({
      dataSource,
      index,
      bgOpacity: 0.95,
      showHideAnimationType: 'zoom',
      closeTitle: 'Close',
      zoomTitle: 'Zoom',
      arrowPrevTitle: 'Previous',
      arrowNextTitle: 'Next',
      initialZoomLevel: 'fit',
    });

    // https://photoswipe.com/methods/#refreshslidecontentslideindex
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
        html: '<div class="pswp__caption-name"></div><div class="pswp__caption-desc"></div>',
        onInit: (el) => {
          const nameEl = el.querySelector('.pswp__caption-name');
          const descEl = el.querySelector('.pswp__caption-desc');
          const update = () => {
            const slide = pswp.currSlide?.data;
            nameEl.textContent = slide?.name ?? '';
            descEl.textContent = slide?.description ?? '';
            el.classList.toggle('has-desc', !!(slide?.description));
          };
          update();
          pswp.on('change', update);
        },
      });
    });

    pswp.init();
  }
}
