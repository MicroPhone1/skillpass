/* ============================================================
   views/simulator.js — ห้องจำลองอาการเสีย (Fault Simulator)

   ผู้เรียนได้โจทย์อาการเสียที่สุ่มมาให้เหมาะกับระดับตัวเอง
   แล้วต้องไล่หาสาเหตุด้วยการวัดไฟ กดปุ่ม และตัดแยกพลังงาน
   ระบบบันทึกลำดับทุกอย่างเพื่อบอกทีหลังว่า "วิธีไล่" ดีแค่ไหน
   ไม่ใช่แค่ตอบถูกหรือผิด
   ============================================================ */

import { icon, on, esc, toast, ring, scoreTone, paint } from '../ui.js';
import { state, abilityFor, pushDrill, addXP, save } from '../store.js';
import { CIRCUITS, circuitById } from '../data/circuits.js';
import { trackById, skillName } from '../data/tracks.js';
import { FaultSession } from '../engine/faultsim.js';

let session = null;
let phase = 'brief';       // brief | live | result
let lastResult = null;

export default {
  title: () => 'ห้องจำลองอาการเสีย',
  sub: () => 'ไล่หาจุดเสียในวงจรจำลอง — ระบบดูทั้งคำตอบและวิธีไล่',

  render(ctx){
    const c = circuitById(ctx.route.sub || CIRCUITS[0].id);
    if (phase === 'result') return resultView(c);
    if (phase === 'live')   return liveView(c);
    return briefView(c);
  },

  mount(root, ctx){
    const c = circuitById(ctx.route.sub || CIRCUITS[0].id);
    if (phase === 'live')   return mountLive(root, c, ctx);
    if (phase === 'result') return mountResult(root, c, ctx);
    mountBrief(root, c, ctx);
  },

  unmount(){ session = null; phase = 'brief'; lastResult = null; },
};

/* ============================================================
   BRIEF
   ============================================================ */
function briefView(c){
  const t = trackById(c.track);
  const hist = state.drillHistory.filter(h => h.drillId === 'sim_' + c.id);
  const best = hist.reduce((m, h) => Math.max(m, h.score), 0);

  return `
  <div class="stack" style="gap:18px;max-width:900px;margin:0 auto">
    <section class="card pad-lg">
      <div class="card-head">
        <div class="track-ico" style="background:var(--blue-100);color:var(--blue-700);width:54px;height:54px">
          ${icon('zone')}</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px">${esc(c.name)}</h2>
          <p>${esc(t.name)} · ทักษะ “${esc(skillName(c.track, c.skill))}”</p>
        </div>
        ${best ? `<div style="text-align:right;flex:none">
          <div class="num" style="font-weight:700;font-size:20px">${best}</div>
          <div class="tiny muted">ดีที่สุด</div></div>` : ''}
      </div>

      <p class="small" style="line-height:1.8;margin-top:6px">
        ระบบจะสุ่มอาการเสียหนึ่งอย่างในวงจรนี้ โดยเลือกความยากให้พอดีกับระดับของคุณ
        หน้าที่ของคุณคือหาว่าเสียตรงไหน ด้วยการวัดแรงดันตามจุดวัด กดปุ่มทดสอบ
        และตัดแยกพลังงานก่อนแตะวงจรทุกครั้ง
      </p>

      <div class="grid g3" style="margin-top:16px">
        <div class="tile"><div class="t-lbl">สิ่งที่ระบบดู</div>
          <div class="t-val" style="font-size:17px">คำตอบ</div>
          <div class="t-sub">สรุปได้ถูกจุดหรือไม่</div></div>
        <div class="tile"><div class="t-lbl">และ</div>
          <div class="t-val" style="font-size:17px">วิธีไล่</div>
          <div class="t-sub">เป็นระบบไหม วัดกี่จุด</div></div>
        <div class="tile"><div class="t-lbl">และ</div>
          <div class="t-val" style="font-size:17px">ความปลอดภัย</div>
          <div class="t-sub">ตัดไฟก่อนแตะวงจรหรือเปล่า</div></div>
      </div>

      <div class="explain" style="margin-top:16px">
        <h4>${icon('shield')} กติกาความปลอดภัย</h4>
        <p class="small" style="line-height:1.7">
          งานที่ต้องแตะวงจร เช่น เปิดฝาตู้ ขันสาย หรือวัดความต้านทาน
          ต้องกด “ตัดแยกพลังงาน” ก่อนเสมอ ถ้าข้ามขั้นนี้ คะแนนจะถูกจำกัดไว้ที่
          ${FaultSession.UNSAFE_CAP} แม้จะตอบถูกก็ตาม เพราะในสนามสอบจริงถือว่าตกทั้งสถานี
        </p>
      </div>

      <div class="row" style="margin-top:18px">
        <button class="btn btn-primary btn-lg" data-start>${icon('play')} รับโจทย์</button>
        <a class="btn btn-ghost" href="#/lab">${icon('camera')} ไปห้องฝึกกล้อง</a>
      </div>
    </section>

    ${hist.length ? `
    <section class="card">
      <div class="card-head"><div><h2>ประวัติการฝึกไล่จุดเสีย</h2></div></div>
      <div class="stack" style="gap:0">
        ${hist.slice(0, 5).map(h => `
          <div class="rubric-row">
            <span class="r-name">${esc(h.note || 'ไล่หาจุดเสีย')}</span>
            <span class="r-score" style="color:var(--${scoreTone(h.score) === 'ok' ? 'ok' : scoreTone(h.score) === 'warn' ? 'warn' : 'bad'})">${h.score}%</span>
          </div>`).join('')}
      </div>
    </section>` : ''}
  </div>`;
}

function mountBrief(root, c, ctx){
  on(root, 'click', '[data-start]', () => {
    const a = abilityFor(c.track);
    const skill = a.skills?.[c.skill];
    // แปลงความชำนาญ 0..1 เป็นระดับความสามารถ -2..2 เพื่อเลือกความยากโจทย์
    const ability = ((skill?.mastery ?? 0.4) - 0.5) * 4;
    const recent = state.drillHistory.filter(h => h.drillId === 'sim_' + c.id)
                                     .slice(0, 2).map(h => h.faultId).filter(Boolean);
    session = new FaultSession({ circuitId: c.id, ability, recent });
    phase = 'live';
    rerender(ctx, c);
  });
}

/* ============================================================
   LIVE
   ============================================================ */
function liveView(c){
  const tps = c.chain.map(el => ({ tp: el.tp, name: el.name }));

  return `
  <div class="sim-grid">
    <div class="stack" style="gap:14px;min-width:0">
      <section class="card">
        <div class="card-head"><div>
          <h2>อาการที่พบ</h2><p>อ่านให้ละเอียดก่อนลงมือ — อาการบอกทิศทางได้มาก</p></div></div>
        <p class="sim-symptom" id="symptom">กำลังรับโจทย์…</p>
      </section>

      <section class="card">
        <div class="card-head"><div>
          <h2>จุดวัดแรงดัน</h2><p>แตะจุดที่ต้องการวัด ระบบจะบอกค่าที่อ่านได้ทันที</p></div></div>
        <div class="sim-points">
          ${tps.map((p, i) => `
            <button class="sim-tp" data-measure="${p.tp}">
              <span class="tp-id">${p.tp}</span>
              <span class="tp-name">หลัง${esc(p.name)}</span>
              <span class="tp-val" data-val="${p.tp}">—</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>สั่งการวงจร</h2></div></div>
        <div class="sim-actions">
          <button class="btn btn-soft" data-act="start">${icon('play')} กดสตาร์ทค้าง</button>
          <button class="btn btn-soft" data-act="release">${icon('hand')} ปล่อยปุ่ม</button>
          <button class="btn btn-soft" data-act="stop">${icon('stop')} กดสตอป</button>
        </div>
        <div class="sim-state" id="sim-state"></div>
      </section>

      <section class="card">
        <div class="card-head"><div>
          <h2>งานที่ต้องแตะวงจร</h2><p>ต้องตัดแยกพลังงานก่อนทุกครั้ง</p></div>
          <div class="spacer"></div>
          <button class="btn ${''}" id="loto-btn" data-act="loto">${icon('lock')} ตัดแยกพลังงาน</button>
        </div>
        <div class="sim-actions">
          ${c.contactWork.map(w => `
            <button class="btn btn-ghost btn-sm" data-work="${w.id}">${esc(w.name)}</button>`).join('')}
        </div>
      </section>
    </div>

    <div class="stack" style="gap:14px;min-width:0">
      <section class="card">
        <div class="card-head"><div><h2>สรุปว่าเสียตรงไหน</h2>
          <p>เลือกเมื่อมั่นใจ — ระบบดูวิธีไล่ของคุณด้วย ไม่ใช่แค่คำตอบ</p></div></div>
        <div class="stack" style="gap:8px">
          ${c.faults.map(f => `
            <button class="sim-answer" data-submit="${f.id}">${esc(f.name)}</button>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>บันทึกการไล่</h2>
          <p>ทุกขั้นถูกบันทึกไว้เพื่อวิเคราะห์</p></div></div>
        <ol class="sim-log" id="sim-log"><li class="muted">ยังไม่มีการกระทำ</li></ol>
      </section>
    </div>
  </div>`;
}

const ACT_LABEL = {
  observe:'อ่านอาการ', measure:'วัดแรงดัน', press_start:'กดสตาร์ท',
  release_start:'ปล่อยปุ่มสตาร์ท', press_stop:'กดสตอป',
  loto:'ตัดแยกพลังงาน', contact:'แตะวงจร', submit:'สรุปคำตอบ',
};

function paintLog(root){
  const el = root.querySelector('#sim-log');
  if (!el || !session) return;
  if (!session.log.length){ el.innerHTML = '<li class="muted">ยังไม่มีการกระทำ</li>'; return; }
  el.innerHTML = session.log.map(a => {
    const unsafe = a.type === 'contact' && a.result?.unsafe;
    const v = a.result?.volts;
    const detail = a.type === 'measure' ? `${a.detail} → ${v} V`
                 : a.type === 'contact' ? a.detail
                 : '';
    return `<li${unsafe ? ' class="unsafe"' : ''}>
      <b>${ACT_LABEL[a.type] || a.type}</b>${detail ? ' · ' + esc(detail) : ''}
      ${unsafe ? '<span class="pill bad">ยังไม่ตัดไฟ</span>' : ''}</li>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function paintState(root){
  const el = root.querySelector('#sim-state');
  if (!el || !session) return;
  const on = session.contactorOn, run = session.motorRunning;
  el.innerHTML = `
    <span class="pill ${on ? 'ok' : 'plain'}">${icon(on ? 'check' : 'x')} คอนแทคเตอร์ ${on ? 'ดูด' : 'ไม่ดูด'}</span>
    <span class="pill ${run ? 'ok' : 'plain'}">${icon(run ? 'check' : 'x')} มอเตอร์ ${run ? 'หมุน' : 'ไม่หมุน'}</span>
    <span class="pill ${session.powerIsolated ? 'ok' : 'warn'}">
      ${icon('lock')} ${session.powerIsolated ? 'ตัดไฟแล้ว' : 'ยังมีไฟอยู่'}</span>`;
}

function mountLive(root, c, ctx){
  if (!session){ phase = 'brief'; return rerender(ctx); }

  root.querySelector('#symptom').textContent = session.observe();
  paintState(root); paintLog(root);

  on(root, 'click', '[data-measure]', (e, t) => {
    const r = session.measure(t.dataset.measure);
    const cell = root.querySelector(`[data-val="${t.dataset.measure}"]`);
    if (cell){
      cell.textContent = r.volts + ' V';
      cell.dataset.live = r.volts > 0 ? '1' : '0';
    }
    paintLog(root);
  });

  on(root, 'click', '[data-act]', (e, t) => {
    const a = t.dataset.act;
    if (a === 'start')   session.pressStart(true);
    if (a === 'release') session.releaseStart();
    if (a === 'stop')    session.pressStop();
    if (a === 'loto'){
      session.isolate();
      toast('ตัดแยกพลังงานแล้ว — แตะวงจรได้อย่างปลอดภัย', 'ok', 2000);
      /* ตัดไฟแล้วค่าที่วัดไว้ก่อนหน้าใช้ไม่ได้อีก ต้องล้างไม่ให้เข้าใจผิด */
      root.querySelectorAll('[data-val]').forEach(el => { el.textContent = '—'; delete el.dataset.live; });
    }
    paintState(root); paintLog(root);
  });

  on(root, 'click', '[data-work]', (e, t) => {
    const r = session.contactWork(t.dataset.work);
    if (r.unsafe) toast('อันตราย! ยังไม่ได้ตัดแยกพลังงาน', 'bad', 3000);
    paintLog(root);
  });

  on(root, 'click', '[data-submit]', (e, t) => {
    lastResult = session.submit(t.dataset.submit);
    const score = session.score();
    pushDrill({
      drillId: 'sim_' + c.id, trackId: c.track, skillId: c.skill,
      score, at: Date.now(), note: 'ไล่จุดเสีย: ' + lastResult.actual.name,
      faultId: lastResult.actual.id,
    });
    addXP(lastResult.correct ? 45 : 15);
    save();
    phase = 'result';
    rerender(ctx, c);
  });
}

/* ============================================================
   RESULT
   ============================================================ */
function resultView(c){
  const r = lastResult;
  const score = session ? session.score() : 0;
  const tone = scoreTone(score);
  const coach = session ? session.coaching() : [];

  return `
  <div class="stack" style="gap:18px;max-width:900px;margin:0 auto">
    <section class="card pad-lg" style="text-align:center">
      ${ring(score / 100, { size:118, stroke:11, label:score + '%',
                            sub: r.correct ? 'ตอบถูก' : 'ยังไม่ถูก',
                            color:`var(--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'})` })}
      <h2 style="margin-top:14px;font-size:20px">
        ${r.correct ? 'หาจุดเสียเจอ' : 'ยังไม่ใช่จุดที่เสีย'}</h2>
      <p class="small muted" style="margin-top:6px;line-height:1.75">
        อาการจริงคือ <b style="color:var(--blue-700)">${esc(r.actual.name)}</b><br>
        ${r.correct ? '' : `คุณตอบว่า “${esc(r.answered)}”<br>`}
        ใช้เวลา ${r.seconds} วินาที · วัดไป ${r.measures} จุด
      </p>
      <div class="explain" style="text-align:left;margin-top:16px">
        <h4>${icon('wrench')} สิ่งที่ต้องทำต่อหน้างานจริง</h4>
        <p class="small" style="line-height:1.7">${esc(r.actual.fix)}</p>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>วิเคราะห์วิธีไล่ของคุณ</h2>
        <p>ส่วนนี้แยกคนที่เข้าใจระบบ ออกจากคนที่เดาถูก</p></div></div>
      <div class="grid g3">
        <div class="tile"><div class="t-lbl">ความเป็นระบบ</div>
          <div class="t-val" style="font-size:22px">${Math.round(r.systematic * 100)}%</div>
          <div class="t-sub">วัดแล้วตัดความเป็นไปได้ลงได้จริงกี่ครั้ง</div></div>
        <div class="tile"><div class="t-lbl">ความประหยัด</div>
          <div class="t-val" style="font-size:22px">${r.measures}<span style="font-size:14px;color:var(--ink-3)"> / ${r.idealMeasures}</span></div>
          <div class="t-sub">จุดที่วัด เทียบกับที่จำเป็น</div></div>
        <div class="tile"><div class="t-lbl">ความปลอดภัย</div>
          <div class="t-val" style="font-size:22px;color:var(--${r.safetyViolations ? 'bad' : 'ok'})">
            ${r.safetyViolations ? r.safetyViolations + ' ครั้ง' : 'ผ่าน'}</div>
          <div class="t-sub">แตะวงจรก่อนตัดไฟ</div></div>
      </div>

      <div class="stack" style="gap:9px;margin-top:14px">
        ${coach.map(x => `
          <div class="coach-${x.tone === 'bad' ? 'verify' : x.tone === 'warn' ? 'probe' : 'next'}">
            ${icon(x.tone === 'ok' ? 'check' : 'info')}
            <div><p>${esc(x.text)}</p></div>
          </div>`).join('')}
      </div>
    </section>

    <div class="row" style="justify-content:center">
      <button class="btn btn-primary btn-lg" data-again>${icon('refresh')} รับโจทย์ใหม่</button>
      <a class="btn btn-ghost btn-lg" href="#/progress">${icon('radar')} ดูจุดอ่อนรวม</a>
    </div>
  </div>`;
}

function mountResult(root, c, ctx){
  on(root, 'click', '[data-again]', () => {
    phase = 'brief';
    session = null;
    rerender(ctx, c);
  });
}

/* วาดใหม่ในที่เดิม ไม่ผ่าน router
   เพราะการเปลี่ยน hash จะทำให้ router เรียก unmount แล้วล้าง session ที่กำลังเล่นอยู่ทิ้ง */
function rerender(ctx, c){
  const root = document.querySelector('#view');
  paint(root, phase === 'result' ? resultView(c) : phase === 'live' ? liveView(c) : briefView(c));
  if (phase === 'result') mountResult(root, c, ctx);
  else if (phase === 'live') mountLive(root, c, ctx);
  else mountBrief(root, c, ctx);
}
