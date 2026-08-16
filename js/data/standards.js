/* ============================================================
   data/standards.js — เกณฑ์มาตรฐานฝีมือแรงงานแห่งชาติ (DSD)

   แยกจาก tracks.js เพราะคนละธรรมชาติกัน:
   tracks คือ "เส้นทางการเรียนในแอป" ซึ่งเราออกแบบเองได้
   ส่วนไฟล์นี้คือ "ข้อเท็จจริงตามประกาศราชการ" ที่ต้องตรงกับต้นฉบับ
   ห้ามแก้ตัวเลขในไฟล์นี้โดยไม่มีแหล่งอ้างอิง — ดู docs/research.md

   ค่าจ้าง: ประกาศคณะกรรมการค่าจ้าง เรื่อง อัตราค่าจ้างตามมาตรฐานฝีมือ
   (ฉบับที่ 13) ราชกิจจานุเบกษา 19 ธ.ค. 2566 · มีผล 18 มี.ค. 2567
   ============================================================ */

/* ค่าจ้างขั้นต่ำใช้เป็นฐานเปรียบเทียบ "ได้ใบเซอร์แล้วต่างจากเดิมเท่าไร"
   ประกาศฯ มีผล 1 ก.ค. 2568 · แบ่ง 17 ระดับตามพื้นที่ */
export const MINIMUM_WAGE = { low: 337, high: 400, note: 'ตามพื้นที่ 17 ระดับ' };

export const STANDARDS = [
  {
    id: 'dsd-electrician-indoor-1',
    trackId: 'electrician',              // ผูกกับ track ในแอป
    authority: 'กรมพัฒนาฝีมือแรงงาน (DSD)',
    name: 'ช่างไฟฟ้าภายในอาคาร ระดับ 1',
    nameEn: 'Building Electrician Level 1',
    law: 'พ.ร.บ. ส่งเสริมการพัฒนาฝีมือแรงงาน (ฉบับที่ 2) พ.ศ. 2557',
    lawNote: 'เป็นสาขาที่อาจเป็นอันตรายต่อสาธารณะ ผู้ปฏิบัติงานต้องมีหนังสือรับรองความรู้ความสามารถ',
    weights: { theory: 30, practical: 70 },
    passing: { combined: 70 },           // ระดับ 1 ตัดสินจากคะแนนรวม
    wage: { 1: 470, 2: 595, 3: 695 },
    validYears: null,                    // ประกาศไม่ได้ระบุอายุไว้
    entry: [
      'ผ่านการทดสอบมาตรฐานฝีมือแรงงานแห่งชาติ สาขาช่างไฟฟ้าภายในอาคาร',
      'มีประสบการณ์ทำงานที่เกี่ยวข้อง',
      'มีคุณลักษณะส่วนบุคคลที่เหมาะสมกับสาขาอาชีพ',
    ],
    modules: [
      { n: 1,  th: 'ความรู้เกี่ยวกับอัคคีภัย',                    en: 'Fire Safety' },
      { n: 2,  th: 'ความปลอดภัย',                                 en: 'General Safety' },
      { n: 3,  th: 'การปฏิบัติงานทางไฟฟ้าด้วยความปลอดภัย',        en: 'Electrical Work Safety' },
      { n: 4,  th: 'วงจรไฟฟ้า',                                   en: 'Electrical Circuits' },
      { n: 5,  th: 'เครื่องวัดไฟฟ้า',                              en: 'Measuring Instruments' },
      { n: 6,  th: 'สายไฟฟ้า',                                    en: 'Wires & Cables' },
      { n: 7,  th: 'อุปกรณ์ป้องกันกระแสเกิน',                     en: 'Overcurrent Protection' },
      { n: 8,  th: 'การต่อลงดิน',                                 en: 'Grounding' },
      { n: 9,  th: 'เครื่องมือช่าง',                               en: 'Hand Tools' },
      { n: 10, th: 'อุปกรณ์และวัสดุงานเดินสายไฟฟ้าในท่อร้อยสาย',  en: 'Conduit Wiring' },
      { n: 11, th: 'รางเดินสาย',                                  en: 'Raceway' },
      { n: 12, th: 'วงจรย่อย',                                    en: 'Branch Circuits' },
      { n: 13, th: 'การต่อสวิตช์และเต้ารับไฟฟ้า',                 en: 'Switch & Receptacle Wiring' },
    ],
    /* เกณฑ์ระดับ 3 ต่างจากระดับ 1 อย่างมีนัยสำคัญ ตามประกาศ DSD 10 ม.ค. 2568
       เก็บไว้กันคนเข้าใจผิดว่า "70% ทุกภาคทุกระดับ" */
    levelNotes: {
      3: 'ภาคความรู้แบบปรนัยผ่านที่ 60% · ภาคความสามารถ 3 สถานี (รางเคเบิล, ' +
         'สัญญาณแจ้งเหตุเพลิงไหม้, วงจรควบคุมมอเตอร์สตาร์-เดลตา) ต้องได้สถานีละ ≥ 70%',
    },
  },

  {
    id: 'dsd-electrician-industrial-1',
    trackId: 'automation',               // เส้นทางระบบควบคุมอัตโนมัติ & PLC อิงเกณฑ์นี้
    authority: 'กรมพัฒนาฝีมือแรงงาน (DSD)',
    name: 'ช่างไฟฟ้าอุตสาหกรรม ระดับ 1',
    nameEn: 'Industrial Electrician Level 1',
    law: null,
    lawNote: null,
    weights: null,                       // คู่มือไม่ได้ระบุสัดส่วนไว้ชัด
    passing: { combined: 70 },
    wage: { 1: 440, 2: 550, 3: 660 },
    wageNote: 'ต้องตรวจซ้ำ: ประกาศฯ ฉบับที่ 14 (2568) มีสาขาชื่อคล้ายกันที่ระดับ 2 = 600 บาท',
    validYears: null,
    entry: [
      'อายุไม่ต่ำกว่า 18 ปีบริบูรณ์ นับถึงวันสมัคร',
      'มีประสบการณ์ในสาขานี้ไม่น้อยกว่า 1 ปี',
      'หรือผ่านการฝึกไม่น้อยกว่า 360 ชม. + ประสบการณ์จากการฝึก/ปฏิบัติงานไม่น้อยกว่า 180 ชม.',
      'หรือสำเร็จการศึกษาไม่ต่ำกว่า ปวช. ในสาขาที่เกี่ยวข้อง',
    ],
    /* เลื่อนระดับได้ 2 ทาง: สะสมประสบการณ์ หรือทำคะแนนระดับก่อนหน้าให้ถึง 80%
       ทางที่สองสำคัญกับแอปเรา เพราะเป็นเป้าหมายที่ผู้เรียนไล่ตามได้ด้วยการฝึก */
    promotion: { experienceYears: 1, scoreShortcut: 80 },
    modules: [
      { n: 1,  th: 'ความปลอดภัยเบื้องต้นในการปฏิบัติงานทางไฟฟ้า', en: 'Electrical Safety Fundamentals' },
      { n: 2,  th: 'การใช้เครื่องมือช่างทั่วไป',                   en: 'General Hand Tools' },
      { n: 3,  th: 'การปฏิบัติงานทางไฟฟ้าด้วยความปลอดภัย',        en: 'Safe Electrical Work Practices' },
      { n: 4,  th: 'ความรู้ทั่วไปเกี่ยวกับวงจรไฟฟ้า',              en: 'Electrical Circuit Fundamentals' },
      { n: 5,  th: 'ความรู้ทั่วไปเกี่ยวกับเครื่องวัดไฟฟ้า',         en: 'Electrical Measuring Instruments' },
      { n: 6,  th: 'สายไฟฟ้า',                                    en: 'Electrical Wires & Cables' },
      { n: 7,  th: 'อุปกรณ์ป้องกันกระแสเกิน',                     en: 'Overcurrent Protection' },
      { n: 8,  th: 'การต่อลงดิน',                                 en: 'Grounding' },
      { n: 9,  th: 'เครื่องจักรกลไฟฟ้าเบื้องต้น',                  en: 'Electrical Machines Fundamentals' },
      { n: 10, th: 'อุปกรณ์ในงานควบคุมมอเตอร์',                   en: 'Motor Control Devices' },
      { n: 11, th: 'การต่อมอเตอร์ไฟฟ้าสามเฟส',                    en: 'Three-Phase Motor Connection' },
      { n: 12, th: 'วงจรควบคุมมอเตอร์ด้วยคอนแทคเตอร์',            en: 'Contactor-Based Motor Control' },
    ],
  },

  {
    id: 'dsd-welding-smaw-1',
    trackId: 'welding',
    authority: 'กรมพัฒนาฝีมือแรงงาน (DSD)',
    name: 'ช่างเชื่อมอาร์กโลหะด้วยมือ ระดับ 1',
    nameEn: 'Shielded Metal Arc Welding (SMAW) Level 1',
    law: null,
    lawNote: 'กลุ่มสาขาอาชีพช่างอุตสาหการ',
    weights: null,
    /* สาขานี้ตัดสินแยกภาค ไม่ใช่คะแนนรวม และภาคความรู้เป็นด่านกรอง
       ถ้าไม่ผ่าน 70% จะไม่มีสิทธิ์สอบภาคความสามารถเลย */
    passing: { theory: 70, practical: 70, gate: true },
    wage: { 1: 500, 2: 610, 3: 685 },
    validYears: 4,                       // สาขาเดียวในสามสาขาที่ระบุอายุไว้
    theoryFormat: { items: 50, choices: 4, minutes: 60, maxScore: 50 },
    practicalFormat: {
      hours: 3,
      maxScore: 100,
      task: 'เชื่อมเหล็กกล้าคาร์บอนแบบ Fillet Weld ทั้งแผ่น-แผ่น และแผ่น-ท่อ ความหนา ≥ 3 มม.',
      positionStandard: 'ISO 9606-1',
      qualityStandard: 'ISO 5817 ระดับ B',
    },
    promotion: { experienceYears: 1, scoreShortcut: 80 },
    modules: [
      { n: 1,  th: 'ความปลอดภัยทั่วไปในพื้นที่ปฏิบัติงาน',         en: 'General Workplace Safety' },
      { n: 2,  th: 'ความปลอดภัยในการเชื่อมและตัด',                en: 'Welding & Cutting Safety' },
      { n: 3,  th: 'การใช้เครื่องมือวัด',                          en: 'Measuring Tools' },
      { n: 4,  th: 'การใช้เครื่องมือทั่วไป',                       en: 'General Hand Tools' },
      { n: 5,  th: 'การใช้เครื่องมือกล',                           en: 'Machine Tools' },
      { n: 6,  th: 'เครื่องเชื่อมและวงจรไฟฟ้า',                    en: 'Welding Machines & Electrical Circuits' },
      { n: 7,  th: 'เทคนิคการเชื่อม',                              en: 'Welding Techniques' },
      { n: 8,  th: 'สมบัติและความสามารถเชื่อมได้ของโลหะ',         en: 'Metal Properties & Weldability' },
      { n: 9,  th: 'ลวดเชื่อม',                                   en: 'Welding Electrodes' },
      { n: 10, th: 'ข้อกำหนดกรรมวิธีการเชื่อม',                   en: 'Welding Procedure Specification' },
      { n: 11, th: 'คณิตศาสตร์ประยุกต์กับการร่างแบบงานเชื่อม',    en: 'Applied Mathematics & Welding Drawing' },
      { n: 12, th: 'วิทยาศาสตร์เบื้องต้นสำหรับงานเชื่อม',          en: 'Basic Science for Welding' },
      { n: 13, th: 'การตรวจสอบและคุณภาพของงานเชื่อม',             en: 'Weld Inspection & Quality' },
      { n: 14, th: 'ท่อ',                                         en: 'Pipes' },
    ],
  },
];

/* ------------------------------------------------------------ lookups */

export const standardForTrack = trackId =>
  STANDARDS.find(s => s.trackId === trackId) || null;

export const standardById = id => STANDARDS.find(s => s.id === id) || null;

/** ส่วนต่างค่าจ้างเทียบค่าแรงขั้นต่ำ ใช้ตอบคำถาม "สอบแล้วได้อะไร" ด้วยตัวเลข */
export function wageGap(standard, level = 1) {
  const wage = standard?.wage?.[level];
  if (!wage) return null;
  return {
    wage,
    vsHigh: wage - MINIMUM_WAGE.high,
    vsLow: wage - MINIMUM_WAGE.low,
    pctVsHigh: Math.round(((wage - MINIMUM_WAGE.high) / MINIMUM_WAGE.high) * 100),
    perMonth: (wage - MINIMUM_WAGE.high) * 26,   // ประมาณการที่ 26 วันทำงาน
  };
}
