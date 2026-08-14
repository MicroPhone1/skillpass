/* ============================================================
   views/community.js — คอมมูนิตี้ช่างฝีมือและผู้เรียน
   ============================================================ */

import { icon, on, esc, timeAgo, avatarColor, initials, toast, modal, scoreTone, paint } from '../ui.js';
import { state, addPost, toggleLike, addXP, displayName } from '../store.js';
import { SEED_POSTS, TAGS } from '../data/community.js';
import { TRACKS, trackById } from '../data/tracks.js';
import { drillById } from '../data/drills.js';

let filter = 'all';

const allPosts = () => [...state.posts, ...SEED_POSTS].sort((a, b) => b.at - a.at);

const view = {
  title: 'คอมมูนิตี้',
  sub: () => 'ถามปัญหาหน้างานจริง แชร์เทคนิค และแลกเปลี่ยนกับคนที่ทำงานสายเดียวกัน',

  render(){
    const posts = allPosts().filter(p => filter === 'all' || p.tag === filter || p.track === filter);

    return `
    <div class="stack" style="gap:18px">
      <section class="g-side">
        <div class="stack" style="gap:16px">

          <div class="card">
            <button class="row" data-compose style="width:100%;gap:12px;text-align:left">
              <span class="avatar" style="background:${avatarColor(displayName())}">${esc(initials(displayName()))}</span>
              <span class="small muted" style="flex:1;padding:10px 16px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-pill)">
                มีอะไรอยากถามหรือแชร์วันนี้?
              </span>
              <span class="btn btn-primary btn-sm" style="flex:none">${icon('plus')} โพสต์</span>
            </button>
          </div>

          <div class="row" style="gap:8px;overflow-x:auto;padding-bottom:2px">
            <button class="btn btn-sm ${filter==='all'?'btn-primary':'btn-ghost'}" data-tag="all">ทั้งหมด</button>
            ${TAGS.map(t => `<button class="btn btn-sm ${filter===t?'btn-primary':'btn-ghost'}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>

          <div class="card">
            ${posts.length ? posts.map(postCard).join('') : `
              <div class="empty">${icon('people')}<h3>ยังไม่มีโพสต์ในหมวดนี้</h3><p>ลองเปลี่ยนตัวกรอง หรือเป็นคนแรกที่เริ่มบทสนทนา</p></div>`}
          </div>
        </div>

        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-head"><div><h2>หัวข้อที่คนคุยกันมาก</h2></div></div>
            <div class="stack" style="gap:0">
              ${TAGS.map(t => {
                const n = allPosts().filter(p => p.tag === t).length;
                return `<button class="rubric-row" data-tag="${esc(t)}" style="width:100%;text-align:left">
                  <span class="r-name">#${esc(t)}</span>
                  <span class="r-score">${n}</span>
                </button>`;
              }).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>กรองตามเส้นทาง</h2></div></div>
            <div class="row tight">
              ${[...new Set(allPosts().map(p => p.track))].map(id => `
                <button class="pill" data-tag="${id}">${icon(trackById(id).icon)} ${esc(trackById(id).name)}</button>`).join('')}
            </div>
          </div>

          <div class="card" style="background:var(--blue-50);border-color:var(--blue-200)">
            <div class="card-head">
              <div class="track-ico" style="background:#fff">${icon('heart')}</div>
              <div><h2>กติกาของห้องนี้</h2></div>
            </div>
            <ul class="stack" style="gap:8px">
              ${['ถามให้ละเอียด: บอกอาการ สิ่งที่ลองแล้ว และค่าที่วัดได้',
                 'ตอบด้วยเหตุผล ไม่ใช่แค่ผลลัพธ์ — คนอ่านจะได้เรียนรู้ด้วย',
                 'เรื่องความปลอดภัยสำคัญกว่าความเร็ว เตือนกันได้เสมอ',
                 'ห้ามแนะนำวิธีที่เสี่ยงอันตรายหรือผิดมาตรฐาน'
                ].map(r => `<li class="small muted" style="line-height:1.65">• ${esc(r)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </section>
    </div>`;
  },

  mount(root, ctx){
    on(root, 'click', '[data-tag]', (e, t) => {
      filter = t.dataset.tag;
      rerender(ctx);
    });

    on(root, 'click', '[data-like]', (e, t) => {
      const added = toggleLike(t.dataset.like);
      const n = +t.dataset.n + (added ? 1 : 0);
      t.innerHTML = icon('heart') + ` <span>${n}</span>`;
      t.style.color = added ? 'var(--bad)' : '';
    });

    on(root, 'click', '[data-answers]', (e, t) => {
      const box = root.querySelector(`#ans-${t.dataset.answers}`);
      if (!box) return;
      const open = box.classList.toggle('u-hide') === false;
      t.querySelector('span').textContent = open ? 'ซ่อนคำตอบ' : `${t.dataset.n} คำตอบ`;
    });

    on(root, 'click', '[data-compose]', () => openComposer(ctx));
  },
};

export default view;

/* ------------------------------------------------------------ */
function postCard(p){
  const liked = state.liked.includes(p.id);
  const likes = (p.likes || 0) + (liked ? 1 : 0);
  const answers = p.answers || p.replies || [];
  const accepted = answers.find(a => a.accepted);

  return `
  <article class="post">
    <div class="p-head">
      <span class="avatar" style="background:${avatarColor(p.author)}">${esc(initials(p.author))}</span>
      <div style="flex:1;min-width:0">
        <b style="font-size:13.5px">${esc(p.author)}</b>
        <div class="tiny muted">${esc(p.role || '')} · ${timeAgo(p.at)}</div>
      </div>
      <span class="pill plain">${icon(trackById(p.track).icon)} ${esc(trackById(p.track).name)}</span>
    </div>

    <h3 class="p-title">${esc(p.title)}</h3>
    ${p.body ? `<p class="p-body">${esc(p.body)}</p>` : ''}
    ${p.score !== undefined ? `<div class="row tight" style="margin-top:9px">
      <span class="pill ${scoreTone(p.score)==='ok'?'ok':'warn'}">${icon('camera')} คะแนนฝึก ${p.score}%
        ${p.drillId ? '· ' + esc(drillById(p.drillId)?.name || '') : ''}</span>
    </div>` : ''}

    ${accepted ? `<div class="answer-box">
      <div class="row tight" style="margin-bottom:6px">
        ${icon('check')}<b>คำตอบที่ถูกเลือก</b>
        <span class="tiny muted">· ${esc(accepted.author)}</span>
      </div>
      ${esc(accepted.text)}
    </div>` : ''}

    <div class="p-meta">
      <span class="pill plain">#${esc(p.tag)}</span>
      <button data-like="${p.id}" data-n="${p.likes || 0}" style="${liked ? 'color:var(--bad)' : ''}">
        ${icon('heart')} <span>${likes}</span>
      </button>
      ${answers.length ? `<button data-answers="${p.id}" data-n="${answers.length}">
        ${icon('reply')} <span>${answers.length} คำตอบ</span></button>` : `
        <span>${icon('reply')} ยังไม่มีคำตอบ</span>`}
    </div>

    ${answers.length ? `
    <div class="u-hide" id="ans-${p.id}" style="margin-top:12px;padding-left:14px;border-left:2px solid var(--line)">
      ${answers.map(a => `
        <div style="padding:11px 0;border-bottom:1px dashed var(--line-soft)">
          <div class="row tight" style="margin-bottom:5px">
            <span class="avatar" style="width:24px;height:24px;font-size:10px;background:${avatarColor(a.author)}">${esc(initials(a.author))}</span>
            <b style="font-size:12.5px">${esc(a.author)}</b>
            ${a.accepted ? `<span class="pill ok">${icon('check')} คำตอบที่ถูกเลือก</span>` : ''}
          </div>
          <p class="small" style="line-height:1.75;color:var(--ink-2)">${esc(a.text)}</p>
        </div>`).join('')}
    </div>` : ''}
  </article>`;
}

/* ------------------------------------------------------------ composer */
function openComposer(ctx){
  const last = state.drillHistory[0];
  const m = modal(`
    <h2>ตั้งกระทู้ใหม่</h2>
    <p class="small muted" style="margin-top:4px">โพสต์จะถูกเก็บในเครื่องคุณเท่านั้น (ต้นแบบสาธิต)</p>

    <label class="small" style="font-weight:600;display:block;margin:16px 0 6px">เส้นทาง</label>
    <select id="c-track" class="num-input" style="font-family:var(--font);font-size:14px">
      ${TRACKS.map(t => `<option value="${t.id}"${t.id === state.activeTrack ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
    </select>

    <label class="small" style="font-weight:600;display:block;margin:14px 0 6px">หมวด</label>
    <div class="row tight" id="c-tags">
      ${TAGS.map((t, i) => `<button class="btn btn-sm ${i===0?'btn-primary':'btn-ghost'}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>

    <label class="small" style="font-weight:600;display:block;margin:14px 0 6px">หัวข้อ</label>
    <input id="c-title" class="num-input" style="font-family:var(--font);font-size:14px" placeholder="เช่น RCD ตัดบ่อยเฉพาะตอนฝนตก เกิดจากอะไร">

    <label class="small" style="font-weight:600;display:block;margin:14px 0 6px">รายละเอียด</label>
    <textarea id="c-body" class="num-input" rows="4" style="font-family:var(--font);font-size:14px;resize:vertical"
      placeholder="เล่าอาการ สิ่งที่ลองแล้ว และค่าที่วัดได้"></textarea>

    ${last ? `<label class="row" style="gap:9px;margin-top:14px;cursor:pointer">
      <input type="checkbox" id="c-attach" style="width:17px;height:17px;accent-color:var(--blue-600)">
      <span class="small">แนบผลฝึกล่าสุด: ${esc(drillById(last.drillId)?.name || '')} (${last.score}%)</span>
    </label>` : ''}

    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" id="c-post">${icon('send')} โพสต์</button>
    </div>`);

  let tag = TAGS[0];
  on(m.el, 'click', '[data-t]', (e, t) => {
    tag = t.dataset.t;
    m.el.querySelectorAll('[data-t]').forEach(b => b.className = 'btn btn-sm ' + (b === t ? 'btn-primary' : 'btn-ghost'));
  });

  m.el.querySelector('#c-post').addEventListener('click', () => {
    const title = m.el.querySelector('#c-title').value.trim();
    if (!title) return toast('ใส่หัวข้อก่อนนะครับ', 'bad');
    const attach = m.el.querySelector('#c-attach')?.checked;
    addPost({
      track: m.el.querySelector('#c-track').value,
      tag, title,
      body: m.el.querySelector('#c-body').value.trim(),
      author: displayName(), role: state.profile.title || state.profile.school || 'ผู้เรียน',
      likes: 0, answers: [],
      ...(attach && last ? { score: last.score, drillId: last.drillId } : {}),
    });
    addXP(15, 'แบ่งปันในคอมมูนิตี้');
    m.close();
    rerender(ctx);
    toast('โพสต์เรียบร้อย', 'ok');
  });
}

/* paint() ล้าง listener ของรอบก่อน — ถ้าไม่ล้าง การกดตัวกรองครั้งที่สอง
   จะ mount ซ้อนกันแบบทวีคูณ (1 → 2 → 4 → 8 handler) จนหน้าค้าง */
function rerender(ctx){
  const root = document.querySelector('#view');
  paint(root, view.render(ctx));
  view.mount(root, ctx);
}
