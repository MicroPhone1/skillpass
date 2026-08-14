/* ============================================================
   views/tutor.js — ติวเตอร์ AI (RAG) พร้อมแหล่งอ้างอิงทุกคำตอบ
   ------------------------------------------------------------
   แต่ละเส้นทางมี "ห้องแชท" ของตัวเอง เก็บแยกกันใน store
   สลับเส้นทาง = สลับห้อง ประวัติไม่ปนกันและอยู่ข้ามการปิดเปิดหน้า
   ============================================================ */

import { icon, on, esc, toast, dropdown, mountDropdowns } from '../ui.js';
import { state, questProgress, addXP, today, save,
         tutorThread, pushTutorMessage, clearTutorThread } from '../store.js';
import { TRACKS, trackById, hasTrack, skillName } from '../data/tracks.js';
import { ask, suggestions } from '../engine/tutor.js';
import { askTutor } from '../ai/roles.js';
import { sourceBadge } from '../ai/presentation.js';

let curTrack = null;
const pendingTracks = new Set(); // แต่ละห้องรอคำตอบได้อิสระ ไม่ทำให้ห้องอื่นค้างตาม

const intro = t => ({
  kind:'answer',
  lead:`สวัสดีครับ ผมเป็นติวเตอร์ประจำเส้นทาง “${t.name}”`,
  blocks:[{ text:'ถามได้ทั้งหลักการ วิธีคิดโจทย์ หรือปัญหาที่เจอหน้างาน ผมจะค้นจากคลังความรู้ของระบบแล้วตอบพร้อมบอกที่มาเสมอ หากไม่พบข้อมูลผมจะบอกตรง ๆ ว่าไม่มี ไม่เดาคำตอบให้' }],
  sources:[], hits:[],
});

export default {
  title: 'ติวเตอร์ AI',
  sub: () => 'ตอบจากคลังความรู้ที่ค้นเจอเท่านั้น พร้อมแสดงแหล่งอ้างอิง — ถ้าไม่รู้จะบอกว่าไม่รู้',

  render(ctx){
    curTrack = ctx.route.params.track || curTrack || state.activeTrack;
    if (!hasTrack(curTrack)) curTrack = state.activeTrack;

    return `
    <div class="stack" style="gap:14px;max-width:940px;margin:0 auto">

      <div class="tutor-bar">
        ${dropdown({ id:'tutor-track', label:'คลังความรู้ของเส้นทาง', value: curTrack, icon:'compass',
                     options: TRACKS.map(t => ({
                       value: t.id, label: t.name, icon: t.icon, sub: t.cert,
                       badge: tutorThread(t.id).filter(m => m.role === 'me').length || '',
                     })) })}
        <div class="tutor-bar-actions">
          <span class="pill plain" id="thread-count">${threadLabel(curTrack)}</span>
          <button class="btn btn-ghost btn-sm" data-clear
            ${tutorThread(curTrack).length ? '' : 'disabled'}>${icon('refresh')} ล้างประวัติ</button>
        </div>
      </div>

      <div class="card flush">
        <div class="chat-scroll" id="chat">${chatHTML(curTrack)}</div>
        <div class="suggest-row" id="suggest">${suggestHTML(curTrack)}</div>
        <form class="composer" id="composer">
          <input id="q" placeholder="พิมพ์คำถามของคุณ… เช่น “RCD ทำงานยังไง”" autocomplete="off">
          <button class="send" type="submit" aria-label="ส่ง">${icon('send')}</button>
        </form>
      </div>

      <div class="card" style="background:var(--blue-50);border-color:var(--blue-200)">
        <div class="card-head">
          <div class="track-ico" style="background:#fff">${icon('shield')}</div>
          <div>
            <h2>ทำไมติวเตอร์ตัวนี้ถึงไม่มั่ว</h2>
            <p style="font-size:13.5px;line-height:1.75;color:var(--ink-2);margin-top:6px">
              ระบบค้นหาข้อความจริงจากคลังความรู้ด้วย TF-IDF ก่อน แล้วจึงเรียบเรียงคำตอบ
              <b>จากข้อความที่ค้นเจอเท่านั้น</b> ไม่ได้แต่งขึ้นใหม่ ทุกคำตอบจึงตามรอยกลับไปยังเอกสารต้นทางได้
              ถ้าคะแนนความเกี่ยวข้องต่ำกว่าเกณฑ์ ระบบจะตอบว่า “ยังไม่มีข้อมูล” แทนการเดา
              — เวอร์ชันใช้งานจริงจะเปลี่ยนคลังนี้เป็นเอกสารหลักสูตรและมาตรฐานฉบับเต็ม
            </p>
          </div>
        </div>
      </div>
    </div>`;
  },

  mount(root, ctx){
    const chat  = root.querySelector('#chat');
    const input = root.querySelector('#q');
    mountDropdowns(root);
    const picker = root.querySelector('#tutor-track');
    scrollDown(chat);

    /* เข้ามาพร้อม ?skill= → ให้ติวเตอร์สรุปเรื่องนั้นทันที (ครั้งเดียว) */
    const p = ctx.route.params;
    if (p.skill){
      const label = `ขอสรุปหลักการเรื่อง ${skillName(curTrack, p.skill)}`;
      const t = tutorThread(curTrack);
      if (t[t.length - 1]?.text !== label){
        sendQuestion(label, { reward:false });
      }
    }

    /* ---------- สลับเส้นทาง = สลับห้องแชท ---------- */
    picker?.addEventListener('change', () => {
      curTrack = picker.value;
      chat.innerHTML = chatHTML(curTrack);
      root.querySelector('#suggest').innerHTML = suggestHTML(curTrack);
      refreshBar(root);
      scrollDown(chat);
      input.focus();
    });

    on(root, 'click', '[data-clear]', () => {
      if (!tutorThread(curTrack).length) return;
      if (!confirm(`ล้างประวัติการคุยของ “${trackById(curTrack).name}” ทั้งหมด?`)) return;
      clearTutorThread(curTrack);
      chat.innerHTML = chatHTML(curTrack);
      refreshBar(root);
      toast('ล้างประวัติห้องนี้แล้ว', 'ok');
    });

    on(root, 'click', '[data-q]', (e, t) => { input.value = t.dataset.q; send(); });

    root.querySelector('#composer').addEventListener('submit', e => { e.preventDefault(); send(); });

    function send(){
      const q = input.value.trim();
      if (!q || pendingTracks.has(curTrack)) return;
      input.value = '';
      sendQuestion(q);
    }

    function sendQuestion(question, { reward = true } = {}){
      const trackAtSend = curTrack;
      appendMessage(chat, { role:'me', text:question });

      if (reward){
        questProgress('tutor');
        today().tutor = (today().tutor || 0) + 1;
        if (today().tutor === 1) addXP(10, 'ถามติวเตอร์');
        save();
      }

      // ไม่ส่งคำถามปัจจุบันซ้ำใน history เพราะมีช่อง question แยกอยู่แล้ว
      const history = tutorThread(trackAtSend).slice(0, -1);
      respond(root, trackAtSend, askTutor(question, { trackId:trackAtSend, history }), question);
    }
  },
};

/* ------------------------------------------------------------ rendering */
function chatHTML(trackId){
  const t = trackById(trackId);
  const thread = tutorThread(trackId);
  return bubble({ role:'ai', res: intro(t) })
    + (thread.length
        ? thread.map(bubble).join('')
        : `<p class="chat-hint">${icon('quote')} ห้องนี้ยังไม่มีประวัติการคุย — เริ่มจากคำถามแนะนำด้านล่างได้เลย</p>`)
    + (pendingTracks.has(trackId) ? typingBubble(trackId) : '');
}

const suggestHTML = trackId =>
  suggestions(trackId).map(s => `<button data-q="${esc(s)}">${esc(s)}</button>`).join('');

const threadLabel = trackId => {
  const n = tutorThread(trackId).filter(m => m.role === 'me').length;
  return n ? `${n} คำถามในห้องนี้` : 'ห้องใหม่';
};

function refreshBar(root){
  const chip = root.querySelector('#thread-count');
  if (chip) chip.textContent = threadLabel(curTrack);
  const btn = root.querySelector('[data-clear]');
  if (btn) btn.disabled = !tutorThread(curTrack).length || pendingTracks.has(curTrack);
  const input = root.querySelector('#q');
  const send = root.querySelector('.composer .send');
  const busy = pendingTracks.has(curTrack);
  if (input) input.disabled = busy;
  if (send) send.disabled = busy;
}

/** เพิ่มข้อความลงห้องแชทของเส้นทางปัจจุบัน แล้ววาดต่อท้าย */
function appendMessage(chat, msg){
  pushTutorMessage(curTrack, msg);
  chat.querySelector('.chat-hint')?.remove();
  chat.insertAdjacentHTML('beforeend', bubble(msg));
  scrollDown(chat);
}

async function respond(root, trackAtSend, request, question){
  pendingTracks.add(trackAtSend);
  let chat = root.querySelector('#chat');
  if (trackAtSend === curTrack){
    chat?.insertAdjacentHTML('beforeend', typingBubble(trackAtSend));
    if (chat) scrollDown(chat);
    refreshBar(root);
  }

  let res;
  try{
    res = await request;
  }catch{
    // ป้องกันข้อผิดพลาดนอกสัญญาของ gateway ไม่ให้ห้องแชทค้างถาวร
    res = { ...ask(question, { trackId:trackAtSend }), source:'local' };
  }

  pendingTracks.delete(trackAtSend);
  pushTutorMessage(trackAtSend, { role:'ai', res });

  // ผู้ใช้อาจออกจากหน้าแล้วกลับมาก่อนคำตอบถึง — ต้องหา view ปัจจุบัน
  // แทนการวาดลง root เก่าที่ router ถอดออกจาก DOM ไปแล้ว
  const liveRoot = document.querySelector('#view');
  if (trackAtSend === curTrack && liveRoot?.querySelector('#chat')){
    chat = liveRoot.querySelector('#chat');
    chat?.querySelector(`[data-typing="${trackAtSend}"]`)?.remove();
    chat?.insertAdjacentHTML('beforeend', bubble({ role:'ai', res }));
    if (chat) scrollDown(chat);
    refreshBar(liveRoot);
  }
}

const typingBubble = trackId => `
  <div class="msg" data-typing="${esc(trackId)}" aria-label="ติวเตอร์กำลังตอบ">
    <div class="av">${icon('brain')}</div>
    <div class="bub"><div class="typing"><i></i><i></i><i></i></div>
      <span class="tiny muted">กำลังค้นคลังความรู้และเรียบเรียงคำตอบ…</span></div>
  </div>`;

function bubble(m){
  if (m.role === 'me'){
    return `<div class="msg me"><div class="av">${icon('people')}</div>
      <div class="bub">${esc(m.text)}</div></div>`;
  }
  const r = m.res;
  const body = `
    ${sourceBadge(r.source, { aiLabel:'ตอบโดย AI', localLabel:'ตอบในเครื่อง' })}
    ${r.lead ? `<p style="font-weight:600">${esc(r.lead)}</p>` : ''}
    ${r.blocks.map(b => `
      ${b.h ? `<h5>${esc(b.h)}</h5>` : ''}
      ${b.list ? `<ul class="b">${b.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
               : `<p style="margin-top:4px">${esc(b.text)}</p>`}
    `).join('')}
    ${r.sources?.length ? `<div class="sources">
      ${r.sources.map(s => `<span class="src-chip">${icon('book')} ${esc(s.title)} · ${esc(s.ref)}</span>`).join('')}
    </div>` : ''}
    ${r.hits?.length ? `<div class="tiny muted" style="margin-top:8px">
      ค้นเจอ ${r.hits.length} รายการ · คะแนนความเกี่ยวข้องสูงสุด ${r.hits[0].score}
    </div>` : ''}`;

  return `<div class="msg"><div class="av">${icon(r.kind === 'nohit' ? 'info' : 'brain')}</div>
    <div class="bub"${r.kind === 'nohit' ? ' style="border-color:var(--warn);background:var(--warn-soft)"' : ''}>${body}</div></div>`;
}

const scrollDown = el => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
