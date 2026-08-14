/* ============================================================
   views/progress.js — Skill-Gap Dashboard + แผนติวเฉพาะจุด
   ============================================================ */

import { icon, on, esc, ring, radarChart, sparkline, barList, scoreTone, timeAgo } from '../ui.js';
import { state, abilityFor, setActiveTrack } from '../store.js';
import { TRACKS, trackById, skillShort, skillName } from '../data/tracks.js';
import { drillsFor, drillById } from '../data/drills.js';
import { trackReadiness, readinessBand, studyPlan, overallReadiness } from '../engine/adaptive.js';
import { COHORT } from '../data/community.js';
import { go } from '../app.js';

export default {
  title: 'จุดอ่อน & แผนติว',
  sub: () => 'แผนภูมิใยแมงมุมแสดงจุดอ่อน คะแนนความพร้อม และลำดับสิ่งที่ควรทำต่อ',

  render(ctx){
    const trackId = ctx.route.params.track || state.activeTrack;
    const t = trackById(trackId);
    const a = abilityFor(trackId);
    const rd = trackReadiness(trackId);
    const band = readinessBand(rd);

    const axes = t.skills.map(s => s.short);
    const mine = t.skills.map(s => a.skills[s.id]?.mastery ?? 0.35);
    const classAvg = t.skills.map(s => COHORT.classMastery[s.id] ?? 0.55);
    const target = t.skills.map(() => 0.8);

    const drillIndex = {};
    for (const d of drillsFor(trackId)) drillIndex[d.skill] ||= d;
    const plan = studyPlan(trackId, drillIndex);

    const log = (state.readinessLog[trackId] || []).map(r => r.value);
    const totalQ = Object.values(a.skills).reduce((s, v) => s + v.n, 0);
    const drillsDone = state.drillHistory.filter(h => h.trackId === trackId).length;

    return `
    <div class="stack" style="gap:20px">

      <div class="row" style="gap:8px;overflow-x:auto;padding-bottom:2px">
        ${state.enrolled.map(id => `<button class="btn btn-sm ${id === trackId ? 'btn-primary' : 'btn-ghost'}"
          data-track="${id}">${esc(trackById(id).name)}</button>`).join('')}
        <a class="btn btn-sm btn-ghost" href="#/tracks">${icon('plus')} เพิ่ม</a>
      </div>

      <!-- ===== ภาพรวม ===== -->
      <section class="g-side">
        <div class="card">
          <div class="card-head">
            <div><h2>แผนที่ทักษะของคุณ</h2><p>${esc(t.name)} · ${esc(t.cert)}</p></div>
          </div>
          <div class="radar-wrap">
            ${radarChart(axes, [
              { name:'เป้าหมายสอบผ่าน', values:target,   color:'var(--blue-200)', fill:.30, dots:false },
              { name:'ค่าเฉลี่ยรุ่นเดียวกัน', values:classAvg, color:'var(--warn)',     fill:.10, dots:false },
              { name:'ระดับของคุณ',      values:mine,     color:'var(--blue-600)', fill:.26 },
            ], { size: 330 })}
          </div>
          <div class="legend">
            <span><i style="background:var(--blue-600)"></i>ระดับของคุณ</span>
            <span><i style="background:var(--warn)"></i>ค่าเฉลี่ยรุ่นเดียวกัน</span>
            <span><i style="background:var(--blue-200)"></i>เป้าหมายสอบผ่าน (80%)</span>
          </div>
        </div>

        <div class="stack" style="gap:16px">
          <div class="card" style="text-align:center">
            ${ring(rd/100, { size:124, stroke:12, label: rd + '%', sub:'Readiness' })}
            <div style="margin-top:10px"><span class="pill ${band.tone}">${band.label}</span></div>
            <p class="small muted" style="margin-top:10px;line-height:1.65">${band.note}</p>
          </div>
          <div class="card">
            <div class="stack" style="gap:0">
              <div class="rubric-row"><span class="r-name">ข้อสอบที่ทำไปแล้ว</span><span class="r-score num">${totalQ}</span></div>
              <div class="rubric-row"><span class="r-name">ฝึกหน้ากล้อง</span><span class="r-score num">${drillsDone} ครั้ง</span></div>
              <div class="rubric-row"><span class="r-name">ค่าความสามารถ (θ)</span><span class="r-score num">${a.theta.toFixed(2)}</span></div>
              <div class="rubric-row"><span class="r-name">ความคลาดเคลื่อน</span><span class="r-score num">±${a.se.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== แผนติว ===== -->
      <section class="card">
        <div class="card-head">
          <div class="track-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('target')}</div>
          <div>
            <h2>แผนติวเฉพาะจุด</h2>
            <p>เรียงจากทักษะที่ต้องซ่อมด่วนที่สุด — ทำตามลำดับนี้จะคุ้มเวลาที่สุด</p>
          </div>
        </div>

        <div class="stack" style="gap:18px">
          ${plan.map((p, i) => {
            const pct100 = Math.round(p.mastery * 100);
            const tone = scoreTone(pct100);
            return `
            <div class="plan-card">
              <div class="plan-head">
                <span class="q-ico plan-n">${i + 1}</span>
                <div class="plan-title">
                  <b>${esc(p.name)}</b>
                  <div class="tiny muted">${p.n ? `วัดไปแล้ว ${p.n} ข้อ` : 'ยังไม่เคยวัด'}</div>
                </div>
                <div class="plan-score">
                  <span class="num" style="color:var(--${tone==='ok'?'ok':tone==='warn'?'warn':'bad'})">${pct100}%</span>
                  <div class="bar thin ${tone}"><i style="width:${pct100}%"></i></div>
                </div>
              </div>
              <div class="stack" style="gap:8px">
                ${p.actions.map(ac => {
                  const href = ac.type === 'exam'
                    ? `#/exam?track=${trackId}&skill=${ac.arg.skill}&length=${ac.arg.length}`
                    : ac.type === 'tutor' ? `#/tutor?track=${trackId}&skill=${ac.arg.skill}`
                    : `#/lab/${ac.arg.drill}`;
                  const ico = { exam:'exam', tutor:'brain', drill:'camera' }[ac.type];
                  const col = { exam:'blue-50|blue-600', tutor:'violet-soft|violet', drill:'cyan-soft|cyan' }[ac.type].split('|');
                  return `<a class="quest" href="${href}">
                    <div class="q-ico" style="background:var(--${col[0]});color:var(--${col[1]})">${icon(ico)}</div>
                    <div class="q-body"><b>${esc(ac.label)}</b><span>${esc(ac.detail)}</span></div>
                    ${icon('arrowR')}
                  </a>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>

      <!-- ===== รายละเอียด ===== -->
      <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <div class="card">
          <div class="card-head"><div><h2>ความชำนาญรายทักษะ</h2><p>เทียบกับเกณฑ์ผ่าน 80%</p></div></div>
          ${barList(t.skills.map(s => ({
            label: s.name,
            value: Math.round((a.skills[s.id]?.mastery ?? 0.35) * 100),
          })))}
        </div>

        <div class="card">
          <div class="card-head"><div><h2>เส้นทางความก้าวหน้า</h2><p>คะแนนความพร้อมย้อนหลัง</p></div></div>
          ${log.length > 1 ? sparkline(log) + `
            <div class="row" style="justify-content:space-between;margin-top:6px">
              <span class="tiny muted">ครั้งแรก ${log[0]}%</span>
              <span class="tiny muted">ล่าสุด ${log[log.length-1]}%</span>
            </div>` : `
            <div class="empty" style="padding:28px 10px">
              ${icon('chart')}
              <h3>ยังไม่มีข้อมูลพอ</h3>
              <p>ทำข้อสอบอย่างน้อย 2 ชุดเพื่อเริ่มเห็นแนวโน้ม</p>
            </div>`}

          <div class="divider" style="margin:14px 0"></div>
          <div class="row" style="gap:8px">
            <a class="btn btn-primary btn-sm" href="#/exam?track=${trackId}">${icon('play')} ทำข้อสอบเพิ่ม</a>
            ${drillsFor(trackId).length ? `<a class="btn btn-ghost btn-sm" href="#/lab/${drillsFor(trackId)[0].id}">${icon('camera')} ฝึกภาคปฏิบัติ</a>` : ''}
          </div>
        </div>
      </section>

      <!-- ===== ภาพรวมทุกเส้นทาง ===== -->
      <section class="card">
        <div class="card-head">
          <div><h2>ภาพรวมทุกเส้นทางที่เรียน</h2><p>ความพร้อมเฉลี่ย ${overallReadiness()}%</p></div>
        </div>
        <div class="grid g3">
          ${state.enrolled.map(id => {
            const tr = trackById(id), r = trackReadiness(id), b = readinessBand(r);
            return `<a class="track-card" href="#/progress?track=${id}">
              <div class="row" style="gap:12px;align-items:center">
                <div class="track-ico" style="width:40px;height:40px">${icon(tr.icon)}</div>
                <div style="flex:1;min-width:0">
                  <h3 style="font-size:14.5px">${esc(tr.name)}</h3>
                  <span class="tiny muted">${b.label}</span>
                </div>
                <div class="num" style="font-weight:700;font-size:19px;color:var(--${b.tone==='ok'?'ok':b.tone==='warn'?'warn':'bad'})">${r}%</div>
              </div>
              <div class="bar thin ${b.tone}"><i style="width:${r}%"></i></div>
            </a>`;
          }).join('')}
        </div>
      </section>
    </div>`;
  },

  mount(root){
    on(root, 'click', '[data-track]', (e, t) => {
      setActiveTrack(t.dataset.track);
      go('progress?track=' + t.dataset.track);
    });
  },
};
