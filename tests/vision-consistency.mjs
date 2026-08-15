/* วัดความคงเส้นคงวาของผู้ตรวจชิ้นงานจากภาพ
   ------------------------------------------------------------
   ยิงภาพชุดเดิมซ้ำหลายรอบ แล้วดูว่าตัดสินเหมือนเดิมไหม
   โมเดลที่ตอบภาพเดิมไม่เหมือนเดิม เอาไปตัดสินงานนักเรียนไม่ได้

   ใช้ทุกครั้งที่เปลี่ยนโมเดลภาพหรือแก้ prompt ของบทบาท inspector

       python serve.py --http --port 8559        (อีกหน้าต่างหนึ่ง)
       node tests/vision-consistency.mjs

   ภาพทดสอบใน tests/fixtures เป็นภาพวาดสังเคราะห์ ไม่ใช่ภาพถ่ายจริง
   ใช้ดูแนวโน้มได้ แต่สรุปแทนการทดสอบกับภาพหน้างานจริงไม่ได้
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.env.OUT || path.join(HERE, 'fixtures');
const API = process.env.SKILLPASS_API || 'http://127.0.0.1:8559/api/ai';
const ROUNDS = +(process.env.ROUNDS || 3);
const b64 = f => fs.readFileSync(path.join(OUT, f)).toString('base64');

const CRITERIA = [
  { id:'c_duct',   name:'สายเดินในราง',   pass:'สายไฟทุกเส้นอยู่ในรางหรือมัดเป็นระเบียบ ไม่พาดไขว้กลางตู้' },
  { id:'c_lug',    name:'เข้าหางปลา',     pass:'ปลายสายทุกเส้นมีหางปลาย้ำก่อนเข้าเทอร์มินอล' },
  { id:'c_copper', name:'ไม่มีทองแดงโผล่', pass:'มองไม่เห็นเนื้อทองแดงเปลือยพ้นออกมาจากหางปลาหรือเทอร์มินอล' },
  { id:'c_mark',   name:'ติดป้ายมาร์กสาย', pass:'สายแต่ละเส้นมีป้ายกำกับ เช่น L1 L2 L3 N PE' },
];
const criteriaText = CRITERIA.map(c => `[${c.id}] ${c.name} — ผ่านเมื่อ: ${c.pass}`).join('\n');

async function inspect(imageB64){
  const res = await fetch(API, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      role:'inspector',
      input:{ drill:'ตรวจการเดินสายในตู้ควบคุม', track:'ช่างไฟฟ้าภายในอาคาร',
              round:'1', criteria:criteriaText, previousFix:'(รอบแรก)' },
      images:[imageB64],
    }),
  });
  const j = await res.json();
  if (!j.ok) return { error: j.error };
  return {
    verdicts: Object.fromEntries((j.data.criteria || []).map(c => [c.id, c.verdict])),
    visible: j.data.workpieceVisible,
    overall: j.data.overall,
    scene: (j.data.sceneSummary || '').slice(0, 70),
  };
}

const CASES = [
  { file:'panel-good.jpg',  label:'A ตู้เรียบร้อย',  expect:'pass' },
  { file:'panel-bad.jpg',   label:'B ตู้รก',        expect:'fail' },
  { file:'panel-blank.jpg', label:'C ภาพเปล่า',     expect:'unclear' },
];

const table = {};
for (const c of CASES){
  const img = b64(c.file);
  table[c.label] = [];
  for (let r = 1; r <= ROUNDS; r++){
    const out = await inspect(img);
    table[c.label].push(out);
    const v = out.verdicts ? Object.values(out.verdicts) : ['ERROR'];
    console.log(`${c.label} รอบ ${r}: ${v.join(' ')}  (เห็นชิ้นงาน=${out.visible}) ${out.scene}`);
  }
}

console.log('\n########## สรุป ##########');
let allGood = true;
for (const c of CASES){
  const runs = table[c.label];
  const hit = runs.filter(r =>
    r.verdicts && Object.values(r.verdicts).filter(v => v === c.expect).length >= 3).length;
  const consistent = new Set(runs.map(r => JSON.stringify(r.verdicts))).size === 1;
  console.log(`${c.label.padEnd(16)} ตรงที่คาด ${hit}/${ROUNDS} รอบ · ตอบเหมือนเดิมทุกรอบ: ${consistent ? 'ใช่' : 'ไม่'}`);
  if (hit < ROUNDS || !consistent) allGood = false;
}
console.log(allGood
  ? '\nคงเส้นคงวาและตรงที่คาดทุกเคส'
  : '\nยังไม่คงเส้นคงวา — ห้ามเอาไปตัดสินผลจริงของนักเรียนในสภาพนี้');
