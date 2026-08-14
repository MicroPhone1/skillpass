/* ============================================================
   demo.js — ข้อมูลตัวอย่างสำหรับโหมดผู้เยี่ยมชม
   ------------------------------------------------------------
   เหตุผลที่ต้องมี: โหมดผู้เยี่ยมชมมีไว้ให้คนที่เพิ่งเปิดเข้ามาเห็นว่า
   ระบบทำอะไรได้บ้าง แต่บัญชีเปล่า ๆ จะเห็นแค่หน้าว่างกับเลข 0
   — โดยเฉพาะเกียรติบัตร ซึ่งต้องฝึกจริงหลายรอบกว่าจะได้มา
   จึงปลูกความคืบหน้าที่สมจริงไว้หนึ่งชุด: หนึ่งเส้นทางที่ "จบแล้ว"
   (มีเกียรติบัตร) และอีกสองเส้นทางที่กำลังไปได้ครึ่งทาง

   ปลูกครั้งเดียวต่อบัญชี (ธง demoSeeded) และไม่แตะบัญชีที่สมัครจริง
   ============================================================ */

import { state, abilityFor, pushExam, pushDrill, grantBadge, flush } from './store.js';
import { skillsOf } from './data/tracks.js';
import { drillsFor } from './data/drills.js';
import { trackReadiness } from './engine/adaptive.js';
import { issue } from './certificate.js';

const DAY = 86400000;
const ago = d => Date.now() - d * DAY;

/**
 * ปลูกความคืบหน้าของเส้นทางหนึ่ง
 * @param {string} trackId
 * @param {object} o  { theta, masteries:number[], exams:[{days,percent,items,mode}], drills:[{days,score}] }
 */
function seedTrack(trackId, { theta, masteries, exams = [], drills = [] }){
  const a = abilityFor(trackId);
  a.theta = theta;
  a.se = 0.42;

  /* กระจายค่าความชำนาญและจำนวนข้อให้ทักษะย่อย
     จำนวนข้อรวมต้องเท่ากับผลรวม items ของประวัติการสอบ ไม่งั้นตัวเลข
     "ข้อสอบที่ผ่าน" บนเกียรติบัตรจะไม่ตรงกับประวัติที่แสดงในสมุดทักษะ */
  const skills = skillsOf(trackId);
  const w = skills.map((_, i) => masteries[i] ?? masteries.at(-1) ?? 0.6);
  const sumW = w.reduce((s, v) => s + v, 0);
  const total = exams.reduce((s, e) => s + e.items, 0);

  a.skills = {};
  let left = total;
  skills.forEach((s, i) => {
    const isLast = i === skills.length - 1;
    const n = isLast ? Math.max(1, left) : Math.max(1, Math.round((total * w[i]) / sumW));
    left -= n;
    a.skills[s.id] = { n, correct: Math.round(n * w[i]), mastery: w[i] };
  });

  for (const e of exams){
    pushExam({
      at: ago(e.days), trackId, mode: e.mode || 'adaptive',
      items: e.items, percent: e.percent,
      theta: e.theta ?? theta, readiness: e.readiness, seconds: e.seconds ?? 240 + e.items * 12,
    });
  }

  const list = drillsFor(trackId);
  drills.forEach((d, i) => {
    const drill = list[i % list.length];
    if (!drill) return;
    pushDrill({ at: ago(d.days), drillId: drill.id, trackId, score: d.score, detail: d.detail || {} });
  });

  // แนวโน้มความพร้อมย้อนหลัง (ใช้วาดกราฟเส้นในหน้าแรก/ความก้าวหน้า)
  state.readinessLog[trackId] = exams.map(e => ({ at: ago(e.days), value: e.readiness }));
  if (exams.length) state.readinessLog[trackId].push({ at: Date.now(), value: trackReadiness(trackId) });
}

/**
 * ปลูกข้อมูลตัวอย่างลงบัญชีที่เปิดอยู่ (ถ้ายังไม่เคยปลูก)
 * @returns {object|null} เกียรติบัตรที่ออกให้ หรือ null ถ้าเคยปลูกแล้ว
 */
export function seedGuestDemo(){
  if (state.demoSeeded) return null;
  state.demoSeeded = true;

  /* --- เส้นทางหลัก: ฝึกจนจบ ผ่านทั้งทฤษฎีและปฏิบัติ --- */
  seedTrack('electrician', {
    theta: 2.02,
    masteries: [0.93, 0.88, 0.95, 0.84, 0.72, 0.67],
    exams: [
      { days: 12, items: 10, percent: 70, theta: 0.42, readiness: 60 },
      { days:  8, items: 10, percent: 80, theta: 1.18, readiness: 79 },
      { days:  3, items: 12, percent: 92, theta: 1.86, readiness: 90, mode: 'mock' },
    ],
    drills: [
      { days: 6, score: 78 },
      { days: 2, score: 91 },
    ],
  });

  /* --- เส้นทางที่กำลังไป: ใกล้เกณฑ์แล้วแต่ยังไม่ครบ --- */
  seedTrack('firstaid', {
    theta: 0.94,
    masteries: [0.74, 0.68, 0.62, 0.55],
    exams: [
      { days: 9, items: 8, percent: 62, theta: 0.30, readiness: 52 },
      { days: 4, items: 8, percent: 75, theta: 0.88, readiness: 70 },
    ],
    drills: [{ days: 4, score: 64 }],
  });

  /* --- เส้นทางที่เพิ่งเริ่ม --- */
  seedTrack('cloud', {
    theta: 0.18,
    masteries: [0.52, 0.46, 0.41],
    exams: [{ days: 5, items: 6, percent: 50, theta: 0.18, readiness: 45 }],
  });

  /* --- ตัวเลขภาพรวมให้สมเหตุสมผลกับประวัติข้างบน --- */
  state.xp = 985;
  state.streak = 6;
  for (const [id, title] of [
    ['curious','นักตั้งคำถาม'], ['hands1','ลงมือทำจริง'], ['handspro','มือแม่น'],
    ['sharp','แม่นยำ'], ['mock1','ผ่านสนามจำลอง'], ['ready','พร้อมลงสนาม'],
  ]) grantBadge(id, title);

  const r = issue('electrician');
  flush();
  return r?.cert || null;
}
