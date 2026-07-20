const STORAGE_KEY = 'smartDarkExcluded';
const textarea = document.getElementById('list');
const status = document.getElementById('status');

chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (res) => {
  textarea.value = res[STORAGE_KEY].join('\n');
});

document.getElementById('save').addEventListener('click', () => {
  const list = textarea.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  chrome.storage.sync.set({ [STORAGE_KEY]: list }, () => {
    status.textContent = 'Сохранено!';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
});
