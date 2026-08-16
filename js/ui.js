/* ============================================================
   ui.js — icon set, DOM helpers, toast/modal, tiny SVG charts
   ============================================================ */

/* ---------------------------------------------------- icons
   All inline SVG (no network). Stroke-based, 24x24 grid.      */
const P = {
  home:      'M4 11.2 12 4l8 7.2M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9',
  compass:   'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  exam:      'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9.5 8h5M9.5 12h5M9.5 16h3',
  camera:    'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  spark:     'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  chart:     'M4 20V10M10 20V4M16 20v-7M22 20H2',
  radar:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 3v18M3.5 7.5l17 9M20.5 7.5l-17 9',
  people:    'M8 11a3.2 3.2 0 1 0 0-6.5A3.2 3.2 0 0 0 8 11Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.7-5 6-5s6 2 6 5M15.5 15.4c2.8.3 5 2.2 5 4.6',
  medal:     'M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 0v6l-2.5-1.6L7 21l1.6-5.2M12 21l2.5-1.6L17 21l-1.6-5.2',
  teacher:   'M3 8.5 12 4l9 4.5-9 4.5-9-4.5Zm3 3v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5M21 8.5v6',
  flame:     'M12 3s5 4 5 8.5A5 5 0 0 1 7 12C7 9 9 7 9 7s.5 2 1.5 2.5C11 8 12 6 12 3Z',
  bolt:      'M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z',
  check:     'M4.5 12.5 9.5 17.5 19.5 6.5',
  x:         'M6 6l12 12M18 6 6 18',
  play:      'M7 4.5v15l13-7.5-13-7.5Z',
  stop:      'M6.5 6.5h11v11h-11z',
  clock:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2',
  book:      'M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 1-2-2v-12ZM20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 0 2-2v-12Z',
  brain:     'M9.5 4.5A2.6 2.6 0 0 0 7 7a2.5 2.5 0 0 0-1.5 4.5A2.6 2.6 0 0 0 7 16a2.5 2.5 0 0 0 4.5 1.5V5.6A2.4 2.4 0 0 0 9.5 4.5ZM14.5 4.5A2.6 2.6 0 0 1 17 7a2.5 2.5 0 0 1 1.5 4.5A2.6 2.6 0 0 1 17 16a2.5 2.5 0 0 1-4.5 1.5',
  target:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z',
  send:      'M4 12 20.5 4 13.5 20.5l-2.2-6.3L4 12Z',
  arrowR:    'M5 12h14M13 6l6 6-6 6',
  arrowL:    'M19 12H5M11 18l-6-6 6-6',
  chevU:     'M6 14.5 12 8.5l6 6',
  chevD:     'M6 9.5 12 15.5l6-6',
  quote:     'M9 8H5.5A1.5 1.5 0 0 0 4 9.5V13a1.5 1.5 0 0 0 1.5 1.5H8v1A2.5 2.5 0 0 1 5.5 18M19.5 8H16a1.5 1.5 0 0 0-1.5 1.5V13A1.5 1.5 0 0 0 16 14.5h2.5v1A2.5 2.5 0 0 1 16 18',
  heart:     'M12 19.5s-7-4.3-7-9A3.8 3.8 0 0 1 12 7.8 3.8 3.8 0 0 1 19 10.5c0 4.7-7 9-7 9Z',
  reply:     'M9 8 4.5 12 9 16M4.5 12H14a5 5 0 0 1 5 5v1',
  lock:      'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
  info:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9.5V16M12 8.2v.4',
  refresh:   'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
  wave:      'M2 12h3l2-6 3 13 3-16 3 15 2-6h4',
  zone:      'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
  hand:      'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6 7s-6-2.4-6-6V11a1.5 1.5 0 0 1 3 0v1',
  mic:       'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM5.5 11.5A6.5 6.5 0 0 0 18.5 11.5M12 18.5V21',
  bulb:      'M9.5 18h5M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-1 1.2-1.1 2h-5c-.1-.8-.5-1.5-1.1-2A6 6 0 0 1 12 3Z',
  shield:    'M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5ZM9 12l2 2 4-4',
  grid:      'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  wrench:    'M15.5 4.5a4.5 4.5 0 0 0-5.8 5.6L4 15.8V20h4.2l5.7-5.7a4.5 4.5 0 0 0 5.6-5.8L17 11l-2.4-.6L14 8l2.5-2.5-1-1Z',
  globe:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3Z',
  cloud:     'M7 18.5a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17.3 9.6 3.9 3.9 0 0 1 17 18.5H7Z',
  heartbeat: 'M3 12h3.5l1.8-4 3 9 2.4-7 1.8 4H21',
  flask:     'M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3M9 3h6M7.4 14h9.2',
  coins:     'M9 12a5 5 0 1 0 0-8 5 5 0 0 0 0 8ZM15 20a5 5 0 1 0 0-8 5 5 0 0 0 0 8Z',
  present:   'M4 4h16v11H4zM9 19h6M12 15v4M9.5 11.5l2-2.5 1.5 2 2-3',
  weld:      'M3 20h18M6 20V9l7-5 5 4v12M9.5 20v-4h4v4',
  car:       'M5 16.5h14M6.5 16.5V19h-2v-2.5M19.5 16.5V19h-2v-2.5M4.5 16.5l1.3-5.4A2 2 0 0 1 7.7 9.5h8.6a2 2 0 0 1 1.9 1.6l1.3 5.4M7.5 13.2h1M15.5 13.2h1',
  snow:      'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 7l-2.4-2M12 7l2.4-2M12 17l-2.4 2M12 17l2.4 2',
  plug:      'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5V21',
  eye:       'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z',
  trophy:    'M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4.5v1.5A3 3 0 0 0 7.5 10M17 6h2.5v1.5A3 3 0 0 1 16.5 10M9.5 20h5M12 14v6',
  plus:      'M12 5.5v13M5.5 12h13',
  calendar:  'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  filter:    'M4 5.5h16l-6.2 7v6l-3.6-2v-4L4 5.5Z',
  ruler:     'M4 14.5 14.5 4l5.5 5.5L9.5 20 4 14.5Zm3.5-3 2 2m1.5-5 2 2m1.5-5 2 2',
  sequence:  'M5 6.5h4v4H5zM5 15h4v4H5zM15 6.5h4v4h-4zM15 15h4v4h-4zM9 8.5h6M17 10.5v4M15 17H9',
};

export function icon(name, cls){
  const d = P[name] || P.info;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85"
    stroke-linecap="round" stroke-linejoin="round"${cls?` class="${cls}"`:''} aria-hidden="true"><path d="${d}"/></svg>`;
}

/* ---------------------------------------------------- DOM helpers */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** Tagged template that escapes ${} interpolations, unless wrapped in raw(). */
export function html(strings, ...vals){
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = vals[i-1];
    const chunk = (v && v.__raw) ? v.value
      : Array.isArray(v) ? v.map(x => (x && x.__raw) ? x.value : esc(x)).join('')
      : esc(v);
    return out + chunk + s;
  }, '');
}
export const raw = value => ({ __raw:true, value });

/**
 * Delegated listener.
 *
 * ทุก listener ที่ผูกผ่าน on() จะถูกจดไว้กับ root เพื่อให้ถอดออกได้ทีเดียว
 * ด้วย clearListeners() — จำเป็นมาก เพราะหน้าจอถูก re-render โดยการเขียนทับ
 * innerHTML ของ element เดิม ถ้าไม่ถอด listener เก่าออกก่อน mount ใหม่
 * handler จะซ้อนกันทุกครั้งที่ re-render (คลิกครั้งเดียวยิงหลายรอบ)
 */
export function on(root, evt, sel, fn){
  const handler = e => {
    const t = e.target?.closest?.(sel);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(evt, handler);
  (root.__bound ||= []).push([evt, handler]);
  return handler;
}

/** ถอด listener ทั้งหมดที่ผูกไว้กับ root ผ่าน on() */
export function clearListeners(root){
  if (!root?.__bound) return;
  for (const [evt, handler] of root.__bound) root.removeEventListener(evt, handler);
  root.__bound = [];
}

/** ล้าง listener เดิมแล้วเขียนเนื้อหาใหม่ — ใช้แทน root.innerHTML = … ทุกที่ที่ re-render */
export function paint(root, htmlStr){
  clearListeners(root);
  root.innerHTML = htmlStr;
  return root;
}

/* ============================================================
   DROPDOWN — ตัวเลือกแบบกำหนดหน้าตาเองได้
   ------------------------------------------------------------
   ทำไมไม่ใช้ <select>: เบราว์เซอร์ไม่ให้จัดสไตล์รายการข้างในเลย
   จึงใส่ไอคอน คำอธิบายบรรทัดสอง หรือช่องค้นหาไม่ได้
   ตัวนี้เก็บค่าไว้ใน <input hidden> แล้วยิง event 'change' เหมือน <select>
   โค้ดที่ผูก listener ไว้เดิมจึงใช้ต่อได้โดยไม่ต้องแก้
   ============================================================ */

const SEARCH_THRESHOLD = 8;      // ตัวเลือกมากกว่านี้ค่อยมีช่องค้นหา

/**
 * @param {object} o  { id, label, value, options:[{value,label,sub,icon,badge}],
 *                      icon, hint, placeholder, searchable }
 */
export function dropdown(o){
  const { id, label = '', value = '', options = [], icon: ico,
          hint = '', placeholder = 'เลือก…' } = o;
  const searchable = o.searchable ?? options.length > SEARCH_THRESHOLD;
  const sel = options.find(x => String(x.value) === String(value)) || options[0] || {};

  const item = op => {
    const on = String(op.value) === String(sel.value);
    return `<button type="button" class="dd-opt" role="option" aria-selected="${on}"
      data-value="${esc(op.value)}" data-search="${esc((op.label + ' ' + (op.sub || '')).toLowerCase())}">
      ${op.icon ? icon(op.icon) : ''}
      <span class="dd-opt-text">
        <b>${esc(op.label)}</b>
        ${op.sub ? `<span>${esc(op.sub)}</span>` : ''}
      </span>
      ${op.badge ? `<span class="dd-badge">${esc(op.badge)}</span>` : ''}
      <span class="dd-check">${icon('check')}</span>
    </button>`;
  };

  return `<div class="field dd-field">
    ${label ? `<label for="${id}-btn">${esc(label)}</label>` : ''}
    <div class="dd" data-dd>
      <button type="button" class="dd-btn" id="${id}-btn"
        aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label || placeholder)}">
        ${ico ? icon(ico, 'dd-ico') : ''}
        <span class="dd-value">${sel.label ? esc(sel.label) : `<i>${esc(placeholder)}</i>`}</span>
        ${icon('chevD', 'dd-caret')}
      </button>

      <div class="dd-pop" role="listbox" tabindex="-1" hidden>
        ${searchable ? `<div class="dd-search">
          ${icon('compass')}
          <input type="text" placeholder="พิมพ์เพื่อค้นหา…" aria-label="ค้นหาตัวเลือก">
        </div>` : ''}
        <div class="dd-list">${options.map(item).join('')}</div>
        <p class="dd-empty" hidden>ไม่พบตัวเลือกที่ตรงกับที่ค้นหา</p>
      </div>

      <input type="hidden" id="${id}" name="${id}" value="${esc(sel.value ?? '')}">
    </div>
    ${hint ? `<span class="f-hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/**
 * เปิดใช้งาน dropdown ทุกตัวใน root (เรียกใน mount ของวิว)
 * ปลอดภัยเมื่อเรียกซ้ำ — ตัวที่ผูกแล้วจะถูกข้าม
 */
export function mountDropdowns(root = document){
  for (const dd of root.querySelectorAll('[data-dd]')){
    if (dd.__wired) continue;
    dd.__wired = true;

    const btn    = dd.querySelector('.dd-btn');
    const pop    = dd.querySelector('.dd-pop');
    const hidden = dd.querySelector('input[type=hidden]');
    const search = dd.querySelector('.dd-search input');
    const empty  = dd.querySelector('.dd-empty');
    const opts   = () => [...dd.querySelectorAll('.dd-opt')].filter(o => !o.hidden);

    const close = () => {
      pop.hidden = true;
      dd.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      // ปิดตัวอื่นก่อน ไม่ให้ซ้อนกันหลายอัน
      document.querySelectorAll('.dd.open').forEach(x => {
        if (x !== dd){ x.classList.remove('open'); x.querySelector('.dd-pop').hidden = true;
                       x.querySelector('.dd-btn').setAttribute('aria-expanded', 'false'); }
      });
      pop.hidden = false;
      dd.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      // เปิดขึ้นบนถ้าที่ว่างด้านล่างไม่พอ
      const space = window.innerHeight - btn.getBoundingClientRect().bottom;
      dd.classList.toggle('drop-up', space < Math.min(320, pop.scrollHeight + 24));
      if (search){ search.value = ''; filter(''); search.focus(); }
      else dd.querySelector('.dd-opt[aria-selected="true"]')?.focus();
    };

    const filter = q => {
      let n = 0;
      for (const op of dd.querySelectorAll('.dd-opt')){
        const hit = !q || op.dataset.search.includes(q);
        op.hidden = !hit;
        if (hit) n++;
      }
      if (empty) empty.hidden = n > 0;
    };

    const pick = op => {
      hidden.value = op.dataset.value;
      dd.querySelector('.dd-value').textContent = op.querySelector('b').textContent;
      dd.querySelectorAll('.dd-opt').forEach(x =>
        x.setAttribute('aria-selected', String(x === op)));
      close();
      btn.focus();
      // ยิง event เหมือน <select> เพื่อให้โค้ดเดิมที่ฟัง change ทำงานต่อได้
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      pop.hidden ? open() : close();
    });

    on(dd, 'click', '.dd-opt', (e, op) => { e.stopPropagation(); pick(op); });

    search?.addEventListener('input', () => filter(search.value.trim().toLowerCase()));

    dd.addEventListener('keydown', e => {
      const list = opts();
      const here = list.indexOf(document.activeElement);

      if (e.key === 'Escape'){ e.stopPropagation(); close(); btn.focus(); return; }
      if (pop.hidden && ['ArrowDown', 'Enter', ' '].includes(e.key) && document.activeElement === btn){
        e.preventDefault(); open(); return;
      }
      if (pop.hidden) return;

      if (e.key === 'ArrowDown'){ e.preventDefault(); (list[here + 1] || list[0])?.focus(); }
      if (e.key === 'ArrowUp'){   e.preventDefault(); (list[here - 1] || list.at(-1))?.focus(); }
      if (e.key === 'Home'){      e.preventDefault(); list[0]?.focus(); }
      if (e.key === 'End'){       e.preventDefault(); list.at(-1)?.focus(); }
      if (e.key === 'Enter' && here >= 0){ e.preventDefault(); pick(list[here]); }
      if (e.key === 'Tab') close();
    });

    document.addEventListener('click', e => {
      if (!pop.hidden && !dd.contains(e.target)) close();
    });
  }
}

/** อ่านค่าปัจจุบันของ dropdown (หรือ input/select ธรรมดา) ตาม id */
export const fieldValue = (root, id) => root.querySelector('#' + id)?.value ?? '';

/* ---------------------------------------------------- toast */
let toastSeq = 0;
export function toast(msg, kind = '', ms = 2600){
  const host = $('#toast-host');
  const el = document.createElement('div');
  const ico = kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : kind === 'xp' ? 'bolt' : 'info';
  el.className = `toast ${kind}`;
  el.innerHTML = icon(ico) + `<span>${esc(msg)}</span>`;
  el.dataset.id = ++toastSeq;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------------------------------------------------- modal */
/**
 * หน้าต่างซ้อน
 * มีปุ่มกากบาทมุมขวาบนเสมอ ผู้ใช้จึงปิดได้ทันทีโดยไม่ต้องเลื่อนลงไปหาปุ่มท้ายเนื้อหา
 * @param {object} o  { onClose, size:'md'|'wide', label }
 */
export function modal(innerHTML, { onClose, size = 'md', label = 'หน้าต่าง' } = {}){
  const host = $('#modal-host');
  host.innerHTML = `<div class="modal-back">
    <div class="modal${size === 'wide' ? ' modal-wide' : ''}" role="dialog" aria-modal="true"
      aria-label="${esc(label)}" tabindex="-1">
      <button class="modal-x" data-close aria-label="ปิดหน้าต่าง">${icon('x')}</button>
      <div class="modal-body">${innerHTML}</div>
    </div>
  </div>`;

  const back = $('.modal-back', host);
  const el = $('.modal', host);
  const close = () => {
    host.innerHTML = '';
    document.removeEventListener('keydown', key);
    document.documentElement.classList.remove('modal-open');
    onClose?.();
  };
  const key = e => { if (e.key === 'Escape') close(); };

  back.addEventListener('click', e => { if (e.target === back) close(); });
  on(host, 'click', '[data-close]', close);
  document.addEventListener('keydown', key);
  document.documentElement.classList.add('modal-open');
  el.focus?.();

  return { close, el };
}

/* ---------------------------------------------------- formatting */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const pct = v => Math.round(clamp(v, 0, 1) * 100);

export function mmss(sec){
  sec = Math.max(0, Math.round(sec));
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

export function timeAgo(ts){
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return 'เมื่อครู่';
  if (s < 3600)  return `${Math.floor(s/60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s/3600)} ชม.ที่แล้ว`;
  if (s < 604800)return `${Math.floor(s/86400)} วันที่แล้ว`;
  return new Date(ts).toLocaleDateString('th-TH', { day:'numeric', month:'short' });
}

/** สีอวาตาร์จากชื่อ คนเดิมได้สีเดิมเสมอ
    เฉดวนอยู่ในช่วงเขียว–เขียวอมเหลือง–เขียวอมฟ้า ให้เข้าชุดกับธีมเขียว–ขาว
    ความสว่างคุมไว้ 28–32% เพราะเขียวสว่างกว่าน้ำเงินที่เคยใช้มาก
    ถ้าปล่อยสว่างกว่านี้ ตัวย่อสีขาวบนอวาตาร์จะตกเกณฑ์คอนทราสต์ทันที */
export function avatarColor(name){
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const hues = [104, 88, 132, 76, 148, 116];
  return `hsl(${hues[h % hues.length]} 52% ${28 + (h % 3) * 2}%)`;
}
export const initials = name => String(name).trim().slice(0, 2);

/* เงาคนสำหรับกรณียังไม่ได้ใส่รูป — วาดแยกจากชุด icon() เพราะต้องเป็นทรงทึบ (fill)
   ไม่ใช่เส้น (stroke) และต้องเต็มกรอบพอดีทุกขนาด */
const SILHOUETTE = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <circle cx="20" cy="15.2" r="6.8" fill="currentColor"/>
  <path d="M5.6 36.5c0-7.3 6.4-12.6 14.4-12.6s14.4 5.3 14.4 12.6z" fill="currentColor"/>
</svg>`;

/** รูปโปรไฟล์: ใช้ภาพที่อัปโหลด ถ้ายังไม่มีจะเป็นเงาคน (ไม่ใช่ตัวอักษรย่อ) */
export function avatar(profile = {}, size = 40, radius){
  const r = radius ?? Math.round(size * 0.32);
  const st = `width:${size}px;height:${size}px;border-radius:${r}px`;
  return profile.photo
    ? `<img class="avatar" src="${esc(profile.photo)}" alt="รูปโปรไฟล์" style="${st};object-fit:cover">`
    : `<span class="avatar avatar-ghost" style="${st}" role="img" aria-label="ยังไม่ได้ตั้งรูปโปรไฟล์">${SILHOUETTE}</span>`;
}

/* ---------------------------------------------------- form fields */

/** ช่องกรอกข้อมูลมาตรฐาน — ใช้ให้เหมือนกันทุกฟอร์มในระบบ */
export function field(o){
  const {
    id, label, value = '', type = 'text', placeholder = '', hint = '',
    required = false, autocomplete, rows, options, icon: ico, maxlength,
  } = o;
  const attrs = [
    `id="${id}"`, `name="${id}"`,
    placeholder ? `placeholder="${esc(placeholder)}"` : '',
    autocomplete ? `autocomplete="${autocomplete}"` : '',
    maxlength ? `maxlength="${maxlength}"` : '',
    required ? 'required' : '',
  ].filter(Boolean).join(' ');

  const control =
    rows     ? `<textarea class="input" rows="${rows}" ${attrs}>${esc(value)}</textarea>`
  : options  ? `<select class="input" ${attrs}>${options.map(op =>
                 `<option value="${esc(op.value)}"${op.value === value ? ' selected' : ''}>${esc(op.label)}</option>`).join('')}</select>`
  :            `<input class="input" type="${type}" value="${esc(value)}" ${attrs}>`;

  return `<div class="field${ico ? ' has-ico' : ''}">
    <label for="${id}">${esc(label)}${required ? '<i>*</i>' : ''}</label>
    ${ico ? icon(ico, 'f-ico') : ''}${control}
    ${hint ? `<span class="f-hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/** Grade colour class from a 0..100 score. */
export function scoreTone(v){
  return v >= 75 ? 'ok' : v >= 50 ? 'warn' : 'bad';
}
export const toneColor = t => ({ ok:'var(--ok)', warn:'var(--warn)', bad:'var(--bad)' }[t] || 'var(--brand-600)');

/* ============================================================
   Tiny SVG charts (no library, theme-aware, responsive)
   ============================================================ */

/** Progress ring. value 0..1 */
export function ring(value, { size = 92, stroke = 9, label = '', sub = '', color } = {}){
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - clamp(value, 0, 1));
  const col = color || toneColor(scoreTone(value * 100));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--brand-100)" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
        style="transition:stroke-dashoffset .7s cubic-bezier(.2,.7,.3,1)"/>
    </svg>
    <div class="ring-txt"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
  </div>`;
}

/**
 * Radar / spider chart of skill mastery.
 * series: [{ name, color, values:[0..1] }]  axes: [string]
 */
export function radarChart(axes, series, { size = 300 } = {}){
  const cx = size/2, cy = size/2 + 6, R = size/2 - 46;
  const n = axes.length;
  const ang = i => (Math.PI * 2 * i / n) - Math.PI/2;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];

  let g = '';
  // rings
  for (const lv of [.25, .5, .75, 1]){
    const p = axes.map((_, i) => pt(i, lv).map(x => x.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${p}" fill="none" stroke="var(--${lv === 1 ? 'blue-200' : 'line'})" stroke-width="1"/>`;
  }
  // spokes + labels
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 1);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
    const [lx, ly] = pt(i, 1.19);
    const anchor = Math.abs(lx - cx) < 12 ? 'middle' : (lx > cx ? 'start' : 'end');
    g += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}"
            font-size="10.5" font-weight="600" fill="var(--ink-3)">${esc(a)}</text>`;
  });
  // series
  series.forEach(s => {
    const p = s.values.map((v, i) => pt(i, clamp(v, .04, 1)).map(x => x.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${p}" fill="${s.color}" fill-opacity="${s.fill ?? .22}"
            stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    if (s.dots !== false){
      s.values.forEach((v, i) => {
        const [x, y] = pt(i, clamp(v, .04, 1));
        g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${s.color}"/>`;
      });
    }
  });
  return `<svg viewBox="0 0 ${size} ${size + 12}" width="100%" style="max-width:${size}px"
    role="img" aria-label="แผนภูมิใยแมงมุมแสดงระดับทักษะ">${g}</svg>`;
}

/** Sparkline for a series of 0..100 values. */
export function sparkline(vals, { w = 220, h = 56, color = 'var(--brand-500)' } = {}){
  if (!vals.length) return '';
  const max = 100, min = 0, n = vals.length;
  const x = i => (i / Math.max(1, n - 1)) * (w - 6) + 3;
  const y = v => h - 6 - ((v - min) / (max - min)) * (h - 14);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n-1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:100%;height:${h}px" aria-hidden="true">
    <path d="${area}" fill="${color}" fill-opacity=".12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(n-1).toFixed(1)}" cy="${y(vals[n-1]).toFixed(1)}" r="3.6" fill="${color}"/>
  </svg>`;
}

/** Horizontal bar list: items [{label, value 0..100, tone}] */
export function barList(items){
  return `<div class="stack" style="gap:11px">` + items.map(it => `
    <div>
      <div class="spread" style="margin-bottom:5px">
        <span class="small" style="font-weight:600">${esc(it.label)}</span>
        <span class="small num" style="color:${toneColor(it.tone || scoreTone(it.value))};font-weight:700">${Math.round(it.value)}%</span>
      </div>
      <div class="bar ${it.tone || scoreTone(it.value)}"><i style="width:${clamp(it.value,0,100)}%"></i></div>
    </div>`).join('') + `</div>`;
}
