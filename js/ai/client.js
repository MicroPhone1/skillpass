/* ============================================================
   ai/client.js — ตัวเชื่อมกับ AI gateway ฝั่งเซิร์ฟเวอร์
   ------------------------------------------------------------
   หลักการที่ยึดไว้ทั้งไฟล์: AI เป็น "ของเสริม" ไม่ใช่ "ของที่ขาดไม่ได้"
   ถ้า gateway ล่ม ไม่มีคีย์ หรือโควตาหมด ทุกฟีเจอร์ต้องยังทำงานได้
   ด้วยเอนจินในเครื่องเหมือนเดิม ผู้ใช้แค่ได้คำตอบที่ยืดหยุ่นน้อยลง
   ============================================================ */

const BASE = '/api/ai';
const TIMEOUT = 45000;

/* สถานะที่ตรวจได้จาก /api/ai/health — แคชไว้ ไม่ต้องถามซ้ำทุกครั้ง */
let statusCache = null;
let statusPromise = null;
const listeners = new Set();

/** แจ้งทุกส่วนที่สนใจเมื่อสถานะ AI เปลี่ยน (เช่น โควตาหมดกลางคัน) */
export const onStatusChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(statusCache); } catch {} });

function setStatus(next){
  const before = statusCache?.ok;
  statusCache = next;
  if (before !== next?.ok) emit();
  return next;
}

const OFFLINE = { ok:false, provider:'offline', model:'', roles:[], reason:'unreachable' };

/** ถาม gateway ว่าพร้อมใช้ไหม (แคชผลไว้จนกว่าจะสั่ง refresh) */
export function status({ refresh = false } = {}){
  if (statusCache && !refresh) return Promise.resolve(statusCache);
  if (statusPromise && !refresh) return statusPromise;

  statusPromise = fetch(`${BASE}/health`, { cache:'no-store' })
    .then(r => (r.ok ? r.json() : OFFLINE))
    .catch(() => OFFLINE)                       // เปิดผ่าน file:// หรือเซิร์ฟเวอร์เก่าที่ไม่มี /api
    .then(setStatus)
    .finally(() => { statusPromise = null; });

  return statusPromise;
}

/** true เมื่อเรียกโมเดลจริงได้ — ใช้ตัดสินใจว่าจะใช้ AI หรือเอนจินในเครื่อง */
export const available = () => status().then(s => !!s?.ok);

/** สถานะล่าสุดแบบไม่ต้องรอ (อาจเป็น null ถ้ายังไม่เคยเช็ก) */
export const lastStatus = () => statusCache;

/* ------------------------------------------------------------ การเรียกใช้ */

const MESSAGES = {
  'no-provider': 'ยังไม่ได้ตั้งค่า AI — ใช้เอนจินในเครื่องแทน',
  'rate-limit':  'ใช้โควตา AI ถี่เกินไป รอสักครู่แล้วลองใหม่',
  'bad-key':     'API key ไม่ถูกต้อง — ตรวจไฟล์ .env',
  'billing':     'โปรเจกต์ของ API key เครดิตหมด — ต้องสร้างคีย์ใหม่ในโปรเจกต์ที่ไม่ผูกบิล',
  'offline':     'ต่ออินเทอร์เน็ตไม่ได้ — ใช้เอนจินในเครื่องแทน',
  'timeout':     'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง',
  'blocked':     'โมเดลปฏิเสธที่จะตอบคำถามนี้',
  'bad-json':    'AI ตอบกลับในรูปแบบที่อ่านไม่ได้',
  'unreachable': 'ต่อกับเซิร์ฟเวอร์ AI ไม่ได้',
  'ollama-down': 'ยังไม่ได้เปิดโปรแกรม Ollama — ใช้เอนจินในเครื่องแทน',
  'model-missing':'ยังไม่ได้ดึงโมเดลลงเครื่อง (ollama pull …)',
  'empty':       'โมเดลตอบว่าง ลองใหม่อีกครั้ง',
};
export const describe = err => MESSAGES[err] || 'เรียก AI ไม่สำเร็จ';

/**
 * เรียก AI ตามบทบาท
 * @param {string} role   ต้องตรงกับบทบาทที่ประกาศไว้ใน aigateway.py
 * @param {object} input  ข้อมูลล้วน ๆ (ไม่ใช่คำสั่ง) ที่จะถูกเติมลง template ฝั่งเซิร์ฟเวอร์
 * @returns {Promise<{ok, data?, error?, message?}>}  ไม่ throw — ผู้เรียกเช็ก .ok เอง
 */
export async function run(role, input, { signal } = {}){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  signal?.addEventListener('abort', () => ctl.abort(), { once:true });

  try{
    const res = await fetch(BASE, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ role, input }),
      signal: ctl.signal,
    });

    if (!res.ok) return { ok:false, error:'unreachable', message: describe('unreachable') };

    const out = await res.json();
    // โควตาหมดหรือคีย์เสีย = สถานะเปลี่ยน ต้องบอกส่วนอื่นให้ซ่อนป้าย "AI พร้อม"
    if (!out.ok && ['no-provider', 'bad-key', 'billing'].includes(out.error)){
      setStatus({ ...(statusCache || OFFLINE), ok:false, reason: out.error });
    }
    if (!out.ok && !out.message) out.message = describe(out.error);
    return out;

  }catch(e){
    const err = e.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { ok:false, error: err, message: describe(err) };
  }finally{
    clearTimeout(timer);
  }
}

/**
 * เรียก AI แต่ถ้าไม่สำเร็จให้ถอยไปใช้ฟังก์ชันสำรองในเครื่อง
 * รูปแบบนี้ทำให้จุดเรียกใช้ไม่ต้องเขียน if/else ซ้ำทุกที่
 *
 * @param {string}   role
 * @param {object}   input
 * @param {Function} fallback  () => ผลลัพธ์แบบเดียวกันจากเอนจินในเครื่อง
 * @param {Function} [adapt]   (data) => แปลงผลจาก AI ให้เป็นรูปเดียวกับ fallback
 */
export async function withFallback(role, input, fallback, adapt = x => x){
  if (!(await available())) return { source:'local', value: fallback() };

  const res = await run(role, input);
  if (!res.ok) return { source:'local', value: fallback(), error: res.error, message: res.message };

  try{
    return { source:'ai', value: adapt(res.data), meta: res.meta };
  }catch{
    // AI ตอบมาแต่รูปแบบไม่ตรงที่คาด — ถือว่าใช้ไม่ได้ ดีกว่าปล่อยให้หน้าจอพัง
    return { source:'local', value: fallback(), error:'bad-shape', message: describe('bad-json') };
  }
}
