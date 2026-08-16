/* ============================================================
   views/passport.js — สมุดทักษะ (Skill Passport) + เหรียญตรา
   ============================================================ */

import { icon, on, esc, ring, timeAgo, scoreTone } from '../ui.js';
import { state, levelInfo, resetAll, abilityFor, save, displayName } from '../store.js';
import { trackById, skillName } from '../data/tracks.js';
import { drillById } from '../data/drills.js';
import { trackReadiness, readinessBand, overallReadiness } from '../engine/adaptive.js';

const BADGES = [
  { id:'curious',  icon:'bulb',   name:'นักตั้งคำถาม',    how:'เปิดอ่าน “รู้ไว้ใช่ว่า” ครั้งแรก' },
  { id:'hands1',   icon:'hand',   name:'ลงมือทำจริง',     how:'ทำบทฝึกหน้ากล้องสำเร็จครั้งแรก' },
  { id:'handspro', icon:'medal',  name:'มือแม่น',          how:'ได้คะแนนบทฝึกหน้ากล้อง 85% ขึ้นไป' },
  { id:'hardhit',  icon:'bolt',   name:'นักล่าข้อยาก',     how:'ตอบข้อระดับยากได้ถูก' },
  { id:'sharp',    icon:'target', name:'แม่นยำ',           how:'ทำข้อสอบได้ 90% ขึ้นไปในหนึ่งชุด' },
  { id:'mock1',    icon:'clock',  name:'ผ่านสนามจำลอง',   how:'ทำข้อสอบโหมดจับเวลาจนจบ' },
  { id:'streak7',  icon:'flame',  name:'ไฟไม่มอด',         how:'เรียนต่อเนื่อง 7 วัน' },
  { id:'ready',    icon:'shield', name:'พร้อมลงสนาม',      how:'ความพร้อมของเส้นทางหลักถึง 80%' },
];

export default {
  title: 'สมุดทักษะ',
  sub: () => 'หลักฐานการฝึกของคุณ — คะแนน เหรียญ และประวัติที่ตรวจสอบย้อนหลังได้',

  render(){
    // ปลดล็อกเหรียญที่คำนวณจากสถานะปัจจุบัน
    if (state.streak >= 7 && !state.badges.includes('streak7')) state.badges.push('streak7');
    if (trackReadiness(state.activeTrack) >= 80 && !state.badges.includes('ready')) state.badges.push('ready');
    save();

    const lv = levelInfo();
    const t = trackById(state.activeTrack);
    const earned = BADGES.filter(b => state.badges.includes(b.id));
    const totalQ = state.examHistory.reduce((s, e) => s + (e.items || 0), 0);
    const bestDrill = [...state.drillHistory].sort((a, b) => b.score - a.score)[0];

    return `
    <div class="stack" style="gap:20px">

      <!-- ===== บัตรทักษะ ===== -->
      <section class="passport">
        <div class="spread" style="align-items:flex-start;gap:18px;flex-wrap:wrap">
          <div style="flex:1;min-width:min(100%,260px)">
            <div class="tiny" style="color:var(--blue-200);letter-spacing:2px;text-transform:uppercase;font-weight:700">
              เช็คช่าง · สมุดบันทึกทักษะ
            </div>
            <h2 style="font-size:26px;font-weight:700;letter-spacing:-.6px;margin-top:10px">${esc(displayName())}</h2>
            <p class="small" style="color:var(--blue-200)">${esc(state.profile.school || 'ยังไม่ได้ระบุสถาบัน')}</p>
            <div class="row tight" style="margin-top:14px">
              <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
                ${icon('bolt')} เลเวล ${lv.level}</span>
              <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
                ${icon('flame')} ${state.streak} วันต่อเนื่อง</span>
              <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
                ${icon('medal')} ${earned.length}/${BADGES.length} เหรียญ</span>
            </div>
          </div>
          <div style="text-align:center;flex:none">
            ${ring(overallReadiness()/100, { size:104, stroke:10, label: overallReadiness() + '%', sub:'เฉลี่ยรวม', color:'#fff' })}
          </div>
        </div>

        <div class="divider" style="margin:20px 0;background:rgba(255,255,255,.2)"></div>

        <div class="grid g4" style="gap:12px">
          ${[['ข้อสอบสะสม', totalQ + ' ข้อ'],
             ['ฝึกหน้ากล้อง', state.drillHistory.length + ' ครั้ง'],
             ['เส้นทางที่เรียน', state.enrolled.length + ' สาย'],
             ['ประสบการณ์', state.xp + ' XP']].map(([k, v]) => `
            <div>
              <div class="tiny" style="color:var(--blue-200)">${k}</div>
              <div style="font-size:20px;font-weight:700;letter-spacing:-.5px">${v}</div>
            </div>`).join('')}
        </div>
      </section>

      <!-- ===== เหรียญ ===== -->
      <section class="card">
        <div class="card-head">
          <div><h2>เหรียญตรา</h2><p>ได้จากการฝึกจริง ไม่ใช่แค่เข้าใช้งาน</p></div>
          <div class="spacer"></div>
          <span class="pill">${earned.length}/${BADGES.length}</span>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:12px">
          ${BADGES.map(b => {
            const got = state.badges.includes(b.id);
            return `<div class="badge-tile${got ? '' : ' locked'}" title="${esc(b.how)}">
              <div class="badge-medal">${icon(got ? b.icon : 'lock')}</div>
              <b>${esc(b.name)}</b>
              <span>${esc(b.how)}</span>
            </div>`;
          }).join('')}
        </div>
      </section>

      <!-- ===== ระดับความพร้อมแต่ละสาย ===== -->
      <section class="card">
        <div class="card-head"><div><h2>ระดับความพร้อมที่บันทึกไว้</h2><p>ใช้แสดงต่อครูที่ปรึกษาหรือสถานประกอบการได้</p></div></div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th>เส้นทาง</th><th>ใบรับรองเป้าหมาย</th><th>ความพร้อม</th><th>สถานะ</th><th class="right">ข้อสอบที่ทำ</th>
            </tr></thead>
            <tbody>
              ${state.enrolled.map(id => {
                const tr = trackById(id), r = trackReadiness(id), b = readinessBand(r);
                const a = abilityFor(id);
                const n = Object.values(a.skills).reduce((s, v) => s + v.n, 0);
                return `<tr>
                  <td><div class="row tight">${icon(tr.icon)} <b>${esc(tr.name)}</b></div></td>
                  <td class="small muted">${esc(tr.cert)}</td>
                  <td style="min-width:130px">
                    <div class="spread" style="margin-bottom:4px"><span class="tiny num">${r}%</span></div>
                    <div class="bar thin ${b.tone}"><i style="width:${r}%"></i></div>
                  </td>
                  <td><span class="pill ${b.tone}">${b.label}</span></td>
                  <td class="right num">${n}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- ===== หลักฐานการฝึกภาคปฏิบัติ ===== -->
      <section class="card">
        <div class="card-head">
          <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('camera')}</div>
          <div><h2>หลักฐานการฝึกภาคปฏิบัติ</h2><p>บันทึกคะแนนจากการตรวจด้วยกล้อง (ไม่เก็บวิดีโอ)</p></div>
        </div>
        ${state.drillHistory.length ? `
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>บทฝึก</th><th>ทักษะ</th><th>เมื่อ</th><th class="right">คะแนน</th></tr></thead>
              <tbody>
                ${state.drillHistory.slice(0, 12).map(h => {
                  const d = drillById(h.drillId);
                  return `<tr>
                    <td><b>${esc(d?.name || h.drillId)}</b></td>
                    <td class="small muted">${esc(d ? skillName(d.track, d.skill) : '')}</td>
                    <td class="small muted">${timeAgo(h.at)}</td>
                    <td class="right num" style="font-weight:700;color:var(--${scoreTone(h.score)==='ok'?'ok':scoreTone(h.score)==='warn'?'warn':'bad'})">${h.score}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${bestDrill ? `<p class="small muted" style="margin-top:12px">
            ผลงานดีที่สุด: <b>${esc(drillById(bestDrill.drillId)?.name || '')}</b> ที่ ${bestDrill.score}%
          </p>` : ''}`
        : `<div class="empty">${icon('camera')}
            <h3>ยังไม่มีหลักฐานภาคปฏิบัติ</h3>
            <p>ห้องฝึกหน้ากล้องจะบันทึกคะแนนให้อัตโนมัติ เริ่มจากบทฝึกแรกได้เลย</p>
            <a class="btn btn-primary btn-sm" href="#/lab" style="margin-top:14px">${icon('camera')} ไปห้องฝึก</a>
          </div>`}
      </section>

      <!-- ===== ประวัติการสอบ ===== -->
      <section class="card">
        <div class="card-head"><div><h2>ประวัติการทดสอบ</h2></div></div>
        ${state.examHistory.length ? `
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>เส้นทาง</th><th>โหมด</th><th>เมื่อ</th><th>จำนวนข้อ</th><th class="right">ผล</th></tr></thead>
              <tbody>
                ${state.examHistory.slice(0, 12).map(e => `<tr>
                  <td><b>${esc(trackById(e.trackId).name)}</b></td>
                  <td><span class="pill plain">${e.mode === 'mock' ? 'จับเวลา' : 'ปรับระดับ'}</span></td>
                  <td class="small muted">${timeAgo(e.at)}</td>
                  <td class="num">${e.items}</td>
                  <td class="right num" style="font-weight:700;color:var(--${scoreTone(e.percent)==='ok'?'ok':scoreTone(e.percent)==='warn'?'warn':'bad'})">${e.percent}%</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : `<div class="empty">${icon('exam')}<h3>ยังไม่มีประวัติ</h3>
            <p>ทำข้อสอบชุดแรกเพื่อเริ่มบันทึกความก้าวหน้า</p>
            <a class="btn btn-primary btn-sm" href="#/exam" style="margin-top:14px">${icon('play')} เริ่มทดสอบ</a></div>`}
      </section>

      <!-- ===== เกียรติบัตร ===== -->
      <section class="card">
        <div class="card-head">
          <div class="track-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('trophy')}</div>
          <div><h2>เกียรติบัตรที่ได้รับ</h2><p>ออกให้เมื่อผ่านเกณฑ์ทั้งภาคทฤษฎีและภาคปฏิบัติ</p></div>
          <div class="spacer"></div>
          <a class="btn btn-ghost btn-sm" href="#/certs">ดูทั้งหมด ${icon('arrowR')}</a>
        </div>
        ${state.certificates.length ? `
          <div class="stack" style="gap:0">
            ${state.certificates.slice(0, 5).map(c => `
              <a class="rubric-row" href="#/certs/${c.id}" style="color:inherit;text-decoration:none">
                <div class="track-ico" style="width:34px;height:34px;border-radius:11px;background:var(--warn-soft);color:var(--warn)">${icon('medal')}</div>
                <div class="r-name"><b style="font-weight:600">${esc(trackById(c.trackId).name)}</b><br>
                  <span class="tiny muted num">${esc(c.code)} · ${timeAgo(c.issuedAt)}</span></div>
                <div class="r-score">${c.score}%</div>
              </a>`).join('')}
          </div>`
        : `<div class="empty" style="padding:30px 16px">${icon('trophy')}
            <h3>ยังไม่มีเกียรติบัตร</h3>
            <p>ทำข้อสอบให้ครบเกณฑ์แล้วพิสูจน์ภาคปฏิบัติหน้ากล้อง ระบบจะออกใบให้อัตโนมัติ</p>
            <a class="btn btn-primary btn-sm" href="#/certs" style="margin-top:14px">${icon('target')} ดูเกณฑ์การได้รับ</a>
          </div>`}
      </section>

      <div class="row" style="justify-content:center;gap:10px;padding-bottom:6px">
        <a class="btn btn-ghost btn-sm" href="#/profile">${icon('people')} แก้ไขโปรไฟล์</a>
        <button class="btn btn-danger btn-sm" data-reset>${icon('refresh')} ล้างข้อมูลทั้งหมด</button>
      </div>
      <p class="tiny muted" style="text-align:center">
        ข้อมูลทั้งหมดเก็บอยู่ใน localStorage ของเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีการส่งออกภายนอก
      </p>
    </div>`;
  },

  mount(root){
    on(root, 'click', '[data-reset]', () => {
      if (confirm('ล้างความคืบหน้า เหรียญ เกียรติบัตร และประวัติทั้งหมด?\nการกระทำนี้ย้อนกลับไม่ได้')) resetAll();
    });
  },
};
