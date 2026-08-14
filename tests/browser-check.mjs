/* Browser verification ผ่าน Chrome DevTools Protocol (ไม่ต้องติดตั้ง package เพิ่ม)
   ใช้คู่กับ Edge/Chrome ที่เปิด --remote-debugging-port=9223 และ SkillPass port 8765 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cdpBase = process.env.SKILLPASS_CDP || 'http://127.0.0.1:9223';
const appUrl = process.env.SKILLPASS_URL || 'http://127.0.0.1:8765/';
const targets = await (await fetch(`${cdpBase}/json/list`)).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('ไม่พบ browser page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once:true });
  ws.addEventListener('error', reject, { once:true });
});

let seq = 0;
const pending = new Map();
const errors = [];
const failedResponses = [];

ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)){
    const p = pending.get(msg.id); pending.delete(msg.id);
    return msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown')
    errors.push({ type:'exception', text:msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'runtime exception' });
  if (msg.method === 'Log.entryAdded' && msg.params.entry?.level === 'error')
    errors.push({ type:'log', text:msg.params.entry.text, url:msg.params.entry.url || '' });
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    errors.push({ type:'console', text:(msg.params.args || []).map(x => x.value || x.description || '').join(' ') });
  if (msg.method === 'Network.responseReceived' && msg.params.response?.status >= 400)
    failedResponses.push({ status:msg.params.response.status, url:msg.params.response.url });
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async expression => {
  const out = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || 'evaluate failed');
  return out.result.value;
};

const waitFor = async (expression, timeout = 45000) => {
  const start = Date.now();
  while (Date.now() - start < timeout){
    if (await evaluate(expression)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.navigate', { url:appUrl });
await waitFor(`document.readyState === 'complete'`, 10000);

const auth = await evaluate(`({
  title:document.title,
  content:document.body.innerText.trim().length,
  guest:[...document.querySelectorAll('button')].some(b => b.innerText.includes('ผู้เยี่ยมชม')),
  shell:!document.querySelector('#app-shell')?.hidden,
  overlay:!!document.querySelector('[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay')
})`);

if (auth.guest)
  await evaluate(`([...document.querySelectorAll('button')].find(b => b.innerText.includes('ผู้เยี่ยมชม'))?.click(), true)`);
const shellReady = await waitFor(`!document.querySelector('#app-shell')?.hidden && document.querySelector('#main-nav')?.innerText.includes('ติวเตอร์ AI')`, 10000);

await evaluate(`location.hash = '#/assessment'`);
const assessmentReady = await waitFor(`document.querySelectorAll('.development-step').length > 0`, 45000);
const assessment = await evaluate(`({
  title:document.querySelector('#page-title')?.innerText || '',
  aiStatus:document.querySelector('#ai-status')?.innerText || '',
  controls:document.querySelectorAll('.assessment-controls select').length,
  steps:document.querySelectorAll('.development-step').length,
  sourceBadges:[...document.querySelectorAll('.ai-source')].map(x => x.innerText.trim()),
  blank:document.body.innerText.trim().length === 0,
  overlay:!!document.querySelector('[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay')
})`);

const shot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
const screenshot = path.join(os.tmpdir(), 'skillpass-assessment-browser-check.png');
fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
ws.close();

const report = { auth, shellReady, assessmentReady, assessment, errors, failedResponses, screenshot };
console.log(JSON.stringify(report, null, 2));

const failed = !auth.content || (!auth.guest && !auth.shell) || auth.overlay || !shellReady || !assessmentReady ||
  assessment.blank || assessment.overlay || assessment.controls !== 2 || !assessment.steps || errors.length || failedResponses.length;
process.exit(failed ? 1 : 0);
