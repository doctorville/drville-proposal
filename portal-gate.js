// 제안서 생성기 — 업무 포털 로그인 필수 (doctorville.github.io 배포본에서만 적용)
// 포털 세션이 없거나 권한이 없으면 포털 로그인 화면으로 보냅니다. (포털: https://doctorville.github.io/portal/)
(function () {
  'use strict';
  if (location.hostname !== 'doctorville.github.io') return; // claude.ai 미리보기 등은 적용 안 함
  var root = document.documentElement;
  var st = document.createElement('style');
  st.textContent = 'html.pg-lock body>*:not(#pgGate){visibility:hidden}' +
    '#pgGate{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:14px "Noto Sans KR",sans-serif;color:#0f2a4a;background:#f3f6fa;z-index:99999}' +
    '#pgBar{position:fixed;left:12px;bottom:12px;z-index:9999;background:#0f2a4a;color:#fff;font:12px "Noto Sans KR",sans-serif;padding:6px 10px;border-radius:999px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 14px rgba(15,42,74,.25)}' +
    '#pgBar a,#pgBar button{color:#cfe1ff;background:none;border:0;font:inherit;cursor:pointer;padding:0;text-decoration:underline}';
  document.head.appendChild(st);
  root.classList.add('pg-lock');
  var P = window.PortalSession;
  function gateMsg(text) {
    var g = document.getElementById('pgGate');
    if (!g) { g = document.createElement('div'); g.id = 'pgGate'; (document.body || root).appendChild(g); }
    g.textContent = text;
  }
  function ready(fn) { document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }
  if (!P) { location.replace('https://doctorville.github.io/portal/?next=' + encodeURIComponent(location.pathname)); return; }
  ready(function () { if (root.classList.contains('pg-lock')) gateMsg('업무 포털 로그인을 확인하고 있습니다…'); });
  window.PORTAL_GATE = P.me().then(function (m) {
    window.PORTAL_USER = m;
    ready(function () {
      root.classList.remove('pg-lock');
      var g = document.getElementById('pgGate'); if (g) g.remove();
      var bar = document.createElement('div'); bar.id = 'pgBar';
      bar.innerHTML = '<span></span><a href="/portal/">업무 포털</a><button type="button">로그아웃</button>';
      bar.querySelector('span').textContent = m.email;
      bar.querySelector('button').onclick = function () { P.signOut(); P.goLogin(location.pathname); };
      document.body.appendChild(bar);
    });
    return m;
  }, function (e) {
    if (e && e.status === 401) { P.goLogin(location.pathname); return; }
    ready(function () { gateMsg('업무 포털 로그인 정보를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.'); });
  });
  // 다른 탭에서 포털 로그아웃 시 함께 잠금
  window.addEventListener('storage', function (e) { if (e.key === P.STORE && !e.newValue) P.goLogin(location.pathname); });
})();
