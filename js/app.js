/* ============================================================
   app.js — shell, auth gate, hash router, navigation, header
   ============================================================ */

import { $, icon, on, esc, toast, avatar, clearListeners } from './ui.js';
import { state, save, flush, onChange, emitChange, checkIn, levelInfo,
         setRole, resetAll, displayName } from './store.js';
import { restoreSession, currentUser, logout } from './auth.js';

import * as authView from './views/auth.js';
import home      from './views/home.js';
import tracks    from './views/tracks.js';
import exam      from './views/exam.js';
import lab       from './views/lab.js';
import tutor     from './views/tutor.js';
import progress  from './views/progress.js';
import assessment from './views/assessment.js';
import community from './views/community.js';
import passport  from './views/passport.js';
import certs     from './views/certs.js';
import profile   from './views/profile.js';
import teacher   from './views/teacher.js';
import classes   from './views/classes.js';
import { status as getAIStatus, lastStatus as lastAIStatus, onStatusChange } from './ai/client.js';
import { startTour } from './tour.js';

/* ------------------------------------------------------------ routes */
const ROUTES = { home, tracks, exam, lab, tutor, progress, assessment, community,
                 passport, certs, profile, teacher, classes };

const NAV_STUDENT = [
  { group:'เรียนรู้' },
  { id:'home',      label:'หน้าแรก',        icon:'home' },
  { id:'tracks',    label:'เส้นทางทักษะ',   icon:'compass' },
  { group:'ฝึกฝน' },
  { id:'exam',      label:'ทดสอบปรับระดับ', icon:'exam' },
  { id:'lab',       label:'ห้องฝึกกล้อง',   icon:'camera', badge:'ใหม่' },
  { id:'tutor',     label:'ติวเตอร์ AI',    icon:'brain' },
  { group:'ความก้าวหน้า' },
  { id:'progress',  label:'จุดอ่อน & แผนติว', icon:'radar' },
  { id:'assessment',label:'ประเมิน + แผนพัฒนา', icon:'target', badge:'AI' },
  { id:'passport',  label:'สมุดทักษะ',      icon:'medal' },
  { id:'certs',     label:'เกียรติบัตร',    icon:'trophy' },
  { id:'classes',   label:'ชั้นเรียนของฉัน', icon:'teacher' },
  { id:'community', label:'คอมมูนิตี้',     icon:'people' },
];

const NAV_TEACHER = [
  { group:'ห้องเรียน' },
  { id:'classes',   label:'จัดการชั้นเรียน', icon:'teacher', badge:'ใหม่' },
  { id:'teacher',   label:'ภาพรวมชั้นเรียน', icon:'grid' },
  { id:'progress',  label:'วิเคราะห์ทักษะ',  icon:'radar' },
  { group:'เนื้อหา' },
  { id:'tracks',    label:'เส้นทางทักษะ',   icon:'compass' },
  { id:'lab',       label:'ห้องฝึกกล้อง',   icon:'camera' },
  { id:'certs',     label:'เกียรติบัตร',    icon:'trophy' },
  { id:'community', label:'คอมมูนิตี้',     icon:'people' },
];

const BOTTOM = [
  { id:'home',     label:'หน้าแรก',  icon:'home' },
  { id:'exam',     label:'ทดสอบ',    icon:'exam' },
  { id:'lab',      label:'ฝึกกล้อง', icon:'camera', accent:true },
  { id:'certs',    label:'เกียรติบัตร', icon:'trophy' },
  { id:'profile',  label:'โปรไฟล์',  icon:'people' },
];

/* ------------------------------------------------------------ router */
export function parseHash(){
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: seg[0] || 'home', sub: seg[1] || null, params };
}

export function go(path){
  location.hash = '#/' + String(path).replace(/^#?\/?/, '');
}

let currentView = null;

export function render(){
  if (!currentUser()) return;

  const route = parseHash();
  const view = ROUTES[route.name] || ROUTES.home;

  currentView?.unmount?.();
  currentView = view;

  const viewEl = $('#view');
  const ctx = { route, go };

  // ปิดหน้าต่างซ้อนที่ค้างอยู่ ไม่งั้นคลาส modal-open จะล็อกการเลื่อนหน้าถัดไป
  const mh = $('#modal-host');
  if (mh.innerHTML){ mh.innerHTML = ''; document.documentElement.classList.remove('modal-open'); }

  $('#page-title').textContent = typeof view.title === 'function' ? view.title(ctx) : view.title;
  $('#page-sub').textContent   = typeof view.sub   === 'function' ? (view.sub(ctx) || '') : (view.sub || '');

  // ถอด listener ของหน้าเดิมก่อนเสมอ ไม่งั้น handler จะทับซ้อนกันทุกครั้งที่เปลี่ยนหน้า
  clearListeners(viewEl);
  viewEl.innerHTML = view.render(ctx);
  view.mount?.(viewEl, ctx);

  paintNav(route.name);
  closeMenu();
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
  closeDrawer();
}

/* ------------------------------------------------------------ nav painting */
function paintNav(active){
  const items = state.role === 'teacher' ? NAV_TEACHER : NAV_STUDENT;
  $('#main-nav').innerHTML = items.map(it => it.group
    ? `<div class="nav-group">${it.group}</div>`
    : `<a class="nav-item" href="#/${it.id}"${it.id === active ? ' aria-current="page"' : ''}>
         ${icon(it.icon)}<span>${it.label}</span>
         ${it.badge ? `<span class="nav-badge">${it.badge}</span>` : ''}
       </a>`).join('');

  $('#bottom-nav').innerHTML = `<div class="bn-row">` + BOTTOM.map(it =>
    `<a class="bn-item${it.accent ? ' bn-accent' : ''}" href="#/${it.id}"${it.id === active ? ' aria-current="page"' : ''}>
       ${icon(it.icon)}<span>${it.label}</span>
     </a>`).join('') + `</div>`;

  $('#role-switch').innerHTML = `
    <button data-role="student" aria-pressed="${state.role === 'student'}">ผู้เรียน</button>
    <button data-role="teacher" aria-pressed="${state.role === 'teacher'}">ครู/สถาบัน</button>`;
}

function paintStats(){
  const lv = levelInfo();
  $('#topbar-stats').innerHTML = `
    <div class="stat-chip flame" title="เรียนต่อเนื่อง ${state.streak} วัน">
      ${icon('flame')}<span>${state.streak}</span><span class="lbl">วัน</span>
    </div>
    <div class="stat-chip xp" title="ประสบการณ์รวม ${state.xp} XP">
      ${icon('bolt')}<span>Lv.${lv.level}</span>
    </div>
    <div class="stat-chip" title="XP รวม">${icon('spark')}<span>${state.xp}</span><span class="lbl">XP</span></div>`;

  paintUser();
}

/* ------------------------------------------------------------ AI status */
const AI_REASON = {
  'no-api-key':'ยังไม่ได้ตั้งค่า API key',
  'no-provider':'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI',
  'ollama-down':'ยังไม่ได้เปิด Ollama',
  'model-missing':'ยังไม่มีโมเดลที่ตั้งไว้ในเครื่อง',
  'bad-key':'API key ไม่ถูกต้อง',
  'billing':'เครดิตของผู้ให้บริการหมด',
  'unreachable':'ติดต่อ AI gateway ไม่ได้',
};

function paintAIStatus(st = lastAIStatus()){
  const el = $('#ai-status');
  if (!el) return;

  const ready = !!st?.ok;
  const checking = !st;
  el.dataset.state = checking ? 'checking' : ready ? 'ready' : 'local';

  const provider = st?.provider && st.provider !== 'offline' ? st.provider : '';
  const detail = ready
    ? `${provider || 'AI'}${st.model ? ` · ${st.model}` : ''}`
    : (AI_REASON[st?.reason] || 'ใช้เอนจินในเครื่องแทน');
  const label = checking ? 'กำลังตรวจ AI' : ready ? 'AI พร้อม' : 'โหมดในเครื่อง';

  el.innerHTML = `<span class="ai-status-dot"></span><span class="ai-status-label">${label}</span>`;
  el.title = checking ? 'กำลังตรวจสถานะ AI' : `${label} — ${detail} · คลิกเพื่อตรวจใหม่`;
  el.setAttribute('aria-label', `${label}: ${detail}`);
}

/* ------------------------------------------------------------ user menu */
function paintUser(){
  const u = currentUser();
  if (!u) return;

  $('#user-btn').innerHTML = `${avatar(state.profile, 32, 10)}
    <span class="ub-name">${esc(displayName())}</span>${icon('chevD')}`;

  $('#user-menu').innerHTML = `
    <div class="um-head">
      ${avatar(state.profile, 42, 13)}
      <div style="min-width:0">
        <b>${esc(displayName())}</b>
        <span>${esc(u.guest ? 'บัญชีผู้เยี่ยมชม' : (u.email || state.profile.school || 'สมาชิก'))}</span>
      </div>
    </div>
    <a class="um-item" href="#/profile">${icon('people')} โปรไฟล์ของฉัน</a>
    <a class="um-item" href="#/certs">${icon('trophy')} เกียรติบัตรของฉัน
      ${state.certificates.length ? `<span class="um-count">${state.certificates.length}</span>` : ''}</a>
    <a class="um-item" href="#/passport">${icon('medal')} สมุดทักษะ</a>
    <div class="um-sep"></div>
    <button class="um-item" data-tour-replay>${icon('spark')} ดูวิธีใช้งานอีกครั้ง</button>
    <div class="um-sep"></div>
    <button class="um-item danger" data-logout>${icon('arrowR')} ออกจากระบบ</button>`;
}

const openMenu  = () => { $('#user-wrap').dataset.open = '1'; $('#user-btn').setAttribute('aria-expanded', 'true'); };
const closeMenu = () => { delete $('#user-wrap').dataset.open; $('#user-btn')?.setAttribute('aria-expanded', 'false'); };

/* ------------------------------------------------------------ drawer */
const openDrawer  = () => { $('#app-shell').dataset.drawer = 'open'; $('#scrim').hidden = false; };
const closeDrawer = () => { delete $('#app-shell').dataset.drawer; $('#scrim').hidden = true; };

/* ------------------------------------------------------------ auth gate */
function showAuth(){
  $('#app-shell').hidden = true;
  const root = $('#auth-root');
  root.hidden = false;
  authView.reset();
  root.innerHTML = authView.render();
  authView.mount(root, { onAuth: user => { root.hidden = true; root.innerHTML = ''; startApp(user); } });
}

function startApp(user){
  $('#app-shell').hidden = false;
  checkIn();
  paintStats();
  paintAIStatus();
  getAIStatus().then(paintAIStatus);
  render();

  /* ครั้งแรกที่เข้าใช้พาทัวร์ให้เลย ครั้งต่อไปทักสั้น ๆ พอ
     รอให้ shell วาดเสร็จก่อน ไม่งั้นทัวร์จะหาปุ่มที่ต้องชี้ไม่เจอ */
  if (!state.seenTour){
    state.seenTour = true; save();
    setTimeout(() => startTour({ onDone: () => go('tracks') }), 700);
  } else {
    setTimeout(() => toast(
      user.guest ? 'กำลังใช้โหมดผู้เยี่ยมชม — เริ่มจากเลือกเส้นทางทักษะได้เลย'
                 : `ยินดีต้อนรับ ${displayName()} — เริ่มจากเลือกเส้นทางทักษะได้เลย`,
      'ok', 4200), 900);
  }
}

/* ------------------------------------------------------------ boot */
function boot(){
  /* --- ปุ่มบน shell ผูกครั้งเดียวตอนบูต --- */
  $('#menu-btn').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  $('#user-btn').addEventListener('click', e => {
    e.stopPropagation();
    $('#user-wrap').dataset.open ? closeMenu() : openMenu();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest?.('#user-wrap')) closeMenu();
  });

  on(document, 'click', '.um-item', closeMenu);

  /* เมนูต้องปิดสนิทก่อน ไม่งั้นทัวร์จะไปวัดตำแหน่งปุ่มที่ยังถูกเมนูบังอยู่ */
  on(document, 'click', '[data-tour-replay]', () => {
    closeMenu();
    setTimeout(() => startTour(), 120);
  });

  on(document, 'click', '[data-logout]', () => {
    if (!confirm('ออกจากระบบตอนนี้? ความคืบหน้าของคุณจะถูกบันทึกไว้')) return;
    logout();
    currentView = null;
    location.hash = '#/home';
    showAuth();
  });

  on(document, 'click', '#role-switch button', (e, t) => {
    setRole(t.dataset.role);
    go(t.dataset.role === 'teacher' ? 'teacher' : 'home');
    render();
  });

  on(document, 'click', '.nav-item, .bn-item', closeDrawer);

  on(document, 'click', '#ai-status', async (e, btn) => {
    if (btn.disabled) return;
    btn.disabled = true;
    delete btn.dataset.state;
    paintAIStatus(null);
    const st = await getAIStatus({ refresh:true });
    paintAIStatus(st);
    btn.disabled = false;
    toast(st.ok ? `AI พร้อมใช้งานผ่าน ${st.provider}` : 'AI ยังไม่พร้อม — แอปใช้เอนจินในเครื่องอยู่', st.ok ? 'ok' : '');
  });

  onStatusChange(paintAIStatus);

  window.addEventListener('hashchange', render);
  onChange(paintStats);

  /* ปุ่มลัดคีย์บอร์ดบนเดสก์ท็อป */
  document.addEventListener('keydown', e => {
    if (e.target?.matches?.('input, textarea, select')) return;
    if (e.key === 'Escape'){ closeDrawer(); closeMenu(); }
    if (e.altKey && e.key >= '1' && e.key <= '5'){
      e.preventDefault();
      go(BOTTOM[+e.key - 1].id);
    }
  });

  /* กันข้อมูลหายตอนปิดแท็บ — เขียนลงดิสก์ทันทีแทนการรอ debounce */
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  /* --- เข้าสู่แอปหรือหน้าเข้าสู่ระบบ --- */
  const user = restoreSession();
  user ? startApp(user) : showAuth();
}

/* debug helper */
window.SkillPass = { state, resetAll, go, render, emitChange, currentUser };

boot();
