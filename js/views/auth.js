/* ============================================================
   views/auth.js — หน้าเข้าสู่ระบบ / สมัครสมาชิก
   แสดงเต็มจอนอก app shell (ยังไม่มีเมนู เพราะยังไม่รู้ว่าเป็นใคร)
   ============================================================ */

import { icon, esc, on, field, clearListeners, toast } from '../ui.js';
import { login, register, guest, accounts, passwordScore, emailOk } from '../auth.js';

let tab = 'login';        // login | register
let busy = false;

const HIGHLIGHTS = [
  { icon:'brain',  title:'ข้อสอบปรับระดับด้วย IRT',
    text:'ข้อถัดไปเลือกจากระดับความสามารถจริงของคุณ วัดแม่นด้วยจำนวนข้อที่น้อยลง' },
  { icon:'camera', title:'ตรวจภาคปฏิบัติด้วยกล้อง',
    text:'จับจังหวะ ความนิ่ง ตำแหน่ง และลำดับขั้นตอน — ประมวลผลในเครื่องคุณเท่านั้น' },
  { icon:'medal',  title:'เกียรติบัตรที่มีหลักฐานรองรับ',
    text:'ออกให้เมื่อผ่านเกณฑ์ทั้งทฤษฎีและปฏิบัติ พร้อมเลขที่กำกับทุกใบ' },
];

export function render(){
  const n = accounts().filter(a => !a.guest).length;

  return `
  <div class="auth-wrap">
    <!-- ---------- ฝั่งแบรนด์ ---------- -->
    <aside class="auth-brand">
      <div class="auth-brand-inner">
        <div class="brand" style="padding:0 0 28px">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 100 100"><rect width="100" height="100" rx="26" fill="currentColor"/>
              <path d="M28 52l15 15 29-33" stroke="#fff" stroke-width="11" fill="none"
                stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="brand-text"><strong>SkillPass</strong><span>ฝึกจนเป็น พิสูจน์ได้</span></div>
        </div>

        <h1>ข้อสอบวัดว่าคุณ “รู้”<br>ที่นี่วัดว่าคุณ “ทำเป็น”</h1>
        <p class="auth-lead">
          แพลตฟอร์มเตรียมสอบใบรับรองที่รวมข้อสอบปรับระดับ ติวเตอร์ที่อ้างอิงแหล่งที่มาได้
          และการตรวจภาคปฏิบัติผ่านกล้อง ไว้ในที่เดียว
        </p>

        <ul class="auth-points">
          ${HIGHLIGHTS.map(h => `
            <li>
              <span class="ap-ico">${icon(h.icon)}</span>
              <div><b>${esc(h.title)}</b><span>${esc(h.text)}</span></div>
            </li>`).join('')}
        </ul>

        <p class="auth-foot">
          ${icon('lock')} ข้อมูลและรหัสผ่านถูกเก็บแบบเข้ารหัสไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น
          ไม่มีการส่งออกภายนอก
        </p>
      </div>
    </aside>

    <!-- ---------- ฝั่งฟอร์ม ---------- -->
    <main class="auth-panel">
      <div class="auth-card">
        <div class="auth-tabs" role="tablist">
          <button role="tab" data-tab="login"    aria-selected="${tab === 'login'}">เข้าสู่ระบบ</button>
          <button role="tab" data-tab="register" aria-selected="${tab === 'register'}">สมัครสมาชิก</button>
        </div>

        <div id="auth-body">${tab === 'login' ? loginForm(n) : registerForm()}</div>

        <div class="auth-or"><span>หรือ</span></div>
        <button class="btn btn-ghost btn-block" data-guest>
          ${icon('eye')} ลองใช้แบบผู้เยี่ยมชม (ไม่ต้องสมัคร)
        </button>
        <p class="tiny muted" style="text-align:center;margin-top:10px;line-height:1.6">
          โหมดผู้เยี่ยมชมใช้ได้ทุกฟีเจอร์ แต่ความคืบหน้าจะรวมอยู่ในบัญชีสาธารณะของเครื่องนี้
        </p>
      </div>
    </main>
  </div>`;
}

/* ------------------------------------------------------------ forms */
function loginForm(n){
  return `
  <form id="form-login" novalidate>
    <h2>ยินดีต้อนรับกลับมา</h2>
    <p class="auth-sub">${n ? `มี ${n} บัญชีบนเครื่องนี้ — เข้าสู่ระบบเพื่อกลับไปยังความคืบหน้าของคุณ`
                            : 'ยังไม่มีบัญชีบนเครื่องนี้ เริ่มจากแท็บ “สมัครสมาชิก” ได้เลย'}</p>

    ${field({ id:'li-email', label:'อีเมล', type:'email', placeholder:'you@example.com',
              autocomplete:'email', required:true, icon:'send' })}

    <div class="field has-ico">
      <label for="li-pw">รหัสผ่าน<i>*</i></label>
      ${icon('lock', 'f-ico')}
      <input class="input" id="li-pw" name="li-pw" type="password" autocomplete="current-password"
        placeholder="รหัสผ่านของคุณ" required>
      <button type="button" class="f-eye" data-toggle="li-pw" aria-label="แสดงรหัสผ่าน">${icon('eye')}</button>
    </div>

    <label class="check">
      <input type="checkbox" id="li-remember" checked>
      <span>จำฉันไว้บนเครื่องนี้</span>
    </label>

    <p class="auth-error" id="auth-err" hidden></p>

    <button class="btn btn-primary btn-lg btn-block" type="submit" id="li-go">
      ${icon('arrowR')} เข้าสู่ระบบ
    </button>
  </form>`;
}

function registerForm(){
  return `
  <form id="form-register" novalidate>
    <h2>สร้างบัญชีใหม่</h2>
    <p class="auth-sub">ใช้เวลาไม่ถึงหนึ่งนาที — ชื่อที่กรอกจะถูกใช้พิมพ์ลงเกียรติบัตรของคุณ</p>

    ${field({ id:'rg-name', label:'ชื่อ–สกุล', placeholder:'เช่น สมชาย ใจดี',
              autocomplete:'name', required:true, icon:'people',
              hint:'ตรวจให้ตรงกับบัตรประชาชน เพราะจะปรากฏบนเกียรติบัตร' })}

    ${field({ id:'rg-email', label:'อีเมล', type:'email', placeholder:'you@example.com',
              autocomplete:'email', required:true, icon:'send' })}

    <div class="field has-ico">
      <label for="rg-pw">รหัสผ่าน<i>*</i></label>
      ${icon('lock', 'f-ico')}
      <input class="input" id="rg-pw" name="rg-pw" type="password" autocomplete="new-password"
        placeholder="อย่างน้อย 8 ตัวอักษร" required>
      <button type="button" class="f-eye" data-toggle="rg-pw" aria-label="แสดงรหัสผ่าน">${icon('eye')}</button>
      <div class="pw-meter" id="pw-meter"><i></i><i></i><i></i><i></i></div>
      <span class="f-hint" id="pw-hint">ผสมตัวพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษ จะเดายากขึ้นมาก</span>
    </div>

    <div class="field has-ico">
      <label for="rg-pw2">ยืนยันรหัสผ่าน<i>*</i></label>
      ${icon('shield', 'f-ico')}
      <input class="input" id="rg-pw2" name="rg-pw2" type="password" autocomplete="new-password"
        placeholder="พิมพ์รหัสผ่านอีกครั้ง" required>
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 14px">
      ${field({ id:'rg-school', label:'สถาบัน / หน่วยงาน', placeholder:'เช่น วิทยาลัยเทคนิคขอนแก่น',
                autocomplete:'organization' })}
      ${field({ id:'rg-role', label:'ใช้งานในฐานะ', value:'student', options:[
        { value:'student', label:'ผู้เรียน' },
        { value:'teacher', label:'ครู / ผู้ฝึกสอน' },
      ] })}
    </div>

    <label class="check">
      <input type="checkbox" id="rg-terms">
      <span>ฉันเข้าใจว่านี่เป็นระบบต้นแบบเพื่อการสาธิต และข้อมูลทั้งหมดถูกเก็บไว้ในเครื่องนี้เท่านั้น</span>
    </label>

    <p class="auth-error" id="auth-err" hidden></p>

    <button class="btn btn-primary btn-lg btn-block" type="submit" id="rg-go">
      ${icon('check')} สมัครสมาชิก
    </button>
  </form>`;
}

/* ------------------------------------------------------------ mount */
export function mount(root, { onAuth }){
  clearListeners(root);

  const err = msg => {
    const box = root.querySelector('#auth-err');
    if (!box) return;
    box.hidden = !msg;
    box.textContent = msg || '';
  };

  const setBusy = (btn, on_, label) => {
    busy = on_;
    if (!btn) return;
    btn.disabled = on_;
    btn.innerHTML = on_ ? icon('refresh') + ' กำลังดำเนินการ…' : label;
  };

  const repaint = () => {
    root.querySelector('#auth-body').innerHTML = tab === 'login' ? loginForm(accounts().filter(a => !a.guest).length) : registerForm();
    root.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    root.querySelector('input')?.focus();
  };

  on(root, 'click', '[data-tab]', (e, t) => {
    if (busy || t.dataset.tab === tab) return;
    tab = t.dataset.tab;
    repaint();
  });

  on(root, 'click', '[data-toggle]', (e, t) => {
    const inp = root.querySelector('#' + t.dataset.toggle);
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    t.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    t.classList.toggle('on', show);
  });

  on(root, 'input', '#rg-pw', () => {
    const v = root.querySelector('#rg-pw').value;
    const s = passwordScore(v);
    const meter = root.querySelector('#pw-meter');
    const hint  = root.querySelector('#pw-hint');
    if (!meter) return;
    meter.dataset.tone = s.tone || '';
    [...meter.children].forEach((bar, i) => bar.classList.toggle('on', i < s.score));
    if (hint) hint.textContent = v
      ? `ความแข็งแรง: ${s.label}` + (s.score < 3 ? ' — ลองเพิ่มความยาวหรืออักขระพิเศษ' : ' — ใช้ได้เลย')
      : 'ผสมตัวพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษ จะเดายากขึ้นมาก';
  });

  on(root, 'click', '[data-guest]', () => {
    if (busy) return;
    onAuth(guest());
  });

  on(root, 'submit', '#form-login', async e => {
    e.preventDefault();
    if (busy) return;
    err('');
    const email = root.querySelector('#li-email').value.trim();
    const pw    = root.querySelector('#li-pw').value;
    if (!emailOk(email)) return err('รูปแบบอีเมลไม่ถูกต้อง');
    if (!pw)             return err('กรุณากรอกรหัสผ่าน');

    const btn = root.querySelector('#li-go');
    const label = btn.innerHTML;
    setBusy(btn, true);
    try{
      const user = await login({ email, password: pw, remember: root.querySelector('#li-remember').checked });
      onAuth(user);
    }catch(ex){
      setBusy(btn, false, label);
      err(ex.message);
      root.querySelector('#li-pw').select?.();
    }
  });

  on(root, 'submit', '#form-register', async e => {
    e.preventDefault();
    if (busy) return;
    err('');
    const g = id => root.querySelector('#' + id);
    const name = g('rg-name').value.trim();
    const email = g('rg-email').value.trim();
    const pw = g('rg-pw').value, pw2 = g('rg-pw2').value;

    if (name.length < 2)   return err('กรุณากรอกชื่อ–สกุลอย่างน้อย 2 ตัวอักษร');
    if (!emailOk(email))   return err('รูปแบบอีเมลไม่ถูกต้อง');
    if (pw.length < 8)     return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
    if (pw !== pw2)        return err('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    if (!g('rg-terms').checked) return err('กรุณาติ๊กยอมรับเงื่อนไขก่อนสมัคร');

    const btn = g('rg-go');
    const label = btn.innerHTML;
    setBusy(btn, true);
    try{
      const user = await register({
        name, email, password: pw,
        school: g('rg-school').value.trim(),
        role: g('rg-role').value,
      });
      toast(`ยินดีต้อนรับ ${user.name}`, 'ok', 3200);
      onAuth(user);
    }catch(ex){
      setBusy(btn, false, label);
      err(ex.message);
    }
  });

  root.querySelector('input')?.focus();
}

export const reset = () => { tab = 'login'; busy = false; };
