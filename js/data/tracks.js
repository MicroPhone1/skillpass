/* ============================================================
   data/tracks.js — แคตตาล็อกเส้นทางการเรียนรู้
   ตั้งใจให้ "กว้างกว่าสายอาชีพ": ช่าง + ไอที + ภาษา + สุขภาพ +
   วิทยาศาสตร์ + ทักษะชีวิต  ทุกสายใช้เอนจินเดียวกัน
   ============================================================ */

export const CATEGORIES = [
  { id:'trade',   name:'ช่างฝีมือ & อาชีวศึกษา', icon:'wrench',    color:'var(--blue-600)' },
  { id:'digital', name:'ไอที & ดิจิทัล',          icon:'cloud',     color:'var(--cyan)'     },
  { id:'lang',    name:'ภาษา',                    icon:'globe',     color:'var(--violet)'   },
  { id:'health',  name:'สุขภาพ & ความปลอดภัย',    icon:'heartbeat', color:'var(--bad)'      },
  { id:'science', name:'วิทยาศาสตร์ & ห้องแล็บ',  icon:'flask',     color:'var(--ok)'       },
  { id:'life',    name:'ทักษะชีวิต & อนาคต',      icon:'spark',     color:'var(--warn)'     },
];

export const TRACKS = [
  /* ---------------------------------------------------- ช่าง */
  {
    id:'electrician', cat:'trade', icon:'plug',
    name:'ช่างไฟฟ้าภายในอาคาร',
    short:'เดินสาย ต่อวงจร ตรวจความปลอดภัย',
    cert:'กรมพัฒนาฝีมือแรงงาน (DSD) ระดับ 1 · TPQI',
    nameEn:'Building Electrician',
    certEn:'Department of Skill Development (DSD) Level 1 · TPQI',
    hours:'≈ 40 ชม.',
    skills:[
      { id:'e_calc',   name:'คำนวณไฟฟ้า',       short:'คำนวณ' },
      { id:'e_wire',   name:'การเดินสาย & ขนาดสาย', short:'เดินสาย' },
      { id:'e_safe',   name:'ความปลอดภัย & กราวด์', short:'ปลอดภัย' },
      { id:'e_tool',   name:'เครื่องมือวัด',      short:'เครื่องมือ' },
      { id:'e_code',   name:'มาตรฐาน วสท./กฟภ.',  short:'มาตรฐาน' },
      { id:'e_motor',  name:'มอเตอร์ & ควบคุม',   short:'มอเตอร์' },
    ],
  },
  {
    id:'welding', cat:'trade', icon:'weld',
    name:'ช่างเชื่อมโลหะ (SMAW)',
    short:'เชื่อมไฟฟ้า อ่านสัญลักษณ์ ตรวจแนวเชื่อม',
    cert:'DSD ระดับ 1 · มอก./AWS D1.1 (พื้นฐาน)',
    nameEn:'Metal Arc Welding (SMAW)',
    certEn:'DSD Level 1 · TIS / AWS D1.1 (Fundamentals)',
    hours:'≈ 45 ชม.',
    skills:[
      { id:'w_param', name:'ตั้งกระแส & ลวดเชื่อม', short:'พารามิเตอร์' },
      { id:'w_pos',   name:'ท่าเชื่อม & มุมลวด',    short:'ท่าเชื่อม' },
      { id:'w_defect',name:'ข้อบกพร่องแนวเชื่อม',   short:'ข้อบกพร่อง' },
      { id:'w_symbol',name:'อ่านสัญลักษณ์งานเชื่อม', short:'สัญลักษณ์' },
      { id:'w_safe',  name:'ความปลอดภัยงานเชื่อม',  short:'ปลอดภัย' },
    ],
  },
  {
    id:'auto', cat:'trade', icon:'car',
    name:'ช่างยนต์',
    short:'เครื่องยนต์ ระบบเบรก ไฟฟ้ารถยนต์',
    cert:'DSD ระดับ 1 · TPQI สาขายานยนต์',
    nameEn:'Automotive Technician',
    certEn:'DSD Level 1 · TPQI Automotive Sector',
    hours:'≈ 50 ชม.',
    skills:[
      { id:'a_engine', name:'เครื่องยนต์ & จังหวะ', short:'เครื่องยนต์' },
      { id:'a_brake',  name:'ระบบเบรก & ช่วงล่าง',  short:'เบรก' },
      { id:'a_elec',   name:'ไฟฟ้ารถยนต์',         short:'ไฟฟ้า' },
      { id:'a_diag',   name:'วินิจฉัยอาการเสีย',    short:'วินิจฉัย' },
      { id:'a_safe',   name:'ความปลอดภัยในโรงซ่อม', short:'ปลอดภัย' },
    ],
  },
  {
    id:'hvac', cat:'trade', icon:'snow',
    name:'ช่างเครื่องปรับอากาศ',
    short:'ติดตั้ง เติมน้ำยา ตรวจรั่ว',
    cert:'DSD ระดับ 1 · สาขาเครื่องปรับอากาศ',
    nameEn:'Air Conditioning Technician',
    certEn:'DSD Level 1 · Air Conditioning Sector',
    hours:'≈ 40 ชม.',
    skills:[
      { id:'h_cycle', name:'วัฏจักรทำความเย็น', short:'วัฏจักร' },
      { id:'h_charge',name:'เติม/ดูดน้ำยา',     short:'น้ำยา' },
      { id:'h_leak',  name:'ตรวจรั่ว & สุญญากาศ', short:'ตรวจรั่ว' },
      { id:'h_elec',  name:'วงจรไฟฟ้าแอร์',     short:'ไฟฟ้า' },
    ],
  },

  /* ---------------------------------------------------- ไอที */
  {
    id:'cloud', cat:'digital', icon:'cloud',
    name:'AWS Cloud Practitioner',
    short:'พื้นฐานคลาวด์ บริการหลัก ค่าใช้จ่าย',
    cert:'AWS Certified Cloud Practitioner (CLF-C02)',
    nameEn:'AWS Cloud Practitioner',
    certEn:'AWS Certified Cloud Practitioner (CLF-C02)',
    hours:'≈ 30 ชม.',
    skills:[
      { id:'c_concept',name:'แนวคิดคลาวด์',      short:'แนวคิด' },
      { id:'c_sec',    name:'ความปลอดภัย & IAM', short:'ความปลอดภัย' },
      { id:'c_tech',   name:'บริการหลัก',        short:'บริการ' },
      { id:'c_bill',   name:'ราคา & การเรียกเก็บ', short:'ค่าใช้จ่าย' },
    ],
  },
  {
    id:'cyber', cat:'digital', icon:'shield',
    name:'ความปลอดภัยไซเบอร์เบื้องต้น',
    short:'รหัสผ่าน ฟิชชิ่ง ความเป็นส่วนตัว',
    cert:'CompTIA Security+ (พื้นฐาน) · NCSA',
    nameEn:'Cybersecurity Essentials',
    certEn:'CompTIA Security+ (Fundamentals) · NCSA',
    hours:'≈ 25 ชม.',
    skills:[
      { id:'y_threat', name:'ภัยคุกคาม & ฟิชชิ่ง', short:'ภัยคุกคาม' },
      { id:'y_ident',  name:'ตัวตน & รหัสผ่าน',   short:'ตัวตน' },
      { id:'y_net',    name:'เครือข่ายปลอดภัย',   short:'เครือข่าย' },
      { id:'y_data',   name:'ข้อมูลส่วนบุคคล/PDPA', short:'ข้อมูล' },
    ],
  },

  /* ---------------------------------------------------- ภาษา */
  {
    id:'english', cat:'lang', icon:'globe',
    name:'อังกฤษเพื่อการทำงาน',
    short:'ไวยากรณ์ ศัพท์ช่าง การอ่านคู่มือ',
    cert:'TOEIC · CEFR B1',
    nameEn:'English for the Workplace',
    certEn:'TOEIC · CEFR B1',
    hours:'≈ 35 ชม.',
    skills:[
      { id:'g_gram', name:'ไวยากรณ์',        short:'ไวยากรณ์' },
      { id:'g_vocab',name:'คำศัพท์เทคนิค',   short:'คำศัพท์' },
      { id:'g_read', name:'อ่านจับใจความ',   short:'การอ่าน' },
      { id:'g_speak',name:'พูดสื่อสารหน้างาน', short:'การพูด' },
    ],
  },

  /* ---------------------------------------------------- สุขภาพ */
  {
    id:'firstaid', cat:'health', icon:'heartbeat',
    name:'ปฐมพยาบาล & CPR',
    short:'ช่วยชีวิตขั้นพื้นฐาน ใช้ AED',
    cert:'BLS · สมาคมแพทย์โรคหัวใจฯ (TRC)',
    nameEn:'First Aid & CPR',
    certEn:'Basic Life Support · Thai Resuscitation Council',
    hours:'≈ 12 ชม.',
    skills:[
      { id:'f_assess',name:'ประเมินสถานการณ์',  short:'ประเมิน' },
      { id:'f_cpr',   name:'กดหน้าอก & ช่วยหายใจ', short:'CPR' },
      { id:'f_aed',   name:'การใช้ AED',        short:'AED' },
      { id:'f_wound', name:'บาดแผล & ห้ามเลือด', short:'บาดแผล' },
    ],
  },
  {
    id:'safety', cat:'health', icon:'shield',
    name:'ความปลอดภัยในการทำงาน',
    short:'จป. ระดับพื้นฐาน ประเมินความเสี่ยง',
    cert:'จป. หัวหน้างาน (กฎกระทรวง)',
    nameEn:'Occupational Health & Safety',
    certEn:'Safety Supervisor (Ministerial Regulation)',
    hours:'≈ 18 ชม.',
    skills:[
      { id:'s_ppe',  name:'อุปกรณ์ป้องกัน (PPE)', short:'PPE' },
      { id:'s_risk', name:'ประเมินความเสี่ยง',   short:'ความเสี่ยง' },
      { id:'s_fire', name:'อัคคีภัย & อพยพ',     short:'อัคคีภัย' },
      { id:'s_law',  name:'กฎหมายความปลอดภัย',   short:'กฎหมาย' },
    ],
  },

  /* ---------------------------------------------------- วิทยาศาสตร์ */
  {
    id:'lab', cat:'science', icon:'flask',
    name:'เทคนิคปฏิบัติการวิทยาศาสตร์',
    short:'ปิเปตต์ ไทเทรต ความปลอดภัยแล็บ',
    cert:'มาตรฐานห้องปฏิบัติการ ISO/IEC 17025 (พื้นฐาน)',
    nameEn:'Laboratory Practice Techniques',
    certEn:'ISO/IEC 17025 Laboratory Standard (Fundamentals)',
    hours:'≈ 22 ชม.',
    skills:[
      { id:'l_measure',name:'การวัด & เลขนัยสำคัญ', short:'การวัด' },
      { id:'l_tech',   name:'เทคนิคหัตถการ',      short:'หัตถการ' },
      { id:'l_safe',   name:'ความปลอดภัยสารเคมี',  short:'ปลอดภัย' },
      { id:'l_calc',   name:'คำนวณความเข้มข้น',    short:'คำนวณ' },
    ],
  },

  /* ---------------------------------------------------- ทักษะชีวิต */
  {
    id:'present', cat:'life', icon:'present',
    name:'การนำเสนอ & สื่อสาร',
    short:'พูดหน้าชั้น ภาษากาย เล่าเรื่อง',
    cert:'ทักษะศตวรรษที่ 21 · เตรียมสัมภาษณ์งาน',
    nameEn:'Presentation & Communication',
    certEn:'21st Century Skills · Interview Readiness',
    hours:'≈ 15 ชม.',
    skills:[
      { id:'p_struct',name:'โครงสร้างการเล่า',  short:'โครงสร้าง' },
      { id:'p_body',  name:'ภาษากาย & สายตา',   short:'ภาษากาย' },
      { id:'p_voice', name:'น้ำเสียง & จังหวะ',  short:'น้ำเสียง' },
      { id:'p_qa',    name:'ตอบคำถาม',         short:'ตอบคำถาม' },
    ],
  },
  {
    id:'finance', cat:'life', icon:'coins',
    name:'การเงินส่วนบุคคล',
    short:'ออม ดอกเบี้ย หนี้ ภาษีเบื้องต้น',
    cert:'ความรู้ทางการเงิน (Financial Literacy) · ธปท.',
    nameEn:'Personal Finance',
    certEn:'Financial Literacy · Bank of Thailand',
    hours:'≈ 12 ชม.',
    skills:[
      { id:'m_budget',name:'งบประมาณ & การออม', short:'งบประมาณ' },
      { id:'m_debt',  name:'หนี้ & ดอกเบี้ย',    short:'หนี้' },
      { id:'m_invest',name:'การลงทุนพื้นฐาน',   short:'ลงทุน' },
      { id:'m_tax',   name:'ภาษีเงินได้',       short:'ภาษี' },
    ],
  },
];

/* ------------------------------------------------------------ lookups */
/* trackById() คืนค่าสำรองเสมอเพื่อให้หน้าจอไม่พังเมื่อ id เพี้ยน
   ผลข้างเคียงคือใช้ตรวจความถูกต้องไม่ได้ (`!trackById(x)` ไม่มีวันเป็นจริง)
   ถ้าจะเช็กว่า id มีอยู่จริงให้ใช้ hasTrack() แทน */
export const hasTrack    = id => TRACKS.some(t => t.id === id);
export const trackById  = id => TRACKS.find(t => t.id === id) || TRACKS[0];
export const catById    = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
export const skillsOf   = id => trackById(id).skills;
export const skillName  = (trackId, skillId) =>
  (skillsOf(trackId).find(s => s.id === skillId)?.name) || skillId;
export const skillShort = (trackId, skillId) =>
  (skillsOf(trackId).find(s => s.id === skillId)?.short) || skillId;
