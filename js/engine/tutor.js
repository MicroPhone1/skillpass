/* ============================================================
   engine/tutor.js — RAG Tutor (retrieval จริง + generation แบบเทมเพลต)
   ------------------------------------------------------------
   หลักคิด "zero-hallucination" ในเวอร์ชัน prototype:
   ระบบจะตอบ "เฉพาะจากข้อความที่ค้นเจอในคลังความรู้" เท่านั้น
   ถ้าไม่มี chunk ไหนได้คะแนนถึงเกณฑ์ จะบอกตรง ๆ ว่าไม่มีข้อมูล
   แทนการเดา — และแสดงแหล่งอ้างอิงของทุกคำตอบเสมอ

   การค้นหาใช้ TF-IDF อย่างง่าย บน token ผสม:
   ภาษาไทยไม่มีช่องว่างระหว่างคำ จึงใช้ character 3-gram
   ส่วนภาษาอังกฤษ/ตัวเลขใช้การตัดคำปกติ
   ============================================================ */

import { KB } from '../data/kb.js';
import { QUESTIONS } from '../data/questions.js';
import { skillName, trackById } from '../data/tracks.js';

/* ------------------------------------------------------------ tokenizer */

/* คำหยุด (stopwords) — คำถามภาษาไทยเต็มไปด้วยคำพวกนี้ ("...คืออะไร", "...ยังไง")
   ซึ่งสร้าง n-gram จำนวนมากที่ไม่มีความหมายเชิงเนื้อหา ทำให้
   คำถามนอกเรื่องได้คะแนนสูงเกินจริง และคำถามตรงเรื่องถูกเจือจางลง
   ตัดทิ้งทั้งฝั่งคำค้นและฝั่งเอกสาร เพื่อให้ token ตรงกัน */
const STOP = new RegExp([
  'คืออะไร','อย่างไรบ้าง','อย่างไร','ยังไงบ้าง','ยังไง','เพราะอะไร','ทำไม',
  'เท่าไหร่','เท่าไร','แค่ไหน','อะไรบ้าง','อะไร','ไหม','มั้ย','หรือไม่',
  'ช่วยอธิบาย','อธิบาย','ช่วยบอก','แนะนำ','อยากรู้','อยากทราบ','ขอถาม','สอน',
  'หน่อย','ครับ','ค่ะ','คะ','นะ','บ้าง','ด้วย','แล้ว','วันนี้',
  'ที่','การ','ของ','และ','หรือ','ใน','ให้','ได้','จะ','มี','เป็น','ว่า',
  'กับ','ก็','ไป','มา','นี้','นั้น','ต้อง','ควร','จาก','เมื่อ','ถ้า','แต่',
  'what','which','how','why','when','the','and','for','are','with','that','this',
].join('|'), 'g');

function tokenize(text){
  const out = [];
  const s = String(text).toLowerCase().replace(STOP, ' ');

  // คำละติน + ตัวเลข
  for (const m of s.matchAll(/[a-z0-9][a-z0-9._-]*/g)) if (m[0].length > 1) out.push(m[0]);

  // ไทย: ตัดเป็น character 3-gram ภายในแต่ละช่วงอักษรไทย
  for (const m of s.matchAll(/[฀-๿]+/g)){
    const w = m[0];
    if (w.length <= 3){ out.push(w); continue; }
    for (let i = 0; i + 3 <= w.length; i++) out.push(w.slice(i, i + 3));
  }
  return out;
}

/* ------------------------------------------------------------ index */
const DOCS = KB.map(c => {
  const body  = tokenize(c.text);
  const title = tokenize(c.title);
  const tf = new Map();
  for (const t of body)  tf.set(t, (tf.get(t) || 0) + 1);
  for (const t of title) tf.set(t, (tf.get(t) || 0) + 2.5);   // ชื่อหัวข้อถ่วงน้ำหนักมากกว่า
  return { chunk:c, tf, len: Math.sqrt(body.length + 1) };
});

const DF = new Map();
for (const d of DOCS) for (const t of new Set(d.tf.keys())) DF.set(t, (DF.get(t) || 0) + 1);
const N = DOCS.length;
const idf = t => Math.log(1 + N / (1 + (DF.get(t) || 0)));

/**
 * ค้นคลังความรู้
 * @returns [{ chunk, score }] เรียงจากคะแนนมากไปน้อย
 */
export function retrieve(query, { trackId = null, skillId = null, k = 3 } = {}){
  const qt = tokenize(query);
  if (!qt.length) return [];
  const qSet = new Map();
  for (const t of qt) qSet.set(t, (qSet.get(t) || 0) + 1);

  // น้ำหนัก idf รวมของคำค้น ใช้คำนวณ "ความครอบคลุม" ด้านล่าง
  const qIdfTotal = [...qSet.keys()].reduce((s, t) => s + idf(t), 0) || 1;

  const scored = DOCS.map(d => {
    let s = 0, matched = 0;
    for (const [t, qn] of qSet){
      const tfv = d.tf.get(t);
      if (tfv){
        s += (1 + Math.log(tfv)) * idf(t) * (1 + Math.log(qn));
        matched += idf(t);
      }
    }
    s /= d.len;
    if (trackId && d.chunk.track === trackId) s *= 1.45;   // ให้น้ำหนักแทร็กที่กำลังเรียน
    if (skillId && d.chunk.skill === skillId) s *= 1.30;
    /* coverage = สัดส่วนน้ำหนักของคำค้นที่พบจริงในเอกสารนี้
       คำค้นนอกเรื่องมักได้คะแนน tf-idf พอประมาณจาก n-gram ที่บังเอิญตรง
       แต่ coverage จะต่ำเสมอ — จึงใช้เป็นด่านที่สองกันการตอบมั่ว */
    return { chunk: d.chunk, score: s, coverage: matched / qIdfTotal };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).filter(r => r.score > 0);
}

/* ------------------------------------------------------------ answering */

/* เกณฑ์รับคำตอบ — ต้องผ่านทั้งสองอย่าง (ค่านี้ได้จากการคาลิเบรตกับ
   ชุดคำถามตรงเรื่อง 20 ข้อ และคำถามนอกเรื่อง 10 ข้อ)
     score    = ความเกี่ยวข้องแบบ tf-idf
     coverage = สัดส่วนน้ำหนักคำค้นที่พบจริงในเอกสาร
   คำถามนอกเรื่องมักได้ score พอประมาณจาก n-gram ที่บังเอิญตรง
   แต่ coverage จะต่ำ จึงต้องใช้คู่กัน */
const MIN_SCORE = 0.25;
const MIN_COVERAGE = 0.40;
const passes = h => h && h.score >= MIN_SCORE && h.coverage >= MIN_COVERAGE;

/**
 * ตอบคำถามอิสระ
 * @returns { kind:'answer'|'nohit', lead, blocks:[{h,text}], sources:[{title,ref}], hits }
 */
export function ask(question, { trackId = null, skillId = null } = {}){
  const hits = retrieve(question, { trackId, skillId, k: 3 });
  const top = hits[0];

  if (!passes(top)){
    const topics = [...new Set(
      KB.filter(c => !trackId || c.track === trackId).map(c => c.title)
    )].slice(0, 5);
    return {
      kind:'nohit',
      lead:'ยังไม่พบข้อมูลเรื่องนี้ในคลังความรู้ของระบบ จึงขอไม่เดาคำตอบให้นะครับ',
      blocks:[{
        h:'หัวข้อที่ตอบได้ตอนนี้',
        list: topics.length ? topics : ['ยังไม่มีเนื้อหาในแทร็กนี้'],
      }],
      sources:[], hits:[],
    };
  }

  const blocks = [{ h: top.chunk.title, text: top.chunk.text }];
  const sources = [top.chunk.source];

  // เสริมด้วย chunk รองถ้าเกี่ยวข้องพอ ๆ กัน
  const second = hits[1];
  if (second && second.score > top.score * 0.62){
    blocks.push({ h:`เกี่ยวข้อง: ${second.chunk.title}`, text: second.chunk.text });
    sources.push(second.chunk.source);
  }

  return {
    kind:'answer',
    lead:'จากคลังความรู้ที่ค้นเจอ ผมสรุปให้ดังนี้ครับ',
    blocks, sources,
    hits: hits.map(h => ({ id:h.chunk.id, title:h.chunk.title, score:+h.score.toFixed(2) })),
  };
}

/**
 * อธิบายเฉลยของข้อสอบหนึ่งข้อ — ใช้ steps ที่เขียนไว้กับข้อนั้นโดยตรง
 * (ไม่ generate ใหม่ จึงไม่มีโอกาสเพี้ยน)
 */
export function explainQuestion(q, { given = null, correct = null } = {}){
  const blocks = [];

  if (correct === false){
    blocks.push({ h:'ทำไมคำตอบที่เลือกจึงยังไม่ถูก', text: q.why });
  }

  blocks.push({ h:'วิธีทำทีละขั้น', list: q.steps });

  if (correct !== false && q.why) blocks.push({ h:'จุดที่ต้องจำ', text: q.why });

  // ดึงความรู้พื้นฐานที่เกี่ยวข้องมาเสริม
  const extra = retrieve(q.stem + ' ' + q.why, { trackId: q.track, skillId: q.skill, k: 1 })[0];
  if (passes(extra)){
    blocks.push({ h:`อ่านเพิ่ม: ${extra.chunk.title}`, text: extra.chunk.text });
  }

  const sources = [...(q.sources || [])];
  if (passes(extra)) sources.push(extra.chunk.source);

  return {
    kind:'answer',
    lead: correct === false
      ? `ข้อนี้เกี่ยวกับ “${skillName(q.track, q.skill)}” — มาดูวิธีคิดที่ถูกต้องกันครับ`
      : `เก่งมาก! ทวนวิธีคิดของข้อ “${skillName(q.track, q.skill)}” อีกรอบให้แม่นขึ้น`,
    blocks,
    sources: dedupe(sources),
    hits: [],
  };
}

/** สรุปหลักการของทักษะหนึ่ง ๆ (ใช้จากแผนติว) */
export function brief(trackId, skillId){
  const chunks = KB.filter(c => c.track === trackId && c.skill === skillId);
  if (!chunks.length){
    return ask(skillName(trackId, skillId), { trackId, skillId });
  }
  return {
    kind:'answer',
    lead:`สรุปหลักการของ “${skillName(trackId, skillId)}” ในแทร็ก ${trackById(trackId).name}`,
    blocks: chunks.map(c => ({ h:c.title, text:c.text })),
    sources: dedupe(chunks.map(c => c.source)),
    hits: [],
  };
}

/** คำถามแนะนำสำหรับแทร็กปัจจุบัน */
export function suggestions(trackId){
  const base = KB.filter(c => c.track === trackId).slice(0, 3).map(c => c.title);
  const qs = QUESTIONS.filter(q => q.track === trackId).slice(0, 2)
    .map(q => q.stem.length > 42 ? q.stem.slice(0, 40) + '…' : q.stem);
  return [...base, ...qs].slice(0, 5);
}

function dedupe(list){
  const seen = new Set(); const out = [];
  for (const s of list){
    const k = s.title + '|' + s.ref;
    if (!seen.has(k)){ seen.add(k); out.push(s); }
  }
  return out;
}
