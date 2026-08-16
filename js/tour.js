/* ============================================================
   tour.js — ทัวร์สอนใช้งานแบบชี้ของจริงบนหน้าจอ

   หลักคิด: ไม่เล่าเป็นสไลด์แยกจากแอป แต่ไฮไลต์ปุ่มจริงทีละจุด
   ผู้ใช้จะจำ "ตำแหน่ง" ไปด้วย ไม่ใช่จำแค่เนื้อหา

   ขึ้นเองครั้งแรกที่เข้าใช้ และเปิดซ้ำได้จากเมนูผู้ใช้
   ============================================================ */

import { $, icon, esc } from './ui.js';

/* จุดที่ชี้ต้องเป็น element ที่มีอยู่จริงบน shell
   alt = ตัวสำรองบนจอแคบ ซึ่งเมนูข้างถูกยุบเข้า drawer ไปแล้ว
   ถ้าหาไม่เจอทั้งคู่ให้ข้ามขั้นนั้นไป ดีกว่าชี้ไปที่ว่าง ๆ */
const STEPS = [
  {
    title: 'ยินดีต้อนรับสู่ Check Chang',
    body: 'ระบบนี้พาคุณจาก "ยังไม่รู้ว่าตัวเองอ่อนตรงไหน" ไปถึง "ทำเป็นจริงและมีหลักฐานยืนยัน" '
        + 'ขอเวลาประมาณ 30 วินาที พาดูว่าแต่ละส่วนใช้ทำอะไร',
    center: true,
  },
  {
    target: '#main-nav a[href="#/tracks"]',
    alt: '#bottom-nav a[href="#/home"]',
    title: 'เริ่มที่นี่ — เลือกเส้นทาง',
    body: 'เลือกใบรับรองที่อยากสอบ เช่น ช่างไฟฟ้าภายในอาคาร ระดับ 1 '
        + 'แต่ละเส้นทางบอกเกณฑ์จริงของกรมพัฒนาฝีมือแรงงานไว้ครบ ทั้งหมดที่ต้องรู้และค่าจ้างที่จะได้',
  },
  {
    target: '#main-nav a[href="#/exam"]',
    alt: '#bottom-nav a[href="#/exam"]',
    title: 'วัดระดับด้วยข้อสอบที่ปรับตามคุณ',
    body: 'ข้อสอบจะเลือกข้อถัดไปจากคำตอบข้อก่อนหน้า ตอบถูกจะยากขึ้น ตอบผิดจะง่ายลง '
        + 'จึงรู้ระดับจริงของคุณด้วยจำนวนข้อที่น้อยกว่าข้อสอบแบบเดิมมาก',
  },
  {
    target: '#main-nav a[href="#/lab"]',
    alt: '#bottom-nav a[href="#/lab"]',
    title: 'ฝึกภาคปฏิบัติหน้ากล้อง',
    body: 'เปิดกล้องมือถือหรือโน้ตบุ๊กแล้วทำตามโจทย์ ระบบจับจังหวะ ความนิ่ง ตำแหน่ง '
        + 'และลำดับขั้นตอน แล้วบอกผลทันทีโดยไม่ต้องรอครูตรวจ',
  },
  {
    target: '#main-nav a[href="#/tutor"]',
    alt: '#bottom-nav a[href="#/home"]',
    title: 'ถามติวเตอร์ได้ทุกเมื่อ',
    body: 'ถามเป็นภาษาพูดได้เลย คำตอบจะอ้างอิงกลับไปที่หัวข้อในคู่มือสอบเสมอ '
        + 'และมีป้ายบอกทุกครั้งว่าคำตอบมาจาก AI หรือจากเอนจินในเครื่อง',
  },
  {
    target: '#main-nav a[href="#/progress"]',
    alt: '#bottom-nav a[href="#/home"]',
    title: 'รู้ว่าต้องซ่อมตรงไหน',
    body: 'สรุปให้เห็นว่าทักษะย่อยตัวไหนยังอ่อน แล้วจัดลำดับให้ว่าควรติวอะไรก่อน '
        + 'ไม่ต้องเดาเองว่าจะอ่านตรงไหนต่อ',
  },
  {
    target: '#main-nav a[href="#/certs"]',
    alt: '#bottom-nav a[href="#/certs"]',
    title: 'เกียรติบัตรที่มีหลักฐานอยู่เบื้องหลัง',
    body: 'ระบบจะออกให้เมื่อผ่านเกณฑ์ทั้งภาคทฤษฎีและภาคปฏิบัติจริงเท่านั้น '
        + 'บนใบมีคะแนน จำนวนข้อที่ผ่าน และเลขที่ให้ตรวจย้อนกลับได้ ดาวน์โหลดหรือสั่งพิมพ์ได้เลย',
  },
  {
    target: '#ai-status',
    title: 'ป้ายนี้บอกว่า AI ทำงานอยู่ไหม',
    body: 'ถ้าขึ้น "โหมดในเครื่อง" แปลว่ายังไม่ได้ต่อ AI ภายนอก ระบบจะใช้เอนจินในเครื่องแทน '
        + 'ทุกฟีเจอร์ยังใช้ได้ครบ กดที่ป้ายเพื่อตรวจสถานะใหม่ได้',
  },
  {
    title: 'พร้อมแล้ว',
    body: 'เปิดทัวร์นี้ซ้ำได้ทุกเมื่อจากเมนูชื่อคุณมุมขวาบน '
        + 'ถ้าอยากลองเร็ว ๆ แนะนำให้เริ่มจากเลือกเส้นทางทักษะก่อน',
    center: true,
    done: true,
  },
];

let host = null;      // element ครอบทั้งทัวร์
let idx = 0;
let steps = [];
let onFinish = null;

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** หา element ของขั้นนั้น โดยข้ามตัวที่ซ่อนอยู่ (เช่น เมนูข้างบนจอแคบ) */
function resolve(step){
  for (const sel of [step.target, step.alt]){
    if (!sel) continue;
    const el = document.querySelector(sel);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

function layout(){
  const step = steps[idx];
  const hole = $('.tour-hole', host);
  const card = $('.tour-card', host);
  if (!hole || !card) return;

  const el = step.center ? null : resolve(step);

  if (!el){
    hole.style.opacity = '0';
    card.dataset.place = 'center';
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%,-50%)';
    return;
  }

  const r = el.getBoundingClientRect();
  const pad = 6;
  hole.style.opacity = '1';
  hole.style.left = `${r.left - pad}px`;
  hole.style.top = `${r.top - pad}px`;
  hole.style.width = `${r.width + pad * 2}px`;
  hole.style.height = `${r.height + pad * 2}px`;

  /* วางการ์ดข้างขวาของสิ่งที่ชี้ถ้ามีที่พอ ไม่งั้นวางล่างแล้วหนีบไม่ให้ล้นจอ */
  const cw = card.offsetWidth || 330;
  const ch = card.offsetHeight || 190;
  const gap = 14;
  let left, top, place;

  if (r.right + gap + cw < window.innerWidth - 12){
    place = 'right';
    left = r.right + gap;
    top = r.top + r.height / 2 - ch / 2;
  } else if (r.bottom + gap + ch < window.innerHeight - 12){
    place = 'bottom';
    left = r.left + r.width / 2 - cw / 2;
    top = r.bottom + gap;
  } else {
    place = 'top';
    left = r.left + r.width / 2 - cw / 2;
    top = r.top - gap - ch;
  }

  card.dataset.place = place;
  card.style.transform = 'none';
  card.style.left = `${Math.max(12, Math.min(left, window.innerWidth - cw - 12))}px`;
  card.style.top = `${Math.max(12, Math.min(top, window.innerHeight - ch - 12))}px`;
}

function paintStep(){
  const step = steps[idx];
  const card = $('.tour-card', host);
  const last = idx === steps.length - 1;

  card.innerHTML = `
    <div class="tour-count">ขั้นที่ ${idx + 1} จาก ${steps.length}</div>
    <h3 id="tour-title">${esc(step.title)}</h3>
    <p>${esc(step.body)}</p>
    <div class="tour-dots" aria-hidden="true">
      ${steps.map((_, i) => `<i${i === idx ? ' class="on"' : ''}></i>`).join('')}
    </div>
    <div class="tour-actions">
      <button class="btn btn-ghost btn-sm" data-tour="skip">${last ? 'ปิด' : 'ข้ามทัวร์'}</button>
      <div class="spacer"></div>
      ${idx > 0 ? `<button class="btn btn-ghost btn-sm" data-tour="prev">${icon('arrowL')} ย้อนกลับ</button>` : ''}
      <button class="btn btn-primary btn-sm" data-tour="next">
        ${last ? `${icon('check')} เริ่มใช้งาน` : `ถัดไป ${icon('arrowR')}`}
      </button>
    </div>`;

  const el = steps[idx].center ? null : resolve(steps[idx]);
  el?.scrollIntoView({ block:'center', behavior: reduceMotion() ? 'auto' : 'smooth' });

  // รอให้ scroll นิ่งก่อนค่อยวางตำแหน่ง ไม่งั้นได้พิกัดเก่า
  requestAnimationFrame(() => { layout(); requestAnimationFrame(layout); });
  card.querySelector('[data-tour="next"]')?.focus();
}

function step(n){
  idx = Math.max(0, Math.min(n, steps.length - 1));
  paintStep();
}

function end(finished){
  if (!host) return;
  window.removeEventListener('resize', layout);
  window.removeEventListener('scroll', layout, true);
  document.removeEventListener('keydown', onKey, true);
  host.remove();
  host = null;
  document.documentElement.classList.remove('tour-open');
  if (finished) onFinish?.();
}

function onKey(e){
  if (!host) return;
  if (e.key === 'Escape'){ e.preventDefault(); end(false); }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); idx < steps.length - 1 ? step(idx + 1) : end(true); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); step(idx - 1); }
}

/**
 * เปิดทัวร์
 * @param {object} opts
 * @param {Function} [opts.onDone] เรียกเมื่อผู้ใช้กดจนจบ (ไม่เรียกเมื่อกดข้าม)
 */
export function startTour({ onDone } = {}){
  if (host) return;
  onFinish = onDone;

  steps = STEPS.filter(s => s.center || resolve(s));
  if (steps.length < 2) return;      // จอเล็กมากจนไม่มีอะไรให้ชี้ ก็ไม่ต้องรบกวน
  idx = 0;

  host = document.createElement('div');
  host.className = 'tour';
  host.innerHTML = `
    <div class="tour-block"></div>
    <div class="tour-hole"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></div>`;
  document.body.appendChild(host);
  document.documentElement.classList.add('tour-open');

  host.addEventListener('click', e => {
    const act = e.target.closest('[data-tour]')?.dataset.tour;
    if (!act) return;
    if (act === 'skip') end(false);
    else if (act === 'prev') step(idx - 1);
    else if (idx === steps.length - 1) end(true);
    else step(idx + 1);
  });

  window.addEventListener('resize', layout);
  window.addEventListener('scroll', layout, true);
  document.addEventListener('keydown', onKey, true);

  paintStep();
}

export const tourRunning = () => !!host;
