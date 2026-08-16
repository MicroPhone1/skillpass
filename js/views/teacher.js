/* ============================================================
   views/teacher.js — ห้องครู: คัดกรองความพร้อมทั้งชั้นเรียน
   ============================================================ */

import { icon, on, esc, ring, radarChart, barList, scoreTone, avatarColor, initials, modal, paint } from '../ui.js';
import { COHORT } from '../data/community.js';
import { trackById, skillName, skillShort } from '../data/tracks.js';
import { drillsFor } from '../data/drills.js';
import { readinessBand } from '../engine/adaptive.js';

let sortKey = 'readiness';

export default {
  title: 'ภาพรวมชั้นเรียน',
  sub: () => `${COHORT.name} · ${COHORT.exam} · ${COHORT.examIn}`,

  render(){
    const t = trackById(COHORT.track);
    const S = [...COHORT.students].sort((a, b) =>
      sortKey === 'name' ? a.name.localeCompare(b.name, 'th') :
      sortKey === 'drills' ? b.drills - a.drills :
      a.readiness - b.readiness);

    const avg = Math.round(COHORT.students.reduce((s, x) => s + x.readiness, 0) / COHORT.students.length);
    const atRisk = COHORT.students.filter(s => s.readiness < 60);
    const ready  = COHORT.students.filter(s => s.readiness >= 80);
    const inactive = COHORT.students.filter(s => /วันก่อน/.test(s.lastActive) && parseInt(s.lastActive) >= 3);

    // ทักษะที่ทั้งห้องอ่อนที่สุด
    const weakSkills = Object.entries(COHORT.classMastery)
      .sort((a, b) => a[1] - b[1]);

    // นับว่านักเรียนกี่คนอ่อนในแต่ละทักษะ
    const weakCount = {};
    for (const s of COHORT.students) weakCount[s.weak] = (weakCount[s.weak] || 0) + 1;

    return `
    <div class="stack" style="gap:20px">

      <section class="hero">
        <div class="row" style="justify-content:space-between;gap:20px">
          <div style="flex:1;min-width:min(100%,280px)">
            <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
              ${icon('calendar')} ${esc(COHORT.examIn)}
            </span>
            <h2 style="margin-top:12px">${esc(COHORT.name)}</h2>
            <p>${esc(COHORT.exam)} · ${COHORT.students.length} คน · ความพร้อมเฉลี่ย ${avg}%</p>
            <div class="row" style="margin-top:16px">
              <button class="btn btn-primary" data-plan>${icon('target')} สร้างแผนสอนซ่อมของห้อง</button>
              <button class="btn btn-ghost" data-export>${icon('chart')} สรุปรายงาน</button>
            </div>
          </div>
          <div style="text-align:center;flex:none">
            ${ring(avg/100, { size:112, stroke:11, label: avg + '%', sub:'เฉลี่ยทั้งห้อง', color:'#fff' })}
          </div>
        </div>
      </section>

      <section class="grid g4">
        <div class="tile">${icon('shield', 't-ico')}
          <div class="t-lbl">พร้อมสอบแล้ว</div>
          <div class="t-val" style="color:var(--ok)">${ready.length}</div>
          <div class="t-sub">ความพร้อม ≥ 80%</div></div>
        <div class="tile">${icon('info', 't-ico')}
          <div class="t-lbl">ต้องเร่งช่วย</div>
          <div class="t-val" style="color:var(--bad)">${atRisk.length}</div>
          <div class="t-sub">ความพร้อม &lt; 60%</div></div>
        <div class="tile">${icon('clock', 't-ico')}
          <div class="t-lbl">ไม่ได้เข้าใช้ ≥ 3 วัน</div>
          <div class="t-val" style="color:var(--warn)">${inactive.length}</div>
          <div class="t-sub">ควรติดตาม</div></div>
        <div class="tile">${icon('camera', 't-ico')}
          <div class="t-lbl">ฝึกภาคปฏิบัติเฉลี่ย</div>
          <div class="t-val">${(COHORT.students.reduce((s,x)=>s+x.drills,0)/COHORT.students.length).toFixed(1)}</div>
          <div class="t-sub">ครั้ง/คน</div></div>
      </section>

      <section class="g-side">
        <div class="card">
          <div class="card-head">
            <div><h2>รายชื่อและความพร้อมรายบุคคล</h2><p>เรียงจากคนที่ต้องช่วยก่อน</p></div>
            <div class="spacer"></div>
            <select id="sort" class="btn btn-ghost btn-sm" style="border-radius:var(--r-pill)">
              <option value="readiness"${sortKey==='readiness'?' selected':''}>เรียงตามความพร้อม</option>
              <option value="name"${sortKey==='name'?' selected':''}>เรียงตามชื่อ</option>
              <option value="drills"${sortKey==='drills'?' selected':''}>เรียงตามการฝึกปฏิบัติ</option>
            </select>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>นักเรียน</th><th>ความพร้อม</th><th>จุดอ่อนหลัก</th>
                <th>ฝึกกล้อง</th><th>ใช้งานล่าสุด</th>
              </tr></thead>
              <tbody>
                ${S.map(s => {
                  const b = readinessBand(s.readiness);
                  const trendIco = { up:'▲', down:'▼', flat:'—' }[s.trend];
                  const trendCol = { up:'var(--ok)', down:'var(--bad)', flat:'var(--ink-4)' }[s.trend];
                  return `<tr data-student="${esc(s.name)}" style="cursor:pointer">
                    <td><div class="row tight">
                      <span class="avatar" style="width:28px;height:28px;font-size:11px;background:${avatarColor(s.name)}">${esc(initials(s.name))}</span>
                      <b>${esc(s.name)}</b>
                    </div></td>
                    <td style="min-width:130px">
                      <div class="row tight" style="margin-bottom:4px">
                        <span class="num small" style="font-weight:700">${s.readiness}%</span>
                        <span style="color:${trendCol};font-size:11px">${trendIco}</span>
                      </div>
                      <div class="bar thin ${b.tone}"><i style="width:${s.readiness}%"></i></div>
                    </td>
                    <td><span class="pill ${s.readiness < 60 ? 'bad' : 'plain'}">${esc(skillShort(COHORT.track, s.weak))}</span></td>
                    <td class="num">${s.drills}</td>
                    <td class="small muted">${esc(s.lastActive)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="tiny muted" style="margin-top:10px">คลิกที่แถวเพื่อดูรายละเอียดและคำแนะนำรายบุคคล</p>
        </div>

        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-head"><div><h2>ทักษะที่ทั้งห้องอ่อน</h2><p>ใช้เลือกหัวข้อสอนซ่อม</p></div></div>
            <div class="radar-wrap">
              ${radarChart(
                t.skills.map(s => s.short),
                [
                  { name:'เกณฑ์ผ่าน', values: t.skills.map(() => 0.8), color:'var(--brand-200)', fill:.3, dots:false },
                  { name:'ค่าเฉลี่ยห้อง', values: t.skills.map(s => COHORT.classMastery[s.id] ?? .5), color:'var(--brand-600)', fill:.24 },
                ], { size: 280 })}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>จำนวนคนที่อ่อนแต่ละเรื่อง</h2></div></div>
            ${barList(Object.entries(weakCount).map(([k, n]) => ({
              label: skillName(COHORT.track, k),
              value: Math.round(n / COHORT.students.length * 100),
              tone: n >= 3 ? 'bad' : 'warn',
            })))}
            <p class="tiny muted" style="margin-top:10px">
              ${weakCount[weakSkills[0][0]] || 0} คนมีจุดอ่อนหลักอยู่ที่ “${esc(skillName(COHORT.track, weakSkills[0][0]))}”
              — คุ้มที่สุดถ้าสอนซ่อมเรื่องนี้ทั้งห้องพร้อมกัน
            </p>
          </div>
        </div>
      </section>

      <section class="card" style="background:var(--brand-50);border-color:var(--brand-200)">
        <div class="card-head">
          <div class="track-ico" style="background:#fff">${icon('teacher')}</div>
          <div>
            <h2>ระบบนี้ช่วยลดภาระครูอย่างไร</h2>
            <p style="font-size:13.5px;line-height:1.75;color:var(--ink-2);margin-top:6px">
              ปัญหาที่พบบ่อยคือครูหนึ่งคนดูแลนักเรียนหลายสิบคน จึงให้ feedback รายบุคคลอย่างละเอียดไม่ไหว
              ระบบนี้ให้ feedback อัตโนมัติกับนักเรียนทุกครั้งที่ทำข้อสอบและฝึกหน้ากล้อง
              แล้วสรุปมาให้ครูเห็นเฉพาะ “ใครต้องช่วย” และ “ควรสอนซ่อมเรื่องอะไร”
              เวลาของครูจึงไปอยู่ที่การสอนจริง ไม่ใช่การตรวจและติดตาม
            </p>
          </div>
        </div>
      </section>
    </div>`;
  },

  mount(root, ctx){
    root.querySelector('#sort')?.addEventListener('change', e => {
      sortKey = e.target.value;
      paint(root, this.render(ctx));   // paint = ล้าง listener เดิมก่อนวาดใหม่
      this.mount(root, ctx);
    });

    on(root, 'click', '[data-student]', (e, tr) => {
      const s = COHORT.students.find(x => x.name === tr.dataset.student);
      if (!s) return;
      const b = readinessBand(s.readiness);
      const drills = drillsFor(COHORT.track);
      modal(`
        <div class="row" style="gap:13px">
          <span class="avatar" style="width:48px;height:48px;font-size:17px;border-radius:15px;background:${avatarColor(s.name)}">${esc(initials(s.name))}</span>
          <div style="flex:1">
            <h2 style="font-size:19px">${esc(s.name)}</h2>
            <p class="small muted">${esc(COHORT.name)}</p>
          </div>
          ${ring(s.readiness/100, { size:64, stroke:7, label:s.readiness, sub:'พร้อม' })}
        </div>

        <div class="row tight" style="margin-top:14px">
          <span class="pill ${b.tone}">${b.label}</span>
          <span class="pill plain">${icon('camera')} ฝึกกล้อง ${s.drills} ครั้ง</span>
          <span class="pill plain">${icon('clock')} ${esc(s.lastActive)}</span>
        </div>

        <div class="divider" style="margin:18px 0"></div>

        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px">คำแนะนำอัตโนมัติสำหรับครู</h3>
        <ul class="stack" style="gap:9px">
          <li class="small" style="line-height:1.7">• จุดอ่อนหลักคือ <b>${esc(skillName(COHORT.track, s.weak))}</b>
            ${(weakSameAs(s.weak) > 1) ? `— มีอีก ${weakSameAs(s.weak) - 1} คนในห้องอ่อนเรื่องเดียวกัน จัดสอนซ่อมกลุ่มย่อยได้` : '— เหมาะกับการติวเดี่ยวหรือมอบหมายชุดฝึกเฉพาะจุด'}</li>
          ${s.drills < 3 ? `<li class="small" style="line-height:1.7">• ฝึกภาคปฏิบัติน้อยเพียง ${s.drills} ครั้ง
            ${drills.length ? `— มอบหมายบทฝึก “${esc(drills[0].name)}” เป็นการบ้าน` : ''}</li>` : ''}
          ${s.trend === 'down' ? `<li class="small" style="line-height:1.7">• คะแนนมีแนวโน้มลดลง ควรพูดคุยเรื่องภาระหรืออุปสรรคการเรียน</li>` : ''}
          ${/วันก่อน/.test(s.lastActive) ? `<li class="small" style="line-height:1.7">• ไม่ได้เข้าใช้งาน ${esc(s.lastActive)} — ติดตามก่อนที่ช่องว่างจะกว้างขึ้น</li>` : ''}
          ${s.readiness >= 80 ? `<li class="small" style="line-height:1.7">• พร้อมลงสนามแล้ว อาจให้ช่วยติวเพื่อนเพื่อยกระดับทั้งห้อง</li>` : ''}
        </ul>

        <div class="row" style="justify-content:flex-end;margin-top:20px">
          <button class="btn btn-primary" data-close>เข้าใจแล้ว</button>
        </div>`);
    });

    on(root, 'click', '[data-plan], [data-export]', () => {
      const weak = Object.entries(COHORT.classMastery).sort((a, b) => a[1] - b[1]).slice(0, 3);
      modal(`
        <h2>แผนสอนซ่อมที่ระบบแนะนำ</h2>
        <p class="small muted" style="margin-top:4px">${esc(COHORT.name)} · ${esc(COHORT.examIn)}ก่อนสอบ</p>
        <div class="stack" style="gap:12px;margin-top:18px">
          ${weak.map(([id, m], i) => `
            <div class="quest">
              <div class="q-ico" style="background:var(--brand-600);color:#fff;font-weight:700">${i + 1}</div>
              <div class="q-body">
                <b>${esc(skillName(COHORT.track, id))}</b>
                <span>ค่าเฉลี่ยห้องอยู่ที่ ${Math.round(m*100)}% (เกณฑ์ผ่าน 80%) ·
                  ${weakSameAs(id)} คนมีจุดอ่อนหลักที่เรื่องนี้</span>
              </div>
            </div>`).join('')}
        </div>
        <div class="explain" style="margin-top:18px">
          <h4>${icon('bulb')} ข้อเสนอแนะการจัดคาบ</h4>
          <ol class="steps">
            <li>คาบที่ 1–2: สอนซ่อม “${esc(skillName(COHORT.track, weak[0][0]))}” ทั้งห้อง แล้วให้ทำชุดข้อสอบเฉพาะจุด 10 ข้อ</li>
            <li>คาบที่ 3: แบ่งกลุ่มย่อยตามจุดอ่อนรอง ให้กลุ่มที่พร้อมแล้วช่วยติวเพื่อน</li>
            <li>ทุกสัปดาห์: มอบหมายบทฝึกหน้ากล้อง 1 บท เพื่อเก็บหลักฐานภาคปฏิบัติ</li>
            <li>สัปดาห์สุดท้าย: ให้ทุกคนทำสอบจำลองจับเวลา แล้วดูว่าใครยังต่ำกว่า 70%</li>
          </ol>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:18px">
          <button class="btn btn-primary" data-close>ปิด</button>
        </div>`);
    });
  },
};

const weakSameAs = skillId => COHORT.students.filter(s => s.weak === skillId).length;
