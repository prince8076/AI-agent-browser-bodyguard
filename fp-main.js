// fp-main.js — fingerprinting probe. Runs in the page's MAIN world
// (manifest "world": "MAIN") so it can observe the APIs the page itself uses.
//
// DETECTION ONLY: wrappers count calls and always call through to the
// original implementation. Nothing is blocked or altered.

(function () {
  if (window.__bbgFpInstalled) return;
  window.__bbgFpInstalled = true;

  const counts = Object.create(null);
  let flushTimer = null;

  function hit(api) {
    counts[api] = (counts[api] || 0) + 1;
    if (!flushTimer) flushTimer = setTimeout(flush, 2500);
  }

  function flush() {
    flushTimer = null;
    const hits = {};
    let n = 0;
    for (const k of Object.keys(counts)) {
      hits[k] = counts[k];
      delete counts[k];
      n++;
    }
    if (n) {
      try {
        window.postMessage({ source: 'bbg-fp-main', hits }, '*');
      } catch (e) {
        /* ignore */
      }
    }
  }
  window.addEventListener('pagehide', flush);

  function wrap(obj, method, api) {
    try {
      if (!obj) return;
      const orig = obj[method];
      if (typeof orig !== 'function' || orig.__bbgWrapped) return;
      const fn = function (...args) {
        hit(api);
        return orig.apply(this, args);
      };
      fn.__bbgWrapped = true;
      Object.defineProperty(obj, method, {
        value: fn,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      /* some prototypes are locked down; skip silently */
    }
  }

  try {
    // Canvas fingerprinting
    wrap(HTMLCanvasElement.prototype, 'toDataURL', 'canvas');
    wrap(HTMLCanvasElement.prototype, 'toBlob', 'canvas');
    if (window.CanvasRenderingContext2D) {
      wrap(CanvasRenderingContext2D.prototype, 'getImageData', 'canvas');
    }
    // WebGL fingerprinting
    if (window.WebGLRenderingContext) {
      wrap(WebGLRenderingContext.prototype, 'readPixels', 'webgl');
    }
    if (window.WebGL2RenderingContext) {
      wrap(WebGL2RenderingContext.prototype, 'readPixels', 'webgl');
    }
    // Audio fingerprinting
    if (window.AnalyserNode) {
      wrap(AnalyserNode.prototype, 'getByteFrequencyData', 'audio');
      wrap(AnalyserNode.prototype, 'getFloatFrequencyData', 'audio');
    }
  } catch (e) {
    /* ignore */
  }
})();
