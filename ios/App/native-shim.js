// SET для iPhone: мост между веб-приложением и iOS. Подключается до app.js (WKUserScript, atDocumentStart).
// Перед этим кодом Swift вставляет строку  window.__SET_BOOT = {...};  (версия, уведомления, резервная копия).
// В браузере этого файла нет - веб-версия работает как раньше.
(function () {
  'use strict';
  var boot = window.__SET_BOOT || {};
  var KEY = 'set.v1';
  var post = function (m) { try { window.webkit.messageHandlers.set.postMessage(m); } catch (e) { /* нет моста */ } };
  var waiters = {}, seq = 0;
  var wait = function (msg) { return new Promise(function (resolve, reject) { var id = 'w' + (++seq); waiters[id] = { resolve: resolve, reject: reject }; msg.id = id; post(msg); }); };

  // ответы из Swift
  var perm = boot.notif || 'default';
  window.__setNative = {
    done: function (id, ok, value) { var w = waiters[id]; if (!w) return; delete waiters[id]; if (ok) w.resolve(value); else w.reject(new DOMException('cancelled', 'AbortError')); },
    permission: function (p) { perm = p; },
    route: function (r) { var h = '#/' + String(r || 'today').replace(/^#?\/?/, ''); if (location.hash !== h) location.hash = h; },
    push: function () { push(true); }
  };
  window.SET_NATIVE = { platform: 'ios', version: boot.version || '' };

  // если WebKit потерял данные, а в приложении осталась копия - вернуть её до старта app.js
  var origSet = Storage.prototype.setItem;
  try { if (boot.backup && !localStorage.getItem(KEY)) origSet.call(localStorage, KEY, boot.backup); } catch (e) { /* хранилище недоступно */ }

  // каждое сохранение уходит в приложение: резервная копия + данные для виджетов и напоминаний
  var pushT = null;
  function push(now) {
    clearTimeout(pushT);
    pushT = setTimeout(function () {
      var json = null, snap = null;
      try { json = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
      try { snap = window.SET_NATIVE.snapshot ? window.SET_NATIVE.snapshot() : null; } catch (e) { snap = null; }
      if (json) post({ type: 'state', json: json, snap: snap });
    }, now ? 0 : 600);
  }
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (k === KEY && this === window.localStorage) push(false);
  };
  // «Удалить все данные»: копию в приложении, виджеты и напоминания тоже чистим
  var origRemove = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (k === KEY && this === window.localStorage) post({ type: 'clear' });
  };
  window.addEventListener('load', function () { setTimeout(function () { push(true); }, 400); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') push(true); });

  // экран: тёмный «режим площадки» - светлая строка статуса; текущий раздел нужен уведомлениям
  var sendRoute = function () { post({ type: 'route', hash: location.hash || '' }); };
  window.addEventListener('hashchange', sendRoute);
  window.addEventListener('load', sendRoute);

  var define = function (obj, name, value) { try { Object.defineProperty(obj, name, { value: value, configurable: true, writable: true }); } catch (e) { try { obj[name] = value; } catch (x) { /* ignore */ } } };

  // приложение открыто «как с экрана Домой»; service worker в приложении не нужен
  try { Object.defineProperty(Navigator.prototype, 'standalone', { get: function () { return true; }, configurable: true }); } catch (e) { /* ignore */ }
  try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: function () { return undefined; }, configurable: true }); } catch (e) { /* ignore */ }

  // уведомления: разрешение спрашивает iOS; напоминания по таймингу ставит само приложение (Reminders.swift)
  function N(title, opts) { post({ type: 'notify', title: String(title || ''), body: String((opts && opts.body) || '') }); }
  Object.defineProperty(N, 'permission', { get: function () { return perm; } });
  N.requestPermission = function () { return wait({ type: 'notifRequest' }).then(function (p) { perm = p; return p; }, function () { return perm; }); };
  window.Notification = N;

  // «экран не гаснет» в режиме площадки
  define(navigator, 'wakeLock', {
    request: function () {
      post({ type: 'wake', on: true });
      var lock = { released: false, type: 'screen', release: function () { lock.released = true; post({ type: 'wake', on: false }); return Promise.resolve(); }, addEventListener: function () {}, removeEventListener: function () {} };
      return Promise.resolve(lock);
    }
  });

  // вибрация → тактильный отклик iPhone
  define(navigator, 'vibrate', function () { post({ type: 'haptic' }); return true; });

  // печать листа на площадку → системная печать / PDF
  define(window, 'print', function () { post({ type: 'print', title: document.title }); });

  // копирование
  define(navigator, 'clipboard', { writeText: function (t) { post({ type: 'copy', text: String(t) }); return Promise.resolve(); }, readText: function () { return Promise.resolve(''); } });

  // «Поделиться» (текст и картинки) → системное меню iOS
  var b64 = function (blob) { return new Promise(function (resolve, reject) { var fr = new FileReader(); fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { reject(fr.error); }; fr.readAsDataURL(blob); }); };
  var packFiles = function (files) { return Promise.all(Array.prototype.map.call(files || [], function (f) { return b64(f).then(function (data) { return { name: f.name || 'file', mime: f.type || '', data: data }; }); })); };
  define(navigator, 'canShare', function () { return true; });
  define(navigator, 'share', function (d) {
    d = d || {};
    return packFiles(d.files).then(function (files) { return wait({ type: 'share', text: String(d.text || ''), url: String(d.url || ''), title: String(d.title || ''), files: files }); });
  });

  // ссылки-«скачать» (копия данных, выгрузка для налоговой, картинка итогов) → файл в меню «Поделиться»
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
    if (!a || !a.href) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    var name = a.getAttribute('download') || 'file';
    fetch(a.href).then(function (r) { return r.blob(); }).then(function (blob) { return b64(blob).then(function (data) { post({ type: 'save', name: name, mime: blob.type || '', data: data }); }); }).catch(function () { /* ignore */ });
  }, true);
})();
