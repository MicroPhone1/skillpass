/* ============================================================
   views/tracks.js — แคตตาล็อกเส้นทางทักษะ + หน้ารายละเอียด
   ============================================================ */

import { icon, on, esc, barList, toast, scoreTone } from '../ui.js';
import { state, setActiveTrack, abilityFor } from '../store.js';
import { TRACKS, CATEGORIES, trackById, catById } from '../data/tracks.js';
import { drillsFor, MODE_LABEL, MODE_ICON } from '../data/drills.js';
import { byTrack } from '../data/questions.js';
import { trackReadiness, readinessBand } from '../engine/adaptive.js';
import { standardForTrack, wageGap, MINIMUM_WAGE } from '../data/standards.js';
import { go } from '../app.js';

export default {
  title: ctx => ctx.route.sub ? trackById(ctx.route.sub).name : 'เส้นทางทักษะ',
  sub: ctx => ctx.route.sub
    ? trackById(ctx.route.sub).cert
    : 'เลือกสิ่งที่อยากเก่ง — ครอบคลุมทั้งงานช่าง ไอที ภาษา สุขภาพ วิทยาศาสตร์ และทักษะชีวิต',

  render(ctx){
    return ctx.route.sub ? detail(ctx.route.sub) : catalog();
  },

  mount(root){
    on(root, 'click', '[data-enroll]', (e, t) => {
      const id = t.dataset.enroll;
      setActiveTrack(id);
      toast(`ตั้ง “${trackById(id).name}” เป็นเส้นทางหลักแล้ว`, 'ok');
      go('tracks/' + id);
    });
    on(root, 'click', '[data-filter]', (e, t) => {
      const cat = t.dataset.filter;
      root.querySelectorAll('[data-filter]').forEach(b => {
        const active = b === t;
        b.setAttribute('aria-pressed', String(active));
        // ต้องสลับคลาสด้วย ไม่งั้นปุ่มที่เลือกไม่เปลี่ยนสีให้เห็น
        b.className = 'btn btn-sm ' + (active ? 'btn-soft' : 'btn-ghost');
      });
      let shown = 0;
      root.querySelectorAll('[data-cat]').forEach(sec => {
        sec.hidden = cat !== 'all' && sec.dataset.cat !== cat;
        if (!sec.hidden) shown++;
      });
      const none = root.querySelector('#cat-empty');
      if (none) none.hidden = shown > 0;
    });
  },
};

/* ------------------------------------------------------------ catalog */
function catalog(){
  return `
  <div class="stack" style="gap:20px">

    <div class="row" style="gap:8px;overflow-x:auto;padding-bottom:4px">
      <button class="btn btn-sm btn-soft" data-filter="all" aria-pressed="true">ทั้งหมด</button>
      ${CATEGORIES.map(c => `<button class="btn btn-sm btn-ghost" data-filter="${c.id}" aria-pressed="false">${c.name}</button>`).join('')}
    </div>

    ${CATEGORIES.map(cat => {
      const list = TRACKS.filter(t => t.cat === cat.id);
      if (!list.length) return '';
      return `
      <section data-cat="${cat.id}">
        <div class="section-title">${icon(cat.icon)} ${esc(cat.name)}</div>
        <div class="grid g3">
          ${list.map(t => {
            const enrolled = state.enrolled.includes(t.id);
            const r = trackReadiness(t.id);
            const nq = byTrack(t.id).length, nd = drillsFor(t.id).length;
            return `
            <a class="track-card${state.activeTrack === t.id ? ' selected' : ''}" href="#/tracks/${t.id}">
              <div class="row" style="gap:12px;align-items:flex-start">
                <div class="track-ico">${icon(t.icon)}</div>
                <div style="flex:1;min-width:0">
                  <h3>${esc(t.name)}</h3>
                  <div class="t-cert">${esc(t.short)}</div>
                </div>
              </div>
              <div class="row tight">
                <span class="pill plain">${icon('exam')} ${nq} ข้อ</span>
                ${nd ? `<span class="pill cyan">${icon('camera')} ${nd} บทฝึก</span>` : ''}
                <span class="pill plain">${esc(t.hours)}</span>
              </div>
              ${enrolled ? `
                <div>
                  <div class="spread" style="margin-bottom:5px">
                    <span class="tiny muted">ความพร้อม</span>
                    <span class="tiny num" style="font-weight:700">${r}%</span>
                  </div>
                  <div class="bar thin ${scoreTone(r)}"><i style="width:${r}%"></i></div>
                </div>`
              : `<span class="tiny muted">${esc(t.cert)}</span>`}
            </a>`;
          }).join('')}
        </div>
      </section>`;
    }).join('')}

    <div class="card empty" id="cat-empty" hidden>
      ${icon('compass')}
      <h3>ยังไม่มีเส้นทางในหมวดนี้</h3>
      <p>เลือกหมวดอื่น หรือกด “ทั้งหมด” เพื่อดูเส้นทางที่เปิดอยู่ทุกสาย</p>
    </div>

    <div class="card" style="background:var(--brand-50);border-color:var(--brand-200)">
      <div class="card-head">
        <div class="track-ico" style="background:#fff">${icon('globe')}</div>
        <div>
          <h2>ทำไมถึงไม่จำกัดแค่สายอาชีพ</h2>
          <p style="margin-top:6px;font-size:13.5px;line-height:1.75;color:var(--ink-2)">
            เอนจินเดียวกัน — ปรับความยากตามผู้เรียน อธิบายเฉลยพร้อมแหล่งอ้างอิง และตรวจภาคปฏิบัติผ่านกล้อง —
            ใช้ได้กับทุกทักษะที่ต้อง “ฝึกจนทำเป็น” ไม่ใช่แค่ “ท่องจนจำได้”
            ตั้งแต่การกดหน้าอก CPR การขันน็อตล้อ ไปจนถึงการยืนพูดหน้าห้อง
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ detail */
function detail(id){
  const t = trackById(id);
  const cat = catById(t.cat);
  const a = abilityFor(t.id);
  const r = trackReadiness(t.id);
  const band = readinessBand(r);
  const drills = drillsFor(t.id);
  const qs = byTrack(t.id);
  const enrolled = state.enrolled.includes(t.id);

  /* เส้นทางที่ตรงกับใบรับรอง DSD จริงจะมีเกณฑ์มาตรฐานมาแสดงเพิ่ม
     เส้นทางอื่น (ภาษา ไอที ทักษะชีวิต) ยังไม่มี ก็ซ่อนการ์ดนี้ไป */
  const std = standardForTrack(t.id);
  const gap = std ? wageGap(std, 1) : null;

  const skillBars = t.skills.map(s => ({
    label: s.name,
    value: Math.round((a.skills[s.id]?.mastery ?? 0.35) * 100),
  }));

  const byType = qs.reduce((m, q) => (m[q.type] = (m[q.type] || 0) + 1, m), {});
  const TYPE_TH = { mcq:'ปรนัย', multi:'เลือกหลายข้อ', numeric:'คำนวณ', order:'เรียงลำดับ' };

  return `
  <div class="stack" style="gap:20px">
    <a class="btn btn-ghost btn-sm" href="#/tracks" style="align-self:flex-start">${icon('arrowL')} กลับไปทั้งหมด</a>

    <section class="hero">
      <div class="row" style="justify-content:space-between;gap:20px">
        <div style="flex:1;min-width:min(100%,280px)">
          <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
            ${icon(cat.icon)} ${esc(cat.name)}
          </span>
          <h2 style="margin-top:12px">${esc(t.name)}</h2>
          <p>${esc(t.short)} · ${esc(t.cert)}</p>
          <div class="row" style="margin-top:16px">
            <a class="btn btn-primary" href="#/exam?track=${t.id}">${icon('play')} เริ่มทดสอบปรับระดับ</a>
            ${drills.length ? `<a class="btn btn-ghost" href="#/lab/${drills[0].id}">${icon('camera')} ฝึกภาคปฏิบัติ</a>` : ''}
            ${enrolled && state.activeTrack === t.id ? '' :
              `<button class="btn btn-ghost" data-enroll="${t.id}">${icon('target')} ตั้งเป็นเป้าหมายหลัก</button>`}
          </div>
        </div>
      </div>
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))">
      <div class="card">
        <div class="card-head">
          <div><h2>ระดับทักษะของคุณ</h2><p>อัปเดตอัตโนมัติทุกครั้งที่ทำข้อสอบ</p></div>
          <div class="spacer"></div>
          <span class="pill ${band.tone}">${r}% · ${band.label}</span>
        </div>
        ${barList(skillBars)}
      </div>

      <div class="card">
        <div class="card-head"><div><h2>โครงสร้างคลังข้อสอบ</h2><p>${qs.length} ข้อ · อิงเกณฑ์ ${esc(t.cert)}</p></div></div>
        <div class="stack" style="gap:0">
          ${Object.entries(byType).map(([k, n]) => `
            <div class="rubric-row">
              <span class="r-name">${TYPE_TH[k] || k}</span>
              <span class="r-score">${n} ข้อ</span>
            </div>`).join('')}
          <div class="rubric-row">
            <span class="r-name">ช่วงความยาก</span>
            <span class="r-score">${Math.min(...qs.map(q=>q.b)).toFixed(1)} ถึง ${Math.max(...qs.map(q=>q.b)).toFixed(1)}</span>
          </div>
        </div>
        <p class="tiny muted" style="margin-top:12px">
          ระบบเลือกข้อถัดไปจากค่าความยากที่ให้ข้อมูลมากที่สุด ณ ระดับความสามารถปัจจุบันของคุณ
          จึงวัดได้แม่นด้วยจำนวนข้อที่น้อยกว่าข้อสอบแบบเดิม
        </p>
      </div>
    </section>

    ${drills.length ? `
    <section>
      <div class="section-title">${icon('camera')} บทฝึกหน้ากล้องของเส้นทางนี้</div>
      <div class="grid g3">
        ${drills.map(d => `
          <a class="track-card" href="#/lab/${d.id}">
            <div class="row" style="gap:12px;align-items:flex-start">
              <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon(d.icon)}</div>
              <div style="flex:1;min-width:0">
                <h3>${esc(d.name)}</h3>
                <div class="t-cert">${esc(d.short)}</div>
              </div>
            </div>
            <div class="row tight">
              <span class="pill cyan">${icon(MODE_ICON[d.mode])} ${MODE_LABEL[d.mode]}</span>
              <span class="pill plain">${esc(d.level)}</span>
              <span class="pill plain">${icon('clock')} ~${d.minutes} นาที</span>
            </div>
          </a>`).join('')}
      </div>
    </section>` : `
    <div class="card empty">
      ${icon('camera')}
      <h3>เส้นทางนี้ยังไม่มีบทฝึกหน้ากล้อง</h3>
      <p>เนื้อหาสายทฤษฎีล้วนจะเน้นที่ข้อสอบปรับระดับและติวเตอร์ AI แทน</p>
    </div>`}

    ${std ? `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>เกณฑ์มาตรฐานจริงที่ใช้สอบ</h2>
          <p>${esc(std.name)} · ${esc(std.authority)}</p>
        </div>
        <div class="spacer"></div>
        <span class="pill plain">${std.modules.length} หมวด</span>
      </div>

      <div class="grid g4" style="margin-bottom:16px">
        <div class="tile">
          <div class="t-lbl">เกณฑ์ผ่าน</div>
          <div class="t-val" style="font-size:22px">${std.passing.gate ? '70% ทั้งสองภาค' : `${std.passing.combined}%`}</div>
          <div class="t-sub">${std.weights ? `ทฤษฎี ${std.weights.theory}% · ปฏิบัติ ${std.weights.practical}%` : 'ตัดสินแยกภาค'}</div>
        </div>
        <div class="tile">
          <div class="t-lbl">ค่าจ้างระดับ 1</div>
          <div class="t-val" style="font-size:22px;color:var(--ok)">${std.wage[1]} ฿</div>
          <div class="t-sub">ต่อวัน ตามมาตรฐานฝีมือ</div>
        </div>
        <div class="tile">
          <div class="t-lbl">มากกว่าค่าแรงขั้นต่ำ</div>
          <div class="t-val" style="font-size:22px;color:var(--ok)">+${gap.vsHigh} ฿</div>
          <div class="t-sub">≈ +${gap.perMonth.toLocaleString('th-TH')} ฿/เดือน (26 วัน)</div>
        </div>
        <div class="tile">
          <div class="t-lbl">ไต่ถึงระดับ 3</div>
          <div class="t-val" style="font-size:22px">${std.wage[3] || '—'} ฿</div>
          <div class="t-sub">${std.validYears ? `ใบรับรองมีอายุ ${std.validYears} ปี` : 'ต่อวัน'}</div>
        </div>
      </div>

      <div class="stack" style="gap:0">
        ${std.modules.map(m => `
          <div class="rubric-row">
            <span class="r-name">${String(m.n).padStart(2, '0')} · ${esc(m.th)}</span>
            <span class="r-score tiny muted">${esc(m.en)}</span>
          </div>`).join('')}
      </div>

      <p class="tiny muted" style="margin-top:12px">
        หมวดทั้งหมดอ้างอิงคู่มือเตรียมทดสอบมาตรฐานฝีมือแรงงานแห่งชาติของกรมพัฒนาฝีมือแรงงาน
        อัตราค่าจ้างอ้างอิงประกาศคณะกรรมการค่าจ้าง (ฉบับที่ 13) เทียบกับค่าแรงขั้นต่ำ ${MINIMUM_WAGE.high} บาท
        ${std.wageNote ? `· ${esc(std.wageNote)}` : ''}
      </p>
    </section>` : ''}

    <section class="card">
      <div class="card-head"><div><h2>ทักษะย่อยที่ต้องเก็บให้ครบ</h2><p>ระบบจะกระจายข้อสอบให้ครอบคลุมทุกด้าน ไม่กระจุกอยู่เรื่องเดียว</p></div></div>
      <div class="grid g4">
        ${t.skills.map(s => {
          const st = a.skills[s.id];
          const m = Math.round((st?.mastery ?? 0.35) * 100);
          return `<div class="tile">
            <div class="t-lbl">${esc(s.name)}</div>
            <div class="t-val" style="font-size:22px;color:var(--${scoreTone(m)==='ok'?'ok':scoreTone(m)==='warn'?'warn':'bad'})">${m}%</div>
            <div class="t-sub">${st ? `ทำไปแล้ว ${st.n} ข้อ` : 'ยังไม่เคยวัด'}</div>
          </div>`;
        }).join('')}
      </div>
    </section>
  </div>`;
}
