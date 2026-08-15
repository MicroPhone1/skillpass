/* ============================================================
   ai/roles.js — แบ่งหน้าที่ AI ตามงาน
   ------------------------------------------------------------
   แต่ละบทบาททำงานเดียวและมีสัญญาผลลัพธ์ของตัวเอง เหตุที่ไม่ใช้
   prompt ก้อนเดียวทำทุกอย่าง:
     • คุมคุณภาพได้ทีละงาน แก้บทบาทหนึ่งไม่กระทบอีกบทบาท
     • บังคับรูปแบบผลลัพธ์ (schema) ต่างกันได้ตามที่หน้าจอต้องใช้
     • งานที่ต้องแม่น (ประเมิน/เฉลย) ใช้อุณหภูมิต่ำ งานที่ต้องคิดกว้าง
       (วางแผน) ใช้สูงกว่า
   ทุกบทบาทมีทางถอยไปใช้เอนจินในเครื่องเสมอ
   ============================================================ */

import { withFallback } from './client.js';
import { state, abilityFor, displayName } from '../store.js';
import { trackById, skillsOf, skillName } from '../data/tracks.js';
import { drillsFor, drillById } from '../data/drills.js';
import { retrieve, ask as askLocal, explainQuestion as explainLocal,
         coachFor } from '../engine/tutor.js';
import { trackReadiness, studyPlan, readinessBand } from '../engine/adaptive.js';

/* ------------------------------------------------------------ ตัวช่วยแปลงข้อมูล */

const pct = v => Math.round(v * 100);
const dash = rows => rows.length ? rows.join('\n') : '(ยังไม่มีข้อมูล)';

/**
 * บังคับให้ค่าที่ได้จากโมเดลตกอยู่ในชุดที่หน้าจอรองรับ
 * โมเดลขนาดเล็กมักตอบนอกกรอบแม้ schema จะกำหนด enum ไว้แล้ว
 * (เคยได้ stage="ระดับ 1" และ severity เป็นประโยคยาวทั้งย่อหน้า)
 * จึงต้องกรองอีกชั้นที่ขอบ ไม่ปล่อยให้ค่าแปลก ๆ หลุดเข้าไปทำหน้าจอเพี้ยน
 */
function oneOf(value, allowed, fallback){
  const v = String(value ?? '').trim();
  if (allowed.includes(v)) return v;
  const hit = allowed.find(a => v.includes(a));      // เผื่อตอบมาเป็นประโยคที่มีคำนั้นอยู่
  return hit || fallback;
}

const STAGES     = ['เริ่มต้น', 'กำลังสร้างฐาน', 'ใกล้พร้อม', 'พร้อมสอบ'];
const LEVELS3    = ['สูง', 'กลาง', 'ต่ำ'];
const ACTIONS    = ['exam', 'drill', 'tutor', 'review'];

/** ตัดข้อความยาวเกินที่ช่องนั้นออกแบบให้ใส่ */
const trim = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

/** ทำสถิติรายทักษะให้เป็นตารางข้อความที่โมเดลอ่านง่าย */
function skillTable(trackId){
  const a = abilityFor(trackId);
  return dash(skillsOf(trackId).map(s => {
    const st = a.skills[s.id];
    return st
      ? `- ${s.name} (${s.id}) | ทำ ${st.n} ข้อ | ถูก ${st.correct} ข้อ | ชำนาญ ${pct(st.mastery)}%`
      : `- ${s.name} (${s.id}) | ยังไม่เคยวัด`;
  }));
}

const examTable = trackId => dash(
  state.examHistory.filter(e => e.trackId === trackId).slice(0, 6).map(e =>
    `- ${new Date(e.at).toLocaleDateString('th-TH')} | ${e.mode === 'mock' ? 'จับเวลา' : 'ปรับระดับ'}` +
    ` | ${e.items} ข้อ | ถูก ${e.percent}% | ความพร้อม ${e.readiness}%`));

const practiceTable = trackId => dash(
  state.drillHistory.filter(h => h.trackId === trackId).slice(0, 6).map(h =>
    `- ${drillById(h.drillId)?.name || h.drillId} | ${h.score}%`));

const skillListForPlan = trackId => skillsOf(trackId)
  .map(s => `- skillId=${s.id} ชื่อ="${s.name}"`).join('\n');

const drillListForPlan = trackId => dash(drillsFor(trackId)
  .map(d => `- ${d.name} (ทักษะ ${d.skill}) ~${d.minutes} นาที`));

/* ============================================================
   1 · ติวเตอร์ — ตอบคำถามโดยอ้างอิงคลังความรู้
   ============================================================ */

/**
 * ค้นเอกสารในเครื่องก่อน แล้วส่งเฉพาะข้อความที่ค้นเจอให้โมเดลเรียบเรียง
 * (retrieval อยู่ในเครื่อง generation อยู่ที่โมเดล) — โมเดลจึงอ้างอิงได้จริง
 * และไม่ต้องอัปโหลดคลังความรู้ทั้งก้อนขึ้นไป
 */
export async function askTutor(question, { trackId, history = [] } = {}){
  const track = trackById(trackId);
  const hits = retrieve(question, { trackId, k: 4 });

  const sources = hits.length
    ? hits.map((h, i) =>
        `[${i + 1}] ${h.chunk.title} (ที่มา: ${h.chunk.source.title} · ${h.chunk.source.ref})\n${h.chunk.text}`
      ).join('\n\n')
    : '(ไม่พบเอกสารที่เกี่ยวข้องในคลังความรู้)';

  const r = await withFallback('tutor', {
    track: track.name,
    level: readinessBand(trackReadiness(trackId)).label,
    sources,
    history: history.slice(-4).map(m =>
      `${m.role === 'me' ? 'ผู้เรียน' : 'ติวเตอร์'}: ${m.text || m.res?.lead || ''}`).join('\n') || '(ยังไม่มี)',
    question,
  },
  () => askLocal(question, { trackId }),
  data => ({
    kind: data.grounded ? 'answer' : 'nohit',
    lead: data.lead,
    blocks: data.blocks || [],
    // ให้ที่มาตรงกับหมายเลขที่โมเดลบอกว่าใช้จริง ไม่ใช่ยัดทุกชิ้นที่ค้นเจอ
    sources: (data.usedSources?.length
      ? data.usedSources.map(n => hits[n - 1]?.chunk).filter(Boolean)
      : hits.map(h => h.chunk)).map(c => c.source),
    hits: hits.map(h => ({ score: h.score })),
    /* สามช่องนี้คือส่วนที่ทำให้คำตอบ "พาคิด" แทนที่จะ "จ่ายคำตอบ"
       โมเดลบางตัวไม่ยอมส่งครบแม้จะบังคับใน schema ถ้าขาดให้เติมจากตัวสร้างในเครื่อง
       ห้ามปล่อยว่าง เพราะช่องว่างจะทำให้ UI กลับไปยกคำตอบให้ทันทีเหมือนเดิม */
    ...(() => {
      const local = coachFor(question, hits[0]?.chunk);
      return {
        probe: data.probe || local.probe,
        nextTime: data.nextTime || local.nextTime,
        verify: data.verify || local.verify,
      };
    })(),
    followUps: data.followUps || [],
  }));

  return { ...r.value, source: r.source };
}

/* ============================================================
   2 · ผู้อธิบายเฉลย — บอกว่าเข้าใจผิดตรงไหน ไม่ใช่แค่เฉลยซ้ำ
   ============================================================ */

export async function explainAnswer(q, { given, correct }){
  const hits = retrieve(q.stem, { trackId: q.track, k: 2 });
  const answerText =
    q.type === 'mcq'     ? q.choices[q.answer]
  : q.type === 'multi'   ? q.answer.map(i => q.choices[i]).join(' + ')
  : q.type === 'numeric' ? `${q.answer} ${q.unit || ''}`
  : q.answer.map(i => q.items[i]).join(' → ');

  const givenText =
    given === null || given === undefined ? '(ไม่ได้ตอบ)'
  : q.type === 'mcq'     ? (q.choices[given] ?? given)
  : q.type === 'multi'   ? (given.map(i => q.choices[i]).join(' + ') || '(ไม่ได้เลือก)')
  : q.type === 'order'   ? given.map(i => q.items[i]).join(' → ')
  : String(given);

  const r = await withFallback('explainer', {
    stem: q.stem,
    qtype: { mcq:'ปรนัย', multi:'เลือกหลายข้อ', numeric:'คำนวณ', order:'เรียงลำดับ' }[q.type] || q.type,
    difficulty: q.b?.toFixed(1),
    answer: answerText,
    given: givenText,
    verdict: correct ? 'ถูกต้อง' : 'ยังไม่ถูก',
    skill: skillName(q.track, q.skill),
    sources: hits.map(h => `${h.chunk.title} (${h.chunk.source.ref}): ${h.chunk.text}`).join('\n\n') || '(ไม่มี)',
  },
  () => explainLocal(q, { given, correct }),
  data => ({
    lead: data.lead,
    blocks: [
      ...(data.misconception ? [{ h:'จุดที่เข้าใจคลาดเคลื่อน', text: data.misconception }] : []),
      { h:'วิธีคิดทีละขั้น', list: data.steps },
      { h:'สิ่งที่ควรจำ', text: data.keyPoint },
      ...(data.safety ? [{ h:'ข้อควรระวัง', text: data.safety }] : []),
    ],
    /* เหมือนกับติวเตอร์ — ถ้าโมเดลไม่ส่งมา ให้ใช้ของเอนจินในเครื่องแทน
       เฉลยที่ไม่มีคำถามชวนคิดจะกลายเป็นการยกคำตอบให้เฉย ๆ ทันที */
    ...(() => {
      const local = explainLocal(q, { given, correct });
      return {
        probe: data.probe || local.probe,
        nextTime: data.nextTime || local.nextTime,
        verify: data.verify || local.verify,
      };
    })(),
    sources: q.sources || [],
  }));

  return { ...r.value, source: r.source };
}

/* ============================================================
   3 · ผู้ประเมินความสามารถ — วินิจฉัยว่าเก่ง/อ่อนตรงไหน "เพราะอะไร"
   ============================================================ */

export async function assessLearner(trackId){
  const track = trackById(trackId);
  const a = abilityFor(trackId);
  const readiness = trackReadiness(trackId);
  const questions = Object.values(a.skills).reduce((s, v) => s + v.n, 0);

  const r = await withFallback('assessor', {
    track: track.name,
    cert: track.cert,
    theta: a.theta.toFixed(2),
    se: a.se.toFixed(2),
    readiness,
    questions,
    drills: state.drillHistory.filter(h => h.trackId === trackId).length,
    skills: skillTable(trackId),
    exams: examTable(trackId),
    practice: practiceTable(trackId),
  },
  () => localAssessment(trackId),
  data => ({
    headline: trim(data.headline, 160),
    stage: oneOf(data.stage, STAGES, readinessBand(readiness).label),
    strengths: (data.strengths || []).slice(0, 3)
      .map(s => ({ skill: trim(s.skill, 60), why: trim(s.why, 140) })),
    gaps: (data.gaps || []).slice(0, 4).map(gp => ({
      skill: trim(gp.skill, 60),
      why: trim(gp.why, 160),
      rootCause: trim(gp.rootCause, 120),
      severity: oneOf(gp.severity, LEVELS3, 'กลาง'),
    })),
    confidence: oneOf(data.confidence, LEVELS3, 'กลาง'),
    caveat: trim(data.caveat, 200),
  }));

  return { ...r.value, source: r.source, trackId, readiness, questions };
}

/** ฉบับในเครื่อง: อ่านจากค่าที่คำนวณได้ตรง ๆ ไม่มีการตีความเชิงสาเหตุ */
function localAssessment(trackId){
  const a = abilityFor(trackId);
  const readiness = trackReadiness(trackId);
  const band = readinessBand(readiness);
  const ranked = skillsOf(trackId)
    .map(s => ({ s, m: a.skills[s.id]?.mastery ?? 0.35, n: a.skills[s.id]?.n ?? 0 }))
    .sort((x, y) => x.m - y.m);

  const thin = ranked.every(r => r.n === 0);
  return {
    headline: thin
      ? 'ยังไม่มีข้อมูลพอจะประเมิน — ลองทำข้อสอบสักชุดก่อน'
      : `ความพร้อมโดยรวมอยู่ที่ ${readiness}% (${band.label})`,
    stage: readiness >= 80 ? 'พร้อมสอบ' : readiness >= 65 ? 'ใกล้พร้อม'
         : readiness >= 45 ? 'กำลังสร้างฐาน' : 'เริ่มต้น',
    strengths: ranked.slice(-2).filter(r => r.m >= 0.6)
      .map(r => ({ skill: r.s.name, why: `ความชำนาญ ${pct(r.m)}% จาก ${r.n} ข้อ` })),
    gaps: ranked.slice(0, 3).map(r => ({
      skill: r.s.name,
      why: r.n ? `ความชำนาญ ${pct(r.m)}% จาก ${r.n} ข้อ` : 'ยังไม่เคยวัดทักษะนี้',
      rootCause: r.n ? '' : 'ยังไม่มีข้อมูล',
      severity: r.m < 0.4 ? 'สูง' : r.m < 0.6 ? 'กลาง' : 'ต่ำ',
    })),
    confidence: thin ? 'ต่ำ' : (a.se < 0.5 ? 'สูง' : a.se < 0.8 ? 'กลาง' : 'ต่ำ'),
    caveat: 'ประเมินจากสูตรในเครื่อง (ยังไม่ได้ต่อ AI) จึงบอกได้แค่ “อ่อนตรงไหน” ยังไม่ได้วิเคราะห์ว่า “เพราะอะไร”',
  };
}

/* ============================================================
   4 · ผู้วางแผนพัฒนา — ออกแบบว่าจะทำยังไงให้เก่งขึ้น
   ============================================================ */

export async function buildPlan(trackId, { diagnosis, budget = 'สัปดาห์ละ 3 วัน วันละ 30 นาที' } = {}){
  const track = trackById(trackId);

  const summary = diagnosis
    ? [`ภาพรวม: ${diagnosis.headline}`, `ระยะ: ${diagnosis.stage}`,
       'จุดอ่อน:', ...(diagnosis.gaps || []).map(g =>
         `- ${g.skill} (${g.severity}) ${g.why}${g.rootCause ? ` · สาเหตุ: ${g.rootCause}` : ''}`)].join('\n')
    : skillTable(trackId);

  const r = await withFallback('coach', {
    diagnosis: summary,
    track: track.name,
    cert: track.cert,
    budget,
    readiness: trackReadiness(trackId),
    skillList: skillListForPlan(trackId),
    drills: drillListForPlan(trackId),
  },
  () => localPlan(trackId),
  data => ({
    goal: data.goal,
    horizon: data.horizon,
    expectedGain: data.expectedGain || '',
    watchOut: data.watchOut || '',
    steps: (data.steps || [])
      .sort((x, y) => (x.order || 0) - (y.order || 0))
      .slice(0, 8)
      .map(s => ({
        title: trim(s.title, 90),
        action: oneOf(s.action, ACTIONS, 'review'),
        // โมเดลอาจคืน skillId ที่ไม่มีจริง ต้องตรวจก่อนเอาไปทำลิงก์
        skillId: skillsOf(trackId).some(k => k.id === s.skillId) ? s.skillId : '',
        detail: trim(s.detail, 200),
        // กันเวลาที่ไม่สมเหตุสมผล (เคยได้ 0 และ 480 นาที)
        minutes: Math.min(120, Math.max(5, Number.isFinite(+s.minutes) ? Math.round(+s.minutes) : 20)),
        successCriteria: trim(s.successCriteria, 140),
        why: trim(s.why, 160),
      })),
  }));

  return { ...r.value, source: r.source, trackId };
}

/** ฉบับในเครื่อง: ใช้ studyPlan เดิมที่เรียงตามทักษะอ่อนสุด */
function localPlan(trackId){
  const idx = {};
  for (const d of drillsFor(trackId)) idx[d.skill] ||= d;
  const plan = studyPlan(trackId, idx);

  return {
    goal: `ยกความพร้อมของ ${trackById(trackId).name} ให้ถึงเกณฑ์พร้อมสอบ (80%)`,
    horizon: '2 สัปดาห์',
    expectedGain: '',
    watchOut: '',
    steps: plan.flatMap((p, i) => p.actions.map((ac, j) => ({
      title: ac.label,
      action: ac.type === 'drill' ? 'drill' : ac.type === 'tutor' ? 'tutor' : 'exam',
      skillId: p.skillId,
      detail: ac.detail,
      minutes: 20,
      successCriteria: '',
      why: j === 0 ? `เป็นทักษะที่อ่อนอันดับ ${i + 1}` : '',
    }))),
  };
}

/* ============================================================
   5 · ผู้ให้ฟีดแบ็กภาคปฏิบัติ — แปลงตัวเลขจากกล้องเป็นคำแนะนำ
   ============================================================ */

export async function coachPractice(drill, result){
  const r = await withFallback('practice', {
    drill: drill.name,
    mode: drill.mode,
    skill: skillName(drill.track, drill.skill),
    score: result.score,
    rubric: result.rubric.map(x => `- ${x.name} (${x.weight}%): ${x.value}`).join('\n'),
    metrics: Object.entries(result.detail || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(ไม่มี)',
    target: JSON.stringify(drill.config).slice(0, 500),
  },
  () => ({ verdict:'', doNext: result.feedback || [], keepDoing:'', safety: drill.safety || '' }),
  data => ({
    verdict: data.verdict,
    doNext: data.doNext || [],
    keepDoing: data.keepDoing || '',
    safety: data.safety || '',
  }));

  return { ...r.value, source: r.source };
}

/* ============================================================
   6 · ผู้วางแผนการสอน — ฝั่งครู ร่างแผนรายสัปดาห์ให้ชั้นเรียน
   ============================================================ */

export async function planLessons(cls, { weeks = 8, classProfile = '' } = {}){
  const track = trackById(cls.trackId);
  const hours = cls.schedule.reduce((sum, s) => {
    const [h1, m1] = s.start.split(':').map(Number);
    const [h2, m2] = s.end.split(':').map(Number);
    return sum + (h2 * 60 + m2 - h1 * 60 - m1) / 60;
  }, 0);

  const r = await withFallback('planner', {
    className: cls.name,
    track: track.name,
    cert: track.cert,
    weeks,
    slots: cls.schedule.length,
    hours: hours.toFixed(1),
    students: cls.students.length,
    skillList: skillListForPlan(cls.trackId),
    classProfile: classProfile || '(ยังไม่มีข้อมูลผลการเรียนของห้องนี้)',
    drills: drillListForPlan(cls.trackId),
  },
  () => localLessonPlan(cls, weeks),
  data => ({
    overview: trim(data.overview, 300),
    priorityNote: trim(data.priorityNote, 260),
    weeks: (data.weeks || [])
      .sort((a, b) => (a.week || 0) - (b.week || 0))
      .slice(0, 20)
      .map((w, i) => ({
        week: Number.isFinite(+w.week) ? +w.week : i + 1,
        title: trim(w.title, 90),
        objective: trim(w.objective, 180),
        // โมเดลอาจคิดรหัสทักษะขึ้นเอง ต้องกรองเหลือเฉพาะที่มีจริง
        skillIds: (w.skillIds || []).filter(id => skillsOf(cls.trackId).some(s => s.id === id)),
        theory: trim(w.theory, 200),
        activity: trim(w.activity, 200),
        assessment: trim(w.assessment, 180),
      })),
  }));

  return { ...r.value, source: r.source };
}

/** ฉบับในเครื่อง: กระจายทักษะของหลักสูตรลงสัปดาห์ตามลำดับที่ประกาศไว้ */
function localLessonPlan(cls, weeks){
  const skills = skillsOf(cls.trackId);
  const drills = drillsFor(cls.trackId);
  const per = Math.max(1, Math.ceil(skills.length / weeks));

  return {
    overview: `แผน ${weeks} สัปดาห์สำหรับ ${trackById(cls.trackId).name} ` +
              `กระจายทักษะย่อย ${skills.length} ด้านตามลำดับหลักสูตร`,
    priorityNote: '',
    weeks: Array.from({ length: weeks }, (_, i) => {
      const chunk = skills.slice(i * per, (i + 1) * per);
      const d = drills[i % Math.max(1, drills.length)];
      return {
        week: i + 1,
        title: chunk.length ? chunk.map(s => s.name).join(' + ') : 'ทบทวนและประเมินรวม',
        objective: chunk.length
          ? `นักเรียนอธิบายและลงมือทำเรื่อง ${chunk.map(s => s.name).join(', ')} ได้`
          : 'นักเรียนทำข้อสอบรวมและแก้จุดอ่อนที่เหลือได้',
        skillIds: chunk.map(s => s.id),
        theory: chunk.length ? `บรรยายหลักการ ${chunk.map(s => s.name).join(', ')}` : 'ทบทวนทั้งหมด',
        activity: d ? `บทฝึกหน้ากล้อง: ${d.name}` : 'ฝึกทำข้อสอบเจาะทักษะ',
        assessment: 'ทำข้อสอบปรับระดับ 10 ข้อ แล้วดูความชำนาญรายทักษะ',
      };
    }),
  };
}

/* ============================================================
   7 · ผู้วิเคราะห์ชั้นเรียน — บอกครูว่าควรสอนซ่อมอะไร ใครต้องช่วย
   ============================================================ */

export async function analyseClass(cls, roster){
  const track = trackById(cls.trackId);

  const rosterText = dash(roster.map(s =>
    `- ${s.name} | ความพร้อม ${s.readiness}% | อ่อน: ${s.weak || 'ไม่ระบุ'}` +
    ` | ฝึกปฏิบัติ ${s.drills} ครั้ง | ใช้งานล่าสุด ${s.lastActive || 'ไม่ทราบ'}`));

  const agg = {};
  for (const s of roster) if (s.weak) agg[s.weak] = (agg[s.weak] || 0) + 1;
  const classSkills = dash(Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- ${k}: มีนักเรียน ${n} คนที่อ่อนเรื่องนี้เป็นหลัก`));

  // คำนวณตัวเลขสรุปให้เสร็จก่อนส่ง — ไม่ปล่อยให้โมเดลบวกเลขเอง เพราะพลาดบ่อย
  const avg = roster.length
    ? Math.round(roster.reduce((s, x) => s + x.readiness, 0) / roster.length) : 0;
  const atRisk = roster.filter(s => s.readiness < 60).length;
  const ready  = roster.filter(s => s.readiness >= 80).length;
  const noPractice = roster.filter(s => !s.drills).length;

  const r = await withFallback('classanalyst', {
    className: cls.name,
    track: track.name,
    students: roster.length,
    stats: [
      `- ความพร้อมเฉลี่ยของห้อง: ${avg}%`,
      `- พร้อมสอบแล้ว (≥80%): ${ready} คน`,
      `- ต้องเร่งช่วย (<60%): ${atRisk} คน`,
      `- ยังไม่เคยฝึกภาคปฏิบัติ: ${noPractice} คน`,
    ].join('\n'),
    roster: rosterText,
    classSkills,
  },
  () => localClassAnalysis(roster, agg),
  data => ({
    headline: trim(data.headline, 180),
    teachToAll: (data.teachToAll || []).slice(0, 4).map(x => ({
      topic: trim(x.topic, 80),
      reason: trim(x.reason, 180),
      suggestion: trim(x.suggestion, 200),
    })),
    needAttention: (data.needAttention || []).slice(0, 6).map(x => ({
      student: trim(x.student, 60),
      issue: trim(x.issue, 140),
      action: trim(x.action, 160),
    })),
    doingWell: trim(data.doingWell, 200),
  }));

  return { ...r.value, source: r.source };
}

function localClassAnalysis(roster, agg){
  const atRisk = roster.filter(s => s.readiness < 60);
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1])[0];
  const avg = roster.length
    ? Math.round(roster.reduce((s, x) => s + x.readiness, 0) / roster.length) : 0;

  return {
    headline: `ความพร้อมเฉลี่ยของห้อง ${avg}% · ต้องเร่งช่วย ${atRisk.length} คน`,
    teachToAll: top ? [{
      topic: top[0],
      reason: `มีนักเรียน ${top[1]} คนที่อ่อนเรื่องนี้เป็นหลัก`,
      suggestion: 'สอนซ่อมรวมทั้งห้องแล้วให้ทำข้อสอบเจาะทักษะนี้ 10 ข้อ',
    }] : [],
    needAttention: atRisk.slice(0, 5).map(s => ({
      student: s.name,
      issue: `ความพร้อม ${s.readiness}% ต่ำกว่าเกณฑ์`,
      action: 'นัดติวเดี่ยวหรือจับคู่กับเพื่อนที่พร้อมแล้ว',
    })),
    doingWell: '',
  };
}

/** ชื่อผู้เรียนไว้ใช้ทักทายในบางบทบาท */
export const learnerName = () => displayName();
