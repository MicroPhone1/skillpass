/* ============================================================
   engine/adaptive.js — Adaptive Test Engine
   ------------------------------------------------------------
   ใช้โมเดล IRT แบบ 1 พารามิเตอร์ (Rasch) ที่คำนวณจริงในเบราว์เซอร์
     P(ตอบถูก) = 1 / (1 + e^(-1.7·(θ − b)))
   - θ (theta) = ระดับความสามารถของผู้เรียน
   - b         = ความยากของข้อ
   หลังตอบแต่ละข้อจะอัปเดต θ ด้วย Newton–Raphson หนึ่งก้าว
   แล้วเลือกข้อถัดไปที่ให้ "ข้อมูล (Fisher information)" สูงสุด
   พร้อมโบนัสให้ทักษะที่ยังวัดน้อย เพื่อให้ครอบคลุมทุกด้าน
   ============================================================ */

import { byTrack } from '../data/questions.js';
import { skillsOf } from '../data/tracks.js';
import { abilityFor, skillStat, state } from '../store.js';

const D = 1.7;
/* ความแปรปรวนของ prior N(0, PRIOR_VAR) ที่ใช้ถ่วงการประมาณค่า θ
   ค่ายิ่งมาก = เชื่อคำตอบมากขึ้นและถ่วงเข้าหาค่ากลางน้อยลง */
const PRIOR_VAR = 1.8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** ความน่าจะเป็นที่ผู้เรียนความสามารถ theta จะตอบข้อความยาก b ได้ถูก */
export const pCorrect = (theta, b) => 1 / (1 + Math.exp(-D * (theta - b)));

/** Fisher information ของข้อ b ที่ระดับ theta */
export const info = (theta, b) => {
  const p = pCorrect(theta, b);
  return D * D * p * (1 - p);
};

/* ------------------------------------------------------------ session */

export class AdaptiveSession {
  /**
   * @param {string} trackId
   * @param {object} opts  { length, mode:'adaptive'|'mock', skillFilter, timeLimit }
   */
  constructor(trackId, opts = {}){
    const a = abilityFor(trackId);
    this.trackId  = trackId;
    this.mode     = opts.mode || 'adaptive';
    this.length   = opts.length || 10;
    this.skillFilter = opts.skillFilter || null;
    this.timeLimit   = opts.timeLimit || 0;      // วินาที (0 = ไม่จำกัด)

    this.theta    = a.theta;                     // เริ่มจากความสามารถเดิมที่ประเมินไว้
    this.startTheta = a.theta;
    this.sumInfo  = 0;                           // ข้อมูลสะสมจากข้อที่ทำไปแล้ว
    this.answers  = [];                          // { q, given, correct, score, ms, thetaAfter }
    this.startAt  = Date.now();

    const pool = byTrack(trackId)
      .filter(q => !this.skillFilter || q.skill === this.skillFilter);
    this.pool = pool;
    this.used = new Set();

    /* จำนวนครั้งที่วัดแต่ละทักษะไปแล้วในเซสชันนี้ */
    this.skillSeen = Object.fromEntries(skillsOf(trackId).map(s => [s.id, 0]));
  }

  get index(){ return this.answers.length; }
  get done(){ return this.index >= this.length || this.used.size >= this.pool.length; }
  get se(){ return 1 / Math.sqrt(this.sumInfo + 1 / PRIOR_VAR); }
  get elapsed(){ return (Date.now() - this.startAt) / 1000; }
  get remaining(){ return this.timeLimit ? Math.max(0, this.timeLimit - this.elapsed) : Infinity; }

  /** เลือกข้อถัดไป */
  next(){
    const avail = this.pool.filter(q => !this.used.has(q.id));
    if (!avail.length) return null;

    const minSeen = Math.min(...Object.values(this.skillSeen));
    let best = null, bestScore = -Infinity;

    for (const q of avail){
      // ข้อมูลที่ได้จากข้อนี้ ณ ความสามารถปัจจุบัน
      let s = info(this.theta, q.b);

      // โบนัสความครอบคลุม: ดันทักษะที่ยังวัดน้อยที่สุดขึ้นมาก่อน
      if ((this.skillSeen[q.skill] ?? 0) === minSeen) s *= 1.35;

      // โหมดสอบจำลอง: ไม่ปรับตามผู้เรียนมากนัก กระจายความยากให้เหมือนข้อสอบจริง
      if (this.mode === 'mock'){
        const wantB = -1.2 + (2.4 * this.index) / Math.max(1, this.length - 1);
        s = 1 / (1 + Math.abs(q.b - wantB));
      }

      // สุ่มเล็กน้อยกันได้ชุดเดิมซ้ำทุกครั้ง
      s *= 0.92 + Math.random() * 0.16;

      if (s > bestScore){ bestScore = s; best = q; }
    }

    this.current = best;
    this.currentShownAt = Date.now();
    return best;
  }

  /**
   * ให้คะแนนคำตอบ  → คืน { correct, score, expected }
   * score เป็น 0..1 (ข้อ multi/order ให้คะแนนบางส่วนได้)
   */
  grade(q, given){
    let score = 0;
    if (q.type === 'mcq'){
      score = given === q.answer ? 1 : 0;
    }else if (q.type === 'multi'){
      const want = new Set(q.answer);
      const got  = new Set(given || []);
      let hit = 0, miss = 0;
      for (const i of want) got.has(i) ? hit++ : miss++;
      for (const i of got) if (!want.has(i)) miss++;
      score = clamp((hit - miss) / want.size, 0, 1);
    }else if (q.type === 'numeric'){
      const v = parseFloat(String(given).replace(/[, ]/g, ''));
      if (Number.isFinite(v)){
        const tol = Math.abs(q.answer * (q.tol ?? 0.02)) || 0.01;
        score = Math.abs(v - q.answer) <= tol ? 1 : 0;
      }
    }else if (q.type === 'order'){
      const want = q.answer;
      let hit = 0;
      (given || []).forEach((v, i) => { if (want[i] === v) hit++; });
      score = hit / want.length;
      if (score < 0.999 && score > 0) score *= 0.85;   // ถูกบางส่วน
    }
    return { correct: score >= 0.999, score };
  }

  /** บันทึกคำตอบและอัปเดตความสามารถ */
  submit(given){
    const q = this.current;
    const { correct, score } = this.grade(q, given);
    const expected = pCorrect(this.theta, q.b);

    this.used.add(q.id);
    this.skillSeen[q.skill] = (this.skillSeen[q.skill] ?? 0) + 1;

    // --- อัปเดต mastery รายทักษะ (Elo แบบง่าย)
    const st = skillStat(this.trackId, q.skill);
    st.n++;
    if (correct) st.correct++;
    const k = st.n <= 3 ? 0.30 : 0.16;
    st.mastery = clamp(st.mastery + k * (score - st.mastery), 0.02, 0.99);

    const rec = {
      q, given, correct, score, expected,
      ms: Date.now() - this.currentShownAt,
      thetaAfter: 0,
    };
    this.answers.push(rec);

    // ประมาณค่า θ ใหม่จากรูปแบบคำตอบทั้งหมด แล้วอัปเดตความแม่นของการวัด
    this.theta = this.estimateTheta();
    this.sumInfo = this.answers.reduce((s, a) => s + info(this.theta, a.q.b), 0);
    rec.thetaAfter = this.theta;
    return rec;
  }

  /**
   * ประมาณค่าความสามารถแบบ MAP จากคำตอบทั้งหมดในเซสชัน
   * ------------------------------------------------------------
   * ใช้ Newton–Raphson วนจนลู่เข้า บน log-posterior:
   *     log L(θ) + log N(θ ; startTheta, PRIOR_VAR)
   *
   * เหตุที่ต้องมี prior: ถ้าใช้ MLE ล้วน ผู้เรียนที่ตอบถูก "ทุกข้อ"
   * จะได้ค่า θ ลู่ออกไปอนันต์ (และตอบผิดหมดจะลู่ไป −อนันต์)
   * ซึ่งไม่สมเหตุสมผล — ตอบถูก 10 ข้อไม่ได้แปลว่าเก่งไม่มีที่สิ้นสุด
   * prior จึงถ่วงค่าประมาณไว้กับสิ่งที่เรารู้อยู่ก่อน (ผลจากเซสชันก่อนหน้า)
   */
  estimateTheta(){
    let th = this.startTheta;
    for (let iter = 0; iter < 30; iter++){
      let grad = -(th - this.startTheta) / PRIOR_VAR;   // อนุพันธ์ของ log prior
      let hess = -1 / PRIOR_VAR;
      for (const a of this.answers){
        const p = pCorrect(th, a.q.b);
        grad += D * (a.score - p);
        hess -= D * D * p * (1 - p);
      }
      const step = clamp(-grad / hess, -1.2, 1.2);      // hess < 0 เสมอ
      th = clamp(th + step, -3, 3);
      if (Math.abs(step) < 1e-4) break;
    }
    return th;
  }

  /** สรุปผลตอนจบ */
  summary(){
    const n = this.answers.length || 1;
    const raw = this.answers.reduce((s, a) => s + a.score, 0);
    const bySkill = {};
    for (const a of this.answers){
      const k = a.q.skill;
      (bySkill[k] ||= { n:0, score:0 });
      bySkill[k].n++; bySkill[k].score += a.score;
    }
    return {
      trackId: this.trackId,
      mode: this.mode,
      items: n,
      rawScore: raw,
      percent: Math.round((raw / n) * 100),
      theta: this.theta,
      thetaDelta: this.theta - this.startTheta,
      se: this.se,
      readiness: readinessScore(this.theta),
      seconds: Math.round(this.elapsed),
      bySkill,
      answers: this.answers.map(a => ({ id:a.q.id, skill:a.q.skill, score:a.score, ms:a.ms })),
    };
  }

  /** เขียนผลกลับเข้า store */
  persist(){
    const a = abilityFor(this.trackId);
    a.theta = this.theta;
    a.se = this.se;
    for (const ans of this.answers) if (!a.seen.includes(ans.q.id)) a.seen.push(ans.q.id);
    return this.summary();
  }
}

/* ------------------------------------------------------------ scoring helpers */

/**
 * แปลงความสามารถ θ เป็นคะแนนความพร้อม 0..100
 * cut = ระดับความสามารถที่ถือว่า "น่าจะสอบผ่าน" ตั้งไว้สูงกว่าค่าเฉลี่ย
 * ของคลังข้อสอบเล็กน้อย เพื่อไม่ให้คนที่ตอบถูกครึ่งเดียวได้คะแนนเกินจริง
 * เทียบเคียง: ตอบถูก ~50% → ราว 55% · ~80% → ราว 80% · ถูกหมด → ราว 94%
 */
export function readinessScore(theta, cut = 0.25){
  return Math.round(100 / (1 + Math.exp(-1.45 * (theta - cut))));
}

export function readinessBand(v){
  if (v >= 80) return { label:'พร้อมสอบ',        tone:'ok',   note:'โอกาสสอบผ่านสูง — รักษาระดับด้วยการทบทวนสั้น ๆ ทุกวัน' };
  if (v >= 65) return { label:'เกือบพร้อม',      tone:'ok',   note:'อีกนิดเดียว เก็บจุดอ่อนที่เหลือให้ครบก่อนลงสนามจริง' };
  if (v >= 45) return { label:'ต้องเร่งเตรียม',  tone:'warn', note:'ยังมีช่องว่างชัดเจน ควรตีจุดอ่อนเป็นเรื่อง ๆ ก่อนสอบ' };
  return          { label:'เพิ่งเริ่มต้น',      tone:'bad',  note:'เริ่มจากพื้นฐานทีละหัวข้อ อย่าเพิ่งรีบทำข้อสอบยาก' };
}

/* ------------------------------------------------------------ study plan */

/**
 * สร้างแผนติวเฉพาะจุดจาก mastery ที่อ่อนที่สุด
 * @returns [{ skillId, name, mastery, actions:[{type,label,detail,arg}] }]
 */
export function studyPlan(trackId, drillIndex = {}){
  const a = abilityFor(trackId);
  const skills = skillsOf(trackId);

  const ranked = skills.map(s => {
    const st = a.skills[s.id];
    return { skill: s, mastery: st ? st.mastery : 0.35, n: st ? st.n : 0 };
  }).sort((x, y) => (x.mastery - y.mastery) || (x.n - y.n));

  return ranked.slice(0, 3).map(({ skill, mastery, n }) => {
    const actions = [];

    if (n === 0){
      actions.push({ type:'exam', label:'วัดระดับทักษะนี้ก่อน',
        detail:'ยังไม่เคยทำข้อสอบด้านนี้ — เริ่มด้วยชุดสั้น 5 ข้อ', arg:{ skill: skill.id, length: 5 } });
    }else{
      actions.push({ type:'exam', label:`ฝึกข้อสอบเฉพาะ “${skill.name}”`,
        detail:`ความชำนาญตอนนี้ ${Math.round(mastery*100)}% — ทำอีก 5 ข้อเพื่อยกระดับ`,
        arg:{ skill: skill.id, length: 5 } });
    }

    actions.push({ type:'tutor', label:'ให้ติวเตอร์อธิบายหลักการ',
      detail:'อ่านสรุปหลักการพร้อมแหล่งอ้างอิงก่อนลงมือทำข้อสอบ', arg:{ skill: skill.id } });

    const d = drillIndex[skill.id];
    if (d) actions.push({ type:'drill', label:`ฝึกภาคปฏิบัติ: ${d.name}`,
      detail:d.short, arg:{ drill: d.id } });

    return { skillId: skill.id, name: skill.name, mastery, n, actions };
  });
}

/** ทักษะที่อ่อนที่สุดของแทร็ก */
export function weakestSkill(trackId){
  const a = abilityFor(trackId);
  const skills = skillsOf(trackId);
  let best = skills[0], bestM = 2;
  for (const s of skills){
    const m = a.skills[s.id]?.mastery ?? 0.35;
    if (m < bestM){ bestM = m; best = s; }
  }
  return { skill: best, mastery: bestM };
}

/** คะแนนความพร้อมปัจจุบันของแทร็ก */
export function trackReadiness(trackId){
  return readinessScore(abilityFor(trackId).theta);
}

/** ความพร้อมรวมทุกแทร็กที่ลงทะเบียน */
export function overallReadiness(){
  const ids = state.enrolled;
  if (!ids.length) return 0;
  return Math.round(ids.reduce((s, id) => s + trackReadiness(id), 0) / ids.length);
}
