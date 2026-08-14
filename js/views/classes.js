/* ============================================================
   views/classes.js — ชั้นเรียน · ตารางสอน · รายชื่อนักเรียน
   ------------------------------------------------------------
   หน้าเดียวรับสองบทบาท:
     ครู     → สร้างชั้นเรียน จัดตาราง เพิ่มนักเรียน ให้ AI ร่างแผนการสอน
     นักเรียน → เข้าร่วมด้วยรหัส ดูตารางเรียนและแผนของชั้นที่อยู่
   ============================================================ */

import { icon, on, esc, paint, toast, modal, field, dropdown, mountDropdowns,
         avatar, timeAgo, scoreTone } from '../ui.js';
import { state, abilityFor, displayName } from '../store.js';
import { currentUser } from '../auth.js';
import { TRACKS, trackById, skillName, skillsOf } from '../data/tracks.js';
import { trackReadiness, weakestSkill } from '../engine/adaptive.js';
import { DAYS, DAY_SHORT, allClasses, classById, classesTaughtBy, classesJoinedBy,
         createClass, deleteClass, addStudent, removeStudent, joinByCode,
         addSlot, removeSlot, scheduleByDay, weeklyHours, nextSlot, savePlan } from '../classroom.js';
import { planLessons, analyseClass } from '../ai/roles.js';
import { sourceBadge } from '../ai/presentation.js';
import { assistantPanel, mountAssistant } from '../ai/assistant.js';

const isTeacher = () => state.role === 'teacher';
const me = () => currentUser()?.uid || 'anon';

let tab = 'roster';          // roster | schedule | plan
let planCache = new Map();   // classId -> ผลจาก AI (ไม่ต้องเรียกซ้ำทุกครั้งที่สลับแท็บ)
let analysisCache = new Map();

/* ------------------------------------------------------------ ขอบเขตผู้ช่วย AI */
function scopeFor(cls){
  return {
    key: cls ? 'class-' + cls.id : 'class-list',
    name: cls ? `ชั้นเรียน ${cls.name}` : 'รายการชั้นเรียน',
    topics: cls
      ? 'ตารางสอน · รายชื่อนักเรียน · แผนการสอน · ผลการเรียนของห้องนี้'
      : 'การสร้างชั้นเรียน · การเข้าร่วมด้วยรหัส · ภาพรวมชั้นเรียนที่มี',
    outOfScope: 'เนื้อหาวิชาการรายข้อ (ให้ไปหน้าติวเตอร์ AI) · ' +
                'ผลสอบส่วนตัวของผู้ใช้เอง (ให้ไปหน้าประเมิน + แผนพัฒนา) · ' +
                'เรื่องทั่วไปที่ไม่เกี่ยวกับการจัดการชั้นเรียน',
    context: () => (cls ? classContext(cls) : listContext()),
    suggestions: cls
      ? ['สัปดาห์นี้ควรสอนเรื่องอะไร', 'ตารางว่างวันไหนบ้าง', 'ใครในห้องที่ต้องช่วยก่อน']
      : ['สร้างชั้นเรียนยังไง', 'รหัสเข้าร่วมใช้ยังไง', 'ตอนนี้มีชั้นเรียนอะไรบ้าง'],
  };
}

/** ข้อมูลที่ผู้ช่วยเห็น — เท่ากับที่แสดงบนหน้าจอ ไม่มากไม่น้อยกว่านั้น */
function classContext(cls){
  const t = trackById(cls.trackId);
  const byDay = scheduleByDay(cls);
  const roster = rosterOf(cls);

  return [
    `ชื่อชั้นเรียน: ${cls.name}`,
    `รหัสเข้าร่วม: ${cls.code}`,
    `หลักสูตร: ${t.name} (เกณฑ์ ${t.cert})`,
    cls.term ? `ภาคเรียน: ${cls.term}` : '',
    cls.room ? `ห้อง: ${cls.room}` : '',
    `ครูผู้สอน: ${cls.teacherName || '-'}`,
    `จำนวนนักเรียน: ${cls.students.length} คน`,
    '',
    'ตารางสอน:',
    cls.schedule.length
      ? byDay.map((slots, d) => slots.length
          ? `- ${DAYS[d]}: ` + slots.map(s =>
              `${s.start}-${s.end}${s.topic ? ` (${s.topic})` : ''}${s.room ? ` ห้อง ${s.room}` : ''}`).join(', ')
          : '').filter(Boolean).join('\n')
      : '- ยังไม่ได้จัดตาราง',
    `รวม ${weeklyHours(cls)} ชั่วโมง/สัปดาห์`,
    '',
    'รายชื่อนักเรียนและผลการเรียน:',
    roster.length
      ? roster.map(s => `- ${s.studentNo ? s.studentNo + '. ' : ''}${s.name}` +
          (s.hasData ? ` | ความพร้อม ${s.readiness}% | อ่อน: ${s.weak}` : ' | ยังไม่มีข้อมูลผลการเรียน')).join('\n')
      : '- ยังไม่มีนักเรียนในชั้นเรียน',
    '',
    'ทักษะย่อยของหลักสูตรนี้: ' + skillsOf(cls.trackId).map(s => s.name).join(', '),
    '',
    cls.plan
      ? 'แผนการสอนที่บันทึกไว้:\n' + cls.plan.weeks.map(w =>
          `- สัปดาห์ ${w.week}: ${w.title} — ${w.objective}`).join('\n')
      : 'แผนการสอน: ยังไม่ได้ร่าง',
  ].filter(x => x !== '').join('\n');
}

function listContext(){
  const mine = isTeacher() ? classesTaughtBy(me()) : classesJoinedBy(me());
  return [
    `บทบาทที่ใช้อยู่: ${isTeacher() ? 'ครู/สถาบัน' : 'ผู้เรียน'}`,
    `ชั้นเรียนของฉัน: ${mine.length} ห้อง`,
    ...mine.map(c => `- ${c.name} (รหัส ${c.code}) · ${trackById(c.trackId).name} · ` +
      `${c.students.length} คน · ${c.schedule.length} คาบ/สัปดาห์`),
    '',
    isTeacher()
      ? 'ครูสร้างชั้นเรียนได้จากปุ่ม "สร้างชั้นเรียน" แล้วแจกรหัส 6 หลักให้นักเรียนเข้าร่วม'
      : 'นักเรียนเข้าร่วมชั้นเรียนได้โดยกรอกรหัส 6 หลักที่ครูให้มา',
  ].join('\n');
}

/* ------------------------------------------------------------ รายชื่อ + ผล */

/** รวมรายชื่อกับผลการเรียนจริงเท่าที่มี — คนที่ยังไม่ผูกบัญชีจะไม่มีตัวเลข */
function rosterOf(cls){
  return cls.students.map(s => {
    // ต้นแบบนี้อ่านผลได้เฉพาะบัญชีที่เปิดอยู่ ผลของคนอื่นอยู่ในเครื่องของเขาเอง
    const isMe = s.uid && s.uid === me();
    if (!isMe) return { ...s, hasData:false, readiness:0, weak:'', drills:0 };
    const w = weakestSkill(cls.trackId);
    return {
      ...s, hasData:true,
      readiness: trackReadiness(cls.trackId),
      weak: w.skill?.name || '',
      drills: state.drillHistory.filter(h => h.trackId === cls.trackId).length,
      lastActive: state.lastActive,
    };
  });
}

/* ============================================================
   VIEW
   ============================================================ */
export default {
  title: ctx => ctx.route.sub ? (classById(ctx.route.sub)?.name || 'ชั้นเรียน')
                              : (isTeacher() ? 'ชั้นเรียนของฉัน' : 'ชั้นเรียนที่เข้าร่วม'),
  sub: ctx => ctx.route.sub
    ? 'จัดตารางสอน รายชื่อนักเรียน และแผนการสอนของชั้นเรียนนี้'
    : (isTeacher() ? 'สร้างชั้นเรียน แจกรหัสให้นักเรียน แล้วให้ AI ช่วยร่างแผนการสอน'
                   : 'กรอกรหัสที่ครูให้มาเพื่อเข้าร่วม แล้วดูตารางเรียนของคุณ'),

  render(ctx){
    const cls = ctx.route.sub && classById(ctx.route.sub);
    return cls ? detailView(cls) : listView();
  },

  mount(root, ctx){
    const cls = ctx.route.sub && classById(ctx.route.sub);
    mountDropdowns(root);
    mountAssistant(root, scopeFor(cls || null));

    const again = () => { paint(root, this.render(ctx)); this.mount(root, ctx); };

    /* ---------- รายการ ---------- */
    on(root, 'click', '[data-new-class]', () => openCreate(again));
    on(root, 'click', '[data-join]', () => openJoin(again));

    /* ---------- รายละเอียด ---------- */
    on(root, 'click', '[data-tab]', (e, t) => { tab = t.dataset.tab; again(); });

    on(root, 'click', '[data-copy-code]', (e, t) => {
      navigator.clipboard?.writeText(t.dataset.copyCode)
        .then(() => toast('คัดลอกรหัสเข้าร่วมแล้ว', 'ok'))
        .catch(() => toast('คัดลอกไม่สำเร็จ', 'bad'));
    });

    on(root, 'click', '[data-add-student]', () => openAddStudent(cls, again));
    on(root, 'click', '[data-del-student]', (e, t) => {
      if (!confirm(`ลบ "${t.dataset.name}" ออกจากชั้นเรียน?`)) return;
      removeStudent(cls.id, t.dataset.delStudent);
      again();
    });

    on(root, 'click', '[data-add-slot]', () => openAddSlot(cls, again));
    on(root, 'click', '[data-del-slot]', (e, t) => {
      removeSlot(cls.id, t.dataset.delSlot);
      toast('ลบคาบเรียนแล้ว');
      again();
    });

    on(root, 'click', '[data-del-class]', () => {
      if (!confirm(`ลบชั้นเรียน "${cls.name}" พร้อมรายชื่อและตารางทั้งหมด?\nย้อนกลับไม่ได้`)) return;
      deleteClass(cls.id);
      toast('ลบชั้นเรียนแล้ว', 'ok');
      ctx.go('classes');
    });

    /* ---------- AI ---------- */
    on(root, 'click', '[data-make-plan]', async (e, btn) => {
      const weeks = +(root.querySelector('#plan-weeks')?.value || 8);
      await busy(btn, 'กำลังร่างแผน…', async () => {
        const profile = rosterOf(cls).filter(s => s.hasData)
          .map(s => `- ${s.name}: ความพร้อม ${s.readiness}% อ่อนเรื่อง ${s.weak}`).join('\n');
        const plan = await planLessons(cls, { weeks, classProfile: profile });
        planCache.set(cls.id, plan);
        savePlan(cls.id, plan);
        toast(plan.source === 'ai' ? 'AI ร่างแผนการสอนให้แล้ว' : 'ร่างแผนด้วยเอนจินในเครื่องแล้ว', 'ok');
      });
      again();
    });

    on(root, 'click', '[data-analyse]', async (e, btn) => {
      await busy(btn, 'กำลังวิเคราะห์…', async () => {
        const res = await analyseClass(cls, rosterOf(cls).filter(s => s.hasData));
        analysisCache.set(cls.id, res);
      });
      again();
    });
  },
};

async function busy(btn, label, fn){
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = icon('refresh') + ' ' + label;
  try{ await fn(); }
  catch(err){ toast('ทำรายการไม่สำเร็จ: ' + err.message, 'bad'); }
  finally{ btn.disabled = false; btn.innerHTML = html; }
}

/* ============================================================
   LIST
   ============================================================ */
function listView(){
  const teacher = isTeacher();
  const mine = teacher ? classesTaughtBy(me()) : classesJoinedBy(me());
  const others = teacher ? [] : allClasses().filter(c => !mine.includes(c));

  return `
  <div class="stack" style="gap:20px">

    <section class="hero">
      <div class="row" style="justify-content:space-between;gap:20px">
        <div style="flex:1;min-width:min(100%,280px)">
          <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
            ${icon('teacher')} ${teacher ? 'มุมมองครู/สถาบัน' : 'มุมมองผู้เรียน'}
          </span>
          <h2 style="margin-top:12px">
            ${teacher ? 'จัดการชั้นเรียนของคุณ' : 'ชั้นเรียนที่คุณเข้าร่วม'}
          </h2>
          <p>${teacher
            ? 'สร้างชั้นเรียน จัดตารางสอน เพิ่มรายชื่อนักเรียน แล้วให้ AI ช่วยร่างแผนการสอนรายสัปดาห์จากจุดอ่อนจริงของห้อง'
            : 'กรอกรหัส 6 หลักที่ครูให้มาเพื่อเข้าร่วม จากนั้นจะเห็นตารางเรียนและแผนการสอนของชั้นนั้น'}</p>
          <div class="row" style="margin-top:16px">
            ${teacher
              ? `<button class="btn btn-primary btn-lg" data-new-class>${icon('plus')} สร้างชั้นเรียน</button>`
              : `<button class="btn btn-primary btn-lg" data-join>${icon('plus')} เข้าร่วมด้วยรหัส</button>`}
          </div>
        </div>
      </div>
    </section>

    ${assistantPanel(scopeFor(null))}

    <section>
      <div class="section-title">${icon('grid')} ${teacher ? 'ชั้นเรียนที่สอน' : 'ชั้นเรียนของฉัน'} (${mine.length})</div>
      ${mine.length ? `
        <div class="grid g3">${mine.map(classCard).join('')}</div>`
      : `<div class="card empty" style="padding:44px 20px">
          ${icon('teacher')}
          <h3>ยังไม่มีชั้นเรียน</h3>
          <p>${teacher
            ? 'สร้างชั้นเรียนแรกของคุณ ระบบจะสุ่มรหัส 6 หลักให้แจกนักเรียน'
            : 'ขอรหัสเข้าร่วม 6 หลักจากครูผู้สอน แล้วกรอกที่ปุ่มด้านบน'}</p>
        </div>`}
    </section>

    ${others.length ? `
    <section>
      <div class="section-title">${icon('people')} ชั้นเรียนอื่นบนเครื่องนี้</div>
      <div class="grid g3">${others.map(c => classCard(c, true)).join('')}</div>
      <p class="tiny muted" style="margin-top:10px">
        ต้นแบบนี้ไม่มีเซิร์ฟเวอร์ ชั้นเรียนจึงแชร์ได้แค่ระหว่างบัญชีบนเครื่องเดียวกัน
      </p>
    </section>` : ''}
  </div>`;
}

function classCard(c, muted = false){
  const t = trackById(c.trackId);
  const next = nextSlot(c);
  return `
  <a class="track-card${muted ? ' is-muted' : ''}" href="#/classes/${c.id}">
    <div class="row" style="gap:12px;align-items:flex-start">
      <div class="track-ico">${icon(t.icon)}</div>
      <div style="flex:1;min-width:0">
        <h3>${esc(c.name)}</h3>
        <div class="t-cert">${esc(t.name)}${c.term ? ' · ' + esc(c.term) : ''}</div>
      </div>
      <span class="class-code num">${esc(c.code)}</span>
    </div>
    <div class="row tight">
      <span class="pill plain">${icon('people')} ${c.students.length} คน</span>
      <span class="pill plain">${icon('calendar')} ${c.schedule.length} คาบ</span>
      ${c.plan ? `<span class="pill violet">${icon('spark')} มีแผนการสอน</span>` : ''}
    </div>
    ${next ? `<div class="tiny muted">${icon('clock')} คาบถัดไป ${DAYS[next.day]} ${next.start}–${next.end}${next.topic ? ' · ' + esc(next.topic) : ''}</div>` : ''}
  </a>`;
}

/* ============================================================
   DETAIL
   ============================================================ */
function detailView(cls){
  const t = trackById(cls.trackId);
  const teacher = isTeacher();
  const TABS = [
    ['roster',   'รายชื่อนักเรียน', 'people'],
    ['schedule', 'ตารางเรียน',      'calendar'],
    ['plan',     'แผนการสอน',       'book'],
  ];

  return `
  <div class="stack" style="gap:18px">
    <a class="btn btn-ghost btn-sm" href="#/classes" style="align-self:flex-start">
      ${icon('arrowL')} ชั้นเรียนทั้งหมด</a>

    <section class="class-head">
      <div class="track-ico" style="width:54px;height:54px">${icon(t.icon)}</div>
      <div style="flex:1;min-width:min(100%,220px)">
        <h2>${esc(cls.name)}</h2>
        <p class="small muted">${esc(t.name)} · ${esc(t.cert)}</p>
        <div class="row tight" style="margin-top:9px">
          ${cls.term ? `<span class="pill plain">${icon('calendar')} ${esc(cls.term)}</span>` : ''}
          ${cls.room ? `<span class="pill plain">${icon('zone')} ${esc(cls.room)}</span>` : ''}
          <span class="pill plain">${icon('people')} ${cls.students.length} คน</span>
          <span class="pill plain">${icon('clock')} ${weeklyHours(cls)} ชม./สัปดาห์</span>
        </div>
      </div>
      <div class="class-code-box">
        <span class="tiny muted">รหัสเข้าร่วม</span>
        <button class="class-code big num" data-copy-code="${esc(cls.code)}" title="คลิกเพื่อคัดลอก">
          ${esc(cls.code)} ${icon('lock')}
        </button>
      </div>
    </section>

    ${assistantPanel(scopeFor(cls))}

    <div class="tabbar" role="tablist">
      ${TABS.map(([id, label, ic]) => `
        <button role="tab" data-tab="${id}" aria-selected="${tab === id}">
          ${icon(ic)} ${label}
        </button>`).join('')}
    </div>

    ${tab === 'roster' ? rosterTab(cls, teacher)
     : tab === 'schedule' ? scheduleTab(cls, teacher)
     : planTab(cls, teacher)}

    ${teacher ? `
    <div class="row" style="justify-content:center;padding-top:4px">
      <button class="btn btn-danger btn-sm" data-del-class>${icon('x')} ลบชั้นเรียนนี้</button>
    </div>` : ''}
  </div>`;
}

/* ---------------------------------------------------- แท็บรายชื่อ */
function rosterTab(cls, teacher){
  const roster = rosterOf(cls);
  const withData = roster.filter(s => s.hasData);
  const analysis = analysisCache.get(cls.id);

  return `
  <section class="card">
    <div class="card-head">
      <div class="track-ico">${icon('people')}</div>
      <div><h2>รายชื่อนักเรียน</h2><p>เรียงตามเลขที่ · ${cls.students.length} คน</p></div>
      <div class="spacer"></div>
      ${teacher ? `<button class="btn btn-soft btn-sm" data-add-student>${icon('plus')} เพิ่มนักเรียน</button>` : ''}
    </div>

    ${cls.students.length ? `
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>เลขที่</th><th>ชื่อ–สกุล</th><th>ความพร้อม</th><th>จุดอ่อนหลัก</th>
            <th>สถานะ</th>${teacher ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${roster.map(s => `<tr>
              <td class="num">${esc(s.studentNo || '–')}</td>
              <td><div class="row tight">
                ${avatar({ name: s.name }, 28, 9)}<b>${esc(s.name)}</b>
              </div></td>
              <td style="min-width:120px">
                ${s.hasData ? `
                  <div class="tiny num" style="margin-bottom:3px">${s.readiness}%</div>
                  <div class="bar thin ${scoreTone(s.readiness)}"><i style="width:${s.readiness}%"></i></div>`
                : '<span class="tiny muted">–</span>'}
              </td>
              <td class="small">${s.hasData ? esc(s.weak || '–') : '<span class="muted">–</span>'}</td>
              <td>${s.uid
                ? `<span class="pill ok">${icon('check')} เข้าร่วมแล้ว</span>`
                : `<span class="pill plain">${icon('clock')} รอเข้าร่วม</span>`}</td>
              ${teacher ? `<td class="right">
                <button class="icon-mini" data-del-student="${esc(s.id)}" data-name="${esc(s.name)}"
                  aria-label="ลบ ${esc(s.name)}">${icon('x')}</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <p class="tiny muted" style="margin-top:12px;line-height:1.7">
        ${icon('info')} ต้นแบบนี้อ่านผลการเรียนได้เฉพาะบัญชีที่เปิดอยู่บนเครื่องนี้
        ผลของนักเรียนคนอื่นอยู่ในเครื่องของเขาเอง — ระบบจริงต้องมีเซิร์ฟเวอร์กลางเก็บผล
      </p>`
    : `<div class="empty" style="padding:36px 16px">
        ${icon('people')}
        <h3>ยังไม่มีนักเรียน</h3>
        <p>${teacher
          ? 'เพิ่มรายชื่อไว้ล่วงหน้าได้เลย เมื่อนักเรียนเข้าร่วมด้วยรหัส ระบบจะจับคู่ชื่อให้อัตโนมัติ'
          : 'ครูยังไม่ได้เพิ่มรายชื่อในชั้นเรียนนี้'}</p>
        ${teacher ? `<button class="btn btn-primary btn-sm" data-add-student style="margin-top:14px">
          ${icon('plus')} เพิ่มนักเรียนคนแรก</button>` : ''}
      </div>`}
  </section>

  ${teacher && cls.students.length ? `
  <section class="card">
    <div class="card-head">
      <div class="track-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('radar')}</div>
      <div><h2>AI วิเคราะห์ชั้นเรียน</h2>
        <p>บอกว่าควรสอนซ่อมเรื่องอะไรทั้งห้อง และใครต้องช่วยเป็นรายคน</p></div>
      <div class="spacer"></div>
      ${analysis ? sourceBadge(analysis.source) : ''}
      <button class="btn btn-soft btn-sm" data-analyse
        ${withData.length ? '' : 'disabled title="ยังไม่มีข้อมูลผลการเรียนให้วิเคราะห์"'}>
        ${icon('spark')} ${analysis ? 'วิเคราะห์ใหม่' : 'วิเคราะห์'}
      </button>
    </div>

    ${!withData.length ? `
      <p class="small muted" style="line-height:1.75">
        ยังไม่มีนักเรียนที่มีข้อมูลผลการเรียนในเครื่องนี้ — ให้นักเรียนเข้าร่วมด้วยรหัสแล้วทำข้อสอบอย่างน้อยหนึ่งชุดก่อน
      </p>`
    : analysis ? `
      <div class="stack" style="gap:14px">
        <p style="font-size:15px;font-weight:600;line-height:1.6">${esc(analysis.headline)}</p>

        ${analysis.teachToAll.length ? `
        <div>
          <div class="section-title" style="margin-top:0">${icon('teacher')} ควรสอนซ่อมทั้งห้อง</div>
          <div class="stack" style="gap:9px">
            ${analysis.teachToAll.map((x, i) => `
              <div class="quest">
                <div class="q-ico" style="background:var(--blue-600);color:#fff">${i + 1}</div>
                <div class="q-body">
                  <b>${esc(x.topic)}</b>
                  <span>${esc(x.reason)}</span>
                  <span style="color:var(--blue-700);margin-top:3px">${icon('arrowR')} ${esc(x.suggestion)}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${analysis.needAttention.length ? `
        <div>
          <div class="section-title">${icon('target')} ต้องช่วยเป็นรายคน</div>
          <div class="stack" style="gap:0">
            ${analysis.needAttention.map(x => `
              <div class="rubric-row">
                <div class="r-name">
                  <b style="font-weight:600">${esc(x.student)}</b><br>
                  <span class="tiny muted">${esc(x.issue)}</span>
                </div>
                <div class="small" style="flex:1;color:var(--ink-2);line-height:1.6">${esc(x.action)}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${analysis.doingWell ? `<div class="explain" style="border-left-color:var(--ok);background:var(--ok-soft)">
          <h4 style="color:#0A7B5E">${icon('check')} จุดที่ห้องนี้ทำได้ดี</h4>
          <p class="small" style="line-height:1.7">${esc(analysis.doingWell)}</p>
        </div>` : ''}
      </div>`
    : `<p class="small muted">กด “วิเคราะห์” เพื่อให้ AI อ่านผลของทั้งห้องแล้วจัดลำดับว่าควรทำอะไรก่อน</p>`}
  </section>` : ''}`;
}

/* ---------------------------------------------------- แท็บตาราง */
function scheduleTab(cls, teacher){
  const byDay = scheduleByDay(cls);
  const active = byDay.map((s, d) => ({ d, s })).filter(x => x.s.length);

  return `
  <section class="card">
    <div class="card-head">
      <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('calendar')}</div>
      <div><h2>ตารางเรียน</h2><p>รวม ${weeklyHours(cls)} ชั่วโมงต่อสัปดาห์ · ${cls.schedule.length} คาบ</p></div>
      <div class="spacer"></div>
      ${teacher ? `<button class="btn btn-soft btn-sm" data-add-slot>${icon('plus')} เพิ่มคาบ</button>` : ''}
    </div>

    ${cls.schedule.length ? `
      <div class="timetable">
        ${active.map(({ d, s }) => `
          <div class="tt-day">
            <div class="tt-day-head">
              <span class="tt-dot">${DAY_SHORT[d]}</span>
              <b>${DAYS[d]}</b>
              <span class="tiny muted">${s.length} คาบ</span>
            </div>
            <div class="tt-slots">
              ${s.map(slot => `
                <div class="tt-slot">
                  <div class="tt-time num">${slot.start}<span>–</span>${slot.end}</div>
                  <div class="tt-body">
                    <b>${esc(slot.topic || 'คาบเรียน')}</b>
                    ${slot.room ? `<span class="tiny muted">${icon('zone')} ห้อง ${esc(slot.room)}</span>` : ''}
                    ${slot.skillIds?.length ? `<div class="row tight" style="margin-top:5px">
                      ${slot.skillIds.map(id => `<span class="pill plain">${esc(skillName(cls.trackId, id))}</span>`).join('')}
                    </div>` : ''}
                  </div>
                  ${teacher ? `<button class="icon-mini" data-del-slot="${esc(slot.id)}"
                    aria-label="ลบคาบ">${icon('x')}</button>` : ''}
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>`
    : `<div class="empty" style="padding:36px 16px">
        ${icon('calendar')}
        <h3>ยังไม่ได้จัดตาราง</h3>
        <p>${teacher ? 'เพิ่มคาบเรียนเพื่อให้นักเรียนเห็นว่าเรียนวันไหน เวลาไหน'
                     : 'ครูยังไม่ได้จัดตารางเรียนของชั้นนี้'}</p>
        ${teacher ? `<button class="btn btn-primary btn-sm" data-add-slot style="margin-top:14px">
          ${icon('plus')} เพิ่มคาบแรก</button>` : ''}
      </div>`}
  </section>`;
}

/* ---------------------------------------------------- แท็บแผนการสอน */
function planTab(cls, teacher){
  const plan = planCache.get(cls.id) || cls.plan;

  return `
  <section class="card">
    <div class="card-head">
      <div class="track-ico" style="background:var(--violet-soft);color:var(--violet)">${icon('book')}</div>
      <div><h2>แผนการสอนรายสัปดาห์</h2>
        <p>AI ร่างจากหลักสูตร จำนวนคาบ และจุดอ่อนจริงของนักเรียนในห้อง</p></div>
      <div class="spacer"></div>
      ${plan?.source ? sourceBadge(plan.source) : ''}
    </div>

    ${teacher ? `
    <div class="row" style="gap:12px;align-items:flex-end;margin-bottom:16px">
      <div style="flex:1;min-width:min(100%,200px)">
        ${dropdown({ id:'plan-weeks', label:'จำนวนสัปดาห์', value:String(plan?.weeks?.length || 8),
                     icon:'calendar',
                     options:[4, 6, 8, 12, 16].map(n => ({ value:String(n), label:`${n} สัปดาห์` })) })}
      </div>
      <button class="btn btn-primary" data-make-plan>
        ${icon('spark')} ${plan ? 'ร่างแผนใหม่' : 'ให้ AI ร่างแผน'}
      </button>
    </div>` : ''}

    ${plan ? `
      ${plan.overview ? `<p class="small" style="line-height:1.75;margin-bottom:14px">${esc(plan.overview)}</p>` : ''}
      ${plan.priorityNote ? `<div class="explain" style="margin-bottom:16px">
        <h4>${icon('target')} เรื่องที่ควรให้เวลาเป็นพิเศษ</h4>
        <p class="small" style="line-height:1.7">${esc(plan.priorityNote)}</p>
      </div>` : ''}

      <div class="stack" style="gap:12px">
        ${plan.weeks.map(w => `
          <div class="week-card">
            <div class="week-no">
              <span class="tiny">สัปดาห์</span>
              <b>${w.week}</b>
            </div>
            <div class="week-body">
              <b class="week-title">${esc(w.title)}</b>
              <p class="small muted" style="line-height:1.65">${icon('target')} ${esc(w.objective)}</p>
              <div class="week-grid">
                <div><span class="tiny muted">ภาคทฤษฎี</span><p class="small">${esc(w.theory)}</p></div>
                <div><span class="tiny muted">กิจกรรมลงมือทำ</span><p class="small">${esc(w.activity)}</p></div>
                <div><span class="tiny muted">วัดผล</span><p class="small">${esc(w.assessment)}</p></div>
              </div>
              ${w.skillIds?.length ? `<div class="row tight" style="margin-top:9px">
                ${w.skillIds.map(id => `<span class="pill">${esc(skillName(cls.trackId, id))}</span>`).join('')}
              </div>` : ''}
            </div>
          </div>`).join('')}
      </div>`
    : `<div class="empty" style="padding:36px 16px">
        ${icon('book')}
        <h3>ยังไม่มีแผนการสอน</h3>
        <p>${teacher ? 'เลือกจำนวนสัปดาห์แล้วให้ AI ร่างให้ จากนั้นแก้ไขเองต่อได้'
                     : 'ครูยังไม่ได้ร่างแผนการสอนของชั้นนี้'}</p>
      </div>`}
  </section>`;
}

/* ============================================================
   MODALS
   ============================================================ */
function openCreate(done){
  const u = currentUser();
  const m = modal(`
    <h2>สร้างชั้นเรียนใหม่</h2>
    <p class="small muted" style="margin-top:4px">ระบบจะสุ่มรหัส 6 หลักให้แจกนักเรียนเข้าร่วม</p>
    <div class="form-grid" style="margin-top:18px">
      <div class="span-2">
        ${field({ id:'c-name', label:'ชื่อชั้นเรียน', required:true,
                  placeholder:'เช่น ปวส. ไฟฟ้ากำลัง 2/1' })}
      </div>
      <div class="span-2">
        ${dropdown({ id:'c-track', label:'หลักสูตรของชั้นเรียน', icon:'compass',
                     value: state.activeTrack,
                     options: TRACKS.map(t => ({ value:t.id, label:t.name, icon:t.icon, sub:t.cert })) })}
      </div>
      ${field({ id:'c-term', label:'ภาคเรียน', placeholder:'เช่น 1/2569' })}
      ${field({ id:'c-room', label:'ห้องเรียนประจำ', placeholder:'เช่น ช.301' })}
    </div>
    <p class="auth-error" id="c-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" id="c-save">${icon('check')} สร้างชั้นเรียน</button>
    </div>`, { label:'สร้างชั้นเรียน' });

  mountDropdowns(m.el);
  const err = msg => { const b = m.el.querySelector('#c-err'); b.hidden = !msg; b.textContent = msg || ''; };

  m.el.querySelector('#c-save').addEventListener('click', () => {
    const g = id => m.el.querySelector('#' + id).value.trim();
    const r = createClass({
      name: g('c-name'), trackId: g('c-track'), term: g('c-term'), room: g('c-room'),
      teacherUid: u?.uid, teacherName: displayName(),
    });
    if (!r.ok) return err(r.error);
    m.close();
    toast(`สร้าง "${r.cls.name}" แล้ว · รหัส ${r.cls.code}`, 'ok', 4000);
    location.hash = '#/classes/' + r.cls.id;
  });
  m.el.querySelector('#c-name').focus();
}

function openJoin(done){
  const u = currentUser();
  const m = modal(`
    <h2>เข้าร่วมชั้นเรียน</h2>
    <p class="small muted" style="margin-top:4px">กรอกรหัส 6 หลักที่ครูผู้สอนให้มา</p>
    <div style="margin-top:18px">
      ${field({ id:'j-code', label:'รหัสเข้าร่วม', required:true, placeholder:'เช่น H4F7AA', maxlength:8 })}
    </div>
    <p class="auth-error" id="j-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" id="j-go">${icon('arrowR')} เข้าร่วม</button>
    </div>`, { label:'เข้าร่วมชั้นเรียน' });

  const err = msg => { const b = m.el.querySelector('#j-err'); b.hidden = !msg; b.textContent = msg || ''; };
  const input = m.el.querySelector('#j-code');
  input.style.textTransform = 'uppercase';

  const go = () => {
    const r = joinByCode(input.value, { uid: u?.uid, name: displayName() });
    if (!r.ok) return err(r.error);
    m.close();
    toast(r.linked ? 'เข้าร่วมแล้ว (จับคู่กับรายชื่อที่ครูใส่ไว้)' : 'เข้าร่วมชั้นเรียนแล้ว', 'ok');
    location.hash = '#/classes/' + r.cls.id;
  };
  m.el.querySelector('#j-go').addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  input.focus();
}

function openAddStudent(cls, done){
  const m = modal(`
    <h2>เพิ่มนักเรียน</h2>
    <p class="small muted" style="margin-top:4px">
      ใส่ชื่อไว้ล่วงหน้าได้ เมื่อนักเรียนเข้าร่วมด้วยรหัส ระบบจะจับคู่ชื่อให้อัตโนมัติ</p>
    <div class="form-grid" style="margin-top:18px">
      ${field({ id:'s-no', label:'เลขที่', placeholder:'เช่น 12' })}
      ${field({ id:'s-name', label:'ชื่อ–สกุล', required:true, placeholder:'เช่น กิตติพิชญ์ บุญยิ่ง' })}
      <div class="span-2">${field({ id:'s-note', label:'บันทึกช่วยจำ', placeholder:'เช่น ต้องติดตามเป็นพิเศษ' })}</div>
    </div>
    <p class="auth-error" id="s-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ปิด</button>
      <button class="btn btn-primary" id="s-add">${icon('plus')} เพิ่มแล้วใส่คนต่อไป</button>
    </div>`, { label:'เพิ่มนักเรียน' });

  const err = msg => { const b = m.el.querySelector('#s-err'); b.hidden = !msg; b.textContent = msg || ''; };
  const g = id => m.el.querySelector('#' + id);

  const add = () => {
    const r = addStudent(cls.id, {
      name: g('s-name').value, studentNo: g('s-no').value, note: g('s-note').value });
    if (!r.ok) return err(r.error);
    err('');
    toast(`เพิ่ม ${r.student.name} แล้ว`, 'ok', 1600);
    // เคลียร์ช่องแล้วเดินเลขที่ต่อ เพื่อพิมพ์รายชื่อยาว ๆ ได้รวดเดียว
    const n = parseInt(g('s-no').value, 10);
    g('s-no').value = Number.isFinite(n) ? String(n + 1) : '';
    g('s-name').value = '';
    g('s-note').value = '';
    g('s-name').focus();
    done();
  };

  g('s-add').addEventListener('click', add);
  g('s-name').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  g('s-no').focus();
}

function openAddSlot(cls, done){
  const skills = skillsOf(cls.trackId);
  const m = modal(`
    <h2>เพิ่มคาบเรียน</h2>
    <div class="form-grid" style="margin-top:18px">
      <div class="span-2">
        ${dropdown({ id:'sl-day', label:'วัน', icon:'calendar', value:'1',
                     options: DAYS.map((d, i) => ({ value:String(i), label:d })) })}
      </div>
      ${field({ id:'sl-start', label:'เวลาเริ่ม', type:'time', value:'09:00', required:true })}
      ${field({ id:'sl-end', label:'เวลาเลิก', type:'time', value:'11:00', required:true })}
      <div class="span-2">${field({ id:'sl-topic', label:'หัวข้อคาบนี้', placeholder:'เช่น วงจรอนุกรม–ขนาน' })}</div>
      ${field({ id:'sl-room', label:'ห้อง', value: cls.room, placeholder:'เช่น ช.301' })}
      <div class="span-2">
        ${dropdown({ id:'sl-skill', label:'ทักษะที่สอนในคาบนี้ (ไม่บังคับ)', icon:'target', value:'',
                     options:[{ value:'', label:'ไม่ระบุ' }]
                       .concat(skills.map(s => ({ value:s.id, label:s.name }))) })}
      </div>
    </div>
    <p class="auth-error" id="sl-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ปิด</button>
      <button class="btn btn-primary" id="sl-add">${icon('plus')} เพิ่มคาบ</button>
    </div>`, { label:'เพิ่มคาบเรียน' });

  mountDropdowns(m.el);
  const err = msg => { const b = m.el.querySelector('#sl-err'); b.hidden = !msg; b.textContent = msg || ''; };
  const g = id => m.el.querySelector('#' + id).value;

  m.el.querySelector('#sl-add').addEventListener('click', () => {
    const skill = g('sl-skill');
    const r = addSlot(cls.id, {
      day: g('sl-day'), start: g('sl-start'), end: g('sl-end'),
      topic: g('sl-topic'), room: g('sl-room'),
      skillIds: skill ? [skill] : [],
    });
    if (!r.ok) return err(r.error);
    err('');
    toast('เพิ่มคาบเรียนแล้ว', 'ok', 1600);
    m.el.querySelector('#sl-topic').value = '';
    done();
  });
}
