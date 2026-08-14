/* ============================================================
   views/assessment.js — ประเมินความสามารถ + แผนพัฒนาเฉพาะบุคคล
   ------------------------------------------------------------
   assessor อ่านหลักฐานที่มีอยู่ก่อน แล้ว coach จึงวางแผนจากผลวินิจฉัย
   ทั้งสองขั้นถอยไปใช้สูตรในเครื่องได้เมื่อ AI ไม่พร้อม
   ============================================================ */

import { icon, on, esc, ring, dropdown, mountDropdowns } from '../ui.js';
import { state, abilityFor, setActiveTrack } from '../store.js';
import { trackById } from '../data/tracks.js';
import { drillsFor } from '../data/drills.js';
import { trackReadiness, readinessBand } from '../engine/adaptive.js';
import { assessLearner, buildPlan } from '../ai/roles.js';
import { sourceBadge } from '../ai/presentation.js';

const BUDGETS = {
  light:     { label:'เบา · 2 วัน/สัปดาห์ วันละ 20 นาที', prompt:'สัปดาห์ละ 2 วัน วันละ 20 นาที' },
  steady:    { label:'สม่ำเสมอ · 3 วัน/สัปดาห์ วันละ 30 นาที', prompt:'สัปดาห์ละ 3 วัน วันละ 30 นาที' },
  intensive: { label:'เร่งพัฒนา · 5 วัน/สัปดาห์ วันละ 45 นาที', prompt:'สัปดาห์ละ 5 วัน วันละ 45 นาที' },
};

const cache = new Map();
let loadSeq = 0;

export default {
  title: 'ประเมินความสามารถ + แผนพัฒนา',
  sub: () => 'อ่านหลักฐานรายทักษะ วินิจฉัยจุดแข็ง–ช่องว่าง แล้วจัดลำดับสิ่งที่ควรทำต่อ',

  render(ctx){
    const trackId = validTrack(ctx.route.params.track);
    const budgetKey = validBudget(ctx.route.params.budget);
    const readiness = trackReadiness(trackId);
    const band = readinessBand(readiness);
    const a = abilityFor(trackId);
    const totalQ = Object.values(a.skills).reduce((sum, s) => sum + s.n, 0);

    return `<div class="stack assessment-page" style="gap:18px">
      <section class="assessment-controls">
        ${dropdown({
          id:'assessment-track', label:'เส้นทางที่ต้องการประเมิน', value:trackId, icon:'compass',
          options:state.enrolled.map(id => {
            const t = trackById(id);
            return { value:id, label:t.name, icon:t.icon,
                     sub:t.cert, badge:`${trackReadiness(id)}%` };
          }),
        })}
        ${dropdown({
          id:'assessment-budget', label:'เวลาที่จัดให้การพัฒนาได้', value:budgetKey, icon:'clock',
          options:Object.entries(BUDGETS).map(([value, b]) => {
            const [head, sub] = b.label.split(' · ');
            return { value, label:head, sub };
          }),
        })}
        <button class="btn btn-ghost" data-refresh-assessment>${icon('refresh')} ประเมินใหม่</button>
      </section>

      <section class="card assessment-hero">
        <div>
          <span class="eyebrow">${esc(trackById(trackId).cert)}</span>
          <h2>${esc(trackById(trackId).name)}</h2>
          <p>ระบบใช้คำตอบ ${totalQ} ข้อ, ค่า θ ${a.theta.toFixed(2)} และความคลาดเคลื่อน ±${a.se.toFixed(2)} เป็นหลักฐานตั้งต้น</p>
        </div>
        <div class="assessment-readiness">
          ${ring(readiness / 100, { size:108, stroke:10, label:readiness + '%', sub:'Readiness' })}
          <span class="pill ${band.tone}">${esc(band.label)}</span>
        </div>
      </section>

      <div id="assessment-result" aria-live="polite">
        ${cachedHTML(trackId, budgetKey) || loadingHTML('กำลังอ่านหลักฐานความสามารถ…')}
      </div>
    </div>`;
  },

  mount(root, ctx){
    const trackId = validTrack(ctx.route.params.track);
    const budgetKey = validBudget(ctx.route.params.budget);
    mountDropdowns(root);

    root.querySelector('#assessment-track')?.addEventListener('change', e => {
      setActiveTrack(e.target.value);
      ctx.go(`assessment?track=${encodeURIComponent(e.target.value)}&budget=${budgetKey}`);
    });

    root.querySelector('#assessment-budget')?.addEventListener('change', e => {
      ctx.go(`assessment?track=${encodeURIComponent(trackId)}&budget=${e.target.value}`);
    });

    on(root, 'click', '[data-refresh-assessment]', () => load(root, trackId, budgetKey, true));
    load(root, trackId, budgetKey);
  },

  unmount(){ loadSeq++; },
};

function validTrack(id){
  return state.enrolled.includes(id) ? id : state.activeTrack;
}

function validBudget(key){
  return BUDGETS[key] ? key : 'steady';
}

function fingerprint(trackId, budgetKey){
  const a = abilityFor(trackId);
  return JSON.stringify({
    budgetKey,
    theta:a.theta, se:a.se, skills:a.skills,
    exams:state.examHistory.filter(x => x.trackId === trackId),
    drills:state.drillHistory.filter(x => x.trackId === trackId),
  });
}

const cacheKey = (trackId, budgetKey) => `${trackId}:${budgetKey}`;

function cachedHTML(trackId, budgetKey){
  const item = cache.get(cacheKey(trackId, budgetKey));
  return item?.fingerprint === fingerprint(trackId, budgetKey)
    ? resultHTML(item.diagnosis, item.plan)
    : '';
}

async function load(root, trackId, budgetKey, force = false){
  const slot = root.querySelector('#assessment-result');
  if (!slot) return;

  const key = cacheKey(trackId, budgetKey);
  const fp = fingerprint(trackId, budgetKey);
  const cached = cache.get(key);
  if (!force && cached?.fingerprint === fp){
    slot.innerHTML = resultHTML(cached.diagnosis, cached.plan);
    return;
  }

  const seq = ++loadSeq;
  slot.innerHTML = loadingHTML('กำลังอ่านหลักฐานและประเมินความสามารถ…');
  setRefreshBusy(root, true);

  try{
    const diagnosis = await assessLearner(trackId);
    if (seq !== loadSeq || root.isConnected === false) return;
    slot.innerHTML = resultHTML(diagnosis, null, true);

    const plan = await buildPlan(trackId, {
      diagnosis,
      budget:BUDGETS[budgetKey].prompt,
    });
    if (seq !== loadSeq || root.isConnected === false) return;

    cache.set(key, { fingerprint:fp, diagnosis, plan });
    slot.innerHTML = resultHTML(diagnosis, plan);
  }catch{
    if (seq !== loadSeq || root.isConnected === false) return;
    slot.innerHTML = `<div class="card empty">
      ${icon('info')}<h3>ประเมินไม่สำเร็จ</h3>
      <p>ลองใหม่อีกครั้ง ระบบจะใช้เอนจินในเครื่องให้อัตโนมัติหาก AI ไม่พร้อม</p>
      <button class="btn btn-primary btn-sm" data-refresh-assessment>${icon('refresh')} ลองอีกครั้ง</button>
    </div>`;
  }finally{
    if (seq === loadSeq) setRefreshBusy(root, false);
  }
}

function setRefreshBusy(root, busy){
  const btn = root.querySelector('[data-refresh-assessment]');
  if (!btn) return;
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
}

function loadingHTML(label){
  return `<div class="card assessment-loading">
    <div class="ai-orbit">${icon('brain')}</div>
    <div><h3>${esc(label)}</h3>
      <p>ขั้นตอนนี้อาจใช้เวลาสักครู่ หากโมเดลไม่พร้อมระบบจะถอยไปคำนวณในเครื่อง</p>
      <div class="typing"><i></i><i></i><i></i></div>
    </div>
  </div>`;
}

function resultHTML(d, plan, planLoading = false){
  return `<div class="stack" style="gap:18px">
    <section class="card">
      <div class="card-head">
        <div class="track-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('radar')}</div>
        <div><h2>ผลประเมินความสามารถ</h2><p>${esc(d.headline)}</p></div>
        <span class="spacer"></span>
        ${sourceBadge(d.source, { aiLabel:'AI ประเมิน', localLabel:'ประเมินในเครื่อง' })}
      </div>

      <div class="assessment-summary">
        <div><span>ระยะปัจจุบัน</span><b>${esc(d.stage)}</b></div>
        <div><span>ความมั่นใจของผล</span><b>${esc(d.confidence)}</b></div>
        <div><span>หลักฐานข้อสอบ</span><b>${d.questions} ข้อ</b></div>
      </div>

      <div class="assessment-columns">
        <div>
          <h3 class="section-kicker ok">${icon('check')} จุดแข็ง</h3>
          ${d.strengths?.length ? d.strengths.map(s => `<div class="insight-item">
            <b>${esc(s.skill)}</b><p>${esc(s.why)}</p>
          </div>`).join('') : '<p class="small muted">ยังมีหลักฐานไม่พอระบุจุดแข็งอย่างมั่นใจ</p>'}
        </div>
        <div>
          <h3 class="section-kicker bad">${icon('target')} ช่องว่างที่ควรพัฒนา</h3>
          ${d.gaps?.length ? d.gaps.map(g => `<div class="insight-item gap">
            <div class="spread"><b>${esc(g.skill)}</b><span class="pill ${severityTone(g.severity)}">${esc(g.severity)}</span></div>
            <p>${esc(g.why)}</p>${g.rootCause ? `<small>สาเหตุที่เป็นไปได้: ${esc(g.rootCause)}</small>` : ''}
          </div>`).join('') : '<p class="small muted">ยังไม่พบช่องว่างที่เด่นชัด</p>'}
        </div>
      </div>
      ${d.caveat ? `<p class="assessment-caveat">${icon('info')} ${esc(d.caveat)}</p>` : ''}
    </section>

    ${planLoading ? loadingHTML('ประเมินเสร็จแล้ว — กำลังจัดลำดับแผนพัฒนา…') : planHTML(plan)}
  </div>`;
}

function planHTML(plan){
  if (!plan) return '';
  return `<section class="card">
    <div class="card-head">
      <div class="track-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('target')}</div>
      <div><h2>แผนพัฒนาเฉพาะบุคคล</h2><p>${esc(plan.goal)} · ${esc(plan.horizon)}</p></div>
      <span class="spacer"></span>
      ${sourceBadge(plan.source, { aiLabel:'AI วางแผน', localLabel:'แผนในเครื่อง' })}
    </div>

    ${plan.expectedGain ? `<p class="plan-note ok">${icon('chart')} ผลที่คาดหวัง: ${esc(plan.expectedGain)}</p>` : ''}
    <div class="development-steps">
      ${(plan.steps || []).map((step, i) => stepHTML(step, i, plan.trackId)).join('') || '<p class="muted">ยังไม่มีขั้นตอนที่แนะนำ</p>'}
    </div>
    ${plan.watchOut ? `<p class="plan-note warn">${icon('info')} สิ่งที่ต้องระวัง: ${esc(plan.watchOut)}</p>` : ''}
  </section>`;
}

function stepHTML(step, i, trackId){
  const meta = actionMeta(step.action);
  return `<article class="development-step">
    <div class="step-index">${i + 1}</div>
    <div class="step-main">
      <div class="spread" style="gap:8px"><h3>${esc(step.title)}</h3>
        <span class="pill plain">${icon('clock')} ${step.minutes} นาที</span></div>
      <p>${esc(step.detail)}</p>
      ${step.why ? `<small><b>ทำไมขั้นนี้:</b> ${esc(step.why)}</small>` : ''}
      ${step.successCriteria ? `<small><b>ถือว่าสำเร็จเมื่อ:</b> ${esc(step.successCriteria)}</small>` : ''}
    </div>
    <a class="btn btn-ghost btn-sm" href="${actionHref(step, trackId)}">${icon(meta.icon)} ${meta.label}</a>
  </article>`;
}

function actionMeta(action){
  return ({
    exam:{ label:'เริ่มทดสอบ', icon:'exam' },
    drill:{ label:'เริ่มฝึก', icon:'camera' },
    tutor:{ label:'ถามติวเตอร์', icon:'brain' },
    review:{ label:'ทบทวนกับติวเตอร์', icon:'book' },
  })[action] || { label:'เริ่มทบทวน', icon:'book' };
}

function actionHref(step, trackId){
  const skill = step.skillId ? `&skill=${encodeURIComponent(step.skillId)}` : '';
  if (step.action === 'exam') return `#/exam?track=${trackId}${skill}`;
  if (step.action === 'drill'){
    const drill = drillsFor(trackId).find(d => !step.skillId || d.skill === step.skillId);
    if (drill) return `#/lab/${drill.id}`;
  }
  return `#/tutor?track=${trackId}${skill}`;
}

const severityTone = severity => severity === 'สูง' ? 'bad' : severity === 'กลาง' ? 'warn' : 'plain';
