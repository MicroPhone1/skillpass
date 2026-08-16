/* ============================================================
   views/exam.js — ทดสอบปรับระดับ (Adaptive) และสอบจำลองจับเวลา
   ============================================================ */

import { icon, on, esc, mmss, ring, barList, toast, scoreTone, sparkline, paint,
         dropdown, mountDropdowns } from '../ui.js';
import { state, setActiveTrack, addXP, questProgress, pushExam, logReadiness,
         today, save, grantBadge } from '../store.js';
import { TRACKS, trackById, skillName, skillShort } from '../data/tracks.js';
import { byTrack } from '../data/questions.js';
import { AdaptiveSession, readinessBand, pCorrect } from '../engine/adaptive.js';
import { explainQuestion } from '../engine/tutor.js';
import { explainAnswer } from '../ai/roles.js';
import { sourceBadge } from '../ai/presentation.js';
import { drillsFor } from '../data/drills.js';
import { autoIssue, celebrate } from '../certificate.js';
import { go } from '../app.js';

let S = null;         // AdaptiveSession
let phase = 'setup';  // setup | q | feedback | result
let picked = null;    // คำตอบที่กำลังเลือก
let lastRec = null;
let summary = null;
let timer = null;
let correctStreak = 0;
let explainSeq = 0;   // กันผลเฉลย async กลับมาใส่ผิดข้อหลังผู้ใช้กดถัดไป

export default {
  title: 'ทดสอบปรับระดับ',
  sub: ctx => {
    const t = trackById(ctx.route.params.track || state.activeTrack);
    return t.name + ' · ' + t.cert;
  },

  render(ctx){
    const p = ctx.route.params;
    if (phase === 'setup') return setupView(p);
    if (phase === 'result') return resultView();
    return runView();
  },

  mount(root, ctx){
    if (phase === 'setup') mountSetup(root, ctx);
    else if (phase === 'result') mountResult(root, ctx);
    else mountRun(root, ctx);
  },

  unmount(){
    clearInterval(timer);
    const root = document.querySelector('#view');
    if (root?._key){ document.removeEventListener('keydown', root._key); root._key = null; }
  },
};

/* ============================================================
   SETUP
   ============================================================ */
function setupView(p){
  const trackId = p.track || state.activeTrack;
  const t = trackById(trackId);
  const pool = byTrack(trackId);
  const focusSkill = p.skill || '';

  return `
  <div class="stack exam-wrap" style="gap:18px">
    <section class="card pad-lg">
      <div class="card-head">
        <div class="track-ico">${icon(t.icon)}</div>
        <div style="flex:1">
          <h2>${esc(t.name)}</h2>
          <p>${esc(t.cert)} · คลังข้อสอบ ${pool.length} ข้อ</p>
        </div>
      </div>

      <div class="form-grid" style="margin-top:12px">
        ${dropdown({ id:'ex-track', label:'เส้นทางที่ต้องการทดสอบ', value: trackId, icon:'compass',
                     options: TRACKS.filter(x => byTrack(x.id).length).map(x => ({
                       value: x.id, label: x.name, icon: x.icon, sub: x.cert,
                       badge: `${byTrack(x.id).length} ข้อ`,
                     })) })}
        ${dropdown({ id:'ex-skill', label:'เจาะเฉพาะทักษะ (ไม่บังคับ)', value: focusSkill, icon:'target',
                     options: [{ value:'', label:'ทุกทักษะ', sub:`รวม ${pool.length} ข้อ` }].concat(
                       t.skills.filter(s => pool.some(q => q.skill === s.id)).map(s => ({
                         value: s.id, label: s.name,
                         badge: `${pool.filter(q => q.skill === s.id).length} ข้อ`,
                       }))) })}
      </div>

      <div class="divider" style="margin:6px 0 20px"></div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">
        <button class="track-card" data-start="adaptive">
          <div class="row" style="gap:12px;align-items:flex-start">
            <div class="track-ico">${icon('brain')}</div>
            <div>
              <h3>โหมดปรับระดับ</h3>
              <div class="t-cert">ข้อสอบจะยาก–ง่ายตามคุณ วัดระดับได้แม่นด้วยข้อที่น้อยลง</div>
            </div>
          </div>
          <div class="row tight">
            <span class="pill">${icon('exam')} ${Math.min(10, pool.length)} ข้อ</span>
            <span class="pill plain">ไม่จับเวลา</span>
          </div>
        </button>

        <button class="track-card" data-start="mock">
          <div class="row" style="gap:12px;align-items:flex-start">
            <div class="track-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('clock')}</div>
            <div>
              <h3>สอบจำลองจับเวลา</h3>
              <div class="t-cert">กระจายความยากเหมือนสนามจริง มีเวลาจำกัด กดดันเหมือนสอบจริง</div>
            </div>
          </div>
          <div class="row tight">
            <span class="pill">${icon('exam')} ${Math.min(12, pool.length)} ข้อ</span>
            <span class="pill warn">${icon('clock')} ${Math.min(12, pool.length)} นาที</span>
          </div>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>เอนจินปรับระดับทำงานอย่างไร</h2></div></div>
      <div class="stack" style="gap:12px">
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="q-ico" style="background:var(--brand-50);color:var(--brand-600)">${icon('target')}</div>
          <div style="flex:1"><b style="font-size:14px">เลือกข้อที่ให้ข้อมูลมากที่สุด</b>
            <p class="small muted">ใช้โมเดล IRT (Rasch) คำนวณว่าข้อไหนจะบอกระดับความสามารถของคุณได้ชัดที่สุด ณ ตอนนั้น</p></div>
        </div>
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="q-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('chart')}</div>
          <div style="flex:1"><b style="font-size:14px">อัปเดตค่าความสามารถทุกข้อ</b>
            <p class="small muted">ตอบถูกข้อยากจะดันระดับขึ้นมากกว่าตอบถูกข้อง่าย ความคลาดเคลื่อนจะแคบลงเรื่อย ๆ</p></div>
        </div>
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="q-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('radar')}</div>
          <div style="flex:1"><b style="font-size:14px">กระจายให้ครบทุกทักษะย่อย</b>
            <p class="small muted">มีโบนัสให้ทักษะที่ยังวัดน้อย เพื่อไม่ให้พลาดจุดอ่อนที่ซ่อนอยู่</p></div>
        </div>
      </div>
    </section>
  </div>`;
}

function mountSetup(root, ctx){
  let trackId = ctx.route.params.track || state.activeTrack;
  let skill = ctx.route.params.skill || '';
  const len = parseInt(ctx.route.params.length || '0', 10);

  mountDropdowns(root);

  // เปลี่ยนเส้นทาง = โหลดรายการทักษะใหม่ จึงต้องกลับไปที่ route ให้วาดหน้าใหม่
  root.querySelector('#ex-track')?.addEventListener('change', e => {
    go(`exam?track=${e.target.value}`);
  });
  root.querySelector('#ex-skill')?.addEventListener('change', e => {
    skill = e.target.value;
  });
  on(root, 'click', '[data-start]', (e, t) => {
    const mode = t.dataset.start;
    const pool = byTrack(trackId).filter(q => !skill || q.skill === skill);
    const length = len || Math.min(mode === 'mock' ? 12 : 10, pool.length);
    if (!pool.length) return toast('เส้นทางนี้ยังไม่มีข้อสอบ', 'bad');

    setActiveTrack(trackId);
    S = new AdaptiveSession(trackId, {
      mode, length,
      skillFilter: skill || null,
      timeLimit: mode === 'mock' ? length * 60 : 0,
    });
    correctStreak = 0;
    S.next();
    phase = 'q'; picked = null;
    rerender(ctx);
  });
}

/* ============================================================
   RUN
   ============================================================ */
function runView(){
  const q = S.current;
  const t = trackById(S.trackId);
  const prog = Math.round((S.index / S.length) * 100);
  const conf = Math.round((1 - Math.min(S.se, 1.2) / 1.2) * 100);

  return `
  <div class="exam-wrap">
    <div class="exam-hud">
      <div style="flex:1;min-width:140px">
        <div class="spread" style="margin-bottom:5px">
          <span class="small" style="font-weight:700">ข้อ ${S.index + 1} / ${S.length}</span>
          <span class="tiny muted">${esc(skillShort(S.trackId, q.skill))}</span>
        </div>
        <div class="bar thin"><i style="width:${prog}%"></i></div>
      </div>
      ${S.timeLimit ? `<div class="timer num" id="timer">${mmss(S.remaining)}</div>` : ''}
      <div style="text-align:right">
        <div class="tiny muted">ความมั่นใจในการวัด</div>
        <div class="small num" style="font-weight:700;color:var(--brand-600)">${conf}%</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-quit>${icon('x')} ออก</button>
    </div>

    <section class="card pad-lg">
      <div class="row tight" style="margin-bottom:14px">
        <span class="pill">${icon(t.icon)} ${esc(t.name)}</span>
        <span class="pill plain">${difficultyLabel(q.b)}</span>
        <span class="pill plain">${typeLabel(q.type)}</span>
      </div>

      <p class="q-stem">${esc(q.stem)}</p>

      <div class="stack" style="gap:9px;margin-top:18px" id="answer-area">
        ${answerArea(q)}
      </div>

      <div id="explain-slot"></div>

      <div class="row" style="margin-top:18px;justify-content:flex-end">
        ${phase === 'feedback'
          ? `<button class="btn btn-primary btn-lg" data-next>
               ${S.index >= S.length ? 'ดูผลสรุป' : 'ข้อถัดไป'} ${icon('arrowR')}
             </button>`
          : `<button class="btn btn-primary btn-lg" data-submit disabled>ตรวจคำตอบ ${icon('check')}</button>`}
      </div>
    </section>

    ${phase === 'q' ? `<p class="tiny muted" style="text-align:center;margin-top:12px">
      โอกาสที่ระบบคาดว่าคุณจะตอบข้อนี้ถูก ≈ ${Math.round(pCorrect(S.theta, q.b) * 100)}%
      — ระบบเลือกข้อที่ท้าทายพอดีเพื่อวัดคุณได้แม่นที่สุด</p>` : ''}
  </div>`;
}

function answerArea(q){
  if (q.type === 'mcq' || q.type === 'multi'){
    const keys = ['ก','ข','ค','ง','จ'];
    return q.choices.map((c, i) => {
      let cls = 'choice';
      let pressed = false;
      if (phase === 'feedback'){
        const want = q.type === 'mcq' ? [q.answer] : q.answer;
        const got  = q.type === 'mcq' ? (picked === null ? [] : [picked]) : (picked || []);
        if (want.includes(i)) cls += ' correct';
        else if (got.includes(i)) cls += ' wrong';
      }else{
        pressed = q.type === 'mcq' ? picked === i : (picked || []).includes(i);
      }
      return `<button class="${cls}" data-choice="${i}" aria-pressed="${pressed}" ${phase==='feedback'?'disabled':''}>
        <span class="key">${keys[i] || i+1}</span><span>${esc(c)}</span>
      </button>`;
    }).join('') + (q.type === 'multi' ? `<p class="tiny muted">เลือกได้มากกว่า 1 ข้อ</p>` : '');
  }

  if (q.type === 'numeric'){
    return `
      <div class="row" style="gap:10px;align-items:center">
        <input class="num-input" id="num-in" inputmode="decimal" placeholder="พิมพ์คำตอบเป็นตัวเลข"
          value="${phase==='feedback' ? esc(picked ?? '') : ''}" ${phase==='feedback'?'disabled':''}>
        <span class="pill plain" style="flex:none">${esc(q.unit || '')}</span>
      </div>
      ${phase === 'feedback' ? `<p class="small" style="font-weight:600;color:var(--${lastRec.correct?'ok':'bad'})">
        เฉลย: ${q.answer.toLocaleString('th-TH')} ${esc(q.unit || '')}</p>` : ''}`;
  }

  if (q.type === 'order'){
    const arr = picked || q.items.map((_, i) => i);
    return arr.map((idx, pos) => {
      const isRight = phase === 'feedback' && q.answer[pos] === idx;
      return `<div class="order-item" ${phase==='feedback' ? `style="border-color:var(--${isRight?'ok':'bad'});background:var(--${isRight?'ok':'bad'}-soft)"` : ''}>
        <span class="ord-n">${pos + 1}</span>
        <span style="flex:1">${esc(q.items[idx])}</span>
        ${phase === 'feedback' ? '' : `<span class="ord-btns">
          <button data-move="${pos}" data-dir="-1" ${pos===0?'disabled':''} aria-label="เลื่อนขึ้น">${icon('chevU')}</button>
          <button data-move="${pos}" data-dir="1" ${pos===arr.length-1?'disabled':''} aria-label="เลื่อนลง">${icon('chevD')}</button>
        </span>`}
      </div>`;
    }).join('') + (phase === 'feedback' ? '' : `<p class="tiny muted">จัดเรียงจากขั้นแรกไปขั้นสุดท้าย</p>`);
  }
  return '';
}

function mountRun(root, ctx){
  const q = S.current;

  /* --- timer --- */
  clearInterval(timer);
  if (S.timeLimit){
    timer = setInterval(() => {
      const el = root.querySelector('#timer');
      if (!el) return clearInterval(timer);
      el.textContent = mmss(S.remaining);
      el.classList.toggle('low', S.remaining < 60);
      if (S.remaining <= 0){ clearInterval(timer); finish(ctx); }
    }, 500);
  }

  const submitBtn = () => root.querySelector('[data-submit]');
  const refresh = () => {
    root.querySelector('#answer-area').innerHTML = answerArea(q);
    const b = submitBtn();
    if (b) b.disabled = !hasAnswer(q);
  };

  on(root, 'click', '[data-choice]', (e, t) => {
    if (phase !== 'q') return;
    const i = +t.dataset.choice;
    if (q.type === 'mcq') picked = i;
    else {
      picked = picked || [];
      const at = picked.indexOf(i);
      at < 0 ? picked.push(i) : picked.splice(at, 1);
    }
    refresh();
  });

  on(root, 'click', '[data-move]', (e, t) => {
    const pos = +t.dataset.move, dir = +t.dataset.dir;
    picked = picked || q.items.map((_, i) => i);
    const to = pos + dir;
    if (to < 0 || to >= picked.length) return;
    [picked[pos], picked[to]] = [picked[to], picked[pos]];
    refresh();
  });

  const numIn = root.querySelector('#num-in');
  if (numIn){
    numIn.addEventListener('input', () => {
      picked = numIn.value.trim();
      const b = submitBtn(); if (b) b.disabled = !picked;
    });
    numIn.addEventListener('keydown', e => {
      if (e.key === 'Enter' && hasAnswer(q)) doSubmit(root, ctx);
    });
    if (phase === 'q') setTimeout(() => numIn.focus(), 60);
  }
  if (q.type === 'order' && phase === 'q' && !picked) picked = q.items.map((_, i) => i);

  const b = submitBtn(); if (b) b.disabled = !hasAnswer(q);

  on(root, 'click', '[data-submit]', () => doSubmit(root, ctx));
  on(root, 'click', '[data-next]',   () => nextQuestion(ctx));
  on(root, 'click', '[data-quit]',   () => {
    if (confirm('ออกจากการทดสอบ? ความคืบหน้าในรอบนี้จะไม่ถูกบันทึก')){
      phase = 'setup'; S = null; clearInterval(timer); rerender(ctx);
    }
  });

  /* keyboard: 1-5 เลือกตัวเลือก, Enter ตรวจ/ถัดไป */
  root._key = e => {
    if (e.target.matches('input')) return;
    if (phase === 'q' && (q.type === 'mcq' || q.type === 'multi') && /^[1-5]$/.test(e.key)){
      const el = root.querySelector(`[data-choice="${+e.key - 1}"]`);
      el?.click();
    }
    if (e.key === 'Enter'){
      if (phase === 'feedback') root.querySelector('[data-next]')?.click();
      else if (hasAnswer(q)) root.querySelector('[data-submit]')?.click();
    }
  };
  document.addEventListener('keydown', root._key);
}

const hasAnswer = q =>
  q.type === 'mcq'     ? picked !== null && picked !== undefined :
  q.type === 'multi'   ? (picked || []).length > 0 :
  q.type === 'numeric' ? String(picked || '').trim().length > 0 :
  true;

function doSubmit(root, ctx){
  lastRec = S.submit(picked);
  phase = 'feedback';

  today().questions = (today().questions || 0) + 1;
  questProgress('questions');
  if (S.skillFilter) questProgress('weak');
  save();

  if (lastRec.correct){
    correctStreak++;
    addXP(lastRec.q.b > 0.6 ? 12 : 8, 'ตอบถูก');
    if (correctStreak >= 5){ questProgress('streakQ', 5); correctStreak = 0; }
    if (lastRec.q.b >= 1.0) grantBadge('hardhit', 'นักล่าข้อยาก');
  }else{
    correctStreak = 0;
  }

  rerender(ctx);
  loadExplanation(lastRec);
}

async function loadExplanation(rec){
  const seq = ++explainSeq;
  const slot = document.querySelector('#explain-slot');
  if (!slot) return;
  slot.innerHTML = explainLoading(rec);

  let result;
  try{
    result = await explainAnswer(rec.q, { given:rec.given, correct:rec.correct });
  }catch{
    result = { ...explainQuestion(rec.q, { given:rec.given, correct:rec.correct }), source:'local' };
  }

  // เฉลยของข้อเก่าห้ามทับข้อใหม่หรือหน้าผลสรุป
  if (seq !== explainSeq || phase !== 'feedback' || lastRec !== rec) return;
  const currentSlot = document.querySelector('#explain-slot');
  if (currentSlot) currentSlot.innerHTML = explainBlock(rec, result);
}

function explainLoading(rec){
  return `<div class="explain ai-loading" aria-live="polite">
    <h4>${icon(rec.correct ? 'check' : 'bulb')} ${rec.correct ? 'ตอบถูกแล้ว — กำลังสรุปเหตุผล' : 'กำลังวิเคราะห์จุดที่เข้าใจคลาดเคลื่อน'}</h4>
    <div class="typing"><i></i><i></i><i></i></div>
    <p class="tiny muted">กำลังเตรียมคำอธิบายทีละขั้น หาก AI ไม่พร้อมจะใช้เฉลยในเครื่องให้อัตโนมัติ</p>
  </div>`;
}

function explainBlock(rec, r){
  return `
  <div class="explain">
    <div class="spread" style="gap:8px;align-items:flex-start">
      <h4>${icon(rec.correct ? 'check' : 'bulb')} ${esc(r.lead)}</h4>
      ${sourceBadge(r.source, { aiLabel:'AI อธิบาย', localLabel:'เฉลยในเครื่อง' })}
    </div>
    ${r.probe ? `
      <div class="coach-probe">${icon('spark')}
        <div><b>${rec.correct ? 'ลองดันต่ออีกขั้น' : 'ลองหาจุดที่พลาดเองก่อน'}</b>
        <p>${esc(r.probe)}</p></div>
      </div>` : ''}

    <details class="coach-reveal"${r.probe ? '' : ' open'}>
      <summary>${r.probe ? 'คิดแล้ว ขอดูวิธีทำทีละขั้น' : 'วิธีทำทีละขั้น'}</summary>
      ${r.blocks.map(b => `
        ${b.h ? `<div class="small" style="font-weight:700;color:var(--brand-800);margin-top:10px">${esc(b.h)}</div>` : ''}
        ${b.list ? `<ol class="steps">${b.list.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
                  : `<p class="small" style="line-height:1.75;margin-top:4px">${esc(b.text)}</p>`}
      `).join('')}
    </details>

    ${r.nextTime ? `<div class="coach-next">${icon('target')}
      <div><b>ครั้งหน้าทำเองได้</b><p>${esc(r.nextTime)}</p></div></div>` : ''}
    ${r.verify ? `<div class="coach-verify">${icon('info')}
      <div><b>อย่าเพิ่งเชื่อทั้งหมด</b><p>${esc(r.verify)}</p></div></div>` : ''}

    ${r.sources.length ? `<div class="row tight" style="margin-top:12px">
      <span class="tiny muted">อ้างอิง:</span>
      ${r.sources.map(s => `<span class="src-chip">${icon('book')} ${esc(s.title)} · ${esc(s.ref)}</span>`).join('')}
    </div>` : ''}
    <div class="row" style="margin-top:12px">
      <a class="btn btn-ghost btn-sm" href="#/tutor?track=${rec.q.track}&skill=${rec.q.skill}">
        ${icon('brain')} ถามติวเตอร์เพิ่มเรื่องนี้
      </a>
    </div>
  </div>`;
}

function nextQuestion(ctx){
  explainSeq++;
  picked = null;
  if (S.index >= S.length || !S.next()) return finish(ctx);
  phase = 'q';
  rerender(ctx);
}

function finish(ctx){
  explainSeq++;
  clearInterval(timer);
  summary = S.persist();
  pushExam({
    trackId: summary.trackId, mode: summary.mode, items: summary.items,
    percent: summary.percent, theta: summary.theta, readiness: summary.readiness,
    seconds: summary.seconds,
  });
  logReadiness(summary.trackId, summary.readiness);
  addXP(20 + summary.items * 3, 'จบชุดข้อสอบ');
  if (summary.percent >= 90) grantBadge('sharp', 'แม่นยำ 90%+');
  if (summary.mode === 'mock') grantBadge('mock1', 'ผ่านสนามจำลอง');
  phase = 'result';
  rerender(ctx);

  // ชุดนี้อาจเป็นชุดที่ทำให้ผ่านเกณฑ์เกียรติบัตรพอดี
  const cert = autoIssue(summary.trackId);
  if (cert) setTimeout(() => celebrate(cert), 1500);
}

/* ============================================================
   RESULT
   ============================================================ */
function resultView(){
  const t = trackById(summary.trackId);
  const band = readinessBand(summary.readiness);
  const skills = Object.entries(summary.bySkill).map(([id, v]) => ({
    label: skillName(summary.trackId, id),
    value: Math.round((v.score / v.n) * 100),
  })).sort((a, b) => a.value - b.value);

  const worst = skills[0];
  const drills = drillsFor(summary.trackId);
  const log = (state.readinessLog[summary.trackId] || []).map(r => r.value);

  return `
  <div class="stack exam-wrap" style="gap:18px">
    <section class="card pad-lg" style="text-align:center">
      <div class="row" style="justify-content:center;gap:26px;flex-wrap:wrap">
        ${ring(summary.readiness/100, { size:132, stroke:12, label: summary.readiness + '%', sub:'ความพร้อม' })}
        <div style="text-align:left;min-width:180px">
          <span class="pill ${band.tone}">${band.label}</span>
          <h2 style="font-size:24px;margin-top:10px;letter-spacing:-.5px">
            ตอบถูก ${Math.round(summary.rawScore * 10) / 10} จาก ${summary.items} ข้อ
          </h2>
          <p class="small muted" style="margin-top:4px">
            ${esc(t.name)} · ${summary.mode === 'mock' ? 'สอบจำลองจับเวลา' : 'โหมดปรับระดับ'}
            · ใช้เวลา ${mmss(summary.seconds)}
          </p>
          <p class="small" style="margin-top:10px;color:var(--${summary.thetaDelta >= 0 ? 'ok' : 'warn'});font-weight:600">
            ${icon(summary.thetaDelta >= 0 ? 'arrowR' : 'arrowL')}
            ระดับความสามารถ ${summary.thetaDelta >= 0 ? 'เพิ่มขึ้น' : 'ปรับลง'} ${Math.abs(summary.thetaDelta).toFixed(2)} หน่วย
          </p>
        </div>
      </div>
      <p class="small muted" style="margin-top:16px;max-width:52ch;margin-inline:auto">${band.note}</p>
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div class="card">
        <div class="card-head"><div><h2>ผลรายทักษะในรอบนี้</h2><p>เรียงจากที่ต้องซ่อมก่อน</p></div></div>
        ${barList(skills)}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>ความพร้อมสะสม</h2><p>เทียบกับครั้งก่อน ๆ</p></div></div>
        ${log.length > 1 ? sparkline(log) : `<p class="small muted">ทำอีกสักรอบเพื่อดูแนวโน้ม</p>`}
        <div class="stack" style="gap:0;margin-top:12px">
          <div class="rubric-row"><span class="r-name">ค่าความสามารถ (θ)</span><span class="r-score num">${summary.theta.toFixed(2)}</span></div>
          <div class="rubric-row"><span class="r-name">ความคลาดเคลื่อนของการวัด</span><span class="r-score num">±${summary.se.toFixed(2)}</span></div>
          <div class="rubric-row"><span class="r-name">ความเร็วเฉลี่ยต่อข้อ</span><span class="r-score num">${Math.round(summary.seconds/summary.items)} วิ</span></div>
        </div>
      </div>
    </section>

    <section class="card" style="background:var(--brand-50);border-color:var(--brand-200)">
      <div class="card-head">
        <div class="track-ico" style="background:#fff">${icon('target')}</div>
        <div><h2>ก้าวต่อไปที่แนะนำ</h2><p>อ้างอิงจากจุดอ่อนที่เจอในรอบนี้</p></div>
      </div>
      <div class="stack" style="gap:9px">
        ${worst ? `<a class="quest" href="#/exam?track=${summary.trackId}&skill=${Object.keys(summary.bySkill).find(k => skillName(summary.trackId,k) === worst.label)}&length=5">
          <div class="q-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('exam')}</div>
          <div class="q-body"><b>ซ่อม “${esc(worst.label)}” อีก 5 ข้อ</b><span>ทักษะที่ทำได้น้อยที่สุดในรอบนี้ (${worst.value}%)</span></div>
          ${icon('arrowR')}
        </a>` : ''}
        ${drills.length ? `<a class="quest" href="#/lab/${drills[0].id}">
          <div class="q-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('camera')}</div>
          <div class="q-body"><b>ฝึกภาคปฏิบัติ: ${esc(drills[0].name)}</b><span>ทฤษฎีแน่นแล้ว ลองพิสูจน์ด้วยมือจริงหน้ากล้อง</span></div>
          ${icon('arrowR')}
        </a>` : ''}
        <a class="quest" href="#/progress?track=${summary.trackId}">
          <div class="q-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('radar')}</div>
          <div class="q-body"><b>ดูแผนติวเฉพาะจุดฉบับเต็ม</b><span>แผนภูมิใยแมงมุม + ลำดับสิ่งที่ควรทำ</span></div>
          ${icon('arrowR')}
        </a>
      </div>
    </section>

    <div class="row" style="justify-content:center;gap:10px">
      <button class="btn btn-primary btn-lg" data-again>${icon('refresh')} ทำอีกชุด</button>
      <a class="btn btn-ghost btn-lg" href="#/home">${icon('home')} กลับหน้าแรก</a>
    </div>
  </div>`;
}

function mountResult(root, ctx){
  on(root, 'click', '[data-again]', () => { phase = 'setup'; S = null; rerender(ctx); });
}

/* ============================================================ helpers */
/**
 * วาดหน้าใหม่ในที่เดิม
 * ต้องถอด listener เก่าออกก่อนทุกครั้ง (paint ทำให้แล้ว) ไม่งั้นทุกครั้งที่
 * เปลี่ยนข้อ handler จะทับกันเพิ่มขึ้นเรื่อย ๆ — คลิกตัวเลือกครั้งเดียว
 * จะถูกนับหลายรอบ (ข้อแบบเลือกหลายข้อจะติ๊กแล้วหลุดทันที) และการกด
 * “ตรวจคำตอบ” จะส่งคำตอบซ้ำจนข้ามข้อไปเอง
 */
function rerender(ctx){
  const root = document.querySelector('#view');
  if (root._key){ document.removeEventListener('keydown', root._key); root._key = null; }
  paint(root, exportDefaultRender(ctx));
  exportDefaultMount(root, ctx);
}
const exportDefaultRender = ctx => (phase === 'setup' ? setupView(ctx.route.params)
  : phase === 'result' ? resultView() : runView());
const exportDefaultMount = (root, ctx) => (phase === 'setup' ? mountSetup(root, ctx)
  : phase === 'result' ? mountResult(root, ctx) : mountRun(root, ctx));

const difficultyLabel = b =>
  b < -1 ? 'ระดับง่าย' : b < 0 ? 'ระดับพื้นฐาน' : b < 0.8 ? 'ระดับกลาง' : b < 1.4 ? 'ระดับยาก' : 'ระดับยากมาก';

const typeLabel = t =>
  ({ mcq:'ปรนัย', multi:'เลือกหลายข้อ', numeric:'คำนวณ', order:'เรียงลำดับ' })[t] || t;

/* รีเซ็ตสถานะเมื่อออกจากหน้า (ผู้ใช้กดเมนูอื่น) */
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (!h.startsWith('#/exam')){ phase = 'setup'; S = null; picked = null; clearInterval(timer); }
});
