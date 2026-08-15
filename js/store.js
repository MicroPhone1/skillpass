/* ============================================================
   store.js — local persistence, XP / streak / quests, skill state
   ------------------------------------------------------------
   ข้อมูลของผู้ใช้แต่ละบัญชีถูกแยกคีย์กัน (skillpass.v2:<uid>)
   ระบบจึงรองรับผู้ใช้หลายคนบนเครื่องเดียวได้ และทุกอย่าง
   ยังเก็บอยู่ใน localStorage ของเครื่องผู้ใช้เท่านั้น
   ============================================================ */

import { toast } from './ui.js';

const PREFIX = 'skillpass.v2:';
const LEGACY_KEY = 'skillpass.v1';       // ข้อมูลจากเวอร์ชันก่อนมีระบบบัญชี

const todayKey = () => new Date().toISOString().slice(0, 10);
const dayDiff  = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const DEFAULT = {
  profile: {
    name: '',                      // ชื่อที่แสดงในระบบ
    certName: '',                  // ชื่อ–สกุลที่จะพิมพ์ลงเกียรติบัตร (ว่าง = ใช้ name)
    email: '',
    phone: '',
    school: '',                    // สถาบัน / หน่วยงาน
    schoolEn: '',                  // ชื่อสถาบันภาษาอังกฤษ (ใช้บนเกียรติบัตรฉบับ EN)
    title: '',                     // ตำแหน่ง / อาชีพ
    bio: '',
    photo: '',                     // dataURL ของรูปโปรไฟล์
    goal: '',                      // เป้าหมายของผู้เรียน
    education: [],                 // { id, place, program, year, note }
    experience: [],                // { id, place, role, year, note }
    joined: null,
  },
  role: 'student',                 // student | teacher
  activeTrack: 'electrician',
  enrolled: ['electrician', 'firstaid', 'cloud'],

  xp: 0,
  streak: 0,
  lastActive: null,
  dayLog: {},                      // 'YYYY-MM-DD' -> { xp, quests:[], drills:0, questions:0 }

  /* per-track ability estimate from the adaptive engine */
  ability: {},                     // trackId -> { theta, se, seen:[qid], skills:{ skillId:{n,correct,mastery} } }

  examHistory: [],                 // { id, trackId, mode, score, theta, readiness, at, items }
  drillHistory: [],                // { id, drillId, trackId, score, detail, at }
  readinessLog: {},                // trackId -> [{ at, value }]
  certificates: [],                // { id, code, trackId, name, score, level, issuedAt, evidence }

  tutorThreads: {},                // trackId -> [{ role:'me'|'ai', text?, res? }] แยกห้องแชทตามเส้นทาง
  badges: [],                      // badge ids
  quests: { date: null, list: [] },
  posts: [],                       // user-created community posts
  liked: [],                       // liked post ids
  seenTour: false,
  skin: 'blue',                    // 'blue' | 'green' — ธีมสีของทั้งแอป
  demoSeeded: false,               // ปลูกข้อมูลตัวอย่างของโหมดผู้เยี่ยมชมไปแล้วหรือยัง
};

/* ------------------------------------------------------------ load / save
   state เป็น object เดิมตลอดอายุหน้า (ไม่เคยถูกแทนที่) เพราะทุกวิว
   import ตัวมันตรง ๆ — การสลับบัญชีจึงทำโดย "ล้างแล้วเติมใหม่" */
/* เริ่มด้วยโครงสร้างเปล่าที่ครบทุก field เสมอ (ไม่ใช่ {}) เพื่อให้โค้ดที่แตะ
   state ก่อนมีคนล็อกอิน — เช่น abilityFor() — ทำงานได้โดยไม่พัง */
export const state = structuredClone(DEFAULT);
let uid = null;

const keyFor = id => PREFIX + id;

function merge(base, saved){
  const out = structuredClone(base);
  if (!saved || typeof saved !== 'object') return out;
  for (const [k, v] of Object.entries(saved)){
    // profile ต้อง merge ทีละ field เพื่อให้ field ใหม่ที่เพิ่มทีหลังมีค่าเริ่มต้นเสมอ
    out[k] = (k === 'profile' && v && typeof v === 'object') ? { ...out.profile, ...v } : v;
  }
  return out;
}

/** โหลดข้อมูลของบัญชี uid เข้า state (ล้างของเดิมออกก่อน) */
export function loadFor(id, seed = {}){
  flush();          // เขียนของบัญชีเดิมลงดิสก์ก่อน ไม่งั้นการแก้ล่าสุด (<120ms) จะหาย
  uid = id;
  let saved = null;
  try{
    const raw = localStorage.getItem(keyFor(id));
    if (raw) saved = JSON.parse(raw);
    // ครั้งแรกหลังอัปเกรด: ยกข้อมูลเก่าที่ยังไม่มีบัญชีมาให้ผู้ใช้คนแรก
    if (!saved){
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy){ saved = JSON.parse(legacy); localStorage.removeItem(LEGACY_KEY); }
    }
  }catch{ saved = null; }

  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, merge(DEFAULT, saved));

  state.profile = { ...state.profile, ...seed };
  state.profile.joined ||= Date.now();
  save();
  return state;
}

/** ล้าง state ออกจากหน่วยความจำ (ตอนออกจากระบบ) โดยไม่ลบข้อมูลที่บันทึกไว้ */
export function unload(){
  flush();
  uid = null;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, structuredClone(DEFAULT));
}

export const currentUid = () => uid;

let saveTimer = null;
export function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}

/** เขียนลงดิสก์ทันที — ใช้ก่อนสลับบัญชีหรือปิดหน้า */
export function flush(){
  clearTimeout(saveTimer);
  if (!uid) return;
  try{ localStorage.setItem(keyFor(uid), JSON.stringify(state)); }
  catch(e){ console.warn('save failed', e); }
}

/** ลบข้อมูลความคืบหน้าของบัญชีที่ใช้อยู่ (ไม่ลบตัวบัญชี) */
export function resetAll(){
  if (uid) localStorage.removeItem(keyFor(uid));
  location.reload();
}

/** ลบข้อมูลของบัญชีหนึ่งทิ้งถาวร — ใช้ตอนลบบัญชี */
export function purge(id){
  localStorage.removeItem(keyFor(id));
}

/* ------------------------------------------------------------ events */
const bus = new EventTarget();
export const onChange = fn => bus.addEventListener('change', fn);
export const emitChange = () => bus.dispatchEvent(new Event('change'));

function touch(){ save(); emitChange(); }

/* ------------------------------------------------------------ day / streak */
export function checkIn(){
  const t = todayKey();
  if (state.lastActive === t) return;

  if (state.lastActive){
    const d = dayDiff(state.lastActive, t);
    state.streak = d === 1 ? state.streak + 1 : (d > 1 ? 1 : state.streak);
  }else{
    state.streak = 1;
  }
  state.lastActive = t;
  state.dayLog[t] ||= { xp: 0, quests: [], drills: 0, questions: 0 };
  touch();
}

export const today = () => (state.dayLog[todayKey()] ||= { xp: 0, quests: [], drills: 0, questions: 0 });

/* ------------------------------------------------------------ XP & levels */
/* level n needs 120*n XP cumulative-ish; keeps early levels quick */
export function levelInfo(xp = state.xp){
  let lv = 1, need = 120, acc = 0;
  while (xp >= acc + need){ acc += need; lv++; need = Math.round(need * 1.28); }
  return { level: lv, into: xp - acc, need, progress: (xp - acc) / need };
}

export function addXP(amount, why = ''){
  const before = levelInfo().level;
  state.xp += amount;
  today().xp += amount;
  const after = levelInfo().level;
  touch();
  toast(`+${amount} XP${why ? ' · ' + why : ''}`, 'xp', 2000);
  if (after > before) setTimeout(() => toast(`เลเวลอัป! ตอนนี้เลเวล ${after} 🎉`, 'ok', 3200), 700);
}

/* ------------------------------------------------------------ badges */
export function grantBadge(id, title){
  if (state.badges.includes(id)) return false;
  state.badges.push(id);
  touch();
  setTimeout(() => toast(`ปลดล็อกเหรียญ: ${title}`, 'ok', 3400), 400);
  return true;
}

/* ------------------------------------------------------------ ability state */
export function abilityFor(trackId){
  return (state.ability[trackId] ||= { theta: 0, se: 1.2, seen: [], skills: {} });
}

export function skillStat(trackId, skillId){
  const a = abilityFor(trackId);
  return (a.skills[skillId] ||= { n: 0, correct: 0, mastery: 0.35 });
}

/** Mastery per skill for a track, as { skillId: 0..1 } */
export function masteryMap(trackId){
  const a = abilityFor(trackId);
  const out = {};
  for (const [k, v] of Object.entries(a.skills)) out[k] = v.mastery;
  return out;
}

/* ------------------------------------------------------------ readiness log */
export function logReadiness(trackId, value){
  const arr = (state.readinessLog[trackId] ||= []);
  arr.push({ at: Date.now(), value: Math.round(value) });
  if (arr.length > 40) arr.shift();
  touch();
}

/* ------------------------------------------------------------ history */
export function pushExam(rec){
  state.examHistory.unshift({ id: 'ex' + Date.now(), at: Date.now(), ...rec });
  state.examHistory = state.examHistory.slice(0, 60);
  touch();
}
export function pushDrill(rec){
  state.drillHistory.unshift({ id: 'dr' + Date.now(), at: Date.now(), ...rec });
  state.drillHistory = state.drillHistory.slice(0, 60);
  today().drills++;
  touch();
}

/* ------------------------------------------------------------ quests
   3 เควสต์ต่อวัน สุ่มจาก pool — ออกแบบให้ดัน "ฝึกฝน + ใฝ่รู้"  */
const QUEST_POOL = [
  { id:'q_exam10',  icon:'exam',   title:'ทำข้อสอบปรับระดับ 10 ข้อ',    goal:10, metric:'questions', xp:40 },
  { id:'q_drill1',  icon:'camera', title:'ฝึกภาคปฏิบัติหน้ากล้อง 1 ครั้ง', goal:1,  metric:'drills',    xp:50 },
  { id:'q_tutor3',  icon:'brain',  title:'ถามติวเตอร์ AI 3 คำถาม',       goal:3,  metric:'tutor',     xp:30 },
  { id:'q_weak',    icon:'target', title:'ซ่อมจุดอ่อนที่อ่อนที่สุด 5 ข้อ',  goal:5,  metric:'weak',      xp:45 },
  { id:'q_curious', icon:'bulb',   title:'เปิดอ่าน “รู้ไว้ใช่ว่า” ประจำวัน', goal:1,  metric:'curio',     xp:20 },
  { id:'q_help',    icon:'people', title:'ตอบหรือถามในคอมมูนิตี้ 1 ครั้ง', goal:1,  metric:'community', xp:35 },
  { id:'q_perfect', icon:'spark',  title:'ตอบถูกติดกัน 5 ข้อ',            goal:5,  metric:'streakQ',   xp:55 },
];

export function quests(){
  const t = todayKey();
  if (state.quests.date !== t){
    // deterministic-ish daily pick so it feels stable within the day
    const seed = [...t].reduce((a, c) => a + c.charCodeAt(0), 0);
    const pool = [...QUEST_POOL];
    const picked = [];
    for (let i = 0; i < 3; i++){
      picked.push(...pool.splice((seed * (i + 3)) % pool.length, 1));
    }
    state.quests = { date: t, list: picked.map(q => ({ ...q, progress: 0, done: false })) };
    touch();
  }
  return state.quests.list;
}

/** Advance any quest tracking `metric` by `by`. Awards XP on completion. */
export function questProgress(metric, by = 1){
  let changed = false;
  for (const q of quests()){
    if (q.metric !== metric || q.done) continue;
    q.progress = Math.min(q.goal, q.progress + by);
    if (q.progress >= q.goal){
      q.done = true; changed = true;
      setTimeout(() => { addXP(q.xp, 'เควสต์สำเร็จ'); }, 500);
    }
    changed = true;
  }
  if (changed) touch();
}

/* ------------------------------------------------------------ misc */
export function setActiveTrack(id){
  state.activeTrack = id;
  if (!state.enrolled.includes(id)) state.enrolled.push(id);
  touch();
}
export function setRole(r){ state.role = r; touch(); }

/* ธีมสีต้องทาลง <html> ไม่ใช่ <body> เพราะพื้นหลังของหน้าถูกกำหนดที่ระดับ root
   ถ้าทาที่ body จะเห็นขอบสีเดิมโผล่ตอนเลื่อนเลยขอบเนื้อหา */
export function applySkin(skin = state.skin){
  document.documentElement.dataset.skin = skin === 'green' ? 'green' : 'blue';
}
export function setSkin(skin){
  state.skin = skin === 'green' ? 'green' : 'blue';
  applySkin(state.skin);
  touch();
  return state.skin;
}
export function toggleLike(postId){
  const i = state.liked.indexOf(postId);
  if (i < 0) state.liked.push(postId); else state.liked.splice(i, 1);
  touch();
  return i < 0;
}
export function addPost(post){
  state.posts.unshift({ id: 'p' + Date.now(), at: Date.now(), replies: [], ...post });
  touch();
  questProgress('community');
}

/* ------------------------------------------------------------ ติวเตอร์: ห้องแชทแยกตามเส้นทาง */
const THREAD_MAX = 40;           // เก็บย้อนหลังพอสมควร ไม่ให้ localStorage บวม

export const tutorThread = trackId => (state.tutorThreads[trackId] ||= []);

export function pushTutorMessage(trackId, msg){
  const t = tutorThread(trackId);
  t.push(msg);
  if (t.length > THREAD_MAX) t.splice(0, t.length - THREAD_MAX);
  save();
  return t;
}

export function clearTutorThread(trackId){
  state.tutorThreads[trackId] = [];
  touch();
}

/* ------------------------------------------------------------ profile */
export const displayName = () => state.profile?.name?.trim() || 'ผู้เรียน';

/** ชื่อที่จะพิมพ์ลงเกียรติบัตร — ใช้ชื่อเต็มถ้ากรอกไว้ ไม่งั้นใช้ชื่อที่แสดง */
export const certificateName = () => state.profile?.certName?.trim() || displayName();

export function updateProfile(patch){
  Object.assign(state.profile, patch);
  touch();
}

/** เพิ่ม/ลบรายการประวัติ (education | experience) */
export function addHistory(kind, item){
  (state.profile[kind] ||= []).unshift({ id: kind[0] + Date.now(), ...item });
  touch();
}
export function removeHistory(kind, id){
  state.profile[kind] = (state.profile[kind] || []).filter(x => x.id !== id);
  touch();
}

/* ------------------------------------------------------------ certificates */
export function addCertificate(cert){
  state.certificates.unshift(cert);
  touch();
}
export const certificateFor = trackId =>
  state.certificates.find(c => c.trackId === trackId) || null;
