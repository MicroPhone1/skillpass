/* ============================================================
   views/certs.js — เกียรติบัตร: รายการที่ได้รับ + ความคืบหน้าสู่ใบถัดไป
   ============================================================ */

import { icon, on, esc, toast, modal, ring, clamp, paint } from '../ui.js';
import { state, certificateName } from '../store.js';
import { trackById } from '../data/tracks.js';
import { eligibility, issue, levelOf, certificateSVG, LANGS, setLang,
         downloadPNG, downloadSVG, printCertificate } from '../certificate.js';
import { save } from '../store.js';

const fmtDate = ts => new Date(ts).toLocaleDateString('th-TH',
  { day:'numeric', month:'long', year:'numeric' });

export default {
  title: ctx => ctx.route.sub ? 'เกียรติบัตร' : 'เกียรติบัตรของฉัน',
  sub: ctx => ctx.route.sub
    ? 'บันทึกไว้เป็น PNG ไฟล์ภาพคมชัด หรือสั่งพิมพ์ลงกระดาษ A4 แนวนอน'
    : 'ออกให้เมื่อผ่านเกณฑ์ทั้งภาคทฤษฎีและภาคปฏิบัติ — ชื่อบนใบมาจากโปรไฟล์ของคุณ',

  render(ctx){
    return ctx.route.sub ? detailView(ctx.route.sub) : listView();
  },

  mount(root, ctx){
    /* ---------- ออกเกียรติบัตร ---------- */
    on(root, 'click', '[data-issue]', (e, t) => issueNow(t.dataset.issue));

    /* ---------- ปุ่มบนหน้าใบ ---------- */
    on(root, 'click', '[data-print]', (e, t) => withCert(t.dataset.print, printCertificate));

    on(root, 'click', '[data-png]', async (e, t) => {
      const cert = find(t.dataset.png);
      if (!cert) return;
      t.disabled = true;
      const label = t.innerHTML;
      t.innerHTML = icon('refresh') + ' กำลังสร้างไฟล์…';
      try{
        await downloadPNG(cert);
        toast('บันทึกไฟล์ PNG แล้ว', 'ok');
      }catch{
        toast('สร้างไฟล์ภาพไม่สำเร็จ — ลองใช้ปุ่มพิมพ์แทน', 'bad');
      }finally{
        t.disabled = false; t.innerHTML = label;
      }
    });

    on(root, 'click', '[data-svg]', (e, t) => {
      withCert(t.dataset.svg, downloadSVG);
      toast('บันทึกไฟล์ SVG แล้ว', 'ok');
    });

    on(root, 'click', '[data-copy]', (e, t) => {
      navigator.clipboard?.writeText(t.dataset.copy)
        .then(() => toast('คัดลอกเลขที่เกียรติบัตรแล้ว', 'ok'))
        .catch(() => toast('คัดลอกไม่สำเร็จ', 'bad'));
    });

    on(root, 'click', '[data-checks]', (e, t) => openChecklist(t.dataset.checks));

    /* ---------- สลับภาษาแบบทันตา ----------
       ต้องวาดใหม่ทั้งหน้า ไม่ใช่แค่ตัวใบ เพราะตารางรายละเอียดด้านล่าง
       (ชื่อหลักสูตร ผลการประเมิน) ก็เปลี่ยนตามภาษาด้วย */
    on(root, 'click', '[data-lang]', (e, t) => {
      if (t.getAttribute('aria-pressed') === 'true') return;
      const c = setLang(t.dataset.cert, t.dataset.lang);
      if (!c) return;
      save();

      const stage = root.querySelector('#cert-stage');
      stage?.classList.add('swapping');           // เฟดสั้น ๆ ให้เห็นว่าเปลี่ยนแล้ว
      requestAnimationFrame(() => {
        paint(root, this.render(ctx));
        this.mount(root, ctx);
        root.querySelector('#cert-stage')?.classList.add('swapped');
      });
    });

    /* ---------- ดูใบเต็มจอ (ปิดด้วยกากบาทมุมขวาบน / Esc / คลิกนอกกรอบ) ---------- */
    on(root, 'click', '[data-zoom]', (e, t) => {
      const cert = find(t.dataset.zoom);
      if (!cert) return;
      modal(`<div class="cert-zoom">${certificateSVG(cert)}</div>`,
        { size:'wide', label:`เกียรติบัตร ${trackById(cert.trackId).name}` });
    });
  },
};

const find = id => state.certificates.find(c => c.id === id);
const withCert = (id, fn) => { const c = find(id); if (c) fn(c); };

/** ออกใบแล้วพาไปหน้าใบนั้น — ใช้ร่วมกันทั้งปุ่มในหน้าและปุ่มในหน้าต่างเช็กเกณฑ์ */
function issueNow(trackId){
  const r = issue(trackId);
  if (!r) return toast('ยังไม่ผ่านเกณฑ์ครบทุกข้อ', 'bad');
  toast(`ออกเกียรติบัตร ${trackById(trackId).name} เรียบร้อย 🎉`, 'ok', 3600);
  location.hash = '#/certs/' + r.cert.id;
}

/* ============================================================
   LIST
   ============================================================ */
function listView(){
  const certs = state.certificates;
  const tracks = state.enrolled.map(id => ({ id, cert: certs.find(c => c.trackId === id), ...eligibility(id) }));
  const ready = tracks.filter(t => !t.cert && t.ok);
  const working = tracks.filter(t => !t.cert && !t.ok);

  return `
  <div class="stack" style="gap:20px">

    ${ready.length ? `
    <section class="hero" style="background:linear-gradient(128deg,#1A3CA0,#0B1F52)">
      <div class="row" style="justify-content:space-between;gap:20px">
        <div style="flex:1;min-width:min(100%,280px)">
          <span class="pill" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff">
            ${icon('medal')} ผ่านเกณฑ์แล้ว ${ready.length} หลักสูตร
          </span>
          <h2 style="margin-top:12px">คุณพร้อมรับเกียรติบัตรแล้ว</h2>
          <p>ระบบตรวจแล้วว่าคุณผ่านทั้งภาคทฤษฎีและภาคปฏิบัติ กดออกใบได้เลย
             ชื่อบนเกียรติบัตรจะใช้ “${esc(certificateName())}” ตามที่ตั้งไว้ในโปรไฟล์</p>
          <div class="row" style="margin-top:16px">
            ${ready.map(t => `<button class="btn btn-primary" data-issue="${t.id}">
              ${icon('medal')} ออกใบ: ${esc(trackById(t.id).name)}</button>`).join('')}
            <a class="btn btn-ghost" href="#/profile">${icon('people')} แก้ชื่อบนใบ</a>
          </div>
        </div>
      </div>
    </section>` : ''}

    <!-- ===== ใบที่ได้รับแล้ว ===== -->
    <section>
      <div class="section-title">${icon('medal')} เกียรติบัตรที่ได้รับ (${certs.length})</div>
      ${certs.length ? `
        <div class="grid cert-list">
          ${certs.map(certCard).join('')}
        </div>`
      : `<div class="card empty" style="padding:46px 20px">
          ${icon('medal')}
          <h3>ยังไม่มีเกียรติบัตร</h3>
          <p>เกียรติบัตรของ SkillPass ไม่ได้แจกเมื่อเข้าใช้งาน แต่ออกให้เมื่อมีหลักฐานว่าคุณ “ทำเป็น” จริง
             — ทำข้อสอบให้ครบเกณฑ์ แล้วพิสูจน์ภาคปฏิบัติหน้ากล้อง</p>
          <a class="btn btn-primary btn-sm" href="#/exam" style="margin-top:14px">${icon('play')} เริ่มทำข้อสอบ</a>
        </div>`}
    </section>

    <!-- ===== ความคืบหน้า ===== -->
    ${working.length ? `
    <section class="card">
      <div class="card-head">
        <div class="track-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('target')}</div>
        <div><h2>ความคืบหน้าสู่ใบถัดไป</h2><p>เหลืออะไรอีกบ้างก่อนระบบจะออกใบให้</p></div>
      </div>
      <div class="stack" style="gap:16px">
        ${working.map(t => {
          const track = trackById(t.id);
          const done = t.checks.filter(c => c.ok).length;
          const overall = t.checks.reduce((s, c) => s + c.progress, 0) / t.checks.length;
          return `
          <div class="cert-progress">
            <div class="spread" style="align-items:flex-start;gap:14px">
              <div class="row" style="gap:12px;min-width:0">
                <div class="track-ico">${icon(track.icon)}</div>
                <div style="min-width:0">
                  <b style="font-size:15px">${esc(track.name)}</b>
                  <div class="tiny muted">${esc(track.cert)}</div>
                </div>
              </div>
              <div class="row tight" style="flex:none">
                <span class="pill ${done === t.checks.length ? 'ok' : 'plain'}">${done}/${t.checks.length} เกณฑ์</span>
                <button class="btn btn-ghost btn-sm" data-checks="${t.id}">รายละเอียด</button>
              </div>
            </div>
            <div class="bar" style="margin-top:12px"><i style="width:${Math.round(clamp(overall,0,1)*100)}%"></i></div>
            <div class="row tight" style="margin-top:10px">
              ${t.checks.map(c => `<span class="pill ${c.ok ? 'ok' : 'plain'}">
                ${icon(c.ok ? 'check' : 'clock')} ${esc(c.now)}</span>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>` : ''}

    <div class="card" style="background:var(--blue-50);border-color:var(--blue-200)">
      <div class="card-head">
        <div class="track-ico" style="background:#fff">${icon('shield')}</div>
        <div>
          <h2>เกียรติบัตรนี้เชื่อถือได้แค่ไหน</h2>
          <p style="font-size:13.5px;line-height:1.75;color:var(--ink-2);margin-top:6px">
            ทุกใบผูกกับหลักฐานที่ระบบวัดได้จริง — จำนวนข้อสอบที่ทำ คะแนนความพร้อมจากโมเดล IRT
            และคะแนนภาคปฏิบัติจากการตรวจด้วยกล้อง ทั้งหมดถูกบันทึกไว้ในตัวใบพร้อมเลขที่กำกับ<br><br>
            ข้อจำกัดที่ต้องบอกตรง ๆ: ต้นแบบนี้ออกใบและเก็บข้อมูลในเบราว์เซอร์เครื่องเดียว
            จึงยังไม่สามารถใช้อ้างอิงข้ามองค์กรได้ การใช้งานจริงต้องมีเซิร์ฟเวอร์กลางออกเลขที่
            และหน้าเว็บสำหรับตรวจสอบย้อนกลับ
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

function certCard(c){
  const track = trackById(c.trackId);
  const lv = levelOf(c.score);
  return `
  <article class="cert-card">
    <a class="cert-thumb" data-thumb="${c.id}" href="#/certs/${c.id}" aria-label="เปิดเกียรติบัตร ${esc(track.name)}">
      ${certificateSVG(c)}
    </a>
    <div class="cert-meta">
      <div class="spread" style="align-items:flex-start;gap:10px">
        <div style="min-width:0">
          <b>${esc(track.name)}</b>
          <div class="tiny muted">${fmtDate(c.issuedAt)} · ${(c.lang || 'th') === 'en' ? 'English' : 'ไทย'}</div>
        </div>
        <span class="pill ${lv.tone}" style="flex:none">${icon('medal')} ${esc(lv.th)}</span>
      </div>
      <div class="row tight" style="margin-top:12px">
        <a class="btn btn-primary btn-sm" href="#/certs/${c.id}">${icon('eye')} เปิดดู</a>
        <button class="btn btn-ghost btn-sm" data-png="${c.id}">${icon('present')} PNG</button>
        <button class="btn btn-ghost btn-sm" data-print="${c.id}">${icon('book')} พิมพ์</button>
      </div>
      <div class="cert-code num" data-copy="${esc(c.code)}" role="button" tabindex="0"
        title="คลิกเพื่อคัดลอก">${icon('lock')} ${esc(c.code)}</div>
    </div>
  </article>`;
}

/* ============================================================
   DETAIL
   ============================================================ */
function detailView(id){
  const c = find(id);
  if (!c) return `
    <div class="card empty" style="padding:56px 20px">
      ${icon('info')}
      <h3>ไม่พบเกียรติบัตรใบนี้</h3>
      <p>อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง</p>
      <a class="btn btn-primary btn-sm" href="#/certs" style="margin-top:14px">กลับไปหน้าเกียรติบัตร</a>
    </div>`;

  const track = trackById(c.trackId);
  const lv = levelOf(c.score);
  const ev = c.evidence || {};
  const en = (c.lang || 'th') === 'en';

  return `
  <div class="stack" style="gap:18px;max-width:1080px;margin:0 auto;width:100%">
    <a class="btn btn-ghost btn-sm" href="#/certs" style="align-self:flex-start">${icon('arrowL')} เกียรติบัตรทั้งหมด</a>

    <div class="cert-toolbar">
      <span class="small muted">${icon('globe')} ภาษาบนเกียรติบัตร</span>
      <div class="lang-switch" role="group" aria-label="เลือกภาษาบนเกียรติบัตร">
        ${LANGS.map(l => `<button data-lang="${l.id}" data-cert="${c.id}"
          aria-pressed="${(c.lang || 'th') === l.id}">${esc(l.label)}</button>`).join('')}
      </div>
    </div>

    <div class="cert-stage" id="cert-stage">
      <button class="cert-expand" data-zoom="${c.id}" aria-label="ดูขนาดเต็ม">${icon('zone')}</button>
      ${certificateSVG(c)}
    </div>
    <p class="tiny muted cert-hint">
      ${icon('zone')} หน้าจอแคบทำให้ตัวหนังสือเล็ก — กดปุ่มขยายมุมขวาบนเพื่อดูแบบปัดได้
      หรือบันทึกเป็น PNG ไปเปิดบนเครื่องอื่น
    </p>

    <div class="row cert-actions" style="justify-content:center;gap:10px">
      <button class="btn btn-primary btn-lg" data-png="${c.id}">${icon('present')} บันทึกเป็นรูป PNG</button>
      <button class="btn btn-ghost btn-lg" data-print="${c.id}">${icon('book')} พิมพ์ / บันทึก PDF</button>
      <button class="btn btn-ghost btn-lg" data-svg="${c.id}">${icon('grid')} ไฟล์ SVG</button>
    </div>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))">
      <div class="card">
        <div class="card-head"><div><h2>รายละเอียดเกียรติบัตร</h2></div></div>
        <div class="stack" style="gap:0">
          ${[['ผู้รับ', c.name],
             ['หลักสูตร', en ? (track.nameEn || track.name) : track.name],
             ['เทียบเคียงเกณฑ์', en ? (track.certEn || track.cert) : track.cert],
             ['ผลการประเมิน', lv.th],
             ['สถาบันที่แสดงบนใบ', (en && c.schoolEn) ? c.schoolEn : (c.school || '—')],
             ['วันที่ออก', fmtDate(c.issuedAt)],
            ].map(([k, v]) => `<div class="rubric-row">
              <span class="r-name">${k}</span>
              <span class="r-score" style="font-family:var(--font);font-weight:600;text-align:right;max-width:60%">${esc(v)}</span>
            </div>`).join('')}
          <div class="rubric-row">
            <span class="r-name">เลขที่</span>
            <span class="r-score num" data-copy="${esc(c.code)}" role="button" tabindex="0"
              style="cursor:pointer;color:var(--blue-600)" title="คลิกเพื่อคัดลอก">${esc(c.code)}</span>
          </div>
        </div>
      </div>

      <div class="card" style="text-align:center">
        <div class="card-head" style="justify-content:center"><div><h2>คะแนนรวม</h2></div></div>
        ${ring(c.score/100, { size:132, stroke:12, label: c.score + '%', sub: lv.th })}
        <p class="small muted" style="margin-top:12px;line-height:1.7">
          ${ev.hasDrills
            ? `ถ่วงน้ำหนักจากความพร้อมภาคทฤษฎี 60% (${ev.readiness}%) และคะแนนภาคปฏิบัติ 40% (${ev.bestDrill}%)`
            : `มาจากคะแนนความพร้อมภาคทฤษฎีของหลักสูตรนี้`}
        </p>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="track-ico" style="background:var(--ok-soft);color:var(--ok)">${icon('shield')}</div>
        <div><h2>หลักฐานที่ใช้ออกใบนี้</h2><p>บันทึกไว้ในตัวเกียรติบัตร ณ วันที่ออก</p></div>
      </div>
      <div class="grid g4">
        ${[['ข้อสอบที่ทำสะสม', ev.questions + ' ข้อ'],
           ['ชุดข้อสอบที่ทำจบ', ev.examSets + ' ชุด'],
           ['ความพร้อมภาคทฤษฎี', ev.readiness + '%'],
           ev.hasDrills ? ['คะแนนภาคปฏิบัติ', ev.bestDrill + '%'] : ['ทักษะย่อยที่ครอบคลุม', ev.skills + ' ด้าน'],
          ].map(([k, v]) => `
          <div class="tile">
            <div class="t-lbl">${k}</div>
            <div class="t-val" style="font-size:22px">${esc(v)}</div>
          </div>`).join('')}
      </div>
      <p class="tiny muted" style="margin-top:14px;line-height:1.7">
        ชื่อบนเกียรติบัตรมาจากช่อง “ชื่อ–สกุลบนเกียรติบัตร” ในหน้าโปรไฟล์
        ถ้าแก้ชื่อที่นั่น ใบทุกใบจะอัปเดตตามอัตโนมัติ
        <a href="#/profile">แก้ไขโปรไฟล์</a>
      </p>
    </section>
  </div>`;
}

/* ------------------------------------------------------------ checklist */
function openChecklist(trackId){
  const track = trackById(trackId);
  const e = eligibility(trackId);

  const m = modal(`
    <div class="row" style="gap:12px">
      <div class="track-ico">${icon(track.icon)}</div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:18px">${esc(track.name)}</h2>
        <p class="small muted">${esc(track.cert)}</p>
      </div>
    </div>

    <div class="stack" style="gap:11px;margin-top:18px">
      ${e.checks.map(c => `
        <div class="quest ${c.ok ? 'done' : ''}">
          <div class="q-ico">${icon(c.ok ? 'check' : 'clock')}</div>
          <div class="q-body">
            <b>${esc(c.label)}</b>
            <span>ตอนนี้: ${esc(c.now)}</span>
            ${c.ok ? '' : `<div class="bar thin" style="margin-top:5px"><i style="width:${Math.round(c.progress*100)}%"></i></div>`}
          </div>
        </div>`).join('')}
    </div>

    <p class="small muted" style="margin-top:16px;line-height:1.7">
      ${e.ok
        ? 'ผ่านครบทุกเกณฑ์แล้ว — ปิดหน้าต่างนี้แล้วกดปุ่มออกใบได้เลย'
        : 'ทำให้ครบทุกข้อแล้วระบบจะออกเกียรติบัตรให้อัตโนมัติ พร้อมแจ้งเตือนทันทีที่ผ่าน'}
    </p>

    <div class="row" style="justify-content:flex-end;margin-top:18px;gap:9px">
      <button class="btn btn-ghost" data-close>ปิด</button>
      ${e.ok
        ? `<button class="btn btn-primary" id="ck-issue">${icon('medal')} ออกเกียรติบัตร</button>`
        : `<a class="btn btn-primary" href="#/exam?track=${trackId}" data-close>${icon('play')} ไปทำข้อสอบ</a>`}
    </div>`);

  // ปุ่มอยู่ใน #modal-host ซึ่งอยู่นอก #view จึงต้องผูก handler ตรงนี้เอง
  m.el.querySelector('#ck-issue')?.addEventListener('click', () => {
    m.close();
    issueNow(trackId);
  });
}
