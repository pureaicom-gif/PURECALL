// 0.9.1: on phones keep 4 primary tabs + "เพิ่มเติม" overflow menu
const PRIMARY = ['chats', 'friends', 'timeline', 'profile'];
function addItem(menu, label, fn) {
  const m = document.createElement('button'); m.type = 'button'; m.textContent = label;
  m.onclick = () => { menu.classList.remove('open'); fn(); }; menu.appendChild(m);
}
function setup() {
  const items = document.querySelector('.rail .nav-items');
  if (!items || items.querySelector('.nav-more')) return !!items;
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'nav nav-more'; more.setAttribute('aria-label', 'เพิ่มเติม');
  more.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg><span>เพิ่มเติม</span>';
  const menu = document.createElement('div'); menu.className = 'nav-more-menu'; menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  const sync = () => {
    menu.innerHTML = '';
    for (const b of items.querySelectorAll('.nav[data-tab]')) {
      if (PRIMARY.includes(b.dataset.tab)) continue;
      const shown = !b.hidden && b.style.display !== 'none';
      b.classList.add('in-more');
      if (!shown) continue;
      const m = document.createElement('button'); m.type = 'button'; m.innerHTML = b.innerHTML;
      if (b.classList.contains('active')) m.classList.add('active');
      m.onclick = () => { menu.classList.remove('open'); b.click(); };
      menu.appendChild(m);
    }
    if (window.PureOpenPrefs) addItem(menu, 'ตั้งค่า · ภาษา', () => window.PureOpenPrefs());
    const A = window.PureAndroid;
    if (A?.openScanner) addItem(menu, 'สแกน QR', () => A.openScanner());
    if (A?.nativeMenu) addItem(menu, 'ตั้งค่าแอป', () => A.nativeMenu());
    more.classList.toggle('active', !!items.querySelector('.nav.in-more.active'));
  };
  more.onclick = e => { e.stopPropagation(); sync(); menu.classList.toggle('open'); };
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.remove('open'); });
  items.appendChild(more); sync();
  new MutationObserver(() => more.classList.toggle('active', !!items.querySelector('.nav.in-more.active'))).observe(items, { subtree: true, attributes: true, attributeFilter: ['class'] });
  return true;
}
if (!setup()) { const t = setInterval(() => setup() && clearInterval(t), 500); setTimeout(() => clearInterval(t), 30000); }
