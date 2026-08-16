/* ============================================================
   views/lab.js — ห้องฝึกหน้ากล้อง (Practice Lab)
   เปิดกล้อง/ไมค์จริง วิเคราะห์สด แล้วให้คะแนนตาม rubric
   ============================================================ */

import { icon, on, esc, mmss, ring, toast, scoreTone, timeAgo, paint } from '../ui.js';
import { state, pushDrill, addXP, questProgress, grantBadge, skillStat, save } from '../store.js';
import { DRILLS, drillById, drillsFor, MODE_LABEL, MODE_ICON } from '../data/drills.js';
import { TRACKS, trackById, skillName } from '../data/tracks.js';
import { PracticeEngine, Metronome, hasMultipleCameras, savedFacing,
         shouldMirror } from '../engine/vision.js';
import { autoIssue, celebrate } from '../certificate.js';

let engine = null;
let metro = null;
let phase = 'brief';     // brief | live | result
let result = null;
let liveState = {};
let stepsDone = [];

export default {
  title: ctx => ctx.route.sub ? drillById(ctx.route.sub)?.name || 'ห้องฝึกกล้อง' : 'ห้องฝึกกล้อง',
  sub: ctx => ctx.route.sub
    ? `${trackById(drillById(ctx.route.sub)?.track || 'electrician').name} · ${MODE_LABEL[drillById(ctx.route.sub)?.mode] || ''}`
    : 'ใช้กล้องตรวจว่าคุณ “ทำถูกไหม” ไม่ใช่แค่ “รู้ไหม”',

  render(ctx){
    const d = ctx.route.sub && drillById(ctx.route.sub);
    if (!d) return listView();
    if (phase === 'result') return resultView(d);
    if (phase === 'live')   return liveView(d);
    return briefView(d);
  },

  mount(root, ctx){
    const d = ctx.route.sub && drillById(ctx.route.sub);
    if (!d) return;
    if (phase === 'result') return mountResult(root, d, ctx);
    if (phase === 'live')   return mountLive(root, d, ctx);
    mountBrief(root, d, ctx);
  },

  unmount(){
    engine?.stop(); engine = null;
    metro?.stop();  metro = null;
    phase = 'brief'; result = null; liveState = {}; stepsDone = [];
  },
};

/* ============================================================
   LIST
   ============================================================ */
function listView(){
  const byMode = {};
  for (const d of DRILLS) (byMode[d.mode] ||= []).push(d);
  const hist = state.drillHistory;

  return `
  <div class="stack" style="gap:20px">
    <section class="hero">
      <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
        ${icon('camera')} ใช้กล้องบนเครื่องนี้ · ไม่มีการอัปโหลดภาพ
      </span>
      <h2 style="margin-top:12px">ฝึกด้วยมือจริง แล้วให้ระบบตรวจให้</h2>
      <p>ข้อสอบวัดได้แค่ว่าคุณ “รู้” — แต่ใบเซอร์สายปฏิบัติวัดว่าคุณ “ทำเป็น”
         ห้องฝึกนี้ใช้กล้องวิเคราะห์จังหวะ ความนิ่ง ตำแหน่ง และลำดับขั้นตอนของคุณแบบเรียลไทม์</p>
    </section>

    <div class="grid g4">
      ${Object.entries({
        tempo:'จับจังหวะการเคลื่อนไหวซ้ำ ๆ',
        steady:'วัดการสั่นของมือ',
        sequence:'ตรวจว่าทำครบและถูกลำดับ',
        frame:'ตรวจการวางตัวและการโยกตัว',
      }).map(([m, desc]) => `
        <div class="tile">
          <div class="q-ico" style="background:var(--cyan-soft);color:var(--cyan);margin-bottom:8px">${icon(MODE_ICON[m])}</div>
          <div class="t-lbl" style="font-size:13px;color:var(--ink)">${MODE_LABEL[m]}</div>
          <div class="t-sub" style="line-height:1.5;margin-top:3px">${desc}</div>
        </div>`).join('')}
    </div>

    ${TRACKS.filter(t => drillsFor(t.id).length).map(t => `
      <section>
        <div class="section-title">${icon(t.icon)} ${esc(t.name)}</div>
        <div class="grid g3">
          ${drillsFor(t.id).map(d => {
            const last = hist.find(h => h.drillId === d.id);
            return `
            <a class="track-card" href="#/lab/${d.id}">
              <div class="row" style="gap:12px;align-items:flex-start">
                <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon(d.icon)}</div>
                <div style="flex:1;min-width:0">
                  <h3>${esc(d.name)}</h3>
                  <div class="t-cert">${esc(d.short)}</div>
                </div>
                ${last ? `<div style="text-align:right;flex:none">
                  <div class="num" style="font-weight:700;font-size:17px;color:var(--${scoreTone(last.score)==='ok'?'ok':scoreTone(last.score)==='warn'?'warn':'bad'})">${last.score}</div>
                  <div class="tiny muted">ล่าสุด</div></div>` : ''}
              </div>
              <div class="row tight">
                <span class="pill cyan">${icon(MODE_ICON[d.mode])} ${MODE_LABEL[d.mode]}</span>
                <span class="pill plain">${esc(d.level)}</span>
                ${d.needsMic ? `<span class="pill violet">${icon('mic')} ใช้ไมค์</span>` : ''}
              </div>
            </a>`;
          }).join('')}
        </div>
      </section>`).join('')}

    ${hist.length ? `
    <section class="card">
      <div class="card-head"><div><h2>ประวัติการฝึกล่าสุด</h2></div></div>
      <div class="stack" style="gap:0">
        ${hist.slice(0, 6).map(h => {
          const d = drillById(h.drillId);
          return `<a class="rubric-row" href="#/lab/${h.drillId}" style="color:inherit;text-decoration:none">
            <div class="q-ico" style="background:var(--cyan-soft);color:var(--cyan);width:34px;height:34px">${icon(d?.icon || 'camera')}</div>
            <div class="r-name"><b style="font-weight:600">${esc(d?.name || h.drillId)}</b><br>
              <span class="tiny muted">${timeAgo(h.at)}</span></div>
            <div class="r-score" style="color:var(--${scoreTone(h.score)==='ok'?'ok':scoreTone(h.score)==='warn'?'warn':'bad'})">${h.score}%</div>
          </a>`;
        }).join('')}
      </div>
    </section>` : ''}

    <div class="card" style="border-color:var(--brand-200);background:var(--brand-50)">
      <div class="card-head">
        <div class="track-ico" style="background:#fff">${icon('shield')}</div>
        <div>
          <h2>ความเป็นส่วนตัวและข้อจำกัด</h2>
          <p style="font-size:13.5px;line-height:1.75;color:var(--ink-2);margin-top:6px">
            ภาพจากกล้องถูกประมวลผลในเบราว์เซอร์บนเครื่องคุณเท่านั้น ไม่มีการส่งออกหรือบันทึกวิดีโอ
            ระบบเก็บเฉพาะ “คะแนน” ลงในเครื่องคุณ<br><br>
            ต้นแบบนี้ใช้การวิเคราะห์การเคลื่อนไหวแบบ frame differencing ซึ่งวัดจังหวะ ความนิ่ง
            ตำแหน่ง และลำดับได้จริง แต่ยังไม่ใช่การรู้จำท่าทางแบบเต็มรูปแบบ —
            เวอร์ชันใช้งานจริงควรต่อยอดด้วยโมเดลตรวจจับโครงร่าง (pose estimation) เพื่อวัดมุมข้อต่อและความลึกได้ด้วย
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   BRIEF
   ============================================================ */
function briefView(d){
  const t = trackById(d.track);
  const last = state.drillHistory.find(h => h.drillId === d.id);

  return `
  <div class="stack" style="gap:18px;max-width:900px;margin:0 auto">
    <a class="btn btn-ghost btn-sm" href="#/lab" style="align-self:flex-start">${icon('arrowL')} บทฝึกทั้งหมด</a>

    <section class="card pad-lg">
      <div class="card-head">
        <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan);width:54px;height:54px">${icon(d.icon)}</div>
        <div style="flex:1">
          <h2 style="font-size:20px">${esc(d.name)}</h2>
          <p>${esc(t.name)} · ทักษะ “${esc(skillName(d.track, d.skill))}”</p>
          <div class="row tight" style="margin-top:8px">
            <span class="pill cyan">${icon(MODE_ICON[d.mode])} ${MODE_LABEL[d.mode]}</span>
            <span class="pill plain">${esc(d.level)}</span>
            <span class="pill plain">${icon('clock')} ~${d.minutes} นาที</span>
            ${d.needsMic ? `<span class="pill violet">${icon('mic')} ใช้ไมโครโฟน</span>` : `<span class="pill plain">${icon('camera')} ใช้กล้อง</span>`}
          </div>
        </div>
        ${last ? `<div style="text-align:center;flex:none">
          ${ring(last.score/100, { size:76, stroke:8, label:last.score, sub:'ล่าสุด' })}
        </div>` : ''}
      </div>

      <p style="font-size:14.5px;line-height:1.8;margin-top:6px">${esc(d.intro)}</p>

      ${d.safety ? `<div class="explain" style="border-left-color:var(--bad);background:var(--bad-soft);margin-top:16px">
        <h4 style="color:#B32B2B">${icon('shield')} ข้อควรระวังด้านความปลอดภัย</h4>
        <p class="small" style="line-height:1.7">${esc(d.safety)}</p>
      </div>` : ''}

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:20px">
        <div>
          <div class="section-title" style="margin-top:0">${icon('zone')} เตรียมพื้นที่</div>
          <ol class="steps" style="counter-reset:s">${d.setup.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>
        <div>
          <div class="section-title" style="margin-top:0">${icon('chart')} เกณฑ์ให้คะแนน</div>
          <div class="stack" style="gap:0">
            ${d.rubric.map(r => `<div class="rubric-row">
              <span class="r-name">${esc(r.name)}</span>
              <span class="r-score" style="color:var(--brand-600)">${r.weight}%</span>
            </div>`).join('')}
          </div>
        </div>
      </div>

      ${d.config.steps ? `
        <div class="section-title">${icon('sequence')} ลำดับที่ต้องทำ</div>
        <ol class="steps">${d.config.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}

      <div class="row" style="margin-top:22px">
        <button class="btn btn-primary btn-lg" data-start>
          ${icon(d.needsMic ? 'mic' : 'camera')} ${d.needsMic ? 'เปิดไมโครโฟนแล้วเริ่ม' : 'เปิดกล้องแล้วเริ่ม'}
        </button>
        <span class="tiny muted">เบราว์เซอร์จะขออนุญาตก่อน — กด “อนุญาต”</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>เคล็ดลับจากผู้สอน</h2></div></div>
      <ul class="stack" style="gap:9px">
        ${d.tips.map(tp => `<li class="row" style="gap:10px;align-items:flex-start">
          <span style="color:var(--warn);flex:none;margin-top:2px">${icon('bulb')}</span>
          <span class="small" style="line-height:1.7">${esc(tp)}</span>
        </li>`).join('')}
      </ul>
    </section>
  </div>`;
}

function mountBrief(root, d, ctx){
  on(root, 'click', '[data-start]', async (e, btn) => {
    btn.disabled = true;
    btn.innerHTML = icon('refresh') + ' กำลังเปิด…';
    phase = 'live'; liveState = {}; stepsDone = [];
    rerender(ctx);
  });
}

/* ============================================================
   LIVE
   ============================================================ */
function liveView(d){
  const showSteps = d.mode === 'sequence' || d.mode === 'zone';
  return `
  <div class="lab-grid">
    <div>
      <div class="cam-stage" id="stage">
        <video id="cam" playsinline muted></video>
        <canvas class="overlay" id="ov"></canvas>
        <div class="cam-hud" id="hud"></div>
        <div class="cam-cue" id="cue">กำลังเปิดกล้อง…</div>
        <div class="cam-bar">
          <button class="cbtn" data-stop>${icon('stop')} หยุดและดูผล</button>
          ${d.mode === 'tempo' ? `<button class="cbtn" data-metro>${icon('wave')} เมโทรนอม</button>` : ''}
          ${d.needsMic ? '' : `<button class="cbtn" data-flip hidden>${icon('refresh')} สลับกล้อง</button>`}
        </div>
      </div>
      <p class="tiny muted" style="margin-top:10px;text-align:center">
        ภาพประมวลผลในเครื่องคุณเท่านั้น ไม่มีการอัปโหลดหรือบันทึกวิดีโอ
      </p>
    </div>

    <div class="stack" style="gap:14px">
      <div class="card">
        <div class="card-head"><div><h2>${esc(d.name)}</h2><p>${MODE_LABEL[d.mode]}</p></div></div>
        <div id="live-metrics" class="stack" style="gap:12px"></div>
      </div>

      ${d.mode === 'tempo' ? `
      <div class="card">
        <div class="card-head"><div><h2>เมโทรนอมช่วยจับจังหวะ</h2><p>เป้าหมาย ${d.config.guideBpm} ครั้ง/นาที</p></div></div>
        <div class="metronome"><span class="dot" id="metro-dot"></span>
          <span class="small" id="metro-label">ปิดอยู่ — กดปุ่มบนหน้าจอกล้องเพื่อเปิด</span></div>
      </div>` : ''}

      ${showSteps ? `
      <div class="card">
        <div class="card-head"><div><h2>${d.mode === 'sequence' ? 'ลำดับขั้นตอน' : 'คำสั่ง'}</h2></div></div>
        <div class="step-list" id="steps">
          ${(d.config.steps || d.config.prompts.map(p => p.text)).map((s, i) => `
            <div class="step-row" data-step="${i}">
              <span class="st-mark">${i + 1}</span><span>${esc(s)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-head"><div><h2>เคล็ดลับ</h2></div></div>
        <ul class="stack" style="gap:8px">
          ${d.tips.slice(0, 2).map(t => `<li class="small muted" style="line-height:1.65">• ${esc(t)}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>`;
}

function mountLive(root, d, ctx){
  const video = root.querySelector('#cam');
  const ov    = root.querySelector('#ov');
  const cue   = root.querySelector('#cue');
  const hud   = root.querySelector('#hud');
  const met   = root.querySelector('#live-metrics');

  const setCue = (text, tone) => {
    cue.textContent = text;
    cue.className = 'cam-cue' + (tone ? ' ' + tone : '');
  };

  engine = new PracticeEngine(d, {
    video, overlay: ov,
    onTick: s => { liveState = s; paintHud(hud, met, d, s); },
    onEvent: ev => {
      if (ev.type === 'cue') setCue(ev.text, ev.tone);
      if (ev.type === 'step' && ev.ok) markStep(root, ev.index, 'done');
      if (ev.type === 'step' && !ev.ok) flashStep(root, ev.index);
      if (ev.type === 'prompt') markStep(root, ev.round, 'active');
      if (ev.type === 'hit')  markStep(root, engine.round - 1, 'done');
      if (ev.type === 'miss') markStep(root, engine.round - 1, 'fail');
      if (ev.type === 'beat') pulseMetro(root);
    },
    onDone: r => {
      result = r;
      finishDrill(r, d);
      phase = 'result';
      rerender(ctx);
    },
  });

  /* ปุ่มสลับกล้องโผล่เฉพาะเครื่องที่มีกล้องมากกว่าหนึ่งตัว
     โน้ตบุ๊กที่มีกล้องหน้าตัวเดียวจะไม่เห็นปุ่มที่กดแล้วไม่เกิดอะไรขึ้น */
  let revealFlip = null;
  const flipBtn = root.querySelector('[data-flip]');
  if (flipBtn){
    const stage = root.querySelector('#stage');
    const paintFacing = f => { stage.dataset.mirror = shouldMirror(f) ? '1' : '0'; };
    paintFacing(savedFacing());

    /* เบราว์เซอร์มือถือหลายตัวไม่ยอมบอกรายชื่อกล้องจนกว่าผู้ใช้จะกดอนุญาตก่อน
       เช็กครั้งเดียวตอนเปิดหน้าจึงพลาดได้ ต้องเช็กซ้ำหลังกล้องติดแล้วด้วย */
    revealFlip = () => hasMultipleCameras().then(many => { if (many) flipBtn.hidden = false; });
    revealFlip();

    flipBtn.addEventListener('click', async () => {
      flipBtn.disabled = true;
      const now = await engine.flipCamera();
      paintFacing(now);
      flipBtn.disabled = false;
      toast(now === 'environment' ? 'ใช้กล้องหลังแล้ว' : 'ใช้กล้องหน้าแล้ว', 'ok', 1600);
    });
  }

  engine.start().then(() => {
    // กล้องติดแล้ว ตอนนี้เบราว์เซอร์ยอมบอกรายชื่ออุปกรณ์ครบ เช็กซ้ำให้ปุ่มโผล่ถูกต้อง
    revealFlip?.();
  }).catch(err => {
    setCue('เปิดไม่สำเร็จ', 'bad');
    root.querySelector('#stage').innerHTML = `
      <div class="cam-placeholder">
        ${icon('camera')}
        <h3>เปิด${d.needsMic ? 'ไมโครโฟน' : 'กล้อง'}ไม่สำเร็จ</h3>
        <p>${esc(err.message)}</p>
        <div class="row" style="justify-content:center;margin-top:16px">
          <a class="btn btn-ghost btn-sm" href="#/lab/${d.id}" onclick="location.reload()">ลองอีกครั้ง</a>
        </div>
      </div>`;
  });

  on(root, 'click', '[data-stop]', () => engine?.finish());
  on(root, 'click', '[data-metro]', (e, btn) => {
    metro ||= new Metronome(d.config.guideBpm || 110);
    const on_ = metro.toggle(() => pulseMetro(root));
    btn.classList.toggle('rec', on_);
    const lbl = root.querySelector('#metro-label');
    if (lbl) lbl.textContent = on_ ? `กำลังเล่นที่ ${d.config.guideBpm} ครั้ง/นาที` : 'ปิดอยู่';
  });
}

function paintHud(hud, met, d, s){
  if (s.phase === 'calibrate'){
    hud.innerHTML = `<span class="hud-chip warn">${icon('eye')} จำฉากหลัง ${s.left.toFixed(1)} วิ</span>`;
    met.innerHTML = `<p class="small muted">อย่าเพิ่งยื่นมือเข้ากรอบ — ระบบกำลังเก็บภาพฉากหลังไว้เปรียบเทียบ</p>`;
    return;
  }

  const chips = [`<span class="hud-chip live">${icon('clock')} <b>${mmss(s.left)}</b></span>`];
  const rows = [];
  const meter = (label, val, txt, tone) => rows.push(`
    <div>
      <div class="spread" style="margin-bottom:5px">
        <span class="small" style="font-weight:600">${label}</span>
        <span class="small num" style="font-weight:700">${txt}</span>
      </div>
      <div class="bar ${tone}"><i style="width:${Math.round(val * 100)}%"></i></div>
    </div>`);

  if (d.mode === 'tempo'){
    const [lo, hi] = d.config.targetBpm;
    const ok = s.bpm >= lo - 4 && s.bpm <= hi + 4;
    chips.push(`<span class="hud-chip ${s.bpm ? (ok ? 'good' : 'warn') : ''}">${icon('heartbeat')} <b>${s.bpm || '--'}</b> /นาที</span>`);
    chips.push(`<span class="hud-chip">${icon('bolt')} <b>${s.reps || 0}</b> ครั้ง</span>`);
    meter('อัตราการทำ', s.bpm ? Math.min(s.bpm / hi, 1.2) / 1.2 : 0, `${s.bpm || '--'} / เป้า ${lo}–${hi}`, ok ? 'ok' : 'warn');
    meter('จำนวนครั้งสะสม', Math.min((s.reps || 0) / (d.config.minReps || 20), 1), `${s.reps || 0} / ${d.config.minReps}`, '');
  }

  if (d.mode === 'steady'){
    const lvl = s.steadiness || 0;
    chips.push(`<span class="hud-chip ${lvl > .7 ? 'good' : lvl > .45 ? 'warn' : ''}">${icon('ruler')} นิ่ง <b>${Math.round(lvl*100)}%</b></span>`);
    chips.push(`<span class="hud-chip ${s.present ? 'good' : 'warn'}">${icon('hand')} ${s.present ? 'เห็นมือ' : 'ยังไม่เห็นมือ'}</span>`);
    meter('ความนิ่งของมือ', lvl, `${Math.round(lvl*100)}%`, lvl > .7 ? 'ok' : lvl > .45 ? 'warn' : 'bad');
  }

  if (d.mode === 'zone'){
    const total = d.config.rounds || 6;
    chips.push(`<span class="hud-chip">${icon('target')} ข้อ <b>${Math.min(total, (engine?.round ?? 0) + 1)}</b>/${total}</span>`);
    if (s.zoneLeft > 0) chips.push(`<span class="hud-chip ${s.zoneLeft < 2 ? 'warn' : ''}">${icon('clock')} <b>${s.zoneLeft.toFixed(1)}</b> วิ</span>`);
    const hits = engine?.hits.filter(h => h.ok).length || 0;
    meter('ตอบถูก', hits / total, `${hits}/${total}`, 'ok');
  }

  if (d.mode === 'sequence'){
    const total = d.config.order.length;
    chips.push(`<span class="hud-chip good">${icon('check')} <b>${engine?.step ?? 0}</b>/${total} ขั้น</span>`);
    if (engine?.orderErrors) chips.push(`<span class="hud-chip warn">${icon('x')} สลับลำดับ ${engine.orderErrors}</span>`);
    meter('ความคืบหน้า', (engine?.step ?? 0) / total, `${engine?.step ?? 0}/${total}`, 'ok');
  }

  if (d.mode === 'frame'){
    chips.push(`<span class="hud-chip ${s.inBox > .7 ? 'good' : 'warn'}">${icon('zone')} ในกรอบ <b>${Math.round((s.inBox||0)*100)}%</b></span>`);
    chips.push(`<span class="hud-chip ${s.sway > .7 ? 'good' : 'warn'}">${icon('eye')} นิ่ง <b>${Math.round((s.sway||0)*100)}%</b></span>`);
    meter('อยู่ในกรอบ', s.inBox || 0, `${Math.round((s.inBox||0)*100)}%`, s.inBox > .7 ? 'ok' : 'warn');
    meter('ความมั่นคง (ไม่โยกตัว)', s.sway || 0, `${Math.round((s.sway||0)*100)}%`, s.sway > .7 ? 'ok' : 'warn');
  }

  if (d.mode === 'voice'){
    const [lo, hi] = d.config.targetSyl;
    const ok = s.sylRate >= lo && s.sylRate <= hi;
    chips.push(`<span class="hud-chip ${ok ? 'good' : 'warn'}">${icon('mic')} <b>${(s.sylRate||0).toFixed(1)}</b> พยางค์/วิ</span>`);
    chips.push(`<span class="hud-chip">${icon('wave')} พูด <b>${Math.round((s.speakRatio||0)*100)}%</b></span>`);
    meter('ความเร็วการพูด', Math.min((s.sylRate || 0) / hi, 1), `เป้า ${lo}–${hi} พยางค์/วิ`, ok ? 'ok' : 'warn');
    meter('สัดส่วนเวลาที่พูดจริง', s.speakRatio || 0, `${Math.round((s.speakRatio||0)*100)}%`, '');
  }

  hud.innerHTML = chips.join('');
  met.innerHTML = rows.join('');
}

function markStep(root, i, cls){
  const list = root.querySelectorAll('[data-step]');
  if (!list.length) return;
  if (cls === 'active') list.forEach(el => el.classList.remove('active'));
  const el = list[i];
  if (!el) return;
  el.classList.add(cls);
  if (cls === 'done' || cls === 'fail'){
    el.classList.remove('active');
    el.querySelector('.st-mark').innerHTML = icon(cls === 'done' ? 'check' : 'x');
  }
}
function flashStep(root, i){
  const el = root.querySelectorAll('[data-step]')[i];
  if (!el) return;
  el.style.transition = 'none'; el.style.background = 'var(--bad-soft)';
  setTimeout(() => { el.style.transition = ''; el.style.background = ''; }, 320);
}
function pulseMetro(root){
  const dot = root.querySelector('#metro-dot');
  if (!dot) return;
  dot.classList.add('on');
  setTimeout(() => dot.classList.remove('on'), 110);
}

/* ============================================================
   RESULT
   ============================================================ */
function finishDrill(r, d){
  pushDrill({ drillId: d.id, trackId: d.track, score: r.score, detail: r.detail });
  questProgress('drills');

  // ฝึกภาคปฏิบัติก็ยกระดับ mastery ของทักษะนั้นด้วย
  const st = skillStat(d.track, d.skill);
  st.mastery = Math.max(0.02, Math.min(0.99, st.mastery + 0.12 * (r.score / 100 - st.mastery)));
  save();

  addXP(30 + Math.round(r.score / 4), 'ฝึกหน้ากล้อง');
  grantBadge('hands1', 'ลงมือทำจริง');
  if (r.score >= 85) grantBadge('handspro', 'มือแม่น 85%+');

  // ภาคปฏิบัติที่ผ่านอาจเป็นชิ้นสุดท้ายที่ทำให้ได้เกียรติบัตร
  const cert = autoIssue(d.track);
  if (cert) setTimeout(() => celebrate(cert), 1600);
}

function resultView(d){
  const t = trackById(d.track);
  const tone = scoreTone(result.score);
  const prev = state.drillHistory.filter(h => h.drillId === d.id).slice(1, 2)[0];

  return `
  <div class="stack" style="gap:18px;max-width:900px;margin:0 auto">
    <section class="card pad-lg" style="text-align:center">
      ${ring(result.score/100, { size:136, stroke:12, label: result.score, sub:'คะแนน' })}
      <h2 style="font-size:22px;margin-top:14px;letter-spacing:-.4px">
        ${result.score >= 85 ? 'ทำได้ยอดเยี่ยม' : result.score >= 65 ? 'ผ่านเกณฑ์ ฝึกต่ออีกนิด' : 'ยังต้องฝึกเพิ่ม'}
      </h2>
      <p class="small muted">${esc(d.name)} · ${esc(t.name)} · ใช้เวลา ${result.seconds} วินาที</p>
      ${prev ? `<p class="small" style="margin-top:8px;color:var(--${result.score >= prev.score ? 'ok' : 'warn'});font-weight:600">
        ${result.score >= prev.score ? '▲' : '▼'} ${Math.abs(result.score - prev.score)} คะแนนจากครั้งก่อน (${prev.score})
      </p>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>คะแนนตามเกณฑ์</h2><p>ถ่วงน้ำหนักตาม rubric ของบทฝึกนี้</p></div></div>
      <div class="stack" style="gap:13px">
        ${result.rubric.map(r => `
          <div>
            <div class="spread" style="margin-bottom:5px">
              <span class="small" style="font-weight:600">${esc(r.name)} <span class="tiny muted">(${r.weight}%)</span></span>
              <span class="small num" style="font-weight:700;color:var(--${scoreTone(r.value)==='ok'?'ok':scoreTone(r.value)==='warn'?'warn':'bad'})">${r.value}</span>
            </div>
            <div class="bar ${scoreTone(r.value)}"><i style="width:${r.value}%"></i></div>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="track-ico" style="background:var(--brand-50)">${icon('brain')}</div>
        <div><h2>ผลวิเคราะห์และคำแนะนำ</h2><p>อ้างอิงจากสัญญาณที่วัดได้จริงในรอบนี้</p></div>
      </div>
      <ul class="stack" style="gap:11px">
        ${result.feedback.map(f => `<li class="row" style="gap:10px;align-items:flex-start">
          <span style="color:var(--brand-500);flex:none;margin-top:3px">${icon('arrowR')}</span>
          <span class="small" style="line-height:1.75">${esc(f)}</span>
        </li>`).join('')}
      </ul>
      ${Object.keys(result.detail).length ? `
        <div class="divider" style="margin:16px 0"></div>
        <div class="row tight">
          <span class="tiny muted">ค่าที่วัดได้:</span>
          ${Object.entries(result.detail).map(([k, v]) => `<span class="pill plain num">${esc(k)}: ${esc(v)}</span>`).join('')}
        </div>` : ''}
    </section>

    <div class="row" style="justify-content:center;gap:10px">
      <button class="btn btn-primary btn-lg" data-again>${icon('refresh')} ฝึกอีกครั้ง</button>
      <a class="btn btn-ghost btn-lg" href="#/lab">${icon('grid')} บทฝึกอื่น</a>
      <a class="btn btn-ghost btn-lg" href="#/community">${icon('people')} แชร์ผลในคอมมูนิตี้</a>
    </div>
  </div>`;
}

function mountResult(root, d, ctx){
  on(root, 'click', '[data-again]', () => {
    phase = 'live'; result = null; liveState = {};
    rerender(ctx);
  });
}

/* ============================================================ helpers */
/* paint() ถอด listener ของรอบก่อนออกให้ ไม่งั้นปุ่ม “หยุดและดูผล” จะถูก
   ผูกซ้ำทุกครั้งที่กดฝึกใหม่ แล้วสั่ง finish() หลายรอบพร้อมกัน */
function rerender(ctx){
  const root = document.querySelector('#view');
  const d = ctx.route.sub && drillById(ctx.route.sub);
  paint(root, phase === 'result' ? resultView(d) : phase === 'live' ? liveView(d) : briefView(d));
  if (phase === 'result') mountResult(root, d, ctx);
  else if (phase === 'live') mountLive(root, d, ctx);
  else mountBrief(root, d, ctx);
}

/* ออกจากหน้า lab → ปิดกล้องเสมอ */
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/lab')){
    engine?.stop(); engine = null;
    metro?.stop();  metro = null;
    phase = 'brief'; result = null;
  }
});
