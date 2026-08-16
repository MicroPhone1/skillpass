/* ============================================================
   views/home.js — หน้าแรก: เควสต์ประจำวัน ความพร้อม และสิ่งที่ควรทำต่อ
   ============================================================ */

import { icon, on, esc, ring, sparkline, timeAgo, scoreTone, modal, toast } from '../ui.js';
import { state, quests, questProgress, levelInfo, today, addXP, grantBadge, save, displayName } from '../store.js';
import { TRACKS, trackById, skillName } from '../data/tracks.js';
import { drillsFor, drillById } from '../data/drills.js';
import { CURIOSITY } from '../data/kb.js';
import { trackReadiness, readinessBand, weakestSkill, overallReadiness } from '../engine/adaptive.js';

const greet = () => {
  const h = new Date().getHours();
  return h < 11 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนค่ำ';
};

const curioOfDay = () => {
  const d = new Date();
  const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  return CURIOSITY[seed % CURIOSITY.length];
};

export default {
  title: 'หน้าแรก',
  sub: () => [displayName(), state.profile.school].filter(Boolean).join(' · '),

  render(){
    const t   = trackById(state.activeTrack);
    const rd  = trackReadiness(t.id);
    const band= readinessBand(rd);
    const lv  = levelInfo();
    const qs  = quests();
    const weak= weakestSkill(t.id);
    const cur = curioOfDay();
    const log = state.readinessLog[t.id] || [];
    const trend = log.length > 1 ? log.map(r => r.value) : [Math.max(4, rd - 12), rd];
    const drills = drillsFor(t.id);
    const doneQ = qs.filter(q => q.done).length;

    return `
    <div class="stack" style="gap:22px">

      <!-- ===== hero ===== -->
      <section class="hero">
        <div class="row" style="gap:22px;align-items:center;justify-content:space-between">
          <div style="min-width:min(100%,300px);flex:1">
            <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
              ${icon('flame')} เรียนต่อเนื่อง ${state.streak} วัน
            </span>
            <h2 style="margin-top:12px">${greet()} ${esc(displayName())} — วันนี้ฝึกอะไรดี?</h2>
            <p>คุณกำลังเตรียม <b style="color:#fff">${esc(t.name)}</b> · ${esc(t.cert)}</p>
            <div class="row" style="margin-top:16px">
              <a class="btn btn-primary btn-lg" href="#/exam?track=${t.id}">
                ${icon('play')} ทำข้อสอบปรับระดับ
              </a>
              ${drills.length ? `<a class="btn btn-ghost btn-lg" href="#/lab/${drills[0].id}">
                ${icon('camera')} ฝึกหน้ากล้อง</a>` : ''}
            </div>
          </div>
          <div style="text-align:center;flex:none">
            ${ring(rd/100, { size:118, stroke:11, label:rd + '%', sub:'ความพร้อม', color:'#fff' })}
            <div class="tiny" style="color:var(--blue-200);margin-top:6px;font-weight:600">${band.label}</div>
          </div>
        </div>
      </section>

      <!-- ===== stat tiles ===== -->
      <section class="grid g4">
        <div class="tile">
          ${icon('bolt', 't-ico')}
          <div class="t-lbl">เลเวล</div>
          <div class="t-val">${lv.level}</div>
          <div class="bar thin" style="margin-top:6px"><i style="width:${Math.round(lv.progress*100)}%"></i></div>
          <div class="t-sub" style="margin-top:4px">อีก ${lv.need - lv.into} XP ถึงเลเวลถัดไป</div>
        </div>
        <div class="tile">
          ${icon('target', 't-ico')}
          <div class="t-lbl">เควสต์วันนี้</div>
          <div class="t-val">${doneQ}<span style="font-size:16px;color:var(--ink-4)">/${qs.length}</span></div>
          <div class="t-sub">${doneQ === qs.length ? 'ครบแล้ว เยี่ยมมาก!' : 'ทำให้ครบเพื่อรับ XP โบนัส'}</div>
        </div>
        <div class="tile">
          ${icon('exam', 't-ico')}
          <div class="t-lbl">ข้อสอบวันนี้</div>
          <div class="t-val">${today().questions || 0}</div>
          <div class="t-sub">รวมทั้งหมด ${state.examHistory.reduce((s,e)=>s+(e.items||0),0)} ข้อ</div>
        </div>
        <div class="tile">
          ${icon('camera', 't-ico')}
          <div class="t-lbl">ฝึกหน้ากล้อง</div>
          <div class="t-val">${state.drillHistory.length}</div>
          <div class="t-sub">ครั้งที่ทำสะสม</div>
        </div>
      </section>

      <!-- ===== quests + next up ===== -->
      <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <div class="card">
          <div class="card-head">
            <div>
              <h2>เควสต์ประจำวัน</h2>
              <p>ทำให้ครบเพื่อรักษาสถิติต่อเนื่องและได้ XP</p>
            </div>
          </div>
          <div class="stack" style="gap:9px">
            ${qs.map(q => `
              <div class="quest ${q.done ? 'done' : ''}">
                <div class="q-ico">${icon(q.done ? 'check' : q.icon)}</div>
                <div class="q-body">
                  <b>${esc(q.title)}</b>
                  <span>${q.done ? 'สำเร็จแล้ว' : `ความคืบหน้า ${q.progress}/${q.goal}`}</span>
                  ${q.done ? '' : `<div class="bar thin" style="margin-top:5px"><i style="width:${Math.round(q.progress/q.goal*100)}%"></i></div>`}
                </div>
                <div class="q-xp">+${q.xp} XP</div>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h2>สิ่งที่ควรทำต่อ</h2>
              <p>เลือกให้จากจุดอ่อนล่าสุดของคุณ</p>
            </div>
          </div>
          <div class="stack" style="gap:10px">
            <a class="quest" href="#/exam?track=${t.id}&skill=${weak.skill.id}&length=5">
              <div class="q-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('target')}</div>
              <div class="q-body">
                <b>ซ่อมจุดอ่อน: ${esc(weak.skill.name)}</b>
                <span>ความชำนาญตอนนี้ ${Math.round(weak.mastery*100)}% — ทำ 5 ข้อเจาะเฉพาะเรื่องนี้</span>
              </div>
              ${icon('arrowR')}
            </a>
            ${drills.length ? `
            <a class="quest" href="#/lab/${drills[0].id}">
              <div class="q-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('camera')}</div>
              <div class="q-body">
                <b>${esc(drills[0].name)}</b>
                <span>${esc(drills[0].short)}</span>
              </div>
              ${icon('arrowR')}
            </a>` : ''}
            <a class="quest" href="#/tutor?track=${t.id}&skill=${weak.skill.id}">
              <div class="q-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('brain')}</div>
              <div class="q-body">
                <b>ให้ติวเตอร์สรุปหลักการให้</b>
                <span>อ่านสรุป “${esc(weak.skill.name)}” พร้อมแหล่งอ้างอิง</span>
              </div>
              ${icon('arrowR')}
            </a>
          </div>
        </div>
      </section>

      <!-- ===== curiosity ===== -->
      <section class="card" style="background:linear-gradient(120deg,var(--blue-50),var(--surface));border-color:var(--blue-200)">
        <div class="card-head">
          <div class="track-ico" style="background:var(--surface);color:var(--warn)">${icon('bulb')}</div>
          <div style="flex:1">
            <h2>รู้ไว้ใช่ว่า · ประจำวันนี้</h2>
            <p>คำถามชวนคิดที่ไม่มีในข้อสอบ แต่ทำให้คุณเข้าใจลึกขึ้น</p>
          </div>
          <span class="pill warn">${esc(cur.tag)}</span>
        </div>
        <p style="font-size:16px;font-weight:600;line-height:1.6">${esc(cur.q)}</p>
        <div id="curio-answer" class="u-hide explain" style="margin-top:12px">
          <p style="font-size:14px;line-height:1.75">${esc(cur.a)}</p>
        </div>
        <button class="btn btn-soft" id="curio-btn" style="margin-top:14px">${icon('eye')} เฉลย</button>
      </section>

      <!-- ===== progress + tracks ===== -->
      <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <div class="card">
          <div class="card-head">
            <div><h2>แนวโน้มความพร้อม</h2><p>${esc(t.name)}</p></div>
            <div class="spacer"></div>
            <span class="pill ${band.tone}">${band.label}</span>
          </div>
          ${sparkline(trend)}
          <p class="small muted" style="margin-top:8px">${band.note}</p>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h2>เส้นทางที่กำลังเรียน</h2><p>ความพร้อมเฉลี่ยรวม ${overallReadiness()}%</p></div>
            <div class="spacer"></div>
            <a class="btn btn-ghost btn-sm" href="#/tracks">เพิ่มเส้นทาง</a>
          </div>
          <div class="stack" style="gap:12px">
            ${state.enrolled.map(id => {
              const tr = trackById(id), r = trackReadiness(id);
              return `<a class="row" style="gap:12px;text-decoration:none;color:inherit" href="#/exam?track=${id}">
                <div class="track-ico" style="width:38px;height:38px;border-radius:12px">${icon(tr.icon)}</div>
                <div style="flex:1;min-width:0">
                  <div class="spread" style="margin-bottom:4px">
                    <b style="font-size:14px">${esc(tr.name)}</b>
                    <span class="small num" style="font-weight:700;color:var(--${scoreTone(r)==='ok'?'ok':scoreTone(r)==='warn'?'warn':'bad'})">${r}%</span>
                  </div>
                  <div class="bar ${scoreTone(r)}"><i style="width:${r}%"></i></div>
                </div>
              </a>`;
            }).join('')}
          </div>
        </div>
      </section>

      ${state.drillHistory.length || state.examHistory.length ? `
      <section class="card">
        <div class="card-head"><div><h2>กิจกรรมล่าสุด</h2></div></div>
        <div class="stack" style="gap:0">
          ${[...state.examHistory.slice(0,3).map(e => ({ kind:'exam', ...e })),
             ...state.drillHistory.slice(0,3).map(d => ({ kind:'drill', ...d }))]
            .sort((a,b) => b.at - a.at).slice(0,5).map(a => {
              const isExam = a.kind === 'exam';
              const label = isExam
                ? `ทดสอบ ${trackById(a.trackId).name} · ${a.items} ข้อ`
                : `ฝึกกล้อง: ${drillById(a.drillId)?.name || a.drillId}`;
              const v = isExam ? a.percent : a.score;
              return `<div class="rubric-row">
                <div class="track-ico" style="width:34px;height:34px;border-radius:11px;background:var(--${isExam?'blue-50':'cyan-soft'});color:var(--${isExam?'blue-600':'cyan'})">${icon(isExam?'exam':'camera')}</div>
                <div class="r-name"><b style="font-weight:600">${esc(label)}</b><br><span class="tiny muted">${timeAgo(a.at)}</span></div>
                <div class="r-score" style="color:var(--${scoreTone(v)==='ok'?'ok':scoreTone(v)==='warn'?'warn':'bad'})">${v}%</div>
              </div>`;
            }).join('')}
        </div>
      </section>` : ''}

      <p class="tiny muted" style="text-align:center;padding:8px 0 4px">
        เช็คช่าง · ต้นแบบเพื่อการสาธิต — เนื้อหาข้อสอบและคลังความรู้เป็นตัวอย่าง ต้องให้ผู้เชี่ยวชาญตรวจสอบก่อนใช้จริง
      </p>
    </div>`;
  },

  mount(root){
    on(root, 'click', '#curio-btn', (e, t) => {
      const box = root.querySelector('#curio-answer');
      const opened = box.classList.toggle('u-hide') === false;
      t.innerHTML = opened ? icon('check') + ' อ่านแล้ว' : icon('eye') + ' เฉลย';
      if (opened){
        questProgress('curio');
        if (!today().curioDone){ today().curioDone = true; save(); addXP(10, 'ใฝ่รู้ประจำวัน'); }
        grantBadge('curious', 'นักตั้งคำถาม');
      }
    });
  },
};
