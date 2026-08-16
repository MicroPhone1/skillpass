/* ============================================================
   engine/faultsim.js — เครื่องจำลองอาการเสียของวงจร

   สามอย่างที่เอนจินนี้ทำ
   1) สุ่มโจทย์อาการเสียให้เหมาะกับระดับผู้เรียน (adaptive difficulty)
   2) ตอบผลของทุกการกระทำแบบทันที — วัดไฟจุดไหนได้เท่าไร กดปุ่มแล้วเกิดอะไร
   3) บันทึก "ลำดับการตัดสินใจ" ไว้ทั้งหมด เพื่อวิเคราะห์ทีหลังว่า
      ไล่เป็นระบบไหม ข้ามขั้นความปลอดภัยหรือเปล่า

   จงใจให้ผลลัพธ์คำนวณแบบกำหนดได้ (deterministic) ไม่พึ่งโมเดล AI
   เพราะการให้คะแนนต้องยุติธรรมและอธิบายได้ทุกครั้ง
   AI เอาไว้ใช้ตอนตั้งคำถามชี้แนะเท่านั้น
   ============================================================ */

import { circuitById, faultById } from '../data/circuits.js';

/** เลือกอาการเสียที่ความยากใกล้กับความสามารถผู้เรียนที่สุด
    เว้นข้อที่เพิ่งเจอไป เพื่อไม่ให้ได้โจทย์เดิมซ้ำติดกัน */
export function pickFault(circuit, ability = 0, recent = []){
  const pool = circuit.faults.filter(f => !recent.includes(f.id));
  const list = pool.length ? pool : circuit.faults;
  /* เลือกแบบสุ่มถ่วงน้ำหนัก ไม่ใช่เอาตัวใกล้ที่สุดตรง ๆ
     ไม่งั้นผู้เรียนที่ระดับเท่าเดิมจะได้โจทย์ซ้ำเดิมทุกครั้ง */
  const weights = list.map(f => 1 / (1 + Math.abs(f.b - ability)));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++){
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

export class FaultSession{
  /**
   * @param {object} opts
   * @param {string} opts.circuitId
   * @param {number} opts.ability   ความสามารถปัจจุบันของผู้เรียน (-2..2)
   * @param {string[]} opts.recent  รหัสอาการที่เพิ่งเจอไป
   */
  constructor({ circuitId = 'dol_starter', ability = 0, recent = [] } = {}){
    this.circuit = circuitById(circuitId);
    this.fault = pickFault(this.circuit, ability, recent);
    this.startedAt = Date.now();
    this.log = [];              // ลำดับการกระทำทั้งหมด
    this.holdingStart = false;  // กำลังกดปุ่มสตาร์ทค้างอยู่ไหม
    this.latched = false;       // คอนแทคเตอร์ค้างทำงานอยู่ไหม
    this.powerIsolated = false; // ตัดแยกพลังงานแล้วหรือยัง
    this.finished = null;
  }

  /* ---------------------------------------------------- สถานะวงจร */

  /** ดัชนีของอุปกรณ์ตัวแรกในโซ่ที่เปิดวงจร — หลังจากนี้ไฟจะเป็น 0 */
  breakIndex(){
    const f = this.fault.id;
    const ch = this.circuit.chain;
    for (let i = 0; i < ch.length; i++){
      const el = ch[i];
      if (el.openWhen?.includes(f)) return i;
      if (el.openOnPress === 'stop' && this.pressingStop) return i;
      if (el.latch){
        // จุดนี้ต่อได้เมื่อกดสตาร์ทอยู่ หรือวงจรค้างทำงานอยู่
        const closed = this.holdingStart || this.latched;
        if (!closed) return i;
      }
    }
    return -1;                  // ไม่มีจุดขาด ไฟถึงคอยล์ครบ
  }

  /** คอนแทคเตอร์ดูดอยู่หรือไม่ ณ ขณะนี้ */
  get contactorOn(){
    if (this.fault.stuckOn) return true;           // หน้าสัมผัสละลายติด
    if (this.fault.id === 'coil_open') return false;
    return this.breakIndex() === -1;
  }

  /** มอเตอร์หมุนหรือไม่ */
  get motorRunning(){
    if (this.fault.motorRuns === false) return false;
    return this.contactorOn;
  }

  /** แรงดันที่จุดวัดหนึ่ง (โวลต์) */
  voltageAt(tp){
    const ch = this.circuit.chain;
    const idx = ch.findIndex(el => el.tp === tp);
    if (idx < 0) return null;
    const brk = this.breakIndex();
    // จุดวัดอยู่ "หลัง" อุปกรณ์ตัวนั้น ถ้าจุดขาดอยู่ก่อนหน้าหรือที่ตัวนี้ ไฟจะหาย
    const live = brk === -1 || idx < brk;
    return live ? this.circuit.supply : 0;
  }

  /* ---------------------------------------------------- การกระทำ */

  _push(type, detail, result){
    this.log.push({ t: Date.now() - this.startedAt, type, detail, result });
    return result;
  }

  /** ดูอาการเบื้องต้น ไม่ต้องแตะอะไร */
  observe(){
    const s = this.circuit.symptomsByFault[this.fault.id] || 'กดสตาร์ทแล้วไม่ทำงานตามปกติ';
    return this._push('observe', '', s);
  }

  pressStart(hold = true){
    this.holdingStart = hold;
    if (hold && this.breakIndex() === -1 && !this.fault.latchBroken) this.latched = true;
    const r = { contactor: this.contactorOn, motor: this.motorRunning };
    return this._push('press_start', hold ? 'กดค้าง' : 'แตะแล้วปล่อย', r);
  }

  releaseStart(){
    this.holdingStart = false;
    if (this.fault.latchBroken) this.latched = false;   // ไม่มีวงจรค้าง
    const r = { contactor: this.contactorOn, motor: this.motorRunning };
    return this._push('release_start', '', r);
  }

  pressStop(){
    this.pressingStop = true;
    this.latched = false;
    const r = { contactor: this.contactorOn, motor: this.motorRunning };
    this.pressingStop = false;
    return this._push('press_stop', '', r);
  }

  /** วัดแรงดันที่จุดวัด — การกระทำหลักของการไล่หาจุดเสีย */
  measure(tp){
    const v = this.voltageAt(tp);
    if (v === null) return this._push('measure', tp, { error: 'ไม่มีจุดวัดนี้' });
    return this._push('measure', tp, { volts: v });
  }

  /** ตัดแยกพลังงาน — ต้องทำก่อนงานที่ต้องแตะวงจรทุกครั้ง */
  isolate(){
    this.powerIsolated = true;
    this.latched = false;
    return this._push('loto', '', { isolated: true });
  }

  /**
   * งานที่ต้องแตะวงจร เช่น เปิดฝาตู้ ขันสาย วัดความต้านทาน
   * ถ้ายังไม่ตัดไฟ จะบันทึกเป็นการละเมิดความปลอดภัย
   */
  contactWork(workId){
    const unsafe = !this.powerIsolated;
    return this._push('contact', workId, { unsafe });
  }

  /** สรุปว่าอาการเสียคืออะไร — จบเกม */
  submit(faultId){
    const correct = faultId === this.fault.id;
    const guess = faultById(this.circuit, faultId);
    this.finished = {
      correct,
      answered: guess?.name || faultId,
      actual: this.fault,
      seconds: Math.round((Date.now() - this.startedAt) / 1000),
      ...this.analyse(),
    };
    this._push('submit', faultId, { correct });
    return this.finished;
  }

  /* ---------------------------------------------------- วิเคราะห์เส้นทาง */

  /**
   * วิเคราะห์ "วิธีไล่" ไม่ใช่แค่ "ตอบถูกไหม"
   * นี่คือส่วนที่แยกคนที่เข้าใจระบบ ออกจากคนที่เดาถูก
   */
  analyse(){
    const measures = this.log.filter(a => a.type === 'measure');
    const tps = this.circuit.chain.map(el => el.tp);
    const idxOf = tp => tps.indexOf(tp);

    /* เป็นระบบไหม — วัดแล้วช่วงที่ยังไม่รู้ผลแคบลงทุกครั้งหรือไม่
       ช่างที่ไล่เป็นจะแบ่งครึ่งหรือไล่ตามทางเดินไฟ ไม่ใช่สุ่มจิ้ม */
    let lo = 0, hi = tps.length - 1, narrowing = 0;
    for (const m of measures){
      const i = idxOf(m.detail);
      if (i < lo || i > hi){ continue; }          // วัดนอกช่วงที่เหลือ = ไม่ได้ข้อมูลใหม่
      narrowing++;
      if (m.result?.volts > 0) lo = i + 1; else hi = i - 1;
    }
    const systematic = measures.length ? narrowing / measures.length : 0;

    /* ประสิทธิภาพ — เทียบกับจำนวนครั้งที่น้อยที่สุดที่ทำได้ด้วยการแบ่งครึ่ง */
    const ideal = Math.max(1, Math.ceil(Math.log2(tps.length)));
    const efficiency = measures.length ? Math.min(1, ideal / measures.length) : 0;

    /* ความปลอดภัย — แตะวงจรก่อนตัดไฟถือว่าผิด ไม่ว่าจะตอบถูกหรือไม่ */
    const violations = this.log.filter(a => a.type === 'contact' && a.result?.unsafe);

    return {
      measures: measures.length,
      idealMeasures: ideal,
      systematic: +systematic.toFixed(2),
      efficiency: +efficiency.toFixed(2),
      safetyViolations: violations.length,
      unsafeWork: violations.map(v => v.detail),
      isolatedFirst: this.powerIsolated,
    };
  }

  /** เพดานคะแนนเมื่อมีการแตะวงจรก่อนตัดไฟ
      ในสนามสอบจริงข้อนี้คือตกทั้งสถานี ระบบฝึกจึงต้องส่งสัญญาณให้แรงพอ
      แต่ไม่ตัดเป็นศูนย์ เพราะผู้เรียนยังต้องเห็นว่าการไล่ของตัวเองดีแค่ไหน */
  static UNSAFE_CAP = 45;

  /** คะแนนรวม 0..100 — ตอบถูกเป็นฐาน แล้วบวกจากวิธีไล่ */
  score(){
    const a = this.finished || { correct: false, ...this.analyse() };
    if (!a.correct) return Math.round(15 * a.systematic);      // ตอบผิดยังได้แต้มถ้าไล่เป็นระบบ

    let s = 55 + 20 * a.efficiency;
    /* โบนัสความเป็นระบบต้องมีข้อมูลพอจะพิสูจน์ได้
       วัดจุดเดียวแล้วตอบถูกอาจเป็นการเดา ไม่ใช่การไล่ */
    if (a.measures >= 2) s += 15 * a.systematic;
    s += a.safetyViolations ? 0 : 10;

    if (a.safetyViolations) s = Math.min(s, FaultSession.UNSAFE_CAP);
    return Math.round(Math.min(100, s));
  }

  /** ข้อความสรุปที่บอกว่าควรปรับอะไร — ใช้เป็นฟีดแบ็กหลังจบ */
  coaching(){
    const a = this.finished || this.analyse();
    const out = [];
    if (a.safetyViolations)
      out.push({ tone:'bad', text:`แตะวงจร ${a.safetyViolations} ครั้งก่อนตัดแยกพลังงาน — ` +
        'ในงานจริงคือจุดที่เกิดอุบัติเหตุมากที่สุด ต้องล็อกและวัดยืนยันก่อนเสมอ' });
    if (a.measures > a.idealMeasures * 2)
      out.push({ tone:'warn', text:`วัดไป ${a.measures} จุด ทั้งที่ใช้เพียง ${a.idealMeasures} จุดก็พอ — ` +
        'ลองแบ่งครึ่งวงจรก่อน แล้วค่อยไล่เข้าไปในครึ่งที่ไฟหาย' });
    if (a.systematic < 0.6)
      out.push({ tone:'warn', text:'ลำดับการวัดยังกระโดดไปมา — ' +
        'ไล่ตามทางเดินไฟจากต้นทางไปปลายทาง จะตัดความเป็นไปได้ทีละครึ่ง' });
    if (!out.length)
      out.push({ tone:'ok', text:'ไล่เป็นระบบและปลอดภัยครบทุกขั้น รักษาวิธีนี้ไว้' });
    return out;
  }
}
