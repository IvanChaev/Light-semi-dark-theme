const STORAGE_KEY = 'smartDarkExcluded';
const THRESHOLD_KEY = 'smartDarkThreshold';
const INTENSITY_KEY = 'smartDarkIntensity';
const SITE_OVERRIDE_PREFIX = 'siteOverride:';
const DEFAULT_THRESHOLD = 160;
const DEFAULT_INTENSITY = 50;

// ВНИМАНИЕ: эта функция должна быть идентична в content.js, popup.js и options.js
function normalizeHost(host) {
  return (host || '').replace(/^www\./, '').toLowerCase();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getActiveHost() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) return null;
  try {
    return normalizeHost(new URL(tab.url).hostname);
  } catch (e) {
    return null;
  }
}

(async () => {
  // ----- Верхняя часть: исключение сайта -----
  const host = await getActiveHost();
  const hostEl = document.getElementById('host');
  const btn = document.getElementById('toggle');

  if (!host) {
    hostEl.textContent = 'недоступно на этой странице';
    btn.remove();
    document.getElementById('overrideToggle').disabled = true;
  } else {
    hostEl.textContent = host;

    let settings = await chrome.storage.sync.get({
      [STORAGE_KEY]: [],
      [THRESHOLD_KEY]: DEFAULT_THRESHOLD,
      [INTENSITY_KEY]: DEFAULT_INTENSITY,
      [SITE_OVERRIDE_PREFIX + host]: { enabled: false, threshold: DEFAULT_THRESHOLD, intensity: DEFAULT_INTENSITY }
    });

    let excluded = settings[STORAGE_KEY];
    let globalThreshold = settings[THRESHOLD_KEY];
    let globalIntensity = settings[INTENSITY_KEY];
    let siteOverride = settings[SITE_OVERRIDE_PREFIX + host];

    // --- Кнопка включения/отключения для сайта ---
    const renderToggle = () => {
      const isExcl = excluded.map(normalizeHost).includes(host);
      btn.textContent = isExcl ? 'Включить затемнение здесь' : 'Отключить на этом сайте';
      btn.disabled = false;
    };
    renderToggle();

    btn.addEventListener('click', async () => {
      const isExcl = excluded.map(normalizeHost).includes(host);
      excluded = isExcl
        ? excluded.filter((h) => normalizeHost(h) !== host)
        : [...excluded, host];

      await chrome.storage.sync.set({ [STORAGE_KEY]: excluded });
      renderToggle();

      const tab = await getActiveTab();
      if (tab && tab.id) chrome.tabs.reload(tab.id);
    });

    // --- Переключатель и слайдеры ---
    const overrideToggle = document.getElementById('overrideToggle');
    const intensityInput = document.getElementById('intensity');
    const intensityValue = document.getElementById('intensityValue');
    const thresholdInput = document.getElementById('threshold');
    const thresholdValue = document.getElementById('thresholdValue');

    // Функция обновления UI в зависимости от состояния override
    function updateUIFromState() {
      if (siteOverride.enabled) {
        overrideToggle.checked = true;
        intensityInput.value = siteOverride.intensity;
        thresholdInput.value = siteOverride.threshold;
      } else {
        overrideToggle.checked = false;
        intensityInput.value = globalIntensity;
        thresholdInput.value = globalThreshold;
      }
      intensityValue.textContent = intensityInput.value;
      thresholdValue.textContent = thresholdInput.value;
    }

    updateUIFromState();

    // Переключение режима
    overrideToggle.addEventListener('change', async () => {
      const enabled = overrideToggle.checked;
      const threshold = Number(thresholdInput.value);
      const intensity = Number(intensityInput.value);

      const newOverride = { enabled, threshold, intensity };
      await chrome.storage.sync.set({ [SITE_OVERRIDE_PREFIX + host]: newOverride });
      siteOverride = newOverride;

      if (!enabled) {
        intensityInput.value = globalIntensity;
        thresholdInput.value = globalThreshold;
        intensityValue.textContent = globalIntensity;
        thresholdValue.textContent = globalThreshold;
      }

      // Принудительно уведомляем активную вкладку
      const tab = await getActiveTab();
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'applyOverride' }).catch(() => {});
      }
    });

    // Живое обновление подписей слайдеров
    intensityInput.addEventListener('input', () => {
      intensityValue.textContent = intensityInput.value;
    });
    thresholdInput.addEventListener('input', () => {
      thresholdValue.textContent = thresholdInput.value;
    });

    // Сохранение при отпускании ползунка
    async function saveSliderValues() {
      const intensity = Number(intensityInput.value);
      const threshold = Number(thresholdInput.value);

      if (overrideToggle.checked) {
        const newOverride = { enabled: true, threshold, intensity };
        await chrome.storage.sync.set({ [SITE_OVERRIDE_PREFIX + host]: newOverride });
        siteOverride = newOverride;
      } else {
        await chrome.storage.sync.set({ [THRESHOLD_KEY]: threshold, [INTENSITY_KEY]: intensity });
        globalThreshold = threshold;
        globalIntensity = intensity;
      }

      // Принудительно уведомляем активную вкладку
      const tab = await getActiveTab();
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'applyOverride' }).catch(() => {});
      }
    }

    intensityInput.addEventListener('change', saveSliderValues);
    thresholdInput.addEventListener('change', saveSliderValues);
  }

  // ----- Ссылка на список исключений -----
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html'), active: true });
    window.close();
  });
})();