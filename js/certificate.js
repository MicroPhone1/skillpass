/* ============================================================
   certificate.js — เกณฑ์การออกเกียรติบัตร + ตัวเกียรติบัตร (SVG)
   ------------------------------------------------------------
   หลักคิด: เกียรติบัตรต้องมี "หลักฐาน" อยู่เบื้องหลังเสมอ
   ไม่ใช่ของแจกเมื่อกดเข้าใช้งาน จึงต้องผ่านทั้งสองด้าน
     1) ภาคทฤษฎี  — ทำข้อสอบสะสมพอ และคะแนนความพร้อมถึงเกณฑ์
     2) ภาคปฏิบัติ — ถ้าเส้นทางนั้นมีบทฝึกหน้ากล้อง ต้องมีคะแนนผ่านด้วย
   ทุกใบบันทึกหลักฐานที่ใช้ตัดสิน (evidence) ไว้ในตัวเอง
   ============================================================ */

import { esc, icon, modal } from './ui.js';
import { state, abilityFor, addCertificate, certificateName } from './store.js';
import { trackById } from './data/tracks.js';
import { drillsFor } from './data/drills.js';
import { trackReadiness } from './engine/adaptive.js';

/* เกณฑ์ผ่าน — รวมไว้ที่เดียวเพื่อให้ปรับตามหลักสูตรจริงได้ง่าย */
export const RULES = {
  minQuestions: 15,     // ข้อสอบสะสมของเส้นทางนั้น
  minReadiness: 75,     // คะแนนความพร้อม (0..100)
  minDrillScore: 70,    // คะแนนบทฝึกหน้ากล้องที่ดีที่สุด
  minExamSets: 2,       // จำนวนชุดข้อสอบที่ทำจบ
};

const LEVELS = [
  { min: 90, key:'distinction', th:'ระดับดีเยี่ยม', en:'WITH DISTINCTION', tone:'ok'   },
  { min: 80, key:'merit',       th:'ระดับดีมาก',    en:'WITH MERIT',       tone:'ok'   },
  { min: 0,  key:'pass',        th:'ระดับผ่านเกณฑ์', en:'PASS',            tone:'warn' },
];
export const levelOf = score => LEVELS.find(l => score >= l.min);

/* ------------------------------------------------------------ eligibility */

/**
 * ตรวจว่าเส้นทางนี้ออกเกียรติบัตรได้หรือยัง
 * @returns {{ok:boolean, score:number, checks:Array, evidence:object}}
 */
export function eligibility(trackId){
  const track = trackById(trackId);
  const a = abilityFor(trackId);

  const questions = Object.values(a.skills).reduce((s, v) => s + v.n, 0);
  const readiness = trackReadiness(trackId);
  const examSets  = state.examHistory.filter(e => e.trackId === trackId).length;

  const hasDrills = drillsFor(trackId).length > 0;
  const drills    = state.drillHistory.filter(h => h.trackId === trackId);
  const bestDrill = drills.reduce((m, h) => Math.max(m, h.score), 0);

  const checks = [
    { id:'questions', label:`ทำข้อสอบสะสมอย่างน้อย ${RULES.minQuestions} ข้อ`,
      now:`${questions} ข้อ`, ok: questions >= RULES.minQuestions,
      progress: Math.min(1, questions / RULES.minQuestions) },
    { id:'sets', label:`ทำข้อสอบจบอย่างน้อย ${RULES.minExamSets} ชุด`,
      now:`${examSets} ชุด`, ok: examSets >= RULES.minExamSets,
      progress: Math.min(1, examSets / RULES.minExamSets) },
    { id:'readiness', label:`คะแนนความพร้อมถึง ${RULES.minReadiness}%`,
      now:`${readiness}%`, ok: readiness >= RULES.minReadiness,
      progress: Math.min(1, readiness / RULES.minReadiness) },
  ];

  if (hasDrills){
    checks.push({
      id:'practical', label:`คะแนนภาคปฏิบัติหน้ากล้องถึง ${RULES.minDrillScore}%`,
      now: drills.length ? `${bestDrill}%` : 'ยังไม่เคยฝึก',
      ok: bestDrill >= RULES.minDrillScore,
      progress: Math.min(1, bestDrill / RULES.minDrillScore),
    });
  }

  // คะแนนบนเกียรติบัตร: ถ่วงทฤษฎี 60 / ปฏิบัติ 40 เมื่อเส้นทางมีภาคปฏิบัติ
  const score = hasDrills
    ? Math.round(readiness * 0.6 + bestDrill * 0.4)
    : readiness;

  return {
    ok: checks.every(c => c.ok),
    score,
    checks,
    evidence: { questions, examSets, readiness, bestDrill, hasDrills, drillCount: drills.length,
                skills: track.skills.length },
  };
}

/** เส้นทางทั้งหมดที่ผ่านเกณฑ์แล้วแต่ยังไม่ได้ออกใบ */
export function pendingTracks(){
  return state.enrolled
    .filter(id => !state.certificates.some(c => c.trackId === id))
    .map(id => ({ id, ...eligibility(id) }))
    .filter(e => e.ok);
}

/* ------------------------------------------------------------ issuing */
const rand = n => Array.from({ length: n },
  () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

function makeCode(trackId, at){
  const d = new Date(at);
  const ym = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  return `SP-${trackId.slice(0, 3).toUpperCase()}-${ym}-${rand(5)}`;
}

/**
 * ออกเกียรติบัตรของเส้นทางหนึ่ง (ถ้ามีอยู่แล้วจะคืนใบเดิม)
 * @returns {{cert:object, created:boolean}|null}
 */
export function issue(trackId, { force = false } = {}){
  const existing = state.certificates.find(c => c.trackId === trackId);
  if (existing) return { cert: existing, created: false };

  const e = eligibility(trackId);
  if (!e.ok && !force) return null;

  const at = Date.now();
  const lv = levelOf(e.score);
  const cert = {
    id: 'c' + at.toString(36),
    code: makeCode(trackId, at),
    trackId,
    name: certificateName(),
    school: state.profile.school || '',
    schoolEn: state.profile.schoolEn || '',
    score: e.score,
    level: lv.key,
    lang: 'th',              // สลับได้ทีหลังจากหน้าเกียรติบัตร
    issuedAt: at,
    evidence: e.evidence,
  };
  addCertificate(cert);
  return { cert, created: true };
}

/** เรียกหลังทำข้อสอบ/ฝึกจบ — ออกใบให้อัตโนมัติถ้าเพิ่งผ่านเกณฑ์พอดี */
export function autoIssue(trackId){
  const r = issue(trackId);
  return r?.created ? r.cert : null;
}

/** หน้าต่างแสดงความยินดีเมื่อได้ใบใหม่ (ใช้ร่วมกันทั้งหน้าสอบและห้องฝึก) */
export function celebrate(cert){
  const track = trackById(cert.trackId);
  const lv = LEVELS.find(l => l.key === cert.level) || LEVELS[2];
  const m = modal(`
    <div style="text-align:center">
      <div class="badge-medal" style="width:64px;height:64px;margin:2px auto 14px">${icon('trophy')}</div>
      <h2>ยินดีด้วย! คุณได้รับเกียรติบัตร</h2>
      <p class="small muted" style="margin-top:6px;line-height:1.7">
        ผ่านเกณฑ์ทั้งภาคทฤษฎีและภาคปฏิบัติของหลักสูตร<br>
        <b style="color:var(--blue-700)">${esc(track.name)}</b> · ${esc(lv.th)}
      </p>
    </div>
    <div class="cert-preview">${certificateSVG(cert)}</div>
    <div class="row" style="justify-content:center;margin-top:18px;gap:9px">
      <a class="btn btn-primary" href="#/certs/${cert.id}" data-close>${icon('eye')} เปิดเกียรติบัตร</a>
      <button class="btn btn-ghost" data-close>ไว้ทีหลัง</button>
    </div>`);
  return m;
}

/**
 * ดึงชื่อ/สถาบันจากโปรไฟล์ปัจจุบันมาลงเกียรติบัตรทุกใบ
 * เรียกหลังผู้ใช้บันทึกโปรไฟล์ ใบเก่าจะได้ไม่ค้างชื่อเดิม
 */
export function refreshFromProfile(){
  for (const c of state.certificates){
    c.name = certificateName();
    c.school = state.profile.school || '';
    c.schoolEn = state.profile.schoolEn || '';
  }
}

/** เปลี่ยนภาษาของใบหนึ่ง (จำไว้กับตัวใบ ไฟล์ที่ดาวน์โหลดจะเป็นภาษานั้นด้วย) */
export function setLang(certId, lang){
  const c = state.certificates.find(x => x.id === certId);
  if (!c || !STRINGS[lang]) return null;
  c.lang = lang;
  return c;
}

/* ============================================================
   ตัวเกียรติบัตร — วาดเป็น SVG ล้วน
   เหตุผลที่เลือก SVG: คมทุกขนาด พิมพ์ลง A4 ได้ตรง ๆ และแปลงเป็น PNG
   ได้โดยไม่ต้องพึ่งไลบรารีภายนอก (ต้นแบบนี้ตั้งใจไม่มี dependency)
   ============================================================ */

const W = 1123, H = 794;                    // A4 แนวนอนที่ 96 dpi

const FONT = "'IBM Plex Sans Thai','Noto Sans Thai','Leelawadee UI','Sarabun','Segoe UI',sans-serif";
/* ฟอนต์สำหรับชื่อผู้รับ — ใช้เซริฟให้ดูเป็นเอกสารทางการ
   ชื่อไทยกับชื่อละตินต้องใช้คนละชุด เพราะเซริฟละติน (Georgia) ไม่มีสระ/วรรณยุกต์ไทย
   ส่วนเซริฟไทย (Angsana New) เล็กกว่ามากที่ px เท่ากัน ถ้าปนกันจะสูงไม่เท่ากัน */
const SERIF_LATIN = "Georgia,'Times New Roman','Noto Serif',serif";
const SERIF_THAI  = "'Noto Serif Thai','Sarabun','IBM Plex Sans Thai','Leelawadee UI',serif";
const isThai = s => /[฀-๿]/.test(String(s));
const nameFont = n => (isThai(n) ? SERIF_THAI : SERIF_LATIN);
/* letter-spacing แทรกช่องว่างหลัง "ทุกอักขระ" รวมถึงสระลอยกับวรรณยุกต์ไทย
   ผลคือรูปสระ/วรรณยุกต์ถูกดันออกจากพยัญชนะที่มันเกาะอยู่ ข้อความเลยดูเคลื่อน
   ภาษาไทยจึงต้องเป็นศูนย์เสมอ ส่วนละตินยังจัดระยะได้ตามปกติ */
const ls = (text, value) => (isThai(text) ? 0 : value);

const INK  = '#101C33';   // หมึกเข้มแต่ไม่ดำสนิท
const GOLD = '#A98235';
const BLUE = '#1E48C7';
const SOFT = '#7A879C';
const LINE = '#DFE5F0';

/* ------------------------------------------------------------ ข้อความสองภาษา */
const STRINGS = {
  th: {
    tagline: 'ฝึกจนเป็น พิสูจน์ได้',
    /* ชื่อเอกสารใช้ภาษาอังกฤษทั้งสองฉบับ เพราะบรรทัดนี้วาดด้วยเซริฟละติน
       ซึ่งไม่มีสระ/วรรณยุกต์ไทย พอใส่คำไทยลงไป สระกับวรรณยุกต์จะหลุด
       ออกจากตัวพยัญชนะและตำแหน่งเคลื่อน (ยิ่งมี letter-spacing ยิ่งชัด) */
    title: 'CERTIFICATE',
    subtitle: 'OF ACHIEVEMENT',
    presentedTo: 'ขอมอบเกียรติบัตรฉบับนี้ไว้เพื่อแสดงว่า',
    hasCompleted: 'ได้ผ่านการฝึกอบรมและการประเมินผล ทั้งภาคทฤษฎีและภาคปฏิบัติ ในหลักสูตร',
    benchmark: 'เทียบเคียงเกณฑ์',
    stats: { score:'คะแนนรวม', questions:'ข้อสอบที่ผ่าน', practical:'ภาคปฏิบัติ',
             readiness:'ความพร้อมสอบ', skills:'ทักษะย่อย' },
    signL: ['ผู้อำนวยการหลักสูตร', 'CheckChang Academy'],
    signR: ['ผู้ประเมินภาคปฏิบัติ', 'Assessment Board'],
    certNo: 'เลขที่เกียรติบัตร',
    issuedOn: 'ออกให้ ณ วันที่',
    footer: 'ออกโดยระบบเช็คช่าง · ตรวจสอบย้อนกลับได้ด้วยเลขที่เกียรติบัตร · เอกสารต้นแบบเพื่อการสาธิต',
    locale: 'th-TH',
    track: t => t.name,
    cert:  t => t.cert,
    level: lv => lv.th,
  },
  en: {
    tagline: 'Practice until proven',
    title: 'CERTIFICATE',
    subtitle: 'OF ACHIEVEMENT',
    presentedTo: 'This is to certify that',
    hasCompleted: 'has successfully completed the training and assessment, both theoretical and practical, in',
    benchmark: 'Benchmarked against',
    stats: { score:'Overall Score', questions:'Questions Passed', practical:'Practical',
             readiness:'Exam Readiness', skills:'Sub-skills' },
    signL: ['Programme Director', 'CheckChang Academy'],
    signR: ['Practical Assessor', 'Assessment Board'],
    certNo: 'Certificate No.',
    issuedOn: 'Issued on',
    footer: 'Issued by CheckChang · Verifiable by certificate number · Prototype document for demonstration',
    locale: 'en-GB',
    track: t => t.nameEn || t.name,
    cert:  t => t.certEn || t.cert,
    level: lv => lv.en.replace(/^WITH /, 'With ').replace(/^PASS$/, 'Pass'),
  },
};
export const LANGS = [
  { id:'th', label:'ไทย',    short:'TH' },
  { id:'en', label:'English', short:'EN' },
];

const fmtDate = (ts, locale) => new Date(ts).toLocaleDateString(locale,
  { day:'numeric', month:'long', year:'numeric' });

/** ย่อขนาดตัวอักษรลงเมื่อข้อความยาว เพื่อไม่ให้ล้นกรอบ */
function fit(text, base, maxChars){
  const n = [...String(text)].length;
  return n <= maxChars ? base : Math.max(base * 0.55, base * (maxChars / n));
}

/** มุมกรอบแบบเส้นบาง — แทนกรอบหนาสองชั้นเดิม ให้ดูโปร่งขึ้น */
function corner(x, y, sx, sy){
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none"
    stroke="${GOLD}" stroke-width="1.1" opacity=".9">
    <path d="M0 40 L0 6 Q0 0 6 0 L40 0"/>
  </g>`;
}

/**
 * ตราประทับ — วงแหวนเส้นบางกับเครื่องหมายถูก ไม่มีริบบิ้น
 * (ริบบิ้นเดิมแคบกว่าข้อความ "WITH DISTINCTION" ทำให้ตัวอักษรล้นออกนอกทรง)
 * ระดับผลการประเมินย้ายไปอยู่เป็นบรรทัดข้อความใต้ตราแทน
 */
function seal(cx, cy, r){
  const ticks = [...Array(48)].map((_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = r - 6, r2 = r - 9.5;
    return `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}"
      x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"
      stroke="${GOLD}" stroke-width=".8" opacity=".5"/>`;
  }).join('');

  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${GOLD}" stroke-width="1.2"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="${GOLD}" stroke-width=".6" opacity=".55"/>
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${r - 15}" fill="none" stroke="${BLUE}" stroke-width="1.1" opacity=".28"/>
    <path d="M${cx - 9.5} ${cy + .5} l6.5 6.5 L${cx + 10.5} ${cy - 7.5}"
      fill="none" stroke="${BLUE}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function statBlock(x, y, value, label){
  return `<g>
    <text x="${x}" y="${y}" text-anchor="middle" font-family="${SERIF_LATIN}" font-size="25"
      fill="${INK}">${esc(value)}</text>
    <text x="${x}" y="${y + 19}" text-anchor="middle" font-family="${FONT}" font-size="10.5"
      fill="${SOFT}" letter-spacing="${ls(label, .3)}">${esc(label)}</text>
  </g>`;
}

/**
 * สร้าง SVG ของเกียรติบัตร
 * @param {object} cert  เรคคอร์ดจาก issue()
 * @param {object} opts  { standalone:true จะใส่ xmlns ให้ครบสำหรับ export }
 */
export function certificateSVG(cert, { standalone = false, lang } = {}){
  const L = STRINGS[lang || cert.lang] || STRINGS.th;
  const track = trackById(cert.trackId);
  const lv = LEVELS.find(l => l.key === cert.level) || LEVELS[2];
  const ev = cert.evidence || {};
  const name = cert.name || (L === STRINGS.en ? 'Learner' : 'ผู้เรียน');
  // ฉบับ EN ใช้ชื่อสถาบันภาษาอังกฤษถ้ากรอกไว้ ไม่งั้นใช้ชื่อเดิม
  const school = (L === STRINGS.en && cert.schoolEn) ? cert.schoolEn : cert.school;

  const trackName = L.track(track);
  const nameSize  = fit(name, 52, 24);
  const trackSize = fit(trackName, 26, 36);

  const stats = [
    [`${cert.score}%`, L.stats.score],
    [`${ev.questions ?? 0}`, L.stats.questions],
    ev.hasDrills ? [`${ev.bestDrill ?? 0}%`, L.stats.practical] : [`${ev.skills ?? 0}`, L.stats.skills],
    [`${ev.readiness ?? cert.score}%`, L.stats.readiness],
  ];
  const stepX = 168, startX = W / 2 - ((stats.length - 1) * stepX) / 2;

  /* จังหวะแนวตั้งทั้งใบ — รวมไว้ที่เดียว เพราะครึ่งล่างอยู่ชิดกันมาก
     ถ้าขยับทีละจุดจะชนกันโดยไม่รู้ตัว (กรอบในด้านล่างอยู่ที่ y=760) */
  const Y = {
    brand: 92, hair: 128,
    title: 186, subtitle: 210,
    presented: 262, name: 322, nameRule: 348, school: 374,
    completed: 424, track: 466, benchmark: 492,
    statValue: 556, statLabel: 575,
    sealCy: 646, sealR: 34, level: 700,
    signLine: 660, signName: 680, signOrg: 696,
    footLabel: 730, footValue: 748,
  };

  return `<svg ${standalone ? 'xmlns="http://www.w3.org/2000/svg" ' : ''}viewBox="0 0 ${W} ${H}"
    width="100%" role="img" aria-label="${esc(L.title)} ${esc(name)} — ${esc(trackName)}"
    style="display:block;font-family:${FONT}">
  <defs>
    <linearGradient id="cg-wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBFCFF"/><stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#cg-wash)"/>

  <!-- กรอบ: เส้นเดียวบาง ๆ กับมุมทอง — เรียบกว่ากรอบหนาสองชั้น -->
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${LINE}" stroke-width="1"/>
  ${corner(34, 34, 1, 1)}${corner(W - 34, 34, -1, 1)}
  ${corner(34, H - 34, 1, -1)}${corner(W - 34, H - 34, -1, -1)}

  <!-- หัวกระดาษ -->
  <g transform="translate(${W / 2} ${Y.brand})">
    <rect x="-104" y="-15" width="30" height="30" rx="9" fill="${BLUE}"/>
    <path d="M-97 -1 l5 5 L-81 -9" fill="none" stroke="#fff" stroke-width="3.6"
      stroke-linecap="round" stroke-linejoin="round"/>
    <text x="-66" y="-2" font-size="19" font-weight="700" fill="${INK}" letter-spacing="-.3">CheckChang</text>
    <text x="-66" y="12" font-size="9.5" fill="${SOFT}" letter-spacing="${ls(L.tagline, .5)}">${esc(L.tagline)} · Skill Certification Platform</text>
  </g>
  <line x1="${W / 2 - 44}" y1="${Y.hair}" x2="${W / 2 + 44}" y2="${Y.hair}" stroke="${GOLD}" stroke-width="1" opacity=".7"/>

  <!-- ชื่อเอกสาร -->
  <text x="${W / 2}" y="${Y.title}" text-anchor="middle" font-family="${SERIF_LATIN}"
    font-size="40" fill="${INK}" letter-spacing="8">${esc(L.title)}</text>
  <text x="${W / 2}" y="${Y.subtitle}" text-anchor="middle" font-size="10.5"
    fill="${GOLD}" letter-spacing="5.5">${esc(L.subtitle)}</text>

  <!-- ผู้รับ -->
  <text x="${W / 2}" y="${Y.presented}" text-anchor="middle" font-size="13" fill="${SOFT}"
    letter-spacing="${ls(L.presentedTo, .4)}">${esc(L.presentedTo)}</text>
  <text x="${W / 2}" y="${(Y.name + (52 - nameSize) * 0.35).toFixed(0)}" text-anchor="middle"
    font-family="${nameFont(name)}" font-size="${nameSize.toFixed(1)}" fill="${INK}"
    letter-spacing="${isThai(name) ? 0 : 1.2}">${esc(name)}</text>
  <line x1="${W / 2 - 190}" y1="${Y.nameRule}" x2="${W / 2 + 190}" y2="${Y.nameRule}"
    stroke="${GOLD}" stroke-width="1" opacity=".55"/>
  ${school ? `<text x="${W / 2}" y="${Y.school}" text-anchor="middle" font-size="12.5" fill="${SOFT}">${esc(school)}</text>` : ''}

  <!-- หลักสูตร -->
  <text x="${W / 2}" y="${Y.completed}" text-anchor="middle" font-size="13" fill="${SOFT}">${esc(L.hasCompleted)}</text>
  <text x="${W / 2}" y="${Y.track}" text-anchor="middle" font-family="${nameFont(trackName)}"
    font-size="${trackSize.toFixed(1)}" fill="${BLUE}">${esc(trackName)}</text>
  <text x="${W / 2}" y="${Y.benchmark}" text-anchor="middle" font-size="11.5" fill="${SOFT}">
    ${esc(L.benchmark)} ${esc(L.cert(track))}</text>

  <!-- ตัวเลขหลักฐาน -->
  ${stats.map(([v, l], i) => statBlock(startX + i * stepX, Y.statValue, v, l)).join('')}
  <line x1="270" y1="606" x2="${W - 270}" y2="606" stroke="${LINE}" stroke-width="1"/>

  <!-- ตราประทับ + ระดับผล -->
  ${seal(W / 2, Y.sealCy, Y.sealR)}
  <text x="${W / 2}" y="${Y.level}" text-anchor="middle" font-size="11" fill="${GOLD}"
    letter-spacing="${ls(L.level(lv), 2.6)}">${esc(L.level(lv).toUpperCase())}</text>

  <!-- ลายเซ็น -->
  <g>
    <line x1="150" y1="${Y.signLine}" x2="360" y2="${Y.signLine}" stroke="${LINE}" stroke-width="1"/>
    <text x="255" y="${Y.signName}" text-anchor="middle" font-size="12" fill="${INK}">${esc(L.signL[0])}</text>
    <text x="255" y="${Y.signOrg}" text-anchor="middle" font-size="10" fill="${SOFT}" letter-spacing=".3">${esc(L.signL[1])}</text>
  </g>
  <g>
    <line x1="${W - 360}" y1="${Y.signLine}" x2="${W - 150}" y2="${Y.signLine}" stroke="${LINE}" stroke-width="1"/>
    <text x="${W - 255}" y="${Y.signName}" text-anchor="middle" font-size="12" fill="${INK}">${esc(L.signR[0])}</text>
    <text x="${W - 255}" y="${Y.signOrg}" text-anchor="middle" font-size="10" fill="${SOFT}" letter-spacing=".3">${esc(L.signR[1])}</text>
  </g>

  <!-- ท้ายเอกสาร -->
  <text x="72" y="${Y.footLabel}" font-size="9.5" fill="${SOFT}" letter-spacing="${ls(L.certNo, .5)}">${esc(L.certNo)}</text>
  <text x="72" y="${Y.footValue}" font-size="12" fill="${INK}"
    letter-spacing="1.2" font-family="ui-monospace,Consolas,monospace">${esc(cert.code)}</text>
  <text x="${W - 72}" y="${Y.footLabel}" text-anchor="end" font-size="9.5" fill="${SOFT}" letter-spacing="${ls(L.issuedOn, .5)}">${esc(L.issuedOn)}</text>
  <text x="${W - 72}" y="${Y.footValue}" text-anchor="end" font-size="12" fill="${INK}">${esc(fmtDate(cert.issuedAt, L.locale))}</text>
  <text x="${W / 2}" y="${Y.footValue}" text-anchor="middle" font-size="9" fill="#A8B2C4">${esc(L.footer)}</text>
</svg>`;
}

/* ------------------------------------------------------------ export */

const svgBlobURL = cert => URL.createObjectURL(
  new Blob([certificateSVG(cert, { standalone: true })], { type: 'image/svg+xml;charset=utf-8' }));

function saveBlob(href, filename){
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

const fileBase = cert => `CheckChang-${cert.code}`;

/** ดาวน์โหลดเป็น PNG ความละเอียด 2 เท่า (2246×1588) */
export function downloadPNG(cert, scale = 2){
  return new Promise((resolve, reject) => {
    const url = svgBlobURL(cert);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = H * scale;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(b => {
        const href = URL.createObjectURL(b);
        saveBlob(href, fileBase(cert) + '.png');
        setTimeout(() => URL.revokeObjectURL(href), 4000);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('แปลงเป็นรูปภาพไม่สำเร็จ')); };
    img.src = url;
  });
}

/** ดาวน์โหลดไฟล์ SVG ต้นฉบับ (คมทุกขนาด เหมาะกับส่งโรงพิมพ์) */
export function downloadSVG(cert){
  const url = svgBlobURL(cert);
  saveBlob(url, fileBase(cert) + '.svg');
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * สั่งพิมพ์ / บันทึกเป็น PDF
 * วางเกียรติบัตรไว้ใน #print-host แล้วให้ CSS @media print ซ่อนส่วนอื่นทั้งหมด
 * วิธีนี้ไม่โดน popup blocker เหมือนการเปิดหน้าต่างใหม่
 */
export function printCertificate(cert){
  let host = document.querySelector('#print-host');
  if (!host){
    host = document.createElement('div');
    host.id = 'print-host';
    document.body.appendChild(host);
  }
  host.innerHTML = certificateSVG(cert);
  document.documentElement.classList.add('printing');

  const cleanup = () => {
    document.documentElement.classList.remove('printing');
    host.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => { window.print(); setTimeout(cleanup, 1200); }, 60);
}
