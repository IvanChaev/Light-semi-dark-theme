(function() {
  const STORAGE_KEY = 'smartDarkExcluded';

  function normalizeHost(host) {
    return (host || '').replace(/^www\./, '').toLowerCase();
  }

  // Сайт считается исключенным, если совпадает с записью в списке
  // или является ее поддоменом (example.com исключает и m.example.com)
  function isExcluded(list) {
    const host = normalizeHost(location.hostname);
    return list.some((entry) => {
      const e = normalizeHost(entry.trim());
      if (!e) return false;
      return host === e || host.endsWith('.' + e);
    });
  }

  function checkAndApply() {
    // Если класс уже добавлен, выходим
    if (document.documentElement.classList.contains('apply-smart-dark')) return;

    // Берем фоновые стили главного контейнера страницы
    const htmlStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;

    let bg = htmlStyle.backgroundColor;
    // Если у html фон прозрачный, смотрим на body
    if ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && bodyStyle) {
      bg = bodyStyle.backgroundColor;
    }

    // Если фон не задан вообще, по умолчанию браузер рендерит белый лист — обрабатываем как светлый
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      document.documentElement.classList.add('apply-smart-dark');
      return;
    }

    // Извлекаем цифры RGB
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);

      // Считаем яркость фонового цвета сайта
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      // Порог яркости: 160 из 255.
      // Всё, что светлее (ближе к белому), мы инвертируем в аккуратную темную тему.
      // Всё, что темнее (изначальные темные темы), скрипт игнорирует.
      if (luminance > 160) {
        document.documentElement.classList.add('apply-smart-dark');
      }
    }
  }

  // Небольшой debounce, чтобы MutationObserver не дергал проверку слишком часто
  let pending = null;
  function scheduleCheck() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      checkAndApply();
    });
  }

  function init(excludedList) {
    if (isExcluded(excludedList)) return; // на исключенных сайтах вообще ничего не делаем

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAndApply);
    } else {
      checkAndApply();
    }

    // На случай, если скрипты сайта изменили цвет фона позже
    // (например, ленивая загрузка стилей или SPA-навигация)
    window.addEventListener('load', checkAndApply);

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    } else {
      // body может еще не существовать при run_at: document_start
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        }
      }, { once: true });
    }
  }

  try {
    chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (result) => {
      init(result[STORAGE_KEY] || []);
    });
  } catch (e) {
    // storage недоступен (маловероятно) — работаем как раньше, без исключений
    init([]);
  }
})();
