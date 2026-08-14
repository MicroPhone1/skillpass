/* ============================================================
   views/profile.js — โปรไฟล์ผู้ใช้: ข้อมูลส่วนตัว ประวัติ และความปลอดภัย
   ============================================================ */

import { icon, on, esc, field, avatar, toast, modal, paint, timeAgo, ring } from '../ui.js';
import { state, save, emitChange, levelInfo, updateProfile, addHistory,
         removeHistory, resetAll, displayName, certificateName } from '../store.js';
import { currentUser, changePassword, syncAccount, deleteAccount, logout,
         passwordScore, emailOk } from '../auth.js';
import { trackById } from '../data/tracks.js';
import { overallReadiness } from '../engine/adaptive.js';
import { refreshFromProfile } from '../certificate.js';

const fmtDate = ts => ts
  ? new Date(ts).toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' })
  : '—';

export default {
  title: 'โปรไฟล์ของฉัน',
  sub: () => 'ข้อมูลนี้จะปรากฏบนเกียรติบัตรและในคอมมูนิตี้ — กรอกให้ครบเพื่อให้ระบบออกใบให้ได้ถูกต้อง',

  render(){
    const p = state.profile;
    const u = currentUser() || {};
    const lv = levelInfo();
    const nCerts = state.certificates.length;
    const totalQ = state.examHistory.reduce((s, e) => s + (e.items || 0), 0);

    return `
    <div class="stack" style="gap:20px;max-width:980px;margin:0 auto;width:100%">

      <!-- ===== หัวโปรไฟล์ ===== -->
      <section class="profile-head">
        <div class="ph-avatar">
          ${avatar(p, 96, 30)}
          <button class="ph-cam" data-photo aria-label="เปลี่ยนรูปโปรไฟล์">${icon('camera')}</button>
          <input type="file" id="photo-input" accept="image/*" hidden>
        </div>

        <div class="ph-main">
          <h2>${esc(displayName())}</h2>
          <p class="ph-meta">
            ${p.title ? esc(p.title) + ' · ' : ''}${esc(p.school || 'ยังไม่ได้ระบุสถาบัน')}
          </p>
          <div class="row tight" style="margin-top:10px">
            <span class="pill">${icon('bolt')} เลเวล ${lv.level}</span>
            <span class="pill violet">${icon('spark')} ${state.xp} XP</span>
            <span class="pill ${u.guest ? 'warn' : 'ok'}">${icon(u.guest ? 'eye' : 'shield')}
              ${u.guest ? 'บัญชีผู้เยี่ยมชม' : esc(u.email || 'บัญชีสมาชิก')}</span>
            <span class="pill plain">${icon('calendar')} เข้าร่วม ${fmtDate(p.joined)}</span>
          </div>
          ${p.bio ? `<p class="ph-bio">${esc(p.bio)}</p>` : ''}
        </div>

        <div class="ph-stats">
          ${ring(overallReadiness()/100, { size:88, stroke:9, label: overallReadiness() + '%', sub:'ความพร้อม' })}
        </div>
      </section>

      ${u.guest ? `
      <div class="notice warn">
        ${icon('info')}
        <div>
          <b>คุณกำลังใช้โหมดผู้เยี่ยมชม</b>
          <p>ความคืบหน้าจะถูกเก็บรวมไว้ในบัญชีสาธารณะของเครื่องนี้ และเกียรติบัตรจะไม่ระบุอีเมลเจ้าของ
             — สมัครบัญชีจริงเพื่อแยกข้อมูลของคุณออกมา</p>
        </div>
        <button class="btn btn-primary btn-sm" data-signout>${icon('arrowR')} สมัครบัญชี</button>
      </div>` : ''}

      <!-- ===== สรุปตัวเลข ===== -->
      <section class="grid g4">
        ${[['medal',  nCerts,                        'เกียรติบัตรที่ได้รับ'],
           ['exam',   totalQ,                        'ข้อสอบที่ทำสะสม'],
           ['camera', state.drillHistory.length,     'ครั้งที่ฝึกหน้ากล้อง'],
           ['flame',  state.streak,                  'วันเรียนต่อเนื่อง']
          ].map(([ic, v, l]) => `
          <div class="tile">${icon(ic, 't-ico')}
            <div class="t-lbl">${l}</div>
            <div class="t-val">${v}</div>
          </div>`).join('')}
      </section>

      <!-- ===== ข้อมูลส่วนตัว ===== -->
      <section class="card pad-lg">
        <div class="card-head">
          <div class="track-ico">${icon('people')}</div>
          <div><h2>ข้อมูลส่วนตัว</h2><p>ใช้แสดงในระบบและพิมพ์ลงเกียรติบัตร</p></div>
        </div>

        <form id="form-profile" class="form-grid">
          ${field({ id:'pf-name', label:'ชื่อที่แสดงในระบบ', value:p.name, required:true,
                    autocomplete:'nickname' })}
          ${field({ id:'pf-certname', label:'ชื่อ–สกุลบนเกียรติบัตร', value:p.certName,
                    placeholder: displayName(),
                    hint:'ปล่อยว่างได้ ระบบจะใช้ชื่อที่แสดงแทน' })}
          ${field({ id:'pf-email', label:'อีเมล', type:'email', value:p.email,
                    autocomplete:'email', placeholder:'you@example.com' })}
          ${field({ id:'pf-phone', label:'เบอร์โทรศัพท์', value:p.phone,
                    autocomplete:'tel', placeholder:'08x-xxx-xxxx' })}
          ${field({ id:'pf-school', label:'สถาบัน / หน่วยงาน', value:p.school,
                    autocomplete:'organization', placeholder:'เช่น วิทยาลัยเทคนิคขอนแก่น' })}
          ${field({ id:'pf-title', label:'ตำแหน่ง / อาชีพ', value:p.title,
                    placeholder:'เช่น นักศึกษา ปวส. ปี 2 / ช่างไฟฟ้า' })}
          <div class="span-2">
            ${field({ id:'pf-schoolen', label:'ชื่อสถาบันภาษาอังกฤษ', value:p.schoolEn,
                      placeholder:'เช่น King Mongkut’s University of Technology Thonburi',
                      hint:'ใช้เมื่อสลับเกียรติบัตรเป็นภาษาอังกฤษ — ปล่อยว่างจะใช้ชื่อภาษาไทยแทน' })}
          </div>
          <div class="span-2">
            ${field({ id:'pf-goal', label:'เป้าหมายของคุณ', value:p.goal,
                      placeholder:'เช่น สอบใบรับรองช่างไฟฟ้าภายในอาคาร ระดับ 1 ให้ผ่านภายในเดือนนี้' })}
          </div>
          <div class="span-2">
            ${field({ id:'pf-bio', label:'แนะนำตัวสั้น ๆ', value:p.bio, rows:3, maxlength:280,
                      placeholder:'เล่าประสบการณ์หรือสิ่งที่กำลังฝึกอยู่ — จะแสดงในคอมมูนิตี้' })}
          </div>

          <div class="span-2 row" style="justify-content:flex-end;gap:10px;margin-top:4px">
            <span class="small muted" id="pf-status" style="margin-right:auto"></span>
            <button type="button" class="btn btn-ghost" data-revert>${icon('refresh')} ย้อนกลับ</button>
            <button type="submit" class="btn btn-primary">${icon('check')} บันทึกข้อมูล</button>
          </div>
        </form>
      </section>

      <!-- ===== ประวัติ ===== -->
      ${historySection('education', 'ประวัติการศึกษา / การอบรม', 'book',
        'สถาบันหรือหน่วยงานที่คุณเคยเรียนหรือผ่านการอบรมมา')}

      ${historySection('experience', 'ประวัติการทำงาน / ฝึกงาน', 'wrench',
        'ประสบการณ์จริงที่เกี่ยวข้องกับทักษะที่กำลังฝึก')}

      <!-- ===== ประวัติในระบบ ===== -->
      <section class="card">
        <div class="card-head">
          <div class="track-ico" style="background:var(--cyan-soft);color:var(--cyan)">${icon('clock')}</div>
          <div><h2>ประวัติการฝึกในระบบ</h2><p>บันทึกอัตโนมัติ แก้ไขไม่ได้ — ใช้เป็นหลักฐานประกอบเกียรติบัตร</p></div>
          <div class="spacer"></div>
          <a class="btn btn-ghost btn-sm" href="#/passport">${icon('medal')} สมุดทักษะฉบับเต็ม</a>
        </div>
        ${activityList()}
      </section>

      <!-- ===== บัญชีและความปลอดภัย ===== -->
      <section class="card pad-lg">
        <div class="card-head">
          <div class="track-ico" style="background:var(--blue-50)">${icon('lock')}</div>
          <div><h2>บัญชีและความปลอดภัย</h2><p>จัดการการเข้าถึงและข้อมูลของคุณ</p></div>
        </div>
        <div class="stack" style="gap:0">
          <div class="setting-row">
            <div><b>รหัสผ่าน</b><span>${u.guest ? 'บัญชีผู้เยี่ยมชมไม่ต้องใช้รหัสผ่าน' : 'เปลี่ยนได้ทุกเมื่อ ต้องยืนยันรหัสเดิมก่อน'}</span></div>
            <button class="btn btn-ghost btn-sm" data-changepw ${u.guest ? 'disabled' : ''}>เปลี่ยนรหัสผ่าน</button>
          </div>
          <div class="setting-row">
            <div><b>ออกจากระบบ</b><span>ข้อมูลความคืบหน้าจะยังอยู่ กลับมาเข้าสู่ระบบใหม่ได้</span></div>
            <button class="btn btn-ghost btn-sm" data-signout>${icon('arrowR')} ออกจากระบบ</button>
          </div>
          <div class="setting-row">
            <div><b>ล้างความคืบหน้า</b><span>ลบคะแนน เหรียญ และประวัติทั้งหมด แต่ยังเก็บบัญชีไว้</span></div>
            <button class="btn btn-danger btn-sm" data-reset>${icon('refresh')} ล้างความคืบหน้า</button>
          </div>
          <div class="setting-row">
            <div><b>ลบบัญชีถาวร</b><span>ลบทั้งบัญชี ความคืบหน้า และเกียรติบัตรทุกใบ — ย้อนกลับไม่ได้</span></div>
            <button class="btn btn-danger btn-sm" data-delete>${icon('x')} ลบบัญชี</button>
          </div>
        </div>
      </section>
    </div>`;
  },

  mount(root, ctx){
    /* ---------- รูปโปรไฟล์ ---------- */
    on(root, 'click', '[data-photo]', () => root.querySelector('#photo-input').click());
    root.querySelector('#photo-input')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) return toast('ไฟล์ใหญ่เกินไป (เกิน 8 MB)', 'bad');
      shrinkImage(file, 256)
        .then(dataURL => {
          updateProfile({ photo: dataURL });
          toast('อัปเดตรูปโปรไฟล์แล้ว', 'ok');
          repaint(root, ctx, this);
        })
        .catch(() => toast('อ่านไฟล์รูปไม่สำเร็จ', 'bad'));
    });

    /* ---------- ฟอร์มข้อมูลส่วนตัว ---------- */
    const status = msg => { const el = root.querySelector('#pf-status'); if (el) el.textContent = msg || ''; };
    on(root, 'input', '#form-profile', () => status('มีการแก้ไขที่ยังไม่ได้บันทึก'));

    on(root, 'click', '[data-revert]', () => { repaint(root, ctx, this); toast('ย้อนกลับเป็นข้อมูลที่บันทึกไว้แล้ว'); });

    on(root, 'submit', '#form-profile', e => {
      e.preventDefault();
      const g = id => root.querySelector('#' + id).value.trim();
      const name = g('pf-name');
      if (name.length < 2) return toast('กรุณากรอกชื่อที่แสดงอย่างน้อย 2 ตัวอักษร', 'bad');
      const email = g('pf-email');
      if (email && !emailOk(email)) return toast('รูปแบบอีเมลไม่ถูกต้อง', 'bad');

      updateProfile({
        name, email,
        certName: g('pf-certname'),
        phone:    g('pf-phone'),
        school:   g('pf-school'),
        schoolEn: g('pf-schoolen'),
        title:    g('pf-title'),
        goal:     g('pf-goal'),
        bio:      g('pf-bio'),
      });
      syncAccount({ name, email });
      refreshFromProfile();
      save(); emitChange();
      toast('บันทึกข้อมูลเรียบร้อย', 'ok');
      repaint(root, ctx, this);
    });

    /* ---------- ประวัติ ---------- */
    on(root, 'click', '[data-add]', (e, t) => openHistoryModal(t.dataset.add, root, ctx, this));
    on(root, 'click', '[data-del]', (e, t) => {
      removeHistory(t.dataset.kind, t.dataset.del);
      toast('ลบรายการแล้ว');
      repaint(root, ctx, this);
    });

    /* ---------- บัญชี ---------- */
    on(root, 'click', '[data-changepw]', () => openPasswordModal());

    on(root, 'click', '[data-signout]', () => {
      if (!confirm('ออกจากระบบตอนนี้? ความคืบหน้าของคุณจะถูกบันทึกไว้')) return;
      logout();
      location.hash = '#/home';
      location.reload();
    });

    on(root, 'click', '[data-reset]', () => {
      if (confirm('ล้างคะแนน เหรียญ เกียรติบัตร และประวัติทั้งหมดของบัญชีนี้?\nการกระทำนี้ย้อนกลับไม่ได้')) resetAll();
    });

    on(root, 'click', '[data-delete]', () => {
      const u = currentUser();
      const answer = prompt('ยืนยันการลบบัญชีถาวร — พิมพ์คำว่า  ลบบัญชี  เพื่อยืนยัน');
      if (answer?.trim() !== 'ลบบัญชี') return toast('ยกเลิกการลบบัญชีแล้ว');
      deleteAccount();
      toast(`ลบบัญชี ${u?.name || ''} แล้ว`, 'ok');
      setTimeout(() => location.reload(), 700);
    });
  },
};

/* ============================================================ ส่วนย่อย */

function historySection(kind, title, ico, desc){
  const items = state.profile[kind] || [];
  const isEdu = kind === 'education';

  return `
  <section class="card">
    <div class="card-head">
      <div class="track-ico" style="background:var(--violet-soft);color:var(--violet)">${icon(ico)}</div>
      <div><h2>${title}</h2><p>${desc}</p></div>
      <div class="spacer"></div>
      <button class="btn btn-soft btn-sm" data-add="${kind}">${icon('plus')} เพิ่ม</button>
    </div>

    ${items.length ? `
      <ol class="timeline">
        ${items.map(it => `
          <li>
            <div class="tl-dot"></div>
            <div class="tl-body">
              <div class="spread" style="align-items:flex-start">
                <div style="min-width:0">
                  <b>${esc(isEdu ? it.program : it.role)}</b>
                  <div class="small muted">${esc(it.place)}</div>
                </div>
                <div class="row tight" style="flex:none">
                  ${it.year ? `<span class="pill plain">${esc(it.year)}</span>` : ''}
                  <button class="icon-mini" data-del="${esc(it.id)}" data-kind="${kind}"
                    aria-label="ลบรายการ">${icon('x')}</button>
                </div>
              </div>
              ${it.note ? `<p class="small" style="margin-top:6px;line-height:1.7;color:var(--ink-2)">${esc(it.note)}</p>` : ''}
            </div>
          </li>`).join('')}
      </ol>`
    : `<div class="empty" style="padding:30px 16px">
        ${icon(ico)}
        <h3>ยังไม่มีข้อมูล${isEdu ? 'การศึกษา' : 'การทำงาน'}</h3>
        <p>เพิ่มไว้เพื่อให้โปรไฟล์ของคุณสมบูรณ์ เวลาแสดงต่อครูที่ปรึกษาหรือสถานประกอบการ</p>
        <button class="btn btn-primary btn-sm" data-add="${kind}" style="margin-top:14px">${icon('plus')} เพิ่มรายการแรก</button>
      </div>`}
  </section>`;
}

function activityList(){
  const items = [
    ...state.examHistory.slice(0, 5).map(e => ({
      at: e.at, ico:'exam', tone:'blue-600', bg:'blue-50',
      title:`ทดสอบ ${trackById(e.trackId).name} · ${e.items} ข้อ`,
      value:`${e.percent}%`,
    })),
    ...state.drillHistory.slice(0, 5).map(d => ({
      at: d.at, ico:'camera', tone:'cyan', bg:'cyan-soft',
      title:`ฝึกหน้ากล้อง · ${trackById(d.trackId).name}`,
      value:`${d.score}%`,
    })),
    ...state.certificates.slice(0, 5).map(c => ({
      at: c.issuedAt, ico:'medal', tone:'warn', bg:'warn-soft',
      title:`ได้รับเกียรติบัตร ${trackById(c.trackId).name}`,
      value: c.code,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  if (!items.length) return `
    <div class="empty" style="padding:30px 16px">
      ${icon('chart')}
      <h3>ยังไม่มีกิจกรรม</h3>
      <p>เริ่มจากทำข้อสอบปรับระดับหนึ่งชุด แล้วประวัติจะขึ้นที่นี่เอง</p>
      <a class="btn btn-primary btn-sm" href="#/exam" style="margin-top:14px">${icon('play')} เริ่มทดสอบ</a>
    </div>`;

  return `<div class="stack" style="gap:0">
    ${items.map(a => `
      <div class="rubric-row">
        <div class="track-ico" style="width:34px;height:34px;border-radius:11px;background:var(--${a.bg});color:var(--${a.tone})">${icon(a.ico)}</div>
        <div class="r-name"><b style="font-weight:600">${esc(a.title)}</b><br>
          <span class="tiny muted">${timeAgo(a.at)}</span></div>
        <div class="r-score num">${esc(a.value)}</div>
      </div>`).join('')}
  </div>`;
}

/* ------------------------------------------------------------ modals */
function openHistoryModal(kind, root, ctx, view){
  const isEdu = kind === 'education';
  const m = modal(`
    <h2>${isEdu ? 'เพิ่มประวัติการศึกษา' : 'เพิ่มประวัติการทำงาน'}</h2>
    <p class="small muted" style="margin-top:4px">กรอกเท่าที่มี ไม่จำเป็นต้องครบทุกช่อง</p>
    <div class="form-grid" style="margin-top:16px">
      ${field({ id:'h-place', label: isEdu ? 'สถาบัน / หน่วยงาน' : 'บริษัท / สถานประกอบการ',
                required:true, placeholder: isEdu ? 'เช่น วิทยาลัยเทคนิคขอนแก่น' : 'เช่น บริษัท ไทยอิเล็คทริค จำกัด' })}
      ${field({ id:'h-what', label: isEdu ? 'หลักสูตร / สาขา' : 'ตำแหน่ง',
                required:true, placeholder: isEdu ? 'เช่น ปวส. ไฟฟ้ากำลัง' : 'เช่น ผู้ช่วยช่างไฟฟ้า' })}
      ${field({ id:'h-year', label:'ช่วงเวลา', placeholder:'เช่น 2565–2567 หรือ 2567–ปัจจุบัน' })}
      <div class="span-2">
        ${field({ id:'h-note', label:'รายละเอียดเพิ่มเติม', rows:2,
                  placeholder: isEdu ? 'เช่น เกรดเฉลี่ย 3.4 · ได้รับรางวัลแข่งขันทักษะ' : 'เช่น ดูแลงานติดตั้งระบบไฟอาคารพาณิชย์' })}
      </div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" id="h-save">${icon('check')} เพิ่มรายการ</button>
    </div>`);

  const save_ = () => {
    const g = id => m.el.querySelector('#' + id).value.trim();
    if (!g('h-place') || !g('h-what')) return toast('กรุณากรอกช่องที่มีเครื่องหมาย * ให้ครบ', 'bad');
    addHistory(kind, isEdu
      ? { place:g('h-place'), program:g('h-what'), year:g('h-year'), note:g('h-note') }
      : { place:g('h-place'), role:g('h-what'),    year:g('h-year'), note:g('h-note') });
    m.close();
    toast('เพิ่มรายการแล้ว', 'ok');
    repaint(root, ctx, view);
  };

  m.el.querySelector('#h-save').addEventListener('click', save_);
  m.el.querySelector('#h-place').focus();
}

function openPasswordModal(){
  const m = modal(`
    <h2>เปลี่ยนรหัสผ่าน</h2>
    <p class="small muted" style="margin-top:4px">ต้องยืนยันรหัสผ่านเดิมก่อนตั้งรหัสใหม่</p>
    <div class="form-grid one" style="margin-top:16px">
      ${field({ id:'cp-old',  label:'รหัสผ่านเดิม', type:'password', required:true, autocomplete:'current-password' })}
      ${field({ id:'cp-new',  label:'รหัสผ่านใหม่', type:'password', required:true, autocomplete:'new-password',
                hint:'อย่างน้อย 8 ตัวอักษร' })}
      ${field({ id:'cp-new2', label:'ยืนยันรหัสผ่านใหม่', type:'password', required:true, autocomplete:'new-password' })}
    </div>
    <p class="auth-error" id="cp-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:18px">
      <button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" id="cp-save">${icon('lock')} บันทึกรหัสผ่านใหม่</button>
    </div>`);

  const err = msg => {
    const box = m.el.querySelector('#cp-err');
    box.hidden = !msg; box.textContent = msg || '';
  };
  const btn = m.el.querySelector('#cp-save');

  btn.addEventListener('click', async () => {
    const g = id => m.el.querySelector('#' + id).value;
    err('');
    if (g('cp-new') !== g('cp-new2')) return err('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (passwordScore(g('cp-new')).score < 2) return err('รหัสผ่านใหม่ยังเดาง่ายเกินไป — ลองเพิ่มความยาวหรืออักขระพิเศษ');

    btn.disabled = true;
    try{
      await changePassword(g('cp-old'), g('cp-new'));
      m.close();
      toast('เปลี่ยนรหัสผ่านเรียบร้อย', 'ok');
    }catch(ex){
      btn.disabled = false;
      err(ex.message);
    }
  });
  m.el.querySelector('#cp-old').focus();
}

/* ------------------------------------------------------------ helpers */
function repaint(root, ctx, view){
  paint(root, view.render(ctx));
  view.mount(root, ctx);
}

/** ย่อรูปให้ด้านยาวสุดไม่เกิน max px แล้วคืนเป็น dataURL (กัน localStorage เต็ม) */
function shrinkImage(file, max){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * k), h = Math.round(img.height * k);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
