/* Headless smoke test: shim just enough DOM to import the app and render every view. */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

/* ---------- minimal DOM shim ---------- */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

function makeEl(tag = 'div') {
  const el = {
    tagName: tag, _html: '', dataset: {}, classList: {
      add(){}, remove(){}, toggle(){ return false; }, contains(){ return false; },
    },
    style: {}, children: [], hidden: false,
    set innerHTML(v){ this._html = v; }, get innerHTML(){ return this._html; },
    set textContent(v){ this._text = v; }, get textContent(){ return this._text || ''; },
    querySelector: () => makeEl(), querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
    insertAdjacentHTML(){}, setAttribute(){}, getAttribute(){ return null; },
    focus(){}, click(){}, closest(){ return null; }, contains(){ return false; },
    getBoundingClientRect: () => ({ width: 640, height: 480, top: 0, left: 0 }),
    getContext: () => ({
      save(){}, restore(){}, scale(){}, drawImage(){}, clearRect(){}, fillRect(){},
      strokeRect(){}, beginPath(){}, moveTo(){}, arcTo(){}, closePath(){}, stroke(){},
      fill(){}, fillText(){}, measureText: () => ({ width: 20 }), setLineDash(){},
      getImageData: () => ({ data: new Uint8ClampedArray(160*120*4) }),
    }),
    width: 0, height: 0,
  };
  return el;
}

globalThis.document = {
  documentElement: makeEl('html'),
  body: makeEl('body'),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: t => makeEl(t),
  addEventListener(){}, removeEventListener(){},
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.location = { hash: '#/home', protocol: 'https:', hostname: 'localhost', reload(){} };
Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: {} }, configurable: true });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.scrollTo = () => {};
globalThis.confirm = () => false;
globalThis.alert = () => {};
globalThis.structuredClone ??= o => JSON.parse(JSON.stringify(o));
globalThis.crypto ??= (await import('node:crypto')).webcrypto;

const url = p => pathToFileURL(path.join(ROOT, p)).href;

let fails = 0;
const check = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { fails++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0,4).join('\n       ')); }
};

console.log('\n== import ==');
let mods = {};
await check('app.js (boots shell)', async () => { mods.app = await import(url('js/app.js')); });

const viewNames = ['home','tracks','exam','lab','tutor','progress','assessment','community','passport','certs','profile','teacher','classes','simulator'];
for (const v of viewNames) {
  await check(`views/${v}.js`, async () => { mods[v] = (await import(url(`js/views/${v}.js`))).default; });
}
await check('views/auth.js', async () => { mods.auth = await import(url('js/views/auth.js')); });

console.log('\n== engines ==');
const adaptive = await import(url('js/engine/adaptive.js'));
const tutor    = await import(url('js/engine/tutor.js'));
const store_   = await import(url('js/store.js'));
const Q        = await import(url('js/data/questions.js'));
const T        = await import(url('js/data/tracks.js'));
const D        = await import(url('js/data/drills.js'));

await check('adaptive: full 10-item session (electrician)', () => {
  const s = new adaptive.AdaptiveSession('electrician', { length: 10 });
  let n = 0;
  while (!s.done && s.next()) {
    const q = s.current;
    const ans = q.type === 'mcq' ? q.answer
      : q.type === 'multi' ? q.answer
      : q.type === 'numeric' ? String(q.answer)
      : q.answer;
    const rec = s.submit(ans);
    if (!rec.correct) throw new Error(`graded correct answer as wrong: ${q.id} (${q.type})`);
    n++;
  }
  const sum = s.persist();
  if (n !== 10) throw new Error('expected 10 items, got ' + n);
  if (!(sum.readiness > 88)) throw new Error('all-correct run should give high readiness, got ' + sum.readiness);
  console.log(`       θ=${sum.theta.toFixed(2)} readiness=${sum.readiness}% se=${sum.se.toFixed(2)}`);
});

await check('adaptive: all-wrong run lowers theta', () => {
  const s = new adaptive.AdaptiveSession('cloud', { length: 6 });
  while (!s.done && s.next()) s.submit(s.current.type === 'numeric' ? '-999' : 99);
  const sum = s.summary();
  if (sum.theta >= 0) throw new Error('theta should drop, got ' + sum.theta);
  console.log(`       θ=${sum.theta.toFixed(2)} readiness=${sum.readiness}%`);
});

await check('adaptive: grading every question type', () => {
  const s = new adaptive.AdaptiveSession('electrician', { length: 1 });
  const types = {};
  for (const q of Q.QUESTIONS) {
    const g = s.grade(q, q.answer !== undefined && q.type === 'numeric' ? String(q.answer) : q.answer);
    if (!g.correct) throw new Error(`correct answer not accepted: ${q.id} type=${q.type}`);
    // wrong answer must not be full credit
    const wrong = q.type === 'mcq' ? (q.answer + 1) % q.choices.length
      : q.type === 'multi' ? []
      : q.type === 'numeric' ? String(q.answer * 3 + 7)
      : [...q.answer].reverse();
    if (s.grade(q, wrong).correct) throw new Error(`wrong answer accepted: ${q.id}`);
    types[q.type] = (types[q.type] || 0) + 1;
  }
  console.log('       ' + JSON.stringify(types) + ` over ${Q.QUESTIONS.length} questions`);
});

await check('adaptive: studyPlan for every track', () => {
  for (const t of T.TRACKS) {
    const idx = {}; for (const d of D.drillsFor(t.id)) idx[d.skill] ||= d;
    const plan = adaptive.studyPlan(t.id, idx);
    if (!plan.length) throw new Error('empty plan for ' + t.id);
  }
});

await check('tutor: retrieval finds the right chunk', () => {
  const cases = [
    ['เครื่องตัดไฟรั่วทำงานยังไง', 'electrician', 'k_e4'],
    ['กดหน้าอกเร็วเท่าไหร่', 'firstaid', 'k_f1'],
    ['shared responsibility model', 'cloud', 'k_c1'],
    ['เจือจางกรด', 'lab', 'k_l2'],
  ];
  for (const [q, track, want] of cases) {
    const hits = tutor.retrieve(q, { trackId: track, k: 3 });
    const ids = hits.map(h => h.chunk.id);
    if (!ids.includes(want)) throw new Error(`"${q}" → ${ids.join(',')} (expected ${want})`);
    console.log(`       "${q}" → ${ids[0]} (${hits[0].score.toFixed(2)})`);
  }
});

await check('tutor: refuses when nothing relevant', () => {
  const r = tutor.ask('สูตรทำต้มยำกุ้งใส่กะทิ', { trackId: 'electrician' });
  if (r.kind !== 'nohit') throw new Error('should have answered nohit, got: ' + JSON.stringify(r.blocks[0]).slice(0,120));
});

await check('tutor: explainQuestion for every question', () => {
  for (const q of Q.QUESTIONS) {
    const r = tutor.explainQuestion(q, { correct: false });
    if (!r.blocks.length || !r.sources.length) throw new Error('thin explanation for ' + q.id);
  }
});

console.log('\n== data integrity ==');
await check('every question maps to a real track + skill', () => {
  for (const q of Q.QUESTIONS) {
    const t = T.TRACKS.find(x => x.id === q.track);
    if (!t) throw new Error(`${q.id}: unknown track ${q.track}`);
    if (!t.skills.find(s => s.id === q.skill)) throw new Error(`${q.id}: unknown skill ${q.skill}`);
    if (!q.steps?.length) throw new Error(`${q.id}: no steps`);
    if (!q.sources?.length) throw new Error(`${q.id}: no sources`);
    if (q.type === 'mcq' && (q.answer < 0 || q.answer >= q.choices.length)) throw new Error(`${q.id}: bad answer index`);
    if (q.type === 'order' && q.answer.length !== q.items.length) throw new Error(`${q.id}: order mismatch`);
  }
});

await check('every drill maps to a real track + skill, zones in range', () => {
  for (const d of D.DRILLS) {
    const t = T.TRACKS.find(x => x.id === d.track);
    if (!t) throw new Error(`${d.id}: unknown track`);
    if (!t.skills.find(s => s.id === d.skill)) throw new Error(`${d.id}: unknown skill ${d.skill}`);
    const w = d.rubric.reduce((s, r) => s + r.weight, 0);
    if (w !== 100) throw new Error(`${d.id}: rubric weights sum to ${w}`);
    for (const z of d.config.zones || []) {
      const [x, y, bw, bh] = z.rect;
      if (x < 0 || y < 0 || x + bw > 1.001 || y + bh > 1.001) throw new Error(`${d.id}/${z.id}: rect out of bounds`);
    }
    if (d.config.box) {
      const [x, y, bw, bh] = d.config.box;
      if (x + bw > 1.001 || y + bh > 1.001) throw new Error(`${d.id}: box out of bounds`);
    }
    if (d.mode === 'sequence' && d.config.steps?.length !== d.config.order.length)
      throw new Error(`${d.id}: steps/order length mismatch`);
  }
});

await check('drill mode configs are complete', () => {
  const need = {
    tempo:['duration','targetBpm','guideBpm','minReps'],
    steady:['duration','holdSec','box','maxJitter'],
    zone:['reactSec','rounds','zones','prompts'],
    sequence:['holdSec','zones','order','steps'],
    frame:['duration','box','maxSway'],
    voice:['duration','targetSyl'],
  };
  for (const d of D.DRILLS) {
    for (const k of need[d.mode] || []) {
      if (d.config[k] === undefined) throw new Error(`${d.id} (${d.mode}): missing config.${k}`);
    }
    if (d.mode === 'zone' && d.config.prompts.some(p => !d.config.zones.find(z => z.id === p.zone)))
      throw new Error(`${d.id}: prompt points at unknown zone`);
    if (d.mode === 'sequence' && d.config.order.some(o => !d.config.zones.find(z => z.id === o)))
      throw new Error(`${d.id}: order points at unknown zone`);
    if (d.rubric.some(r => !need[d.mode])) throw new Error(`${d.id}: unknown mode`);
  }
});

await check('every rubric id is produced by the scorer', () => {
  // ids the scorer in vision.js writes, per mode
  const produced = {
    tempo:['rate','steadi','reps'], steady:['stability','inbox','hold'],
    zone:['hit','speed'], sequence:['comp','order','time'],
    frame:['inbox','sway','presence'], voice:['pace','pause','flow'],
  };
  for (const d of D.DRILLS) for (const r of d.rubric)
    if (!produced[d.mode].includes(r.id))
      throw new Error(`${d.id}: rubric id "${r.id}" is never scored (mode ${d.mode} produces ${produced[d.mode].join(',')})`);
});

console.log('\n== event plumbing ==');
const UI = await import(url('js/ui.js'));

/* element จำลองที่นับ listener จริง เพื่อพิสูจน์ว่า handler ไม่ทับซ้อนกันเวลา re-render */
function fakeRoot(){
  const listeners = [];
  const el = {
    listeners,
    innerHTML: '',
    addEventListener: (t, h) => listeners.push([t, h]),
    removeEventListener: (t, h) => {
      const i = listeners.findIndex(([tt, hh]) => tt === t && hh === h);
      if (i >= 0) listeners.splice(i, 1);
    },
    contains: () => true,
    fire(target){ for (const [, h] of [...listeners]) h({ target }); },
  };
  return el;
}

await check('on() + clearListeners: re-render ไม่ทำให้ handler ทับซ้อน', () => {
  const root = fakeRoot();
  const target = { closest: () => target };
  let calls = 0;

  // เลียนแบบวงจร: วาด → mount → วาดใหม่ → mount ใหม่ (5 รอบ)
  for (let i = 0; i < 5; i++){
    UI.paint(root, '<button data-x></button>');
    UI.on(root, 'click', '[data-x]', () => calls++);
  }
  if (root.listeners.length !== 1)
    throw new Error(`เหลือ listener ${root.listeners.length} ตัว (ควรเหลือ 1)`);

  root.fire(target);
  if (calls !== 1) throw new Error(`คลิกครั้งเดียวยิง handler ${calls} รอบ`);
});

await check('on() ไม่พังเมื่อ event target ไม่ใช่ element', () => {
  const root = fakeRoot();
  UI.on(root, 'click', '[data-x]', () => { throw new Error('ไม่ควรถูกเรียก'); });
  root.fire(undefined);          // เช่น keydown ที่ target เป็น document
  root.fire({});                 // ไม่มี closest()
});

console.log('\n== css guards ==');
const fs = await import('node:fs');
const readCss = f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8');
const theme = readCss('theme.css'), comps = readCss('components.css');

await check('ไอคอนมีขนาดตั้งต้นเสมอ (กันลูกศรบานเต็มการ์ด)', () => {
  const i = theme.indexOf('svg[viewBox="0 0 24 24"]');
  if (i < 0) throw new Error('ไม่มีกฎขนาดตั้งต้นของไอคอนใน theme.css');
  // ต้องอยู่ก่อนกฎเฉพาะที่ specificity เท่ากัน ไม่งั้นจะไปทับของเดิม
  const specific = theme.indexOf('.nav-item svg{');
  if (specific >= 0 && i > specific) throw new Error('กฎตั้งต้นอยู่หลังกฎเฉพาะ จะทับกันเอง');
});

await check('.empty / .cam-placeholder ใช้ลูกโดยตรง (ไม่ขยายไอคอนในปุ่ม)', () => {
  for (const sel of ['.empty', '.cam-placeholder']){
    if (new RegExp(`\\${sel} svg\\{`).test(comps))
      throw new Error(`${sel} svg{...} จะขยายไอคอนในปุ่มที่อยู่ข้างในด้วย — ต้องใช้ ${sel} > svg`);
    if (!comps.includes(`${sel} > svg{`)) throw new Error(`ไม่พบกฎ ${sel} > svg`);
  }
});

await check('ลูกศรท้ายการ์ด .quest ถูกล็อกขนาด', () => {
  if (!comps.includes('.quest > svg{')) throw new Error('ไม่พบกฎ .quest > svg');
});

await check('กริดสองคอลัมน์ทุกอันมี breakpoint', () => {
  const all = theme + comps;
  for (const m of all.matchAll(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\([^)]*\)/g)){
    // อนุญาตเฉพาะที่ประกาศผ่าน .g-side ซึ่งมี media query คู่กัน
    if (!all.includes('@media (max-width:940px){.g-side{grid-template-columns:minmax(0,1fr)}}'))
      throw new Error('พบกริด 2 คอลัมน์ที่ไม่มี breakpoint: ' + m[0]);
  }
});

await check('avatar() ใช้เงาคนแทนตัวอักษรเมื่อไม่มีรูป', async () => {
  const ui = await import(url('js/ui.js'));
  const out = ui.avatar({ name:'Kittiphit Boonying' }, 96);
  if (/>\s*Ki\s*</.test(out)) throw new Error('ยังแสดงอักษรย่อ');
  if (!out.includes('avatar-ghost') || !out.includes('<circle')) throw new Error('ไม่ได้วาดเงาคน');
  const withPhoto = ui.avatar({ name:'x', photo:'data:image/png;base64,AAA' }, 40);
  if (!withPhoto.includes('<img')) throw new Error('มีรูปแล้วแต่ไม่ได้ใช้');
  if (!comps.includes('.avatar-ghost{')) throw new Error('ไม่มีสไตล์ .avatar-ghost');
});

console.log('\n== accounts ==');
const auth = await import(url('js/auth.js'));
const CERT = await import(url('js/certificate.js'));

const PW = 'Str0ng!passphrase';

await check('register → session → per-account data is isolated', async () => {
  const u = await auth.register({
    name:'สมชาย ใจดี', email:'somchai@example.com', password: PW,
    school:'วิทยาลัยเทคนิคขอนแก่น',
  });
  if (!u.uid) throw new Error('ไม่ได้ uid กลับมา');
  if (store_.state.profile.name !== 'สมชาย ใจดี') throw new Error('ไม่ได้เติมชื่อลงโปรไฟล์');
  if (store_.state.profile.certName !== 'สมชาย ใจดี') throw new Error('ไม่ได้ตั้งชื่อบนเกียรติบัตร');

  store_.state.xp = 123;
  store_.flush();

  await auth.register({ name:'มานี รักเรียน', email:'manee@example.com', password: PW });
  if (store_.state.xp !== 0) throw new Error('บัญชีใหม่มองเห็นข้อมูลของบัญชีเดิม');

  await auth.login({ email:'somchai@example.com', password: PW });
  if (store_.state.xp !== 123) throw new Error('ข้อมูลเดิมไม่กลับมาหลังเข้าสู่ระบบใหม่');
  console.log(`       2 บัญชี · uid ปัจจุบัน ${store_.currentUid()}`);
});

await check('login ปฏิเสธรหัสผ่านผิด', async () => {
  let threw = false;
  try { await auth.login({ email:'somchai@example.com', password:'not-the-password' }); }
  catch { threw = true; }
  if (!threw) throw new Error('รหัสผ่านผิดแล้วยังเข้าระบบได้');
  if (auth.currentUser()?.email !== 'somchai@example.com') throw new Error('เซสชันเดิมหลุดหลังใส่รหัสผิด');
});

await check('ไม่เก็บรหัสผ่านเป็นข้อความเปล่า', () => {
  const raw = localStorage.getItem('skillpass.accounts.v1') || '';
  if (raw.includes(PW)) throw new Error('พบรหัสผ่านเป็นข้อความเปล่าใน localStorage');
  const acc = JSON.parse(raw)[0];
  if (!acc.salt || !acc.hash || acc.hash.length < 32) throw new Error('แฮช/salt ไม่ครบ');
  if (acc.weak) throw new Error('ตกไปใช้แฮชแบบอ่อน ทั้งที่มี WebCrypto');
});

await check('passwordScore แยกรหัสอ่อนกับรหัสแข็งแรงได้', () => {
  if (auth.passwordScore('12345678').score > 1) throw new Error('รหัสอ่อนได้คะแนนสูงเกิน');
  if (auth.passwordScore('Tr0ub4dor&3xyz').score < 3) throw new Error('รหัสแข็งแรงได้คะแนนต่ำเกิน');
});

console.log('\n== certificates ==');

await check('ยังไม่ผ่านเกณฑ์ → ไม่ออกใบ', () => {
  const e = CERT.eligibility('welding');
  if (e.ok) throw new Error('ผ่านเกณฑ์ทั้งที่ยังไม่มีข้อมูลการฝึก');
  if (CERT.issue('welding')) throw new Error('ออกใบทั้งที่ยังไม่ผ่านเกณฑ์');
});

await check('ผ่านทฤษฎีแต่ยังไม่ผ่านปฏิบัติ → ยังไม่ออกใบ', () => {
  const a = store_.abilityFor('electrician');
  a.theta = 1.7;
  a.skills = { e_calc:{n:6,correct:6,mastery:.92}, e_wire:{n:6,correct:5,mastery:.83},
               e_safe:{n:6,correct:6,mastery:.9} };
  for (let i = 0; i < 2; i++)
    store_.pushExam({ trackId:'electrician', mode:'adaptive', items:9, percent:92,
                      theta:1.7, readiness:89, seconds:280 });

  const e = CERT.eligibility('electrician');
  const practical = e.checks.find(c => c.id === 'practical');
  if (!practical) throw new Error('เส้นทางที่มีบทฝึกต้องมีเกณฑ์ภาคปฏิบัติ');
  if (practical.ok) throw new Error('ผ่านภาคปฏิบัติทั้งที่ยังไม่เคยฝึก');
  if (e.ok) throw new Error('ออกใบได้ทั้งที่ยังขาดภาคปฏิบัติ');
});

await check('ผ่านครบทั้งสองภาค → ออกใบพร้อมหลักฐาน', () => {
  store_.pushDrill({ drillId: D.drillsFor('electrician')[0].id, trackId:'electrician',
                     score: 86, detail:{} });

  const e = CERT.eligibility('electrician');
  if (!e.ok) throw new Error('ยังไม่ผ่าน: ' + e.checks.filter(c => !c.ok).map(c => c.id).join(','));

  const r = CERT.issue('electrician');
  if (!r?.created) throw new Error('ออกใบไม่สำเร็จ');
  const c = r.cert;
  if (c.name !== 'สมชาย ใจดี') throw new Error('ชื่อบนใบไม่ตรงกับโปรไฟล์: ' + c.name);
  if (!/^SP-ELE-\d{4}-[A-Z0-9]{5}$/.test(c.code)) throw new Error('รูปแบบเลขที่ผิด: ' + c.code);
  if (c.evidence.questions !== 18) throw new Error('หลักฐานจำนวนข้อผิด: ' + c.evidence.questions);
  if (c.score !== Math.round(c.evidence.readiness * .6 + 86 * .4))
    throw new Error('ถ่วงน้ำหนักคะแนนผิด');

  const again = CERT.issue('electrician');
  if (again.created) throw new Error('ออกใบซ้ำให้เส้นทางเดิม');
  console.log(`       ${c.code} · ${c.score}% · ${CERT.levelOf(c.score).th}`);
});

await check('แก้โปรไฟล์ → ชื่อและสถาบันบนใบเปลี่ยนตาม', () => {
  store_.updateProfile({ certName:'สมชาย ใจดี (ทดสอบ)', school:'สถาบันใหม่', schoolEn:'New Institute' });
  CERT.refreshFromProfile();
  const c = store_.state.certificates[0];
  if (c.name !== 'สมชาย ใจดี (ทดสอบ)') throw new Error('ชื่อบนใบไม่อัปเดต');
  if (c.school !== 'สถาบันใหม่' || c.schoolEn !== 'New Institute') throw new Error('สถาบันบนใบไม่อัปเดต');

  // ฉบับ EN ต้องหยิบชื่อสถาบันภาษาอังกฤษมาใช้
  if (!CERT.certificateSVG(c, { lang:'en' }).includes('New Institute'))
    throw new Error('ฉบับ EN ไม่ได้ใช้ schoolEn');
  if (!CERT.certificateSVG(c, { lang:'th' }).includes('สถาบันใหม่'))
    throw new Error('ฉบับไทยไม่ได้ใช้ school');
  // ไม่ได้กรอก schoolEn → ต้องถอยไปใช้ชื่อไทย ไม่ใช่ปล่อยว่าง
  if (!CERT.certificateSVG({ ...c, schoolEn:'' }, { lang:'en' }).includes('สถาบันใหม่'))
    throw new Error('ไม่มี schoolEn แล้วไม่ถอยไปใช้ school');

  store_.updateProfile({ certName:'สมชาย ใจดี', school:'วิทยาลัยเทคนิคขอนแก่น', schoolEn:'' });
  CERT.refreshFromProfile();
});

await check('SVG ของเกียรติบัตรสมบูรณ์', () => {
  const c = store_.state.certificates[0];
  const svg = CERT.certificateSVG(c, { standalone: true });
  if (!svg.startsWith('<svg')) throw new Error('ไม่ใช่ SVG');
  if (!svg.includes('xmlns=')) throw new Error('ขาด xmlns ทำให้ export เป็นรูปไม่ได้');
  if (!svg.includes(c.name))  throw new Error('ไม่มีชื่อผู้รับบนใบ');
  if (!svg.includes(c.code))  throw new Error('ไม่มีเลขที่บนใบ');
  if (!svg.includes(T.trackById(c.trackId).name)) throw new Error('ไม่มีชื่อหลักสูตรบนใบ');
  if (/undefined|NaN|\[object Object\]/.test(svg)){
    throw new Error('การแทนค่าผิดพลาด: …' + svg.match(/.{0,70}(undefined|NaN|\[object Object\]).{0,70}/)[0] + '…');
  }
  const open = (svg.match(/<(?!\/)[a-zA-Z]/g) || []).length;
  const close = (svg.match(/<\/[a-zA-Z]/g) || []).length + (svg.match(/\/>/g) || []).length;
  if (open !== close) throw new Error(`แท็กไม่สมดุล เปิด ${open} ปิด ${close}`);
});

/** ดึง font-size ของ <text> ที่บรรจุข้อความนั้น */
const fontSizeOf = (svg, text) => {
  const m = svg.match(new RegExp(`<text[^>]*?font-size="([\\d.]+)"[^>]*>\\s*${
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</`));
  if (!m) throw new Error('หา <text> ของ "' + text.slice(0, 20) + '" ไม่เจอ');
  return parseFloat(m[1]);
};

await check('ชื่อยาวผิดปกติยังไม่ล้นกรอบ (ลดขนาดฟอนต์ให้)', () => {
  const base = store_.state.certificates[0];
  const shortName = fontSizeOf(CERT.certificateSVG({ ...base, name:'สมชาย ใจดี' }), 'สมชาย ใจดี');
  const longText  = 'ท่านผู้มีเกียรตินามสกุลยาวมากเป็นพิเศษจริง ๆ นะครับ';
  const longName  = fontSizeOf(CERT.certificateSVG({ ...base, name: longText }), longText);
  if (!(longName < shortName)) throw new Error(`ไม่ได้ย่อ: สั้น ${shortName} ยาว ${longName}`);
  if (longName < shortName * 0.5) throw new Error('ย่อจนเล็กเกินอ่านไม่ออก: ' + longName);
});

await check('ชื่อไทยกับชื่อละตินใช้ฟอนต์เซริฟคนละชุด', () => {
  const base = store_.state.certificates[0];
  const latin = CERT.certificateSVG({ ...base, name:'Kittiphit Boonying' });
  const thai  = CERT.certificateSVG({ ...base, name:'กิตติพิชญ์ บุญยิ่ง' });
  if (!/font-family="Georgia/.test(latin)) throw new Error('ชื่อละตินไม่ได้ใช้เซริฟละติน');
  const thaiNameTag = thai.match(/<text[^>]*font-family="([^"]*)"[^>]*>\s*กิตติพิชญ์ บุญยิ่ง\s*</)?.[1];
  if (!thaiNameTag || /^Georgia/.test(thaiNameTag))
    throw new Error('ชื่อไทยไม่ควรขึ้นต้นด้วย Georgia (ไม่มีกลิฟไทย): ' + thaiNameTag);
});

await check('เกียรติบัตรสองภาษา: EN ต้องไม่มีตัวอักษรไทยหลงเหลือ', () => {
  const c = { ...store_.state.certificates[0], lang:'en',
              name:'Kittiphit Boonying', school:'King Mongkut’s University of Technology Thonburi' };
  const en = CERT.certificateSVG(c, { standalone: true });

  // ตรวจเฉพาะข้อความที่ผู้อ่านเห็นจริง (<text>) — คอมเมนต์ในซอร์สไม่นับ
  const shown = [...en.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].trim());
  const thaiLeft = shown.filter(t => /[฀-๿]/.test(t));
  if (thaiLeft.length) throw new Error('ยังมีข้อความไทยบนใบ EN: ' + thaiLeft.slice(0, 3).join(' / '));

  for (const want of ['CERTIFICATE', 'This is to certify that', 'Building Electrician',
                      'Certificate No.', 'Issued on', 'Programme Director'])
    if (!en.includes(want)) throw new Error('ฉบับ EN ขาด: ' + want);
});

await check('เกียรติบัตรฉบับไทยยังใช้ข้อความไทย', () => {
  const th = CERT.certificateSVG({ ...store_.state.certificates[0], lang:'th' });
  for (const want of ['ขอมอบเกียรติบัตรฉบับนี้ไว้เพื่อแสดงว่า',
                      'ช่างไฟฟ้าภายในอาคาร', 'เลขที่เกียรติบัตร'])
    if (!th.includes(want)) throw new Error('ฉบับไทยขาด: ' + want);
});

await check('ไม่มีข้อความไทยถูกจัดระยะตัวอักษร (สระ/วรรณยุกต์จะหลุดตำแหน่ง)', () => {
  for (const lang of ['th', 'en']) {
    const svg = CERT.certificateSVG({ ...store_.state.certificates[0], lang,
                                      name:'สมชาย ใจดี', school:'วิทยาลัยเทคนิคสาธิต' });
    for (const [, attrs, body] of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      if (!/[฀-๿]/.test(body)) continue;
      const sp = parseFloat((attrs.match(/letter-spacing="([-\d.]+)"/) || [, '0'])[1]);
      if (sp > 0) throw new Error(`[${lang}] "${body.trim().slice(0, 24)}" ยัง letter-spacing=${sp}`);
      /* ข้อความไทยต้องไม่ถูกวาดด้วยเซริฟละติน ซึ่งไม่มีสระ/วรรณยุกต์ไทย */
      if (/font-family="Georgia/.test(attrs))
        throw new Error(`[${lang}] "${body.trim().slice(0, 24)}" ถูกวาดด้วยเซริฟละติน`);
    }
  }
});

await check('ทุกเส้นทางมีชื่ออังกฤษครบ (ไม่งั้นใบ EN จะโผล่ภาษาไทย)', () => {
  const miss = T.TRACKS.filter(t => !t.nameEn || !t.certEn).map(t => t.id);
  if (miss.length) throw new Error('ขาด nameEn/certEn: ' + miss.join(', '));
  for (const t of T.TRACKS)
    if (/[฀-๿]/.test(t.nameEn + t.certEn))
      throw new Error(t.id + ': ชื่ออังกฤษยังมีอักษรไทยปน');
});

await check('setLang จำภาษาไว้กับตัวใบ', () => {
  const id = store_.state.certificates[0].id;
  if (!CERT.setLang(id, 'en')) throw new Error('setLang คืนค่าว่าง');
  if (store_.state.certificates[0].lang !== 'en') throw new Error('ไม่ได้บันทึกภาษา');
  if (CERT.setLang(id, 'de')) throw new Error('ยอมรับภาษาที่ไม่มีอยู่');
  CERT.setLang(id, 'th');
});

await check('ตราประทับไม่มีข้อความล้นทรง + ทุกอย่างอยู่ในกรอบ', () => {
  const svg = CERT.certificateSVG(store_.state.certificates[0]);
  // กรอบในอยู่ที่ y = 34 .. 760
  const ys = [...svg.matchAll(/\sy="([\d.]+)"/g)].map(m => +m[1]);
  const over = ys.filter(y => y > 760);
  if (over.length) throw new Error('มีองค์ประกอบต่ำกว่ากรอบล่าง: y=' + over.join(','));
  const x1s = [...svg.matchAll(/\sx="([\d.]+)"/g)].map(m => +m[1]);
  if (x1s.some(x => x < 34 || x > 1089)) throw new Error('มีองค์ประกอบล้นกรอบซ้าย/ขวา');
});

console.log('\n== tutor threads ==');

await check('ห้องแชทแยกตามเส้นทาง ไม่ปนกัน', () => {
  store_.clearTutorThread('electrician');
  store_.clearTutorThread('firstaid');

  store_.pushTutorMessage('electrician', { role:'me', text:'RCD ทำงานยังไง' });
  store_.pushTutorMessage('electrician', { role:'ai', res:{ kind:'answer', lead:'ตอบไฟฟ้า', blocks:[], sources:[] } });
  store_.pushTutorMessage('firstaid',    { role:'me', text:'กดหน้าอกเร็วเท่าไหร่' });

  const e = store_.tutorThread('electrician'), f = store_.tutorThread('firstaid');
  if (e.length !== 2) throw new Error('ห้องช่างไฟฟ้าควรมี 2 ข้อความ ได้ ' + e.length);
  if (f.length !== 1) throw new Error('ห้องปฐมพยาบาลควรมี 1 ข้อความ ได้ ' + f.length);
  if (JSON.stringify(f).includes('RCD')) throw new Error('ข้อความข้ามห้องกัน');
  if (store_.tutorThread('cloud').length) throw new Error('ห้องที่ยังไม่เคยคุยต้องว่าง');
});

await check('ล้างประวัติกระทบเฉพาะห้องนั้น', () => {
  store_.clearTutorThread('electrician');
  if (store_.tutorThread('electrician').length) throw new Error('ล้างไม่สำเร็จ');
  if (store_.tutorThread('firstaid').length !== 1) throw new Error('ล้างไปโดนห้องอื่นด้วย');
});

await check('ประวัติแชทอยู่ข้ามการปิดเปิด (บันทึกลง store)', () => {
  store_.pushTutorMessage('electrician', { role:'me', text:'ทดสอบการบันทึก' });
  store_.flush();
  const raw = localStorage.getItem('skillpass.v2:' + store_.currentUid());
  const saved = JSON.parse(raw).tutorThreads;
  if (!saved?.electrician?.some(m => m.text === 'ทดสอบการบันทึก'))
    throw new Error('ไม่ได้บันทึกประวัติลง localStorage');
  if (saved.firstaid?.some(m => m.text === 'ทดสอบการบันทึก'))
    throw new Error('บันทึกข้ามห้อง');
});

await check('ประวัติยาวเกินถูกตัดท้าย ไม่ปล่อยให้บวมไม่จำกัด', () => {
  store_.clearTutorThread('cloud');
  for (let i = 0; i < 60; i++) store_.pushTutorMessage('cloud', { role:'me', text:'q' + i });
  const t = store_.tutorThread('cloud');
  if (t.length > 40) throw new Error('ไม่ได้จำกัดความยาว: ' + t.length);
  if (t.at(-1).text !== 'q59') throw new Error('ตัดผิดด้าน — ควรเก็บข้อความล่าสุดไว้');
  store_.clearTutorThread('cloud');
});

console.log('\n== ui plumbing ==');

await check('ตัวเลือกเป็น dropdown component ไม่ใช่ปุ่มเรียงยาวหรือ select เปล่า', () => {
  const pages = {
    tutor:      [mods.tutor,      { name:'tutor' },      ['tutor-track']],
    exam:       [mods.exam,       { name:'exam' },       ['ex-track', 'ex-skill']],
    assessment: [mods.assessment, { name:'assessment' }, ['assessment-track', 'assessment-budget']],
  };

  for (const [page, [mod, route, ids]] of Object.entries(pages)){
    const out = mod.render({ route:{ ...route, sub:null, params:{} }, go(){} });
    for (const id of ids){
      if (!new RegExp(`<input type="hidden" id="${id}"`).test(out))
        throw new Error(`${page}: ${id} ยังไม่ได้ใช้ dropdown component`);
    }
    if (/<select/.test(out)) throw new Error(`${page}: ยังเหลือ <select> ที่จัดสไตล์ไม่ได้`);
    // ทุกตัวต้องเข้าถึงด้วยคีย์บอร์ดได้
    if (!/aria-haspopup="listbox"/.test(out) || !/role="listbox"/.test(out))
      throw new Error(`${page}: dropdown ขาด ARIA ที่จำเป็น`);
  }

  // ทุกเส้นทางที่มีข้อสอบต้องอยู่ใน dropdown ครบ
  const examOut = mods.exam.render({ route:{ name:'exam', sub:null, params:{} }, go(){} });
  const opts = (examOut.match(/class="dd-opt"/g) || []).length;
  const tracksWithQ = T.TRACKS.filter(t => Q.byTrack(t.id).length).length;
  if (opts < tracksWithQ) throw new Error(`dropdown มี ${opts} ตัวเลือก แต่มี ${tracksWithQ} เส้นทาง`);
});

await check('dropdown ที่ตัวเลือกเยอะมีช่องค้นหาให้อัตโนมัติ', () => {
  const examOut = mods.exam.render({ route:{ name:'exam', sub:null, params:{} }, go(){} });
  if (!/class="dd-search"/.test(examOut))
    throw new Error('รายการเส้นทาง 12 อันควรมีช่องค้นหา');
  // ตัวเลือกน้อย ๆ ไม่ควรมีช่องค้นหามารก
  const short = mods.assessment.render({ route:{ name:'assessment', sub:null, params:{} }, go(){} });
  const budgetBlock = short.slice(short.indexOf('assessment-budget-btn'));
  if (/class="dd-search"/.test(budgetBlock.slice(0, budgetBlock.indexOf('</div>') + 400)))
    throw new Error('ตัวเลือก 3 อันไม่ควรมีช่องค้นหา');
});

await check('หน้า AI เชื่อม role backbone จริงและยังประกาศ fallback ไว้', () => {
  const tutorView = fs.readFileSync(path.join(ROOT, 'js/views/tutor.js'), 'utf8');
  const examView = fs.readFileSync(path.join(ROOT, 'js/views/exam.js'), 'utf8');
  const assessmentView = fs.readFileSync(path.join(ROOT, 'js/views/assessment.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  if (!/askTutor\(/.test(tutorView) || !/source:\s*'local'/.test(tutorView))
    throw new Error('หน้าแชทยังไม่เชื่อม tutor role หรือไม่มี fallback ฉุกเฉิน');
  if (!/explainAnswer\(/.test(examView) || !/explainQuestion\(/.test(examView))
    throw new Error('หน้าเฉลยยังไม่เชื่อม explainer role หรือไม่มี local fallback');
  for (const fn of ['assessLearner(', 'buildPlan('])
    if (!assessmentView.includes(fn)) throw new Error('หน้าประเมินขาด ' + fn);
  if (!app.includes("id:'assessment'") || !index.includes('id="ai-status"'))
    throw new Error('route หน้าประเมินหรือป้ายสถานะ AI ยังไม่ถูกต่อเข้า app shell');
});

await check('หน้าต่างซ้อนมีปุ่มปิดมุมขวาบนเสมอ', () => {
  if (!comps.includes('.modal-x{')) throw new Error('ไม่มีสไตล์ปุ่มปิด');
  if (!comps.includes('.modal-body{')) throw new Error('ไม่มีส่วนเนื้อหาที่เลื่อนแยกจากปุ่มปิด');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  if (!ui.includes('class="modal-x" data-close')) throw new Error('modal() ไม่ได้ใส่ปุ่มกากบาท');
  if (!/max-height:min\(92dvh/.test(comps)) throw new Error('modal ไม่ได้จำกัดความสูงให้พอดีจอ');
  if (!/\.cert-zoom svg\{[\s\S]*?max-height:/.test(comps))
    throw new Error('หน้าต่างดูเกียรติบัตรไม่ได้จำกัดความสูง จะต้องเลื่อนหา');
});

await check('กล่อง modal ต้องมีขนาดตรงกับสิ่งที่เห็น (ไม่งั้นปุ่มปิดลอยผิดที่)', () => {
  // .modal-x วางตำแหน่งอิงขอบของ .modal — ถ้ากล่องถูกทำให้ auto/โปร่งใส
  // ปุ่มจะไปโผล่กลางเนื้อหา (เคยเกิดกับหน้าต่างดูเกียรติบัตรมาแล้ว)
  const rule = comps.match(/#modal-host \.modal:has\(\.cert-zoom\)[^{]*\{([^}]*)\}/)?.[1] || '';
  for (const bad of ['width:auto', 'background:transparent', 'box-shadow:none'])
    if (rule.includes(bad))
      throw new Error(`กฎของหน้าต่างเกียรติบัตรตั้ง ${bad} ทำให้กล่องไม่ตรงกับใบที่เห็น`);
  if (!/\.modal-wide\{width:min\(/.test(comps))
    throw new Error('.modal-wide ต้องกำหนดความกว้างชัดเจน');
});

console.log('\n== ชั้นเรียน ==');
const CR = await import(url('js/classroom.js'));

await check('สร้างชั้นเรียนได้และรหัสเข้าร่วมไม่ซ้ำกัน', () => {
  CR.resetClasses();
  const a = CR.createClass({ name:'ปวส.ไฟฟ้า 2/1', trackId:'electrician', teacherUid:'t1', teacherName:'อ.สมชาย' });
  const b = CR.createClass({ name:'ปวส.ไฟฟ้า 2/2', trackId:'electrician', teacherUid:'t1', teacherName:'อ.สมชาย' });
  if (!a.ok || !b.ok) throw new Error('สร้างไม่สำเร็จ');
  if (a.cls.code === b.cls.code) throw new Error('รหัสซ้ำกัน');
  if (!/^[A-Z2-9]{6}$/.test(a.cls.code)) throw new Error('รูปแบบรหัสผิด: ' + a.cls.code);
  if (/[IO01]/.test(a.cls.code + b.cls.code)) throw new Error('รหัสมีอักษรที่อ่านสับสน (I/O/0/1)');
  if (CR.createClass({ name:'x', trackId:'electrician', teacherUid:'t1' }).ok)
    throw new Error('ชื่อสั้นเกินไปแต่ยังสร้างได้');
  if (CR.createClass({ name:'ชื่อยาวพอ', trackId:'ไม่มีจริง', teacherUid:'t1' }).ok)
    throw new Error('หลักสูตรไม่มีจริงแต่ยังสร้างได้');
});

await check('เพิ่มนักเรียน: กันเลขที่ซ้ำ และเรียงตามเลขที่แบบตัวเลข', () => {
  const c = CR.allClasses()[0];
  CR.addStudent(c.id, { name:'ข นักเรียน', studentNo:'10' });
  CR.addStudent(c.id, { name:'ก นักเรียน', studentNo:'2' });
  if (CR.addStudent(c.id, { name:'ซ้ำเลข', studentNo:'2' }).ok) throw new Error('เลขที่ซ้ำแต่เพิ่มได้');
  if (CR.addStudent(c.id, { name:'ก' }).ok) throw new Error('ชื่อสั้นเกินไปแต่เพิ่มได้');
  const nos = CR.classById(c.id).students.map(s => s.studentNo);
  if (nos.join() !== '2,10') throw new Error('เรียงเลขที่ผิด (ต้องเรียงแบบตัวเลข ไม่ใช่ตัวอักษร): ' + nos);
});

await check('ตารางสอน: กันเวลาชนและเวลาย้อนกลับ', () => {
  const c = CR.allClasses()[0];
  if (!CR.addSlot(c.id, { day:1, start:'09:00', end:'11:00', topic:'คาบแรก' }).ok)
    throw new Error('เพิ่มคาบปกติไม่ได้');
  const clash = CR.addSlot(c.id, { day:1, start:'10:00', end:'12:00' });
  if (clash.ok) throw new Error('เวลาคาบชนกันแต่เพิ่มได้');
  if (!/ชนกับคาบ/.test(clash.error)) throw new Error('ข้อความไม่ได้บอกว่าชนคาบไหน: ' + clash.error);
  if (CR.addSlot(c.id, { day:1, start:'14:00', end:'13:00' }).ok) throw new Error('เวลาเลิกก่อนเริ่มแต่เพิ่มได้');
  if (CR.addSlot(c.id, { day:1, start:'9:00', end:'11:00' }).ok) throw new Error('รูปแบบเวลาผิดแต่เพิ่มได้');
  if (CR.addSlot(c.id, { day:9, start:'09:00', end:'10:00' }).ok) throw new Error('วันไม่ถูกต้องแต่เพิ่มได้');
  if (!CR.addSlot(c.id, { day:2, start:'09:00', end:'11:00' }).ok) throw new Error('คนละวันไม่ควรนับว่าชน');
  if (CR.weeklyHours(CR.classById(c.id)) !== 4) throw new Error('คำนวณชั่วโมงต่อสัปดาห์ผิด');
});

await check('เข้าร่วมด้วยรหัส: จับคู่กับรายชื่อที่ครูใส่ไว้ ไม่เพิ่มซ้ำ', () => {
  const c = CR.allClasses()[0];
  const before = CR.classById(c.id).students.length;
  const j = CR.joinByCode(c.code.toLowerCase(), { uid:'stu1', name:'ก นักเรียน' });
  if (!j.ok) throw new Error('เข้าร่วมไม่สำเร็จ: ' + j.error);
  if (!j.linked) throw new Error('ควรจับคู่กับรายชื่อเดิม ไม่ใช่เพิ่มใหม่');
  if (CR.classById(c.id).students.length !== before) throw new Error('เพิ่มรายชื่อซ้ำ');

  if (CR.joinByCode(c.code, { uid:'stu1', name:'ก นักเรียน' }).ok) throw new Error('เข้าร่วมซ้ำได้');
  if (CR.joinByCode('XXXXXX', { uid:'stu2', name:'ใครสักคน' }).ok) throw new Error('รหัสมั่วแต่เข้าได้');

  const j2 = CR.joinByCode(c.code, { uid:'stu2', name:'คนใหม่ ไม่มีในรายชื่อ' });
  if (!j2.ok || j2.linked) throw new Error('คนใหม่ควรถูกเพิ่มเข้ารายชื่อ');
  if (CR.classesJoinedBy('stu2').length !== 1) throw new Error('classesJoinedBy หาไม่เจอ');
  if (CR.classesTaughtBy('t1').length !== 2) throw new Error('classesTaughtBy นับผิด');
});

await check('คาบถัดไปวนกลับต้นสัปดาห์เมื่อเลยคาบสุดท้ายแล้ว', () => {
  const c = CR.classById(CR.allClasses()[0].id);
  const sunday = new Date('2026-08-09T20:00:00');
  const next = CR.nextSlot(c, sunday);
  if (!next) throw new Error('ไม่คืนคาบถัดไป');
  if (next.day !== 1) throw new Error('ควรวนกลับไปคาบแรกของสัปดาห์ ได้วัน ' + next.day);
});

await check('ลบนักเรียน / คาบ / ชั้นเรียนได้', () => {
  const c = CR.allClasses()[0];
  const st = CR.classById(c.id).students[0];
  CR.removeStudent(c.id, st.id);
  if (CR.classById(c.id).students.some(s => s.id === st.id)) throw new Error('ลบนักเรียนไม่สำเร็จ');
  const sl = CR.classById(c.id).schedule[0];
  CR.removeSlot(c.id, sl.id);
  if (CR.classById(c.id).schedule.some(s => s.id === sl.id)) throw new Error('ลบคาบไม่สำเร็จ');
  const n = CR.allClasses().length;
  CR.deleteClass(c.id);
  if (CR.allClasses().length !== n - 1) throw new Error('ลบชั้นเรียนไม่สำเร็จ');
});

console.log('\n== ผู้ช่วยประจำหน้า ==');
const AS = await import(url('js/ai/assistant.js'));

await check('หน้าชั้นเรียนมีผู้ช่วยฝังอยู่พร้อมคำถามแนะนำ', () => {
  CR.resetClasses();
  const c = CR.createClass({ name:'ปวส.ไฟฟ้า 2/1', trackId:'electrician',
                             teacherUid:'t1', teacherName:'อ.สมชาย' }).cls;
  CR.addStudent(c.id, { name:'กิตติพิชญ์ บุญยิ่ง', studentNo:'1' });
  CR.addSlot(c.id, { day:1, start:'09:00', end:'11:00', topic:'วงจรอนุกรม' });

  const out = mods.classes.render({ route:{ name:'classes', sub:c.id, params:{} }, go(){} });
  if (!out.includes('data-assist=')) throw new Error('หน้าชั้นเรียนไม่มีผู้ช่วยฝังอยู่');
  if (!/assist-chips/.test(out)) throw new Error('ไม่มีคำถามแนะนำ');
});

await check('askScoped ไม่เดาเมื่อ AI ไม่พร้อม (ไม่มี fallback ปลอม)', async () => {
  const scope = { key:'t', name:'ทดสอบ', topics:'ก', outOfScope:'ข',
                  context:() => 'ข้อมูลทดสอบ', suggestions:[] };
  const r = await AS.askScoped(scope, 'คำถาม');
  if (!r.error) throw new Error('AI ไม่พร้อมแต่ตอบมาเฉย ๆ — ต้องบอกผู้ใช้ตรง ๆ');
  if (!r.text) throw new Error('ไม่มีข้อความอธิบายสาเหตุ');
});

await check('ผู้ช่วยไม่เห็นผลการเรียนของนักเรียนคนอื่น', () => {
  const c = CR.allClasses()[0];
  // ครูใส่ชื่อนักเรียนไว้ แต่คนนั้นยังไม่ได้เข้าร่วมจากบัญชีตัวเอง
  CR.addStudent(c.id, { name:'สมหญิง รักเรียน', studentNo:'2' });
  const out = mods.classes.render({ route:{ name:'classes', sub:c.id, params:{} }, go(){} });

  // ชื่อต้องอยู่ (ครูต้องเห็นรายชื่อ) แต่ต้องไม่มีตัวเลขผลการเรียนของคนที่ไม่ได้ผูกบัญชี
  if (!out.includes('สมหญิง รักเรียน')) throw new Error('รายชื่อไม่แสดง');
  if (!/รอเข้าร่วม/.test(out)) throw new Error('ไม่ได้บอกสถานะว่ายังไม่เข้าร่วม');

  // ข้อมูลที่ผู้ช่วยเห็น ต้องระบุชัดว่าคนนั้นยังไม่มีข้อมูล ไม่ใช่เดาตัวเลขให้
  const src = fs.readFileSync(path.join(ROOT, 'js/views/classes.js'), 'utf8');
  if (!/ยังไม่มีข้อมูลผลการเรียน/.test(src))
    throw new Error('context ไม่ได้ระบุกรณีที่ยังไม่มีข้อมูล — AI อาจเดาตัวเลขแทน');
  if (!/s\.uid === me\(\)/.test(src))
    throw new Error('ไม่ได้จำกัดว่าอ่านผลได้เฉพาะบัญชีที่เปิดอยู่');
});

await check('ทุกขอบเขตของผู้ช่วยประกาศเรื่องที่ "ไม่ตอบ" ไว้ด้วย', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/views/classes.js'), 'utf8');
  if (!/outOfScope:/.test(src)) throw new Error('ไม่ได้ประกาศ outOfScope');
  if (!/ติวเตอร์ AI/.test(src)) throw new Error('ไม่ได้ชี้ทางว่าคำถามวิชาการควรไปหน้าไหน');
});

console.log('\n== views render ==');
for (const v of viewNames) {
  await check(`render ${v}`, () => {
    const ctx = { route: { name: v, sub: null, params: {} }, go(){} };
    const out = mods[v].render(ctx);
    if (typeof out !== 'string' || out.length < 200) throw new Error('suspiciously short output');
    if (/undefined|\[object Object\]|NaN/.test(out)) {
      const m = out.match(/.{0,60}(undefined|\[object Object\]|NaN).{0,60}/);
      throw new Error('bad interpolation: …' + m[0] + '…');
    }
  });
}

await check('render tracks detail (all tracks)', () => {
  for (const t of T.TRACKS) {
    const out = mods.tracks.render({ route:{ name:'tracks', sub:t.id, params:{} }, go(){} });
    if (/undefined|NaN/.test(out)) throw new Error(t.id + ': bad interpolation');
  }
});

await check('เกณฑ์ DSD ขึ้นเฉพาะเส้นทางที่มีใบรับรองจริง และตัวเลขตรงกับ standards.js', async () => {
  const S = await import(url('js/data/standards.js'));
  const renderOf = id =>
    mods.tracks.render({ route:{ name:'tracks', sub:id, params:{} }, go(){} });

  for (const t of T.TRACKS) {
    const std = S.standardForTrack(t.id);
    const out = renderOf(t.id);
    const shown = out.includes('เกณฑ์มาตรฐานจริงที่ใช้สอบ');

    if (!!std !== shown)
      throw new Error(`${t.id}: การ์ดเกณฑ์ ${shown ? 'ขึ้นทั้งที่' : 'ไม่ขึ้นทั้งที่'}ไม่ควร`);
    if (!std) continue;

    /* ค่าจ้างบนหน้าจอต้องมาจากไฟล์ standard ไม่ใช่เลขที่พิมพ์ค้างไว้ในวิว */
    if (!out.includes(`${std.wage[1]} ฿`))
      throw new Error(`${t.id}: ไม่พบค่าจ้างระดับ 1 (${std.wage[1]}) บนหน้าจอ`);
    for (const m of std.modules)
      if (!out.includes(m.th)) throw new Error(`${t.id}: ขาดหมวด "${m.th}"`);
  }

  /* กันไม่ให้ตัวเลขค่าจ้างที่แก้ไปแล้วหลุดกลับมา (ดราฟต์เดิมของทีมวิจัย) */
  const wrong = { electrician: 400, welding: 465 };
  for (const [id, old] of Object.entries(wrong))
    if (S.standardForTrack(id).wage[1] === old)
      throw new Error(`${id}: ค่าจ้างระดับ 1 ยังเป็นตัวเลขเก่าที่คลาดเคลื่อน (${old})`);
});

await check('render lab brief (all drills)', () => {
  for (const d of D.DRILLS) {
    const out = mods.lab.render({ route:{ name:'lab', sub:d.id, params:{} }, go(){} });
    if (/undefined|NaN/.test(out)) throw new Error(d.id + ': bad interpolation');
    mods.lab.unmount?.();
  }
});

await check('render certificate detail + not-found', () => {
  const c = store_.state.certificates[0];
  const out = mods.certs.render({ route:{ name:'certs', sub:c.id, params:{} }, go(){} });
  if (!out.includes(c.code)) throw new Error('หน้ารายละเอียดไม่มีเลขที่ใบ');
  if (/undefined|NaN/.test(out)) throw new Error('bad interpolation');

  const missing = mods.certs.render({ route:{ name:'certs', sub:'ไม่มีจริง', params:{} }, go(){} });
  if (!missing.includes('ไม่พบเกียรติบัตร')) throw new Error('ไม่ได้จัดการกรณีหาใบไม่เจอ');
});

await check('render auth screen (both tabs)', () => {
  const out = mods.auth.render();
  for (const want of ['เข้าสู่ระบบ', 'สมัครสมาชิก', 'ผู้เยี่ยมชม'])
    if (!out.includes(want)) throw new Error('ขาดส่วน: ' + want);
  if (/undefined|NaN/.test(out)) throw new Error('bad interpolation');
});

await check('บัญชีผู้เยี่ยมชม: โปรไฟล์ตัวอย่าง + ข้อมูลสาธิต + แยกจากบัญชีอื่น', () => {
  const otherCode = store_.state.certificates[0].code;   // ของบัญชีที่ล็อกอินอยู่ก่อนหน้า

  auth.guest();
  if (store_.currentUid() !== 'guest') throw new Error('ไม่ได้สลับไปบัญชีผู้เยี่ยมชม');
  if (store_.displayName() !== 'Kittiphit Boonying') throw new Error('ชื่อตัวอย่างไม่ถูกตั้ง: ' + store_.displayName());
  if (!/KMUTT/.test(store_.state.profile.school)) throw new Error('สถาบันตัวอย่างไม่ถูกตั้ง');

  const certs = store_.state.certificates;
  if (certs.length !== 1) throw new Error('ควรมีเกียรติบัตรสาธิต 1 ใบ ได้ ' + certs.length);
  if (certs[0].code === otherCode) throw new Error('เห็นเกียรติบัตรของบัญชีอื่น');
  if (certs[0].name !== 'Kittiphit Boonying') throw new Error('ชื่อบนใบไม่ตรงกับโปรไฟล์');
  if (certs[0].trackId !== 'electrician') throw new Error('เส้นทางของใบสาธิตผิด');
  console.log(`       ${certs[0].code} · ${certs[0].score}% · Lv.${store_.levelInfo().level} · ${store_.state.xp} XP`);

  const out = mods.profile.render({ route:{ name:'profile', sub:null, params:{} }, go(){} });
  if (!out.includes('โหมดผู้เยี่ยมชม')) throw new Error('หน้าโปรไฟล์ไม่ได้เตือนว่าเป็นโหมดผู้เยี่ยมชม');
});

await check('ข้อมูลสาธิตปลูกครั้งเดียว ไม่ทับซ้ำเมื่อเข้าใหม่', () => {
  const before = { certs: store_.state.certificates.length, exams: store_.state.examHistory.length };
  auth.guest();
  auth.guest();
  const after = { certs: store_.state.certificates.length, exams: store_.state.examHistory.length };
  if (after.certs !== before.certs || after.exams !== before.exams)
    throw new Error(`ปลูกซ้ำ: ใบ ${before.certs}→${after.certs} ข้อสอบ ${before.exams}→${after.exams}`);
});

await check('ข้อมูลสาธิตพาไปถึงเกณฑ์เกียรติบัตรได้จริง (ไม่ใช่ยัดใบให้เฉย ๆ)', () => {
  const e = CERT.eligibility('electrician');
  if (!e.ok) throw new Error('ใบสาธิตออกทั้งที่ไม่ผ่านเกณฑ์: ' + e.checks.filter(c => !c.ok).map(c => c.id));
  // อีกสองเส้นทางต้องยังไม่ผ่าน เพื่อให้หน้า "ความคืบหน้าสู่ใบถัดไป" มีอะไรให้ดู
  for (const t of ['firstaid', 'cloud'])
    if (CERT.eligibility(t).ok) throw new Error(t + ' ไม่ควรผ่านเกณฑ์ในชุดสาธิต');

  // ตัวเลขบนใบต้องตรงกับประวัติที่แสดงในสมุดทักษะ ไม่ใช่คนละชุด
  const items = store_.state.examHistory
    .filter(x => x.trackId === 'electrician').reduce((s, x) => s + x.items, 0);
  if (e.evidence.questions !== items)
    throw new Error(`ข้อสอบบนใบ (${e.evidence.questions}) ไม่ตรงกับประวัติ (${items})`);
  console.log('       เกณฑ์: ' + e.checks.map(c => `${c.id}=${c.now}`).join('  '));
});

await check('ทัวร์สอนใช้งานชี้ไปยังปุ่มที่มีอยู่จริง', async () => {
  const T2 = await import(url('js/tour.js'));
  if (typeof T2.startTour !== 'function') throw new Error('tour.js ไม่ได้ export startTour');

  const tourSrc = fs.readFileSync(path.join(ROOT, 'js/tour.js'), 'utf8');
  const appSrc  = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  /* ปุ่มเมนูถูกวาดตอนรัน จึงเทียบกับรายการ nav ในซอร์สแทน
     ถ้ามีใครเปลี่ยนชื่อ route แล้วลืมแก้ทัวร์ ทัวร์จะชี้ไปที่ว่าง ๆ โดยไม่มีใครรู้ */
  const navIds = new Set([...appSrc.matchAll(/\bid:\s*'([a-z]+)'/g)].map(m => m[1]));
  const routes = [...tourSrc.matchAll(/href="#\/([a-z]+)"/g)].map(m => m[1]);
  if (!routes.length) throw new Error('ทัวร์ไม่ได้ชี้ไปที่เมนูไหนเลย');
  for (const r of new Set(routes))
    if (!navIds.has(r)) throw new Error(`ทัวร์ชี้ไป #/${r} ซึ่งไม่มีในเมนู`);

  /* จุดที่ชี้แบบไม่ใช่เมนู ต้องมี id นั้นอยู่ใน shell จริง */
  for (const id of [...tourSrc.matchAll(/target:\s*'#([a-z-]+)'/g)].map(m => m[1]))
    if (!htmlSrc.includes(`id="${id}"`)) throw new Error(`ทัวร์ชี้ไป #${id} ซึ่งไม่มีใน index.html`);

  /* ต้องเปิดซ้ำได้ ไม่ใช่ดูได้ครั้งเดียวตอนสมัคร */
  if (!appSrc.includes('data-tour-replay')) throw new Error('ไม่มีทางเปิดทัวร์ซ้ำจากเมนูผู้ใช้');
});

await check('AI พาคิดก่อนเฉลย ไม่ใช่จ่ายคำตอบ (เกณฑ์ JUMP Thailand)', () => {
  /* ต้องผ่านทั้งที่ไม่มี AI ด้วย เพราะเดโมสาธารณะใช้เอนจินในเครื่อง
     ถ้าเทสต์นี้ตก แปลว่าผู้เรียนได้คำตอบสำเร็จรูปโดยไม่ต้องคิดก่อน */
  const a = tutor.ask('คำนวณขนาดสายไฟยังไง', { trackId:'electrician' });
  if (a.kind !== 'answer') throw new Error('ควรตอบได้จากคลังความรู้');
  for (const f of ['probe', 'nextTime', 'verify'])
    if (!a[f]) throw new Error(`คำตอบติวเตอร์ขาด ${f}`);
  if (!/ลอง|ก่อน/.test(a.probe)) throw new Error('probe ไม่ได้ชวนให้คิดก่อน');
  /* nextTime ต้องเป็นวิธีที่ใช้ซ้ำได้ ไม่ใช่คำตอบของคำถามนี้ */
  if (a.nextTime.length < 20) throw new Error('nextTime สั้นเกินกว่าจะเป็นวิธีที่ใช้ซ้ำได้');

  const q = Q.QUESTIONS.find(x => x.track === 'electrician' && x.steps?.length);
  for (const correct of [true, false]){
    const e = tutor.explainQuestion(q, { given: q.answer, correct });
    for (const f of ['probe', 'nextTime', 'verify'])
      if (!e[f]) throw new Error(`เฉลย (correct=${correct}) ขาด ${f}`);
    if (e.nextTime.includes(String(q.answer)))
      throw new Error('nextTime ไปอ้างคำตอบของข้อนี้ ควรเป็นวิธีที่ใช้กับข้ออื่นได้');
  }

  /* ตอบถูกกับตอบผิดต้องถามคนละแบบ ไม่ใช่ประโยคสำเร็จรูปอันเดียว */
  const right = tutor.explainQuestion(q, { given:q.answer, correct:true }).probe;
  const wrong = tutor.explainQuestion(q, { given:q.answer, correct:false }).probe;
  if (right === wrong) throw new Error('ตอบถูกกับตอบผิดใช้คำถามชวนคิดเดียวกัน');
});

await check('โมเดลไม่ส่งช่องพาคิดมา ระบบต้องเติมให้เอง ไม่ปล่อยว่าง', async () => {
  const R = await import(url('js/ai/roles.js'));
  const T3 = await import(url('js/engine/tutor.js'));

  /* จำลองกรณีที่โมเดลตอบมาแบบไม่มี probe/nextTime/verify
     ถ้าปล่อยว่าง UI จะกลับไปยกคำตอบให้ทันที ซึ่งผิดเกณฑ์ */
  const local = T3.coachFor('คำนวณขนาดสายไฟยังไง', null);
  for (const f of ['probe', 'nextTime', 'verify'])
    if (!local[f]) throw new Error(`ตัวสร้างในเครื่องไม่คืน ${f} แม้ไม่มีเอกสารอ้างอิง`);
  if (typeof R.askTutor !== 'function') throw new Error('roles.js ไม่ได้ export askTutor');
});

await check('gateway สั่ง AI ตามเกณฑ์เดียวกันกับเอนจินในเครื่อง', () => {
  const py = fs.readFileSync(path.join(ROOT, 'aigateway.py'), 'utf8');
  for (const [what, re] of [
    ['กติกากลางเรื่องไม่ยกคำตอบสำเร็จรูป', /อย่ายกคำตอบสำเร็จรูป/],
    ['กติกาเรื่องรักษาความยากที่สร้างทักษะ', /ความยากที่สร้างทักษะ/],
    ['กติกาเรื่องทิ้งวิธีให้ใช้เองครั้งหน้า', /ใช้เองครั้งหน้า/],
    ['กติกาเรื่องให้ผู้เรียนตรวจสอบเอง', /ตรวจสอบเองกับคู่มือ/],
  ]) if (!re.test(py)) throw new Error('prompt กลางขาด' + what);

  /* สองบทบาทที่ผู้เรียนเจอตรง ๆ ต้องบังคับสามช่องนี้เป็น required */
  for (const role of ['tutor', 'explainer']){
    const seg = py.slice(py.indexOf(`"${role}": {`), py.indexOf(`"${role}": {`) + 2600);
    for (const f of ['probe', 'nextTime'])
      if (!seg.includes(`"${f}"`)) throw new Error(`บทบาท ${role} ไม่มีช่อง ${f}`);
    if (!/required.*probe/s.test(seg.slice(seg.indexOf('"required"'), seg.indexOf('"required"') + 160)))
      throw new Error(`บทบาท ${role} ไม่ได้บังคับ probe`);
  }
});

await check('AI เสนอแผน แล้วครูแก้เองต่อได้จริง', () => {
  const cls = CR.createClass({ name:'ทดสอบแผน', trackId:'electrician', term:'1/2569' }).cls;

  CR.savePlan(cls.id, { source:'ai', weeks:[
    { week:1, title:'ร่างจาก AI 1', objective:'o1', theory:'t1', activity:'a1', assessment:'s1', skillIds:[] },
    { week:2, title:'ร่างจาก AI 2', objective:'o2', theory:'t2', activity:'a2', assessment:'s2', skillIds:[] },
  ]});

  const before = CR.classById(cls.id).plan.weeks[0];
  if (before.editedAt) throw new Error('สัปดาห์ที่ AI ร่างไม่ควรถูกนับว่าครูแก้แล้ว');
  if (CR.editedWeekCount(CR.classById(cls.id)) !== 0) throw new Error('ยังไม่ควรมีสัปดาห์ที่ครูแก้');

  /* ครูแก้ → ต้องบันทึกและติดตราว่าผ่านมือครูแล้ว */
  CR.editPlanWeek(cls.id, 1, { title:'ครูปรับเอง', activity:'พาไปดูตู้จริงที่โรงฝึก' });
  const after = CR.classById(cls.id).plan.weeks[0];
  if (after.title !== 'ครูปรับเอง') throw new Error('ไม่ได้บันทึกหัวข้อที่ครูแก้');
  if (after.activity !== 'พาไปดูตู้จริงที่โรงฝึก') throw new Error('ไม่ได้บันทึกกิจกรรมที่ครูแก้');
  if (!after.editedAt) throw new Error('ไม่ได้ติดตราว่าครูแก้แล้ว');
  if (after.objective !== 'o1') throw new Error('ฟิลด์ที่ไม่ได้แก้ต้องคงเดิม');
  if (CR.editedWeekCount(CR.classById(cls.id)) !== 1) throw new Error('นับสัปดาห์ที่ครูแก้ผิด');

  /* หัวข้อว่างต้องไม่ผ่าน ไม่งั้นแผนจะมีสัปดาห์ไร้ชื่อ */
  if (CR.editPlanWeek(cls.id, 1, { title:'   ' })) throw new Error('ยอมรับหัวข้อว่าง');

  /* เพิ่ม/ลบสัปดาห์ แล้วเลขต้องเรียงต่อเนื่องเสมอ */
  CR.addPlanWeek(cls.id);
  if (CR.classById(cls.id).plan.weeks.length !== 3) throw new Error('เพิ่มสัปดาห์ไม่สำเร็จ');
  CR.removePlanWeek(cls.id, 2);
  const weeks = CR.classById(cls.id).plan.weeks;
  if (weeks.map(w => w.week).join(',') !== '1,2') throw new Error('เลขสัปดาห์ไม่เรียงใหม่หลังลบ: ' + weeks.map(w => w.week));
  if (weeks[0].title !== 'ครูปรับเอง') throw new Error('ลบผิดสัปดาห์');

  CR.deleteClass(cls.id);
});

await check('สลับกล้องหน้า/หลังได้ และมิเรอร์ให้ถูกด้าน', async () => {
  const V = await import(url('js/engine/vision.js'));

  /* กล้องหลังห้ามมิเรอร์ ไม่งั้นชิ้นงานกับตัวหนังสือบนอุปกรณ์กลับซ้ายขวา */
  if (V.shouldMirror('user') !== true) throw new Error('กล้องหน้าต้องมิเรอร์');
  if (V.shouldMirror('environment') !== false) throw new Error('กล้องหลังต้องไม่มิเรอร์');

  /* ค่าที่จำไว้ต้องข้ามครั้งได้ และค่าเพี้ยนต้องถอยไปกล้องหน้า */
  V.saveFacing('environment');
  if (V.savedFacing() !== 'environment') throw new Error('จำด้านกล้องไม่ได้');
  V.saveFacing('ขยะ');
  if (V.savedFacing() !== 'user') throw new Error('ค่าเพี้ยนต้องถอยไปกล้องหน้า');
  V.saveFacing('user');

  if (typeof V.hasMultipleCameras !== 'function') throw new Error('ไม่มีตัวเช็กจำนวนกล้อง');
  if (typeof V.PracticeEngine.prototype.flipCamera !== 'function')
    throw new Error('เอนจินไม่มี flipCamera');

  /* ฝั่ง UI ต้องมีปุ่มและ CSS ที่ปิดมิเรอร์เมื่อใช้กล้องหลัง */
  const lab = fs.readFileSync(path.join(ROOT, 'js/views/lab.js'), 'utf8');
  if (!lab.includes('data-flip')) throw new Error('ไม่มีปุ่มสลับกล้องในห้องฝึก');
  if (!/hasMultipleCameras\(\)/.test(lab)) throw new Error('ไม่ได้ซ่อนปุ่มเมื่อมีกล้องตัวเดียว');
  const css = fs.readFileSync(path.join(ROOT, 'css/components.css'), 'utf8');
  if (!css.includes('[data-mirror="0"] video{transform:none}'))
    throw new Error('CSS ไม่ได้ปิดมิเรอร์ตอนใช้กล้องหลัง');
});

await check('ธีมเขียว–ขาว สลับได้และคอนทราสต์ผ่านเกณฑ์', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/theme.css'), 'utf8');
  const skin = css.slice(css.indexOf('[data-skin="green"]{'));
  if (!skin) throw new Error('ไม่มีสกินเขียวใน theme.css');

  const val = name => {
    // ใช้ [^#]* แทน \s* เพราะระยะเว้นวรรคจัดคอลัมน์ในไฟล์ไม่คงที่
    const m = skin.match(new RegExp('--' + name + ':[^#]*#([0-9A-Fa-f]{6})'));
    if (!m) throw new Error('หา token --' + name + ' ในสกินไม่เจอ');
    return m[1];
  };
  const lin = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  const lum = hex => { const [r, g, b] = lin(hex); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
                            return (x + .05) / (y + .05); };

  /* สเกล 50–300 ต้องยังสว่างกว่า 700–950 เสมอ
     เพราะโค้ดใช้ช่วงอ่อนเป็นตัวหนังสือบนพื้นเข้มของ hero กับแถบข้าง
     ถ้าใครกลับด้าน ตัวหนังสือจะจมหายไปทั้งแถบ (เคยพลาดมาแล้วตอนทำธีมมืด) */
  const light = ['blue-50', 'blue-100', 'blue-200', 'blue-300'].map(n => lum(val(n)));
  const dark  = ['blue-700', 'blue-800', 'blue-900', 'blue-950'].map(n => lum(val(n)));
  if (Math.min(...light) <= Math.max(...dark))
    throw new Error('สเกลสีกลับด้าน: โทน 50–300 ต้องสว่างกว่า 700–950 เสมอ');

  /* ธีมนี้พื้นสว่าง ตัวหนังสือหลักจึงต้องเข้ม */
  if (lum(val('ink')) > 0.2)  throw new Error('สีตัวหนังสือหลักต้องเข้มบนพื้นสว่าง');
  if (lum(val('bg')) < 0.7)   throw new Error('พื้นหลังต้องสว่าง');

  /* ปุ่มหลักเป็นพื้นเขียวตัวหนังสือขาว เขียวกลาง ๆ มักตกเกณฑ์ตรงนี้ */
  const onBrand = ratio('FFFFFF', val('blue-600'));
  if (onBrand < 4.5)
    throw new Error(`ตัวหนังสือขาวบนปุ่มเขียวคอนทราสต์แค่ ${onBrand.toFixed(2)} ต้องได้ 4.5 ขึ้นไป`);

  /* ตัวหนังสือเนื้อหาบนพื้นหลักต้องอ่านง่าย */
  const body = ratio(val('ink'), val('surface'));
  if (body < 7) throw new Error(`ตัวหนังสือบนพื้นการ์ดคอนทราสต์แค่ ${body.toFixed(2)}`);

  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  if (!app.includes('applySkin()')) throw new Error('ไม่ได้ทาธีมตอนบูต');
  if (!app.includes('data-skin')) throw new Error('ไม่มีปุ่มสลับธีมในเมนูผู้ใช้');
});
await check('ชั้นเรียนตัวอย่างอ้างทักษะที่มีจริง และมีเนื้อหารองรับครบ', async () => {
  const CM = await import(url('js/data/community.js'));
  const S2 = await import(url('js/data/standards.js'));
  const c = CM.COHORT;

  if (!T.hasTrack(c.track)) throw new Error(`ห้องตัวอย่างอ้าง track "${c.track}" ที่ไม่มีอยู่จริง`);
  const ids = T.skillsOf(c.track).map(s => s.id);

  /* จุดอ่อนของนักศึกษาต้องเป็นรหัสทักษะของ track นั้น ไม่งั้นหน้าครูจะโชว์รหัสดิบ */
  for (const s of c.students)
    if (!ids.includes(s.weak))
      throw new Error(`${s.name}: จุดอ่อน "${s.weak}" ไม่ใช่ทักษะของ ${c.track}`);

  /* ค่าเฉลี่ยของห้องต้องครบทุกทักษะ ไม่งั้นเรดาร์เทียบชั้นเรียนจะขาดแกน */
  for (const id of ids)
    if (typeof c.classMastery[id] !== 'number')
      throw new Error(`classMastery ขาดทักษะ ${id}`);
  for (const k of Object.keys(c.classMastery))
    if (!ids.includes(k)) throw new Error(`classMastery มี ${k} ที่ไม่ใช่ทักษะของ track นี้`);

  /* ทุกทักษะต้องมีข้อสอบ ไม่งั้นแผนซ่อมจุดอ่อนจะสั่งให้ทำข้อสอบที่ไม่มี */
  const qSkills = new Set(Q.byTrack(c.track).map(q => q.skill));
  const noQ = ids.filter(id => !qSkills.has(id));
  if (noQ.length) throw new Error('ทักษะที่ยังไม่มีข้อสอบ: ' + noQ.join(', '));

  /* หน้าครูเรียก drillsFor(track) มาแนะนำบทฝึก ถ้าว่างเปล่าจะแนะนำอะไรไม่ได้ */
  if (!D.drillsFor(c.track).length)
    throw new Error('track ของห้องตัวอย่างไม่มีบทฝึกหน้ากล้องเลย');

  /* ห้องตัวอย่างควรผูกกับเกณฑ์มาตรฐานจริง เพื่อให้หน้าเส้นทางมีที่มาอ้างอิง */
  if (!S2.standardForTrack(c.track))
    throw new Error('track ของห้องตัวอย่างยังไม่ผูกกับเกณฑ์มาตรฐานใด');
});

await check('เครื่องจำลองอาการเสีย: ผลวงจรถูกต้องและให้คะแนนวิธีไล่ ไม่ใช่แค่คำตอบ', async () => {
  const FS = await import(url('js/engine/faultsim.js'));
  const CIR = await import(url('js/data/circuits.js'));
  const circuit = CIR.CIRCUITS[0];
  const mk = id => { const s = new FS.FaultSession({}); s.fault = circuit.faults.find(f => f.id === id); return s; };

  /* ไฟต้องหายหลังจุดที่เสีย ไม่ใช่ก่อนหน้า — เป็นหัวใจของการไล่ */
  const f = mk('fuse_blown');
  f.pressStart();
  if (f.voltageAt('TP1') !== circuit.supply) throw new Error('ก่อนจุดเสียต้องยังมีไฟ');
  if (f.voltageAt('TP2') !== 0) throw new Error('หลังจุดเสียต้องไม่มีไฟ');

  /* อาการที่แยกจากกันด้วยพฤติกรรม ไม่ใช่แค่แรงดัน */
  const aux = mk('aux_open'); aux.pressStart(true);
  if (!aux.motorRunning) throw new Error('หน้าสัมผัสช่วยเสีย ตอนกดค้างมอเตอร์ต้องหมุน');
  aux.releaseStart();
  if (aux.motorRunning) throw new Error('ปล่อยปุ่มแล้วต้องหยุด เพราะไม่มีวงจรค้าง');

  const weld = mk('weld_contact'); weld.pressStop();
  if (!weld.motorRunning) throw new Error('หน้าสัมผัสละลายติด กดสตอปแล้วต้องยังหมุน');

  const mo = mk('motor_open'); mo.pressStart();
  if (!mo.contactorOn) throw new Error('ขดลวดมอเตอร์ขาด คอนแทคเตอร์ต้องยังดูด');
  if (mo.motorRunning) throw new Error('ขดลวดขาด มอเตอร์ต้องไม่หมุน');

  /* ความปลอดภัยต้องมีน้ำหนักจริง ไม่ใช่หักแค่นิดเดียว */
  const safe = mk('fuse_blown');
  ['TP3','TP1','TP2'].forEach(t => safe.measure(t));
  safe.isolate(); safe.contactWork('check_wire'); safe.submit('fuse_blown');

  const unsafe = mk('fuse_blown');
  ['TP3','TP1','TP2'].forEach(t => unsafe.measure(t));
  unsafe.contactWork('check_wire'); unsafe.submit('fuse_blown');

  if (unsafe.finished.safetyViolations !== 1) throw new Error('ไม่ได้จับว่าแตะวงจรก่อนตัดไฟ');
  if (unsafe.score() > FS.FaultSession.UNSAFE_CAP)
    throw new Error(`แตะวงจรก่อนตัดไฟแล้วยังได้ ${unsafe.score()} เกินเพดาน`);
  if (safe.score() <= unsafe.score()) throw new Error('ทำถูกขั้นตอนต้องได้คะแนนสูงกว่า');

  /* ตอบผิดแต่ไล่เป็นระบบ ต้องยังได้แต้มบ้าง เพื่อไม่ให้ท้อ */
  const wrong = mk('aux_open'); wrong.measure('TP2'); wrong.submit('coil_open');
  if (wrong.score() <= 0) throw new Error('ตอบผิดแต่ไล่ถูกทางควรได้แต้มบ้าง');
  if (wrong.score() >= safe.score()) throw new Error('ตอบผิดต้องได้น้อยกว่าตอบถูก');

  /* ความยากต้องกระจาย ไม่งั้นเลือกให้เหมาะกับระดับผู้เรียนไม่ได้ */
  const bs = circuit.faults.map(x => x.b);
  if (Math.max(...bs) - Math.min(...bs) < 2)
    throw new Error('ช่วงความยากของอาการเสียแคบเกินกว่าจะปรับตามระดับผู้เรียน');
  for (const fl of circuit.faults){
    if (!fl.fix) throw new Error(`อาการ ${fl.id} ไม่มีวิธีแก้บอกผู้เรียน`);
    if (!circuit.symptomsByFault[fl.id]) throw new Error(`อาการ ${fl.id} ไม่มีคำบรรยายอาการ`);
  }
});


console.log(fails ? `\n${fails} FAILURE(S)\n` : '\nall green\n');
process.exit(fails ? 1 : 0);
