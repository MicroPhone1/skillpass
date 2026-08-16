const t = await import(new URL('../js/engine/tutor.js', import.meta.url).href);
const on = [
  ['เครื่องตัดไฟรั่วทำงานยังไง','electrician'],['สายดินใช้สีอะไร','electrician'],
  ['คำนวณกระแสมอเตอร์ 3 เฟส','electrician'],['แรงดันตกในสายไฟ','electrician'],
  ['PLC สแกนโปรแกรมยังไง','automation'],['เซนเซอร์ PNP กับ NPN ต่างกันยังไง','automation'],
  ['โอเวอร์โหลดรีเลย์ป้องกันอะไร','automation'],['วงจรค้างสถานะคืออะไร','automation'],
  ['สตาร์เดลตาลดกระแสยังไง','automation'],['ไล่หาจุดเสียแบบแบ่งครึ่ง','automation'],
  ['กดหน้าอกเร็วเท่าไหร่','firstaid'],['ใช้ AED ยังไง','firstaid'],
  ['shared responsibility model','cloud'],['S3 คืออะไร','cloud'],['savings plan','cloud'],
  ['เจือจางกรด','lab'],['เลขนัยสำคัญ','lab'],
  ['ทำไมแนวเชื่อมเป็นรูพรุน','welding'],['E7018 คืออะไร','welding'],
  ['แป้นเบรกนิ่ม','auto'],['ทำสุญญากาศทำไม','hvac'],
  ['พูดเร็วแค่ไหนดี','present'],['กฎ 72','finance'],['ฟิชชิ่ง','cyber'],
  ['PDPA ข้อมูลอ่อนไหว','cyber'],['passive voice','english'],
];
const off = [
  ['สูตรทำต้มยำกุ้งใส่กะทิ','electrician'],['วันนี้อากาศเป็นยังไงบ้าง','electrician'],
  ['แนะนำหนังตลกเรื่องใหม่หน่อย','firstaid'],['ราคาบิตคอยน์วันนี้','cloud'],
  ['ช่วยแต่งกลอนให้หน่อย','lab'],['ร้านกาแฟแถวนี้เปิดกี่โมง','automation'],
  ['ดวงวันนี้ราศีเมษเป็นยังไง','automation'],['ทีมฟุตบอลไหนชนะเมื่อคืน','welding'],
  ['เลี้ยงแมวยังไงให้ไม่ป่วย','auto'],['จองตั๋วเครื่องบินไปญี่ปุ่น','present'],
  ['สอนเต้นบัลเล่ต์','finance'],['ปลูกต้นมะม่วงยังไง','cyber'],
];
const row = (q, tr) => { const h = t.retrieve(q,{trackId:tr,k:1})[0]||{score:0,coverage:0};
  return [h.score.toFixed(2).padStart(6), h.coverage.toFixed(2).padStart(5)]; };
console.log('ON-TOPIC              score   cov');
let minOnS=9e9,minOnC=9e9;
for (const [q,tr] of on){ const [s,c]=row(q,tr); minOnS=Math.min(minOnS,+s); minOnC=Math.min(minOnC,+c);
  console.log(q.padEnd(34,' ')+s+' '+c); }
console.log('\nOFF-TOPIC             score   cov');
let maxOffS=0,maxOffC=0;
for (const [q,tr] of off){ const [s,c]=row(q,tr); maxOffS=Math.max(maxOffS,+s); maxOffC=Math.max(maxOffC,+c);
  console.log(q.padEnd(34,' ')+s+' '+c); }
console.log(`\nmin on-topic : score ${minOnS}  cov ${minOnC}`);
console.log(`max off-topic: score ${maxOffS}  cov ${maxOffC}`);
console.log(`separable by score? ${minOnS>maxOffS}   by coverage? ${minOnC>maxOffC}`);
