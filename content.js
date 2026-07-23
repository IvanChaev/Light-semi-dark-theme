(function() {
  const STORAGE_KEY = 'smartDarkExcluded';
  const THRESHOLD_KEY = 'smartDarkThreshold';
  const INTENSITY_KEY = 'smartDarkIntensity';
  const SITE_OVERRIDE_PREFIX = 'siteOverride:';
  const DEFAULT_THRESHOLD = 160;
  const DEFAULT_INTENSITY = 50; // 0..100

  // ----- Вспомогательные функции -----
  // ВНИМАНИЕ: эта функция должна быть идентична в content.js, popup.js и options.js
  function normalizeHost(host) {
    return (host || '').replace(/^www\./, '').toLowerCase();
  }

  function isExcluded(list) {
    const host = normalizeHost(location.hostname);
    return list.some((entry) => {
      const e = normalizeHost(entry.trim());
      if (!e) return false;
      return host === e || host.endsWith('.' + e);
    });
  }

  function siteHasOwnDarkMode() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      const c = meta.content.toLowerCase();
      if (c.includes('dark') && !c.includes('light')) return true;
    }
    const root = document.documentElement;
    if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark') return true;
    const cs = getComputedStyle(root).colorScheme;
    if (cs && cs.includes('dark') && !cs.includes('light')) return true;
    return false;
  }

  function applyIntensityVars(intensity) {
    const i = Math.max(0, Math.min(100, Number(intensity)));
    const contrast = (1 - i * 0.002).toFixed(3);
    const brightness = (1 - i * 0.003).toFixed(3);
    const overlay = (i * 0.0015).toFixed(3);

    const root = document.documentElement.style;
    root.setProperty('--smart-dark-contrast', contrast);
    root.setProperty('--smart-dark-brightness', brightness);
    root.setProperty('--smart-dark-overlay', overlay);
  }

  const KNOWN_SPA_ROOTS = ['#root', '#app', '#__next', '[data-reactroot]'];

  function sampleBackground() {
    const htmlStyle = getComputedStyle(document.documentElement);
    let bg = htmlStyle.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;

    if (document.body) {
      const bodyStyle = getComputedStyle(document.body);
      bg = bodyStyle.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }

    for (const sel of KNOWN_SPA_ROOTS) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = getComputedStyle(el);
        bg = cs.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      }
    }

    const points = [
      [window.innerWidth * 0.5, window.innerHeight * 0.3],
      [window.innerWidth * 0.5, window.innerHeight * 0.7]
    ];
    for (const [x, y] of points) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
    }
    return null;
  }

  // ----- Глобальные и персональные настройки -----
  let globalThreshold = DEFAULT_THRESHOLD;
  let globalIntensity = DEFAULT_INTENSITY;
  let siteOverride = { enabled: false, threshold: DEFAULT_THRESHOLD, intensity: DEFAULT_INTENSITY };

  function getEffective() {
    return siteOverride.enabled ? siteOverride : { threshold: globalThreshold, intensity: globalIntensity };
  }

  function applyEffectiveSettings() {
    const effective = getEffective();
    applyIntensityVars(effective.intensity);
    checkAndApply(effective.threshold);
  }

  function checkAndApply(threshold) {
    if (siteHasOwnDarkMode()) {
      document.documentElement.classList.remove('apply-smart-dark');
      return;
    }

    const bg = sampleBackground();
    if (!bg) return;

    const match = bg.match(/\d+/g);
    if (!match || match.length < 3) return;
    const [r, g, b] = match.map(Number);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    const shouldApply = luminance > threshold;
    document.documentElement.classList.toggle('apply-smart-dark', shouldApply);
  }

  // ----- Управление observer'ом -----
  let observer = null;
  let pending = null;
  let idleTimer = null;
  let hardDeadline = 0;
  let currentExcluded = false;

  function scheduleCheck() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      checkAndApply(getEffective().threshold);

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      }, 15000);
    });
  }

  function setupObserver() {
    if (observer) return;
    hardDeadline = Date.now() + 60000;

    observer = new MutationObserver(() => {
      if (Date.now() > hardDeadline) {
        observer.disconnect();
        observer = null;
        clearTimeout(idleTimer);
        return;
      }
      scheduleCheck();
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        }
      }, { once: true });
    }
  }

  function ensureObserver() {
    if (!observer) setupObserver();
  }

  // ----- SPA-навигация -----
  let historyHooked = false;

  function onNavigate() {
    hardDeadline = Date.now() + 60000;
    ensureObserver();
    applyEffectiveSettings();
    setTimeout(() => applyEffectiveSettings(), 300);
  }

  function hookHistory() {
    if (historyHooked) return;
    historyHooked = true;

    const wrap = (fn) => function (...args) {
      const ret = fn.apply(this, args);
      onNavigate();
      return ret;
    };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', onNavigate);
  }

  // ----- Инициализация -----
  function init(excludedList) {
    currentExcluded = isExcluded(excludedList);
    if (currentExcluded) return;

    if (window.self !== window.top && (window.innerWidth < 50 || window.innerHeight < 50)) {
      return;
    }

    applyEffectiveSettings();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        applyEffectiveSettings();
        setupObserver();
        hookHistory();
      });
    } else {
      applyEffectiveSettings();
      setupObserver();
      hookHistory();
    }

    window.addEventListener('load', () => {
      applyEffectiveSettings();
      ensureObserver();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        applyEffectiveSettings();
        ensureObserver();
      }
    });

    const darkModeMedia = matchMedia('(prefers-color-scheme: dark)');
    darkModeMedia.addEventListener('change', () => applyEffectiveSettings());
  }

  // ----- Запуск -----
  try {
    const host = normalizeHost(location.hostname);
    chrome.storage.sync.get(
      {
        [STORAGE_KEY]: [],
        [THRESHOLD_KEY]: DEFAULT_THRESHOLD,
        [INTENSITY_KEY]: DEFAULT_INTENSITY,
        [SITE_OVERRIDE_PREFIX + host]: { enabled: false, threshold: DEFAULT_THRESHOLD, intensity: DEFAULT_INTENSITY }
      },
      (result) => {
        globalThreshold = result[THRESHOLD_KEY];
        globalIntensity = result[INTENSITY_KEY];
        siteOverride = result[SITE_OVERRIDE_PREFIX + host];
        init(result[STORAGE_KEY] || []);
      }
    );
  } catch (e) {
    init([], DEFAULT_THRESHOLD, DEFAULT_INTENSITY);
  }

  // ----- Живое применение настроек через storage.onChanged -----
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const host = normalizeHost(location.hostname);
      const overrideKey = SITE_OVERRIDE_PREFIX + host;

      // Обновление списка исключений
      if (changes[STORAGE_KEY]) {
        const wasExcluded = currentExcluded;
        currentExcluded = isExcluded(changes[STORAGE_KEY].newValue || []);

        if (currentExcluded) {
          document.documentElement.classList.remove('apply-smart-dark');
        } else if (wasExcluded) {
          applyEffectiveSettings();
          setupObserver();
          hookHistory();
        }
      }

      if (currentExcluded) return;

      // Обновление персональных настроек для этого хоста
      if (changes[overrideKey]) {
        siteOverride = changes[overrideKey].newValue || { enabled: false, threshold: DEFAULT_THRESHOLD, intensity: DEFAULT_INTENSITY };
        applyEffectiveSettings();
      }

      // Обновление глобальных настроек (применяются только если нет включённого оверрайда)
      if (changes[THRESHOLD_KEY] && !siteOverride.enabled) {
        globalThreshold = changes[THRESHOLD_KEY].newValue;
        applyEffectiveSettings();
      }
      if (changes[INTENSITY_KEY] && !siteOverride.enabled) {
        globalIntensity = changes[INTENSITY_KEY].newValue;
        applyEffectiveSettings();
      }
    });
  } catch (e) {
    // storage.onChanged недоступен
  }

  // ----- Прямые сообщения от попапа (гарантированное применение) -----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'applyOverride') {
      const host = normalizeHost(location.hostname);
      chrome.storage.sync.get([SITE_OVERRIDE_PREFIX + host], (result) => {
        if (result[SITE_OVERRIDE_PREFIX + host]) {
          siteOverride = result[SITE_OVERRIDE_PREFIX + host];
          applyEffectiveSettings();
        }
      });
    }
  });

})();