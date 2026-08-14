/* ============================================================
   ai/presentation.js — ส่วนแสดงผลร่วมของฟีเจอร์ AI
   ============================================================ */

import { icon, esc } from '../ui.js';

/** ป้ายกำกับว่าผลลัพธ์มาจากโมเดลจริงหรือเอนจินสำรองในเครื่อง */
export function sourceBadge(source, {
  aiLabel = 'AI ช่วยเรียบเรียง',
  localLabel = 'เอนจินในเครื่อง',
} = {}){
  if (!source) return '';
  const isAI = source === 'ai';
  const label = isAI ? aiLabel : localLabel;
  const title = isAI
    ? 'ผลลัพธ์นี้สร้างผ่าน AI gateway'
    : 'AI ไม่พร้อมหรือปิดอยู่ ระบบจึงใช้เอนจินในเครื่องแทน';
  return `<span class="pill ai-source ${isAI ? 'ai' : 'local'}" title="${esc(title)}">
    ${icon(isAI ? 'spark' : 'shield')} ${esc(label)}
  </span>`;
}
