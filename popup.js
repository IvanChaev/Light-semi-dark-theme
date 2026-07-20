const STORAGE_KEY = 'smartDarkExcluded';

function normalizeHost(host) {
  return (host || '').replace(/^www\./, '').toLowerCase();
}

async function getActiveHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  try {
    return normalizeHost(new URL(tab.url).hostname);
  } catch (e) {
    return null;
  }
}

async function getExcluded() {
  const res = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  return res[STORAGE_KEY];
}

async function setExcluded(list) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: list });
}

(async () => {
  const host = await getActiveHost();
  const hostEl = document.getElementById('host');
  const btn = document.getElementById('toggle');

  if (!host) {
    hostEl.textContent = 'недоступно на этой странице';
    btn.remove();
    return;
  }

  hostEl.textContent = host;
  let excluded = await getExcluded();

  const render = () => {
    const isExcl = excluded.map(normalizeHost).includes(host);
    btn.textContent = isExcl ? 'Включить затемнение здесь' : 'Отключить на этом сайте';
    btn.disabled = false;
  };
  render();

  btn.addEventListener('click', async () => {
    const isExcl = excluded.map(normalizeHost).includes(host);
    if (isExcl) {
      excluded = excluded.filter((h) => normalizeHost(h) !== host);
    } else {
      excluded = [...excluded, host];
    }
    await setExcluded(excluded);
    render();
    // Перезагружаем вкладку, чтобы изменения сразу применились
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.reload(tab.id);
  });

  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    // openOptionsPage может открыть вкладку в фоне без фокуса — открываем явно и активно
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html'), active: true });
    window.close();
  });
})();
