/* ============================================================
   ai/assistant.js — ผู้ช่วย AI ประจำหน้า (ฝังได้ทุกหน้า)
   ------------------------------------------------------------
   แนวคิด: แทนที่จะมีแชทกลางตัวเดียวที่รู้ทุกเรื่องแบบผิว ๆ
   ให้แต่ละหน้ามีผู้ช่วยของตัวเองที่
     1) รู้ขอบเขตของหน้านั้น — ถามนอกเรื่องจะไม่ตอบ แต่ชี้ทางให้
     2) หา "ข้อมูลบนหน้าจอ" มาเองผ่าน context() ที่หน้านั้นให้ไว้
        จึงตอบจากตัวเลขจริงที่ผู้ใช้เห็นอยู่ ไม่ใช่ความรู้ทั่วไป
     3) มีคำถามแนะนำที่ตรงกับงานตรงหน้า

   หน้าใหม่ ๆ แค่ประกาศ scope แล้วเรียก panel()/mount() ก็ได้ผู้ช่วยทันที
   ============================================================ */

import { icon, esc, on, toast } from '../ui.js';
import { run, available, describe, lastStatus } from './client.js';

/* จำบทสนทนาของแต่ละขอบเขตไว้ระหว่างที่ยังอยู่ในหน้า (ไม่ต้องเก็บถาวร) */
const threads = new Map();
const threadOf = key => threads.get(key) || [];
const remember = (key, msg) => {
  const t = threadOf(key);
  t.push(msg);
  threads.set(key, t.slice(-8));
};
export const clearAssistant = key => threads.delete(key);

/**
 * @typedef {object} Scope
 * @property {string}   key         รหัสประจำขอบเขต ใช้แยกบทสนทนา
 * @property {string}   name        ชื่อหน้าที่ผู้ใช้เห็น
 * @property {string}   topics      เรื่องที่ตอบได้ (คั่นด้วย ·)
 * @property {string}   outOfScope  เรื่องที่ไม่ตอบ พร้อมบอกว่าควรไปไหน
 * @property {Function} context     () => string  ข้อมูลบนหน้าจอตอนนี้
 * @property {string[]} suggestions คำถามแนะนำ
 */

/** ส่วน HTML ของผู้ช่วย — วางไว้ตรงไหนของหน้าก็ได้ */
export function assistantPanel(scope, { collapsed = true } = {}){
  const st = lastStatus();
  const offline = st && !st.ok;

  return `
  <section class="assist" data-assist="${esc(scope.key)}" ${collapsed ? '' : 'data-open'}>
    <button class="assist-head" type="button" aria-expanded="${!collapsed}">
      <span class="assist-avatar">${icon('brain')}</span>
      <span class="assist-title">
        <b>ผู้ช่วยประจำหน้านี้</b>
        <span>${esc(scope.topics)}</span>
      </span>
      ${offline ? `<span class="pill plain assist-flag">${icon('shield')} AI ปิดอยู่</span>` : ''}
      <span class="assist-caret">${icon('chevD')}</span>
    </button>

    <div class="assist-body">
      <div class="assist-log" id="assist-log-${esc(scope.key)}">
        ${threadOf(scope.key).map(bubble).join('') || `
          <p class="assist-hint">
            ${icon('info')} ถามได้เฉพาะเรื่องบนหน้านี้ — ผู้ช่วยจะอ่านข้อมูลที่แสดงอยู่แล้วตอบจากตัวเลขจริง
          </p>`}
      </div>

      <div class="assist-chips">
        ${scope.suggestions.map(s => `<button type="button" data-assist-q="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>

      <form class="assist-form">
        <input type="text" placeholder="ถามเกี่ยวกับหน้านี้…" autocomplete="off" aria-label="ถามผู้ช่วยประจำหน้า">
        <button class="assist-send" type="submit" aria-label="ส่งคำถาม">${icon('send')}</button>
      </form>
    </div>
  </section>`;
}

function bubble(m){
  if (m.role === 'me')
    return `<div class="assist-msg me">${esc(m.text)}</div>`;

  if (m.error)
    return `<div class="assist-msg ai err">${icon('info')} ${esc(m.text)}</div>`;

  const off = m.inScope === false;
  return `<div class="assist-msg ai${off ? ' off' : ''}">
    ${off ? `<span class="assist-off">${icon('compass')} นอกขอบเขตของหน้านี้</span>` : ''}
    <p>${esc(m.text)}</p>
    ${m.points?.length ? `<ul>${m.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${m.redirect ? `<p class="assist-redirect">${icon('arrowR')} ${esc(m.redirect)}</p>` : ''}
  </div>`;
}

/**
 * เปิดใช้งานผู้ช่วยใน root
 * เรียกซ้ำได้ ตัวที่ผูกแล้วจะถูกข้าม
 */
export function mountAssistant(root, scope){
  const el = root.querySelector(`[data-assist="${scope.key}"]`);
  if (!el || el.__wired) return;
  el.__wired = true;

  const head = el.querySelector('.assist-head');
  const log  = el.querySelector('.assist-log');
  const form = el.querySelector('.assist-form');
  const input = form.querySelector('input');
  let busy = false;

  head.addEventListener('click', () => {
    const open = el.toggleAttribute('data-open');
    head.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => input.focus(), 180);
  });

  on(el, 'click', '[data-assist-q]', (e, b) => {
    input.value = b.dataset.assistQ;
    form.requestSubmit();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = '';
    busy = true;

    append({ role:'me', text:q });
    const typing = document.createElement('div');
    typing.className = 'assist-msg ai typing-wrap';
    typing.innerHTML = `<div class="typing"><i></i><i></i><i></i></div>`;
    log.appendChild(typing);
    down();

    const reply = await askScoped(scope, q);
    typing.remove();
    append({ role:'ai', ...reply });
    busy = false;
    input.focus();
  });

  function append(msg){
    log.querySelector('.assist-hint')?.remove();
    remember(scope.key, msg);
    log.insertAdjacentHTML('beforeend', bubble(msg));
    down();
  }
  const down = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/**
 * ถามผู้ช่วยโดยจำกัดขอบเขต
 * ไม่มีทางถอยไปเอนจินในเครื่อง เพราะการตอบคำถามอิสระต้องใช้โมเดลจริง
 * — ถ้า AI ไม่พร้อมจะบอกตรง ๆ แทนการเดา
 */
export async function askScoped(scope, question){
  if (!(await available())){
    const st = lastStatus();
    return { error:true, text: describe(st?.reason || 'unreachable') +
      ' — ส่วนอื่นของหน้านี้ยังใช้ได้ตามปกติ' };
  }

  const res = await run('assistant', {
    scope: scope.name,
    topics: scope.topics,
    outOfScope: scope.outOfScope,
    context: scope.context(),
    question,
  });

  if (!res.ok) return { error:true, text: res.message || describe(res.error) };

  const d = res.data || {};
  return {
    inScope: d.inScope !== false,
    text: String(d.answer || '').trim() || 'ไม่พบคำตอบจากข้อมูลบนหน้านี้',
    points: (d.points || []).filter(Boolean).slice(0, 4),
    redirect: String(d.redirect || '').trim(),
  };
}
