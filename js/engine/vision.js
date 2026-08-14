/* ============================================================
   engine/vision.js — Practice Lab engine (กล้อง + ไมโครโฟนจริง)
   ------------------------------------------------------------
   ทำงานด้วย Canvas 2D ล้วน ไม่พึ่งไลบรารีภายนอก:

   1) ย่อภาพจากกล้องลงเป็น 160×120 (มิเรอร์ให้ตรงกับที่ผู้ใช้เห็น)
   2) แปลงเป็นเกรย์สเกล แล้วหา "ผลต่างระหว่างเฟรม" = พลังงานการเคลื่อนไหว
   3) จากสัญญาณนี้ต่อยอดเป็น 5 โหมดวิเคราะห์:
        tempo    — หาจุดยอดของสัญญาณ → นับจังหวะ/นาที + ความสม่ำเสมอ
        steady   — เทียบกับฉากหลังที่คาลิเบรตไว้ → วัดการสั่นในกรอบ
        zone     — พลังงานการเคลื่อนไหวรายโซน → ตอบสนองคำสั่ง
        sequence — เหมือน zone แต่ตรวจ "ลำดับ" ของการแตะโซน
        frame    — การกระจายพลังงาน → อยู่ในกรอบไหม / โยกตัวแค่ไหน
      และอีกหนึ่งโหมดใช้ไมโครโฟน:
        voice    — Web Audio วัด envelope → ความเร็วพูด + สัดส่วนการหยุด

   ข้อจำกัดที่ตั้งใจให้ชัดเจน: นี่คือ heuristic computer vision
   ระดับ prototype ไม่ใช่การรู้จำท่าทาง (pose estimation) จริง
   เวอร์ชันจริงควรต่อยอดด้วย MediaPipe Pose/Hands หรือโมเดล YOLO
   ============================================================ */

const W = 160, H = 120;               // ความละเอียดของภาพที่ใช้วิเคราะห์
const FPS = 15;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std  = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

/* ============================================================
   ตัวช่วย: เปิดกล้อง / ไมค์ พร้อมข้อความผิดพลาดภาษาไทย
   ============================================================ */
export async function openCamera(){
  if (!navigator.mediaDevices?.getUserMedia){
    throw new Error(location.protocol === 'https:' || location.hostname === 'localhost'
      ? 'เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง'
      : 'เบราว์เซอร์อนุญาตให้ใช้กล้องเฉพาะเมื่อเปิดผ่าน HTTPS หรือ localhost เท่านั้น — ลองรัน serve.py แล้วเปิดลิงก์ https ที่แสดงในหน้าต่างคำสั่ง');
  }
  try{
    return await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'user', width:{ ideal:640 }, height:{ ideal:480 } },
      audio:false,
    });
  }catch(e){
    if (e.name === 'NotAllowedError') throw new Error('คุณยังไม่ได้อนุญาตให้ใช้กล้อง — กดไอคอนกล้องบนแถบที่อยู่เว็บแล้วเลือก "อนุญาต"');
    if (e.name === 'NotFoundError')   throw new Error('ไม่พบกล้องบนอุปกรณ์นี้');
    if (e.name === 'NotReadableError')throw new Error('กล้องถูกโปรแกรมอื่นใช้งานอยู่ ลองปิดแอปที่ใช้กล้องแล้วลองใหม่');
    throw new Error('เปิดกล้องไม่สำเร็จ: ' + e.message);
  }
}

export async function openMic(){
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('เบราว์เซอร์นี้ไม่รองรับไมโครโฟน (ต้องเปิดผ่าน HTTPS หรือ localhost)');
  try{
    return await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } });
  }catch(e){
    if (e.name === 'NotAllowedError') throw new Error('คุณยังไม่ได้อนุญาตให้ใช้ไมโครโฟน');
    throw new Error('เปิดไมโครโฟนไม่สำเร็จ: ' + e.message);
  }
}

/* ============================================================
   PracticeEngine
   ============================================================ */
export class PracticeEngine{
  /**
   * @param {object} drill  จาก data/drills.js
   * @param {object} io     { video, overlay, onTick, onEvent, onDone }
   */
  constructor(drill, io){
    this.drill = drill;
    this.cfg   = drill.config || {};
    this.mode  = drill.mode;
    this.io    = io;

    this.work  = document.createElement('canvas');
    this.work.width = W; this.work.height = H;
    this.wctx  = this.work.getContext('2d', { willReadFrequently:true });

    this.prev = null;        // เกรย์สเกลเฟรมก่อนหน้า
    this.base = null;        // ฉากหลังที่คาลิเบรตไว้ (โหมด steady)
    this.running = false;
    this.phase = 'idle';     // idle | calibrate | run | done
    this.t0 = 0;

    /* --- สถานะร่วม --- */
    this.signal   = [];      // พลังงานการเคลื่อนไหวรวมต่อเฟรม
    this.events   = [];
    this.cue      = null;

    /* --- tempo --- */
    this.peaks    = [];      // timestamp ของจุดยอด
    this.emaFast = 0; this.emaSlow = 0; this.armed = false;

    /* --- steady --- */
    this.jitter = []; this.present = []; this.inBox = [];

    /* --- zone / sequence --- */
    this.zoneHold = {};      // zoneId -> เฟรมที่ค้างต่อเนื่อง
    this.step = 0;
    this.round = 0;
    this.roundStart = 0;
    this.hits = [];          // { ok, ms, expected, got }
    this.orderErrors = 0;

    /* --- frame --- */
    this.cx = []; this.cy = [];

    /* --- voice --- */
    this.rms = []; this.voicePeaks = 0; this.voiceArmed = false;
  }

  get duration(){ return this.cfg.duration || 30; }
  get elapsed(){ return this.t0 ? (performance.now() - this.t0) / 1000 : 0; }

  /* ---------------------------------------------------- lifecycle */
  async start(){
    if (this.mode === 'voice') return this.startVoice();

    this.stream = await openCamera();
    const v = this.io.video;
    v.srcObject = this.stream;
    v.muted = true; v.playsInline = true;
    await v.play();

    this.running = true;
    this.frames = 0;

    // โหมด steady ต้องจำฉากหลังก่อน 2 วินาที
    if (this.mode === 'steady'){
      this.phase = 'calibrate';
      this.calibStart = performance.now();
      this.emit('cue', { text:'ให้กรอบว่างไว้ก่อน — ระบบกำลังจำฉากหลัง', tone:'' });
    }else{
      this.beginRun();
    }
    this.loop();
  }

  beginRun(){
    this.phase = 'run';
    this.t0 = performance.now();
    if (this.mode === 'zone') this.nextPrompt();
    if (this.mode === 'sequence') this.emitStep();
    if (this.mode === 'steady')  this.emit('cue', { text:'ถือให้นิ่งในกรอบ', tone:'' });
    if (this.mode === 'tempo')   this.emit('cue', { text:'เริ่มได้เลย — ทำเป็นจังหวะสม่ำเสมอ', tone:'' });
    if (this.mode === 'frame')   this.emit('cue', { text:'ยืนในกรอบ พูดนำเสนอตามปกติ', tone:'' });
  }

  stop(){
    this.running = false;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._t);
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close?.();
  }

  emit(type, data){ this.io.onEvent?.({ type, ...data }); }

  /* ---------------------------------------------------- main loop */
  loop(){
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => {
      this._t = setTimeout(() => this.loop(), 1000 / FPS);
    });
    try{ this.tick(); }catch(e){ console.error(e); }
  }

  /** ดึงเฟรม → เกรย์สเกล (มิเรอร์ให้ตรงกับที่ผู้ใช้เห็นบนจอ) */
  grab(){
    const v = this.io.video;
    if (!v.videoWidth) return null;
    this.wctx.save();
    this.wctx.scale(-1, 1);
    this.wctx.drawImage(v, -W, 0, W, H);
    this.wctx.restore();
    const d = this.wctx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++){
      g[p] = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255;
    }
    return g;
  }

  tick(){
    const g = this.grab();
    if (!g) return;

    /* ---------- คาลิเบรตฉากหลัง ---------- */
    if (this.phase === 'calibrate'){
      if (!this.base) this.base = Float32Array.from(g);
      else for (let i = 0; i < g.length; i++) this.base[i] = this.base[i] * 0.82 + g[i] * 0.18;
      const left = 2 - (performance.now() - this.calibStart) / 1000;
      this.io.onTick?.({ phase:'calibrate', left: Math.max(0, left) });
      this.drawOverlay({ calib:true });
      if (left <= 0){ this.prev = Float32Array.from(g); this.beginRun(); }
      return;
    }

    /* ---------- ผลต่างระหว่างเฟรม ---------- */
    const diff = new Float32Array(W * H);
    let total = 0;
    if (this.prev){
      for (let i = 0; i < g.length; i++){
        const d = Math.abs(g[i] - this.prev[i]);
        const v = d > 0.055 ? d : 0;          // ตัด noise ของเซ็นเซอร์
        diff[i] = v; total += v;
      }
    }
    this.prev = g;
    const motion = total / (W * H);           // 0..~0.3
    this.signal.push(motion);
    this.frames++;

    const t = this.elapsed;
    let hud = { phase:'run', t, left: Math.max(0, this.duration - t), motion };

    switch (this.mode){
      case 'tempo':    hud = { ...hud, ...this.tickTempo(motion) }; break;
      case 'steady':   hud = { ...hud, ...this.tickSteady(g, diff) }; break;
      case 'zone':     hud = { ...hud, ...this.tickZone(diff) }; break;
      case 'sequence': hud = { ...hud, ...this.tickSequence(diff) }; break;
      case 'frame':    hud = { ...hud, ...this.tickFrame(diff, total) }; break;
    }

    this.io.onTick?.(hud);
    this.drawOverlay(hud);

    const overTime = t >= this.duration;
    const zoneDone = (this.mode === 'zone') && this.round >= (this.cfg.rounds || 6);
    const seqDone  = (this.mode === 'sequence') && this.step >= this.cfg.order.length;
    if (overTime || zoneDone || seqDone) this.finish();
  }

  /* ═══════════════════ โหมด tempo ═══════════════════ */
  tickTempo(motion){
    // แบนด์พาส: EMA เร็ว − EMA ช้า → เอาเฉพาะการแกว่งเป็นจังหวะ
    this.emaFast = this.emaFast * 0.55 + motion * 0.45;
    this.emaSlow = this.emaSlow * 0.94 + motion * 0.06;
    const s = this.emaFast - this.emaSlow;

    const recent = this.signal.slice(-45);
    const noise  = Math.max(std(recent) * 0.85, 0.0016);

    // ตรวจจุดยอดแบบ Schmitt trigger กันนับซ้ำจากการสั่นเล็ก ๆ
    if (!this.armed && s > noise){
      const now = performance.now();
      const last = this.peaks[this.peaks.length - 1] || 0;
      if (now - last > 260){                    // กันเกิน ~230 ครั้ง/นาที
        this.peaks.push(now);
        this.emit('beat', {});
      }
      this.armed = true;
    }else if (this.armed && s < noise * 0.35){
      this.armed = false;
    }

    // BPM จากค่ามัธยฐานของช่วงห่าง 6 จังหวะล่าสุด
    const iv = [];
    for (let i = Math.max(1, this.peaks.length - 6); i < this.peaks.length; i++){
      iv.push(this.peaks[i] - this.peaks[i-1]);
    }
    let bpm = 0;
    if (iv.length >= 2){
      const sorted = [...iv].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      bpm = Math.round(60000 / med);
    }

    const [lo, hi] = this.cfg.targetBpm;
    let tone = '', text = 'กำลังจับจังหวะ…';
    if (bpm){
      if (bpm < lo - 4){ tone = 'warn'; text = `ช้าไป (${bpm}/นาที) — เร่งอีกนิด`; }
      else if (bpm > hi + 4){ tone = 'bad'; text = `เร็วเกินไป (${bpm}/นาที) — ผ่อนลง`; }
      else { tone = 'good'; text = `กำลังดี ${bpm}/นาที`; }
    }
    this.setCue(text, tone);
    return { bpm, reps: this.peaks.length, cueTone: tone };
  }

  /* ═══════════════════ โหมด steady ═══════════════════ */
  tickSteady(g, diff){
    const box = this.cfg.box;
    const r = this.rect(box);

    let fg = 0, jit = 0, n = 0;
    for (let y = r.y0; y < r.y1; y++){
      for (let x = r.x0; x < r.x1; x++){
        const i = y * W + x;
        fg  += Math.abs(g[i] - this.base[i]);
        jit += diff[i];
        n++;
      }
    }
    fg /= n; jit /= n;

    const present = fg > 0.055;
    this.present.push(present ? 1 : 0);
    if (present) this.jitter.push(jit);

    // พลังงานการเคลื่อนไหวนอกกรอบ ใช้บอกว่าอยู่ผิดที่หรือไม่
    let out = 0, on = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) continue;
      out += diff[y * W + x]; on++;
    }
    out /= on;
    this.inBox.push(present && jit >= out * 0.5 ? 1 : 0);

    const max = this.cfg.maxJitter || 0.03;
    const level = clamp(1 - jit / max, 0, 1);          // 1 = นิ่งมาก
    let tone = 'good', text = `นิ่งดี ${Math.round(level*100)}%`;
    if (!present){ tone = 'warn'; text = 'ยังไม่เห็นมือในกรอบ — ยื่นเข้ามาในกรอบ'; }
    else if (level < 0.45){ tone = 'bad'; text = 'สั่นมาก — พิงข้อศอกช่วยพยุง'; }
    else if (level < 0.7){ tone = 'warn'; text = 'เกือบนิ่งแล้ว ผ่อนแรงบีบลงอีกนิด'; }
    this.setCue(text, tone);

    return { steadiness: level, present, cueTone: tone };
  }

  /* ═══════════════════ โหมด zone ═══════════════════ */
  tickZone(diff){
    const energies = this.zoneEnergies(diff);
    const best = this.strongestZone(energies);
    const prompt = this.cfg.prompts[this.round % this.cfg.prompts.length];
    const left = this.cfg.reactSec - (performance.now() - this.roundStart) / 1000;

    if (best && this.holdOk(best.id)){
      const ms = performance.now() - this.roundStart;
      const ok = best.id === prompt.zone;
      this.hits.push({ ok, ms, expected: prompt.zone, got: best.id });
      this.emit(ok ? 'hit' : 'miss', { zone: best.id, ok });
      this.setCue(ok ? 'ถูกต้อง!' : 'ผิดโซน — ดูคำสั่งอีกครั้ง', ok ? 'good' : 'bad');
      this.round++;
      if (this.round < (this.cfg.rounds || 6)) setTimeout(() => this.nextPrompt(), 550);
      return { energies, zoneLeft: 0 };
    }

    if (left <= 0){
      this.hits.push({ ok:false, ms: this.cfg.reactSec * 1000, expected: prompt.zone, got: null });
      this.emit('miss', { zone: null, ok:false, timeout:true });
      this.setCue('หมดเวลาข้อนี้', 'bad');
      this.round++;
      if (this.round < (this.cfg.rounds || 6)) setTimeout(() => this.nextPrompt(), 550);
    }
    return { energies, zoneLeft: Math.max(0, left) };
  }

  nextPrompt(){
    this.roundStart = performance.now();
    this.zoneHold = {};
    const p = this.cfg.prompts[this.round % this.cfg.prompts.length];
    this.setCue(p.text, '');
    this.emit('prompt', { round: this.round, text: p.text, zone: p.zone });
  }

  /* ═══════════════════ โหมด sequence ═══════════════════ */
  tickSequence(diff){
    const energies = this.zoneEnergies(diff);
    const best = this.strongestZone(energies);
    if (!best || !this.holdOk(best.id)) return { energies };

    const expected = this.cfg.order[this.step];
    if (best.id === expected){
      this.hits.push({ ok:true, step:this.step, at:this.elapsed });
      this.emit('step', { index:this.step, ok:true });
      this.setCue(`ขั้นที่ ${this.step + 1} ผ่าน`, 'good');
      this.step++;
      this.zoneHold = {};
      if (this.step < this.cfg.order.length) setTimeout(() => this.emitStep(), 450);
    }else if (this.cfg.order.includes(best.id)){
      this.orderErrors++;
      this.emit('step', { index:this.step, ok:false, got:best.id });
      const name = this.cfg.zones.find(z => z.id === expected)?.name || '';
      this.setCue(`ยังไม่ใช่ขั้นนี้ — ขั้นถัดไปคือ “${name}”`, 'bad');
      this.zoneHold = {};
    }
    return { energies };
  }

  emitStep(){
    const zid = this.cfg.order[this.step];
    const z = this.cfg.zones.find(z => z.id === zid);
    const txt = this.cfg.steps?.[this.step] || z?.name || '';
    this.setCue(`ขั้นที่ ${this.step + 1}: ${txt}`, '');
    this.emit('prompt', { round:this.step, text:txt, zone:zid });
  }

  /* ═══════════════════ โหมด frame ═══════════════════ */
  tickFrame(diff, total){
    const r = this.rect(this.cfg.box);
    let inside = 0, sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const v = diff[y * W + x];
      if (!v) continue;
      sx += x * v; sy += y * v; sw += v;
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) inside += v;
    }
    const ratio = sw > 0.6 ? inside / sw : 1;      // ถ้าแทบไม่ขยับ ถือว่าอยู่ในกรอบ
    this.inBox.push(ratio);

    if (sw > 0.6){
      this.cx.push((sx / sw) / W);
      this.cy.push((sy / sw) / H);
    }

    // การโยกตัว = การกระจายตัวของจุดศูนย์กลางการเคลื่อนไหวในแนวนอน
    const recent = this.cx.slice(-45);
    const sway = recent.length > 8 ? std(recent) : 0;
    const maxS = this.cfg.maxSway || 0.045;
    const swayLevel = clamp(1 - sway / maxS, 0, 1);

    let tone = 'good', text = 'ทรงตัวดีมาก';
    if (ratio < 0.65){ tone = 'warn'; text = 'ออกนอกกรอบ — ขยับกลับเข้ากลางภาพ'; }
    else if (swayLevel < 0.45){ tone = 'bad'; text = 'โยกตัวเยอะ — ลงน้ำหนักสองเท้าให้เท่ากัน'; }
    else if (swayLevel < 0.72){ tone = 'warn'; text = 'เริ่มโยกเล็กน้อย — ยืนให้มั่นคงขึ้น'; }
    this.setCue(text, tone);

    return { inBox: ratio, sway: swayLevel, cueTone: tone };
  }

  /* ═══════════════════ โหมด voice ═══════════════════ */
  async startVoice(){
    this.stream = await openMic();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioCtx = ctx;
    const src = ctx.createMediaStreamSource(this.stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);

    this.running = true;
    this.beginRun();
    this.setCue('เริ่มพูดได้เลย', '');

    const step = () => {
      if (!this.running) return;
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      this.rms.push(rms);

      // ประมาณ noise floor จากค่าเปอร์เซ็นไทล์ล่างของ 3 วินาทีล่าสุด
      const win = this.rms.slice(-45).sort((a, b) => a - b);
      const floor = Math.max(win[Math.floor(win.length * 0.2)] || 0, 0.004);
      const thr = floor * 2.6;

      if (!this.voiceArmed && rms > thr){ this.voicePeaks++; this.voiceArmed = true; }
      else if (this.voiceArmed && rms < thr * 0.62){ this.voiceArmed = false; }

      const t = this.elapsed;
      const speakRatio = this.rms.filter(v => v > thr).length / this.rms.length;
      const sylRate = t > 2 ? this.voicePeaks / t : 0;
      const [lo, hi] = this.cfg.targetSyl;

      let tone = 'good', text = 'จังหวะกำลังดี';
      if (t < 3){ tone = ''; text = 'กำลังฟัง…'; }
      else if (speakRatio < 0.25){ tone = 'warn'; text = 'ยังได้ยินเสียงน้อย — พูดดังขึ้นหรือเข้าใกล้ไมค์'; }
      else if (sylRate > hi){ tone = 'bad'; text = 'พูดเร็วเกินไป — ผ่อนจังหวะลง'; }
      else if (sylRate < lo){ tone = 'warn'; text = 'พูดช้าไปนิด — เพิ่มจังหวะได้'; }
      else if (speakRatio > (this.cfg.maxSpeakRatio || 0.9)){ tone = 'warn'; text = 'พูดรวดไม่หยุด — เว้นจังหวะให้คนฟังคิดตาม'; }
      this.setCue(text, tone);

      this.io.onTick?.({ phase:'run', t, left: Math.max(0, this.duration - t),
        sylRate:+sylRate.toFixed(2), speakRatio, rms, cueTone:tone });

      if (t >= this.duration) return this.finish();
      this._t = setTimeout(step, 1000 / FPS);
    };
    step();
  }

  /* ═══════════════════ ตัวช่วยเรื่องโซน ═══════════════════ */
  rect(box){
    const [x, y, w, h] = box;
    return { x0:Math.floor(x*W), y0:Math.floor(y*H), x1:Math.ceil((x+w)*W), y1:Math.ceil((y+h)*H) };
  }

  zoneEnergies(diff){
    const out = {};
    for (const z of this.cfg.zones){
      const r = this.rect(z.rect);
      let s = 0, n = 0;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++){ s += diff[y*W + x]; n++; }
      out[z.id] = s / (n || 1);
    }
    return out;
  }

  strongestZone(energies){
    let best = null, bv = 0, second = 0;
    for (const [id, v] of Object.entries(energies)){
      if (v > bv){ second = bv; bv = v; best = id; }
      else if (v > second) second = v;
    }
    // ต้องเด่นกว่าโซนรองอย่างชัดเจน และเกินเกณฑ์ขั้นต่ำ
    if (!best || bv < 0.012 || bv < second * 1.6) return null;
    return { id: best, value: bv };
  }

  /** ต้องมีการเคลื่อนไหวในโซนเดิมค้างต่อเนื่องตามเวลาที่กำหนดจึงนับว่า "แตะ" */
  holdOk(zoneId){
    for (const k of Object.keys(this.zoneHold)) if (k !== zoneId) this.zoneHold[k] = 0;
    this.zoneHold[zoneId] = (this.zoneHold[zoneId] || 0) + 1;
    const needFrames = Math.max(2, Math.round((this.cfg.holdSec || 1) * FPS * 0.5));
    if (this.zoneHold[zoneId] >= needFrames){ this.zoneHold[zoneId] = 0; return true; }
    return false;
  }

  setCue(text, tone){
    if (this.cue?.text === text && this.cue?.tone === tone) return;
    this.cue = { text, tone };
    this.emit('cue', this.cue);
  }

  /* ═══════════════════ overlay ═══════════════════ */
  drawOverlay(hud = {}){
    const c = this.io.overlay;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(rect.width * dpr)){
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
    }
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = Math.max(2, 2.4 * dpr);
    ctx.font = `${12 * dpr}px "IBM Plex Sans Thai","Leelawadee UI",sans-serif`;

    const R = ([x, y, bw, bh]) => [x*w, y*h, bw*w, bh*h];

    if (hud.calib){
      const [x, y, bw, bh] = R(this.cfg.box);
      ctx.setLineDash([9*dpr, 7*dpr]);
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.strokeRect(x, y, bw, bh);
      ctx.setLineDash([]);
      return;
    }

    /* กรอบเป้าหมาย (steady / frame) */
    if (this.cfg.box){
      const [x, y, bw, bh] = R(this.cfg.box);
      const good = this.mode === 'steady'
        ? (hud.steadiness ?? 0) > 0.7 && hud.present
        : (hud.inBox ?? 1) > 0.65 && (hud.sway ?? 1) > 0.7;
      ctx.strokeStyle = good ? 'rgba(16,214,160,.95)' : 'rgba(255,255,255,.65)';
      ctx.setLineDash(good ? [] : [10*dpr, 8*dpr]);
      roundRect(ctx, x, y, bw, bh, 14*dpr); ctx.stroke();
      ctx.setLineDash([]);
      if (good){ ctx.fillStyle = 'rgba(16,214,160,.10)'; ctx.fill(); }
    }

    /* โซน (zone / sequence) */
    if (this.cfg.zones){
      const target = this.mode === 'sequence'
        ? this.cfg.order[this.step]
        : this.cfg.prompts?.[this.round % this.cfg.prompts.length]?.zone;
      const doneSet = this.mode === 'sequence'
        ? new Set(this.cfg.order.slice(0, this.step)) : new Set();

      for (const z of this.cfg.zones){
        const [x, y, bw, bh] = R(z.rect);
        const e = hud.energies?.[z.id] || 0;
        const hot = clamp(e / 0.035, 0, 1);
        const isTarget = z.id === target;
        const isDone = doneSet.has(z.id);

        ctx.strokeStyle = isDone ? 'rgba(16,214,160,.9)'
                        : isTarget ? 'rgba(120,170,255,.95)'
                        : 'rgba(255,255,255,.34)';
        ctx.setLineDash(isTarget || isDone ? [] : [7*dpr, 6*dpr]);
        roundRect(ctx, x, y, bw, bh, 12*dpr); ctx.stroke();
        ctx.setLineDash([]);

        if (hot > 0.06){
          ctx.fillStyle = `rgba(120,170,255,${0.10 + hot*0.30})`;
          ctx.fill();
        }else if (isDone){
          ctx.fillStyle = 'rgba(16,214,160,.13)'; ctx.fill();
        }

        // ป้ายชื่อโซน
        const label = z.name;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = isDone ? 'rgba(16,163,127,.92)'
                      : isTarget ? 'rgba(30,72,199,.92)' : 'rgba(7,18,51,.62)';
        roundRect(ctx, x + 6*dpr, y + 6*dpr, tw + 16*dpr, 21*dpr, 10*dpr); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 14*dpr, y + 21*dpr);
      }
    }

    /* แถบพลังงานจังหวะ (tempo) */
    if (this.mode === 'tempo'){
      const n = 60, sig = this.signal.slice(-n);
      const bw = w / n, base = h - 14*dpr, scale = 460 * dpr;
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      sig.forEach((v, i) => {
        const bh = clamp(v * scale, 1, h * 0.28);
        ctx.fillRect(i * bw + 1, base - bh, bw - 2, bh);
      });
    }
  }

  /* ═══════════════════ สรุปผล ═══════════════════ */
  finish(){
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.stop();
    const result = this.score();
    this.io.onDone?.(result);
  }

  score(){
    const R = {}, fb = [], d = this.drill;
    const put = (id, v) => R[id] = clamp(Math.round(v), 0, 100);

    if (this.mode === 'tempo'){
      const [lo, hi] = this.cfg.targetBpm;
      const iv = [];
      for (let i = 1; i < this.peaks.length; i++) iv.push(this.peaks[i] - this.peaks[i-1]);
      const avgBpm = iv.length ? Math.round(60000 / mean(iv)) : 0;
      const cv = iv.length > 2 ? std(iv) / mean(iv) : 1;

      const mid = (lo + hi) / 2, halfW = (hi - lo) / 2;
      put('rate', avgBpm ? 100 - clamp((Math.abs(avgBpm - mid) - halfW) / halfW, 0, 1) * 100 : 0);
      put('steadi', (1 - clamp(cv / 0.28, 0, 1)) * 100);
      put('reps', clamp(this.peaks.length / (this.cfg.minReps || 20), 0, 1) * 100);

      if (!avgBpm) fb.push('ระบบยังจับจังหวะไม่ได้ — ลองขยับให้ชัดขึ้นและอยู่ในเฟรมกล้อง');
      else if (avgBpm > hi) fb.push(`คุณทำเฉลี่ย ${avgBpm} ครั้ง/นาที ซึ่งเร็วกว่าเป้าหมาย ${hi} — ลองใช้เมโทรนอมกำกับ`);
      else if (avgBpm < lo) fb.push(`คุณทำเฉลี่ย ${avgBpm} ครั้ง/นาที ซึ่งช้ากว่าเป้าหมาย ${lo} — เร่งจังหวะขึ้นอีกเล็กน้อย`);
      else fb.push(`อัตราเฉลี่ย ${avgBpm} ครั้ง/นาที อยู่ในช่วงเป้าหมาย ${lo}–${hi} พอดี`);
      if (cv > 0.22) fb.push('จังหวะยังไม่สม่ำเสมอ — นับออกเสียงดัง ๆ จะช่วยได้มาก');
      this.detail = { avgBpm, reps:this.peaks.length, cv:+cv.toFixed(3) };
    }

    if (this.mode === 'steady'){
      const j = this.jitter.length ? mean(this.jitter) : 1;
      const max = this.cfg.maxJitter || 0.03;
      put('stability', (1 - clamp(j / max, 0, 1)) * 100);
      put('inbox', mean(this.inBox.length ? this.inBox : [0]) * 100);
      put('hold', clamp(mean(this.present.length ? this.present : [0]), 0, 1) * 100);

      const lvl = 1 - clamp(j / max, 0, 1);
      if (!this.jitter.length) fb.push('ไม่พบมือในกรอบเลย — ครั้งหน้าลองยื่นเข้ามาให้อยู่ในกรอบตลอดเวลา');
      else if (lvl > 0.8) fb.push('มือนิ่งมาก ระดับนี้พอสำหรับงานที่ต้องการความละเอียดสูง');
      else if (lvl > 0.55) fb.push('ความนิ่งใช้ได้ แต่ยังพัฒนาได้ — ลองพิงข้อศอกกับลำตัวหรือโต๊ะ');
      else fb.push('มือสั่นค่อนข้างมาก — หาจุดพยุงและหายใจออกช้า ๆ ขณะทำงานละเอียด');
      this.detail = { jitter:+j.toFixed(4), holdRatio:+mean(this.present || [0]).toFixed(2) };
    }

    if (this.mode === 'zone'){
      const ok = this.hits.filter(h => h.ok);
      put('hit', (ok.length / Math.max(1, this.hits.length)) * 100);
      const avgMs = ok.length ? mean(ok.map(h => h.ms)) : this.cfg.reactSec * 1000;
      put('speed', clamp(1 - (avgMs / 1000) / this.cfg.reactSec, 0, 1) * 100);
      fb.push(`ตอบถูก ${ok.length} จาก ${this.hits.length} ข้อ เวลาเฉลี่ย ${(avgMs/1000).toFixed(1)} วินาที`);
      if (ok.length < this.hits.length) fb.push('ข้อที่พลาดมักเกิดจากยังไม่คุ้นตำแหน่ง — ลองซ้อมซ้ำอีกรอบ');
      this.detail = { correct:ok.length, total:this.hits.length, avgMs:Math.round(avgMs) };
    }

    if (this.mode === 'sequence'){
      const total = this.cfg.order.length;
      put('comp', (this.step / total) * 100);
      put('order', clamp(1 - this.orderErrors / total, 0, 1) * 100);
      put('time', clamp(1 - (this.elapsed / (total * 8)), 0, 1) * 100);
      fb.push(`ทำได้ ${this.step} จาก ${total} ขั้น ในเวลา ${Math.round(this.elapsed)} วินาที`);
      if (this.orderErrors) fb.push(`สลับลำดับไป ${this.orderErrors} ครั้ง — ทบทวนลำดับให้แม่นก่อนลงมือ`);
      else if (this.step === total) fb.push('ลำดับถูกต้องครบทุกขั้น เยี่ยมมาก');
      this.detail = { steps:this.step, total, orderErrors:this.orderErrors, seconds:Math.round(this.elapsed) };
    }

    if (this.mode === 'frame'){
      const ib = mean(this.inBox.length ? this.inBox : [0]);
      const sway = this.cx.length > 8 ? std(this.cx) : 0;
      const swayLvl = clamp(1 - sway / (this.cfg.maxSway || 0.045), 0, 1);
      put('inbox', ib * 100);
      put('sway', swayLvl * 100);
      put('presence', clamp(this.elapsed / this.duration, 0, 1) * 100);
      fb.push(swayLvl > 0.75 ? 'ทรงตัวมั่นคงตลอดการนำเสนอ ดูน่าเชื่อถือ'
            : swayLvl > 0.5  ? 'มีการโยกตัวบ้าง — ลองยืนแยกเท้ากว้างเท่าไหล่แล้วลงน้ำหนักเท่ากัน'
            :                  'โยกตัวค่อนข้างมาก ผู้ฟังจะรู้สึกว่าคุณไม่มั่นใจ ลองซ้อมยืนนิ่งก่อน 30 วินาที');
      if (ib < 0.7) fb.push('บางช่วงคุณหลุดออกนอกกรอบภาพ — ระวังการเดินออกจากจุดยืนโดยไม่ตั้งใจ');
      this.detail = { inBox:+ib.toFixed(2), sway:+sway.toFixed(4) };
    }

    if (this.mode === 'voice'){
      const t = Math.max(this.elapsed, 1);
      const sylRate = this.voicePeaks / t;
      const win = [...this.rms].sort((a, b) => a - b);
      const floor = Math.max(win[Math.floor(win.length * 0.2)] || 0, 0.004);
      const speakRatio = this.rms.filter(v => v > floor * 2.6).length / Math.max(1, this.rms.length);
      const [lo, hi] = this.cfg.targetSyl;
      const mid = (lo + hi) / 2, halfW = (hi - lo) / 2;

      put('pace', sylRate > 0.4 ? 100 - clamp((Math.abs(sylRate - mid) - halfW) / halfW, 0, 1) * 100 : 0);
      const idealPause = clamp(speakRatio, 0, 1);
      put('pause', idealPause >= 0.45 && idealPause <= 0.82 ? 100
        : (1 - clamp(Math.min(Math.abs(idealPause-0.45), Math.abs(idealPause-0.82)) / 0.3, 0, 1)) * 100);
      put('flow', clamp(speakRatio / 0.5, 0, 1) * 100);

      const wpmApprox = Math.round(sylRate * 60 / 1.6);   // ประมาณ 1.6 พยางค์/คำ
      if (sylRate < 0.4) fb.push('ระบบแทบไม่ได้ยินเสียง — ตรวจว่าอนุญาตไมโครโฟนและอยู่ในที่ไม่เงียบเกินไป');
      else{
        fb.push(`ความเร็วโดยประมาณ ${wpmApprox} คำ/นาที (${sylRate.toFixed(1)} พยางค์/วินาที)`);
        if (sylRate > hi) fb.push('เร็วกว่าช่วงที่ผู้ฟังตามสบาย — ฝึกหยุดหายใจตามเครื่องหมายในสคริปต์');
        else if (sylRate < lo) fb.push('ช้ากว่าช่วงที่เหมาะ — เพิ่มพลังเสียงและลดการลากเสียง');
        fb.push(`คุณพูดจริง ${Math.round(speakRatio*100)}% ของเวลา ที่เหลือเป็นการเว้นจังหวะ (ช่วงเหมาะสมคือ 45–82%)`);
      }
      this.detail = { sylRate:+sylRate.toFixed(2), speakRatio:+speakRatio.toFixed(2), wpmApprox };
    }

    // คะแนนรวมถ่วงน้ำหนักตาม rubric
    let total = 0, wsum = 0;
    const rubric = d.rubric.map(r => {
      const v = R[r.id] ?? 0;
      total += v * r.weight; wsum += r.weight;
      return { ...r, value: v };
    });

    return {
      drillId: d.id, trackId: d.track, skillId: d.skill,
      score: Math.round(total / (wsum || 1)),
      rubric, feedback: fb, detail: this.detail || {},
      seconds: Math.round(this.elapsed),
    };
  }
}

/* ------------------------------------------------------------ util */
function roundRect(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}

/* เมโทรนอมสำหรับโหมด tempo (Web Audio, ไม่ต้องมีไฟล์เสียง) */
export class Metronome{
  constructor(bpm){ this.bpm = bpm; this.on = false; }
  toggle(onBeat){
    this.on ? this.stop() : this.start(onBeat);
    return this.on;
  }
  start(onBeat){
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.on = true;
    const period = 60000 / this.bpm;
    const beat = () => {
      if (!this.on) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, this.ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.07);
      o.connect(g).connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + 0.08);
      onBeat?.();
      this.timer = setTimeout(beat, period);
    };
    beat();
  }
  stop(){ this.on = false; clearTimeout(this.timer); this.ctx?.close?.(); }
}
