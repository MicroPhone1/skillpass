/* ============================================================
   classroom.js — ชั้นเรียน ตารางสอน และรายชื่อนักเรียน
   ------------------------------------------------------------
   เก็บแยกจาก store.js ของผู้ใช้ เพราะชั้นเรียนเป็นของ "หลายคนร่วมกัน"
   ครูสร้าง นักเรียนเข้าร่วม ทั้งคู่ต้องเห็นข้อมูลชุดเดียวกัน
   จึงใช้คีย์ระดับเครื่อง (skillpass.classes.v1) ไม่ใช่คีย์ต่อบัญชี

   ข้อจำกัดที่ต้องรู้: ต้นแบบนี้ไม่มีเซิร์ฟเวอร์ การ "แชร์" จึงกว้างได้แค่
   ผู้ใช้หลายคนบนเครื่องเดียวกัน ถ้าจะใช้จริงข้ามเครื่องต้องมี backend
   ============================================================ */

import { hasTrack } from './data/tracks.js';

const KEY = 'skillpass.classes.v1';

export const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const DAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/* ------------------------------------------------------------ เก็บ/อ่าน */
let cache = null;
const bus = new EventTarget();

export const onClassChange = fn => { bus.addEventListener('change', fn); return () => bus.removeEventListener('change', fn); };

function read(){
  if (cache) return cache;
  try{ cache = JSON.parse(localStorage.getItem(KEY)) || []; }
  catch{ cache = []; }
  return cache;
}

function write(){
  try{ localStorage.setItem(KEY, JSON.stringify(cache)); }
  catch(e){ console.warn('บันทึกชั้นเรียนไม่สำเร็จ', e); }
  bus.dispatchEvent(new Event('change'));
}

export const allClasses = () => read();
export const classById = id => read().find(c => c.id === id) || null;
export const classByCode = code =>
  read().find(c => c.code.toLowerCase() === String(code).trim().toLowerCase()) || null;

/** ชั้นเรียนที่บัญชีนี้เป็นครูผู้สอน */
export const classesTaughtBy = uid => read().filter(c => c.teacherUid === uid);

/** ชั้นเรียนที่บัญชีนี้เป็นนักเรียน (ผูกด้วย uid ตอนเข้าร่วมด้วยรหัส) */
export const classesJoinedBy = uid =>
  read().filter(c => c.students.some(s => s.uid === uid));

/* ------------------------------------------------------------ รหัสเข้าร่วม */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ตัด I,O,0,1 ที่อ่านสับสน

function makeCode(){
  for (let attempt = 0; attempt < 40; attempt++){
    const code = Array.from({ length: 6 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!classByCode(code)) return code;
  }
  return 'C' + Date.now().toString(36).toUpperCase().slice(-5);
}

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ------------------------------------------------------------ ชั้นเรียน */

/**
 * สร้างชั้นเรียนใหม่
 * @returns {{ok:boolean, cls?:object, error?:string}}
 */
export function createClass({ name, trackId, term = '', room = '', teacherUid, teacherName }){
  name = String(name || '').trim();
  if (name.length < 2) return { ok:false, error:'กรุณาตั้งชื่อชั้นเรียนอย่างน้อย 2 ตัวอักษร' };
  if (!hasTrack(trackId)) return { ok:false, error:'กรุณาเลือกเส้นทางทักษะของชั้นเรียน' };

  const cls = {
    id: uid('cls'),
    code: makeCode(),
    name, trackId,
    term: String(term).trim(),
    room: String(room).trim(),
    teacherUid, teacherName,
    students: [],
    schedule: [],
    plan: null,                 // แผนการสอนที่ AI ช่วยร่าง
    createdAt: Date.now(),
  };
  read().unshift(cls);
  write();
  return { ok:true, cls };
}

export function updateClass(id, patch){
  const c = classById(id);
  if (!c) return null;
  Object.assign(c, patch);
  write();
  return c;
}

export function deleteClass(id){
  cache = read().filter(c => c.id !== id);
  write();
}

/* ------------------------------------------------------------ นักเรียน */

export function addStudent(classId, { name, studentNo = '', note = '', uid: studentUid = null }){
  const c = classById(classId);
  if (!c) return { ok:false, error:'ไม่พบชั้นเรียนนี้' };

  name = String(name || '').trim();
  if (name.length < 2) return { ok:false, error:'กรุณากรอกชื่อนักเรียน' };

  const no = String(studentNo).trim();
  if (no && c.students.some(s => s.studentNo === no))
    return { ok:false, error:`เลขที่ ${no} มีอยู่ในชั้นเรียนแล้ว` };

  const st = { id: uid('st'), name, studentNo: no, note: String(note).trim(),
               uid: studentUid, addedAt: Date.now() };
  c.students.push(st);
  sortStudents(c);
  write();
  return { ok:true, student: st };
}

export function removeStudent(classId, studentId){
  const c = classById(classId);
  if (!c) return;
  c.students = c.students.filter(s => s.id !== studentId);
  write();
}

export function updateStudent(classId, studentId, patch){
  const c = classById(classId);
  const s = c?.students.find(x => x.id === studentId);
  if (!s) return null;
  Object.assign(s, patch);
  sortStudents(c);
  write();
  return s;
}

/** เรียงตามเลขที่ (ถ้ามี) แล้วค่อยตามชื่อ */
function sortStudents(c){
  c.students.sort((a, b) => {
    const na = parseInt(a.studentNo, 10), nb = parseInt(b.studentNo, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (Number.isFinite(na)) return -1;
    if (Number.isFinite(nb)) return 1;
    return a.name.localeCompare(b.name, 'th');
  });
}

/** นักเรียนเข้าร่วมชั้นเรียนด้วยรหัส — ผูก uid เข้ากับรายชื่อที่ครูใส่ไว้ ถ้าชื่อตรงกัน */
export function joinByCode(code, { uid: studentUid, name }){
  const c = classByCode(code);
  if (!c) return { ok:false, error:'ไม่พบชั้นเรียนที่ใช้รหัสนี้' };

  if (c.students.some(s => s.uid === studentUid))
    return { ok:false, error:'คุณอยู่ในชั้นเรียนนี้อยู่แล้ว', cls:c };

  // ครูอาจใส่ชื่อไว้ล่วงหน้าแล้ว — ผูกเข้ากับรายชื่อเดิมแทนการเพิ่มซ้ำ
  const existing = c.students.find(s => !s.uid && s.name.trim() === String(name).trim());
  if (existing){
    existing.uid = studentUid;
    write();
    return { ok:true, cls:c, linked:true };
  }

  const r = addStudent(c.id, { name, uid: studentUid });
  return r.ok ? { ok:true, cls:c, linked:false } : r;
}

/* ------------------------------------------------------------ ตารางสอน */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/**
 * เพิ่มคาบเรียน — ตรวจเวลาชนกันในวันเดียวกันให้ด้วย
 */
export function addSlot(classId, { day, start, end, topic = '', room = '', skillIds = [] }){
  const c = classById(classId);
  if (!c) return { ok:false, error:'ไม่พบชั้นเรียนนี้' };

  day = Number(day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { ok:false, error:'วันไม่ถูกต้อง' };
  if (!HHMM.test(start) || !HHMM.test(end)) return { ok:false, error:'รูปแบบเวลาต้องเป็น HH:MM' };
  if (toMin(end) <= toMin(start)) return { ok:false, error:'เวลาเลิกต้องอยู่หลังเวลาเริ่ม' };

  const clash = c.schedule.find(s =>
    s.day === day && toMin(start) < toMin(s.end) && toMin(s.start) < toMin(end));
  if (clash)
    return { ok:false, error:`ชนกับคาบ ${clash.start}–${clash.end} วัน${DAYS[day]}` };

  const slot = { id: uid('sl'), day, start, end,
                 topic: String(topic).trim(), room: String(room).trim(), skillIds };
  c.schedule.push(slot);
  sortSchedule(c);
  write();
  return { ok:true, slot };
}

export function removeSlot(classId, slotId){
  const c = classById(classId);
  if (!c) return;
  c.schedule = c.schedule.filter(s => s.id !== slotId);
  write();
}

const sortSchedule = c =>
  c.schedule.sort((a, b) => (a.day - b.day) || toMin(a.start) - toMin(b.start));

/** จัดคาบเป็นรายวัน สำหรับวาดตารางเรียน */
export function scheduleByDay(cls){
  const byDay = DAYS.map(() => []);
  for (const s of cls.schedule) byDay[s.day].push(s);
  return byDay;
}

/** ชั่วโมงสอนรวมต่อสัปดาห์ */
export const weeklyHours = cls =>
  Math.round(cls.schedule.reduce((sum, s) => sum + (toMin(s.end) - toMin(s.start)), 0) / 6) / 10;

/** คาบถัดไปนับจากตอนนี้ (ใช้แสดงบนหน้าแรกของนักเรียน) */
export function nextSlot(cls, now = new Date()){
  if (!cls.schedule.length) return null;
  const nowKey = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const keyed = cls.schedule.map(s => ({ s, k: s.day * 1440 + toMin(s.start) }));
  return (keyed.find(x => x.k >= nowKey) || keyed[0]).s;
}

/* ------------------------------------------------------------ แผนการสอน */
export function savePlan(classId, plan){
  const c = classById(classId);
  if (!c) return null;
  c.plan = { ...plan, savedAt: Date.now() };
  write();
  return c.plan;
}

/**
 * ครูแก้สัปดาห์หนึ่งของแผนที่ AI ร่างมา
 *
 * AI เป็นคน "เสนอ" ครูเป็นคน "ตัดสิน" — ระบบจึงต้องจำว่าสัปดาห์ไหนครูแตะแล้ว
 * เพื่อ 1) แสดงให้เห็นว่าอันไหนผ่านสายตาครูจริง
 *      2) เตือนก่อนร่างใหม่ว่าจะทับของที่ครูแก้ไว้
 *
 * @param {string} classId
 * @param {number} week   เลขสัปดาห์ที่จะแก้
 * @param {object} patch  ฟิลด์ที่แก้ (title, objective, theory, activity, assessment)
 */
export function editPlanWeek(classId, week, patch){
  const c = classById(classId);
  const w = c?.plan?.weeks?.find(x => x.week === week);
  if (!w) return null;

  const clean = {};
  for (const k of ['title', 'objective', 'theory', 'activity', 'assessment']){
    if (typeof patch[k] === 'string') clean[k] = patch[k].trim().slice(0, 400);
  }
  if (!clean.title) return null;                 // อย่างน้อยต้องมีหัวข้อ

  Object.assign(w, clean, { editedAt: Date.now() });
  write();
  return w;
}

/** ลบสัปดาห์ออกจากแผน แล้วเรียงเลขสัปดาห์ใหม่ให้ต่อเนื่อง */
export function removePlanWeek(classId, week){
  const c = classById(classId);
  if (!c?.plan?.weeks) return null;
  c.plan.weeks = c.plan.weeks.filter(w => w.week !== week)
                             .map((w, i) => ({ ...w, week: i + 1 }));
  write();
  return c.plan;
}

/** เพิ่มสัปดาห์เปล่าท้ายแผน ให้ครูเขียนเองทั้งอัน */
export function addPlanWeek(classId){
  const c = classById(classId);
  if (!c?.plan) return null;
  c.plan.weeks = c.plan.weeks || [];
  c.plan.weeks.push({
    week: c.plan.weeks.length + 1,
    title: 'สัปดาห์ที่ครูเพิ่มเอง',
    objective: '', theory: '', activity: '', assessment: '',
    skillIds: [], editedAt: Date.now(),
  });
  write();
  return c.plan;
}

/** จำนวนสัปดาห์ที่ครูแก้เองแล้ว ใช้เตือนก่อนร่างทับ */
export const editedWeekCount = cls =>
  (cls?.plan?.weeks || []).filter(w => w.editedAt).length;

/** ล้างข้อมูลชั้นเรียนทั้งหมดบนเครื่อง (ใช้ตอนทดสอบ/รีเซ็ต) */
export function resetClasses(){
  cache = [];
  write();
}
