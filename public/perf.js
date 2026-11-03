// PURE 0.9.2 perf helpers: lazy media + passive gestures. Behaviour-neutral.
const tune = el => {
  if (el.tagName === 'IMG') { if (!el.hasAttribute('loading')) el.loading = 'lazy'; el.decoding = 'async'; }
  else if (el.tagName === 'VIDEO' && !el.autoplay && !el.hasAttribute('preload')) el.preload = 'metadata';
  else if (el.tagName === 'IFRAME' && !el.hasAttribute('loading')) el.loading = 'lazy';
};
const scan = root => { if (root.nodeType !== 1) return; if (/^(IMG|VIDEO|IFRAME)$/.test(root.tagName)) tune(root); root.querySelectorAll?.('img,video,iframe').forEach(tune); };
scan(document.body);
new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(scan); }).observe(document.body, {childList: true, subtree: true});
