#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
aigateway.py — ตัวกลางคุยกับผู้ให้บริการโมเดลภาษา

ทำไมต้องมีไฟล์นี้ (ไม่เรียก API ตรงจากเบราว์เซอร์):
  1) API key ต้องไม่หลุดไปฝั่ง client — ใครเปิดหน้าเว็บก็อ่าน JS ได้
  2) system prompt ของแต่ละบทบาทเก็บไว้ฝั่งเซิร์ฟเวอร์ client ส่งได้แค่ "ข้อมูล"
     ไม่ใช่ "คำสั่ง" จึงแก้บทบาทของโมเดลจากหน้าเว็บไม่ได้
  3) เปลี่ยนผู้ให้บริการทีหลังได้โดยไม่ต้องแตะโค้ดหน้าเว็บเลย

การตั้งค่า (เลือกอย่างใดอย่างหนึ่ง):
    ตัวแปรสภาพแวดล้อม     GEMINI_API_KEY=xxxx
    ไฟล์ .env ข้างไฟล์นี้   GEMINI_API_KEY=xxxx
    ตอนรัน                python serve.py --api-key xxxx

ขอคีย์ฟรีได้ที่ https://aistudio.google.com/apikey
"""

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parent
TIMEOUT = 60

# ------------------------------------------------------------ การตั้งค่า

def _load_dotenv():
    """อ่านไฟล์ .env แบบง่าย ๆ (KEY=VALUE บรรทัดละคู่) โดยไม่ทับค่าที่ตั้งใน environment"""
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))


_load_dotenv()


DEFAULT_MODEL = {
    "gemini": "gemini-2.5-flash",
    # โมเดลในเครื่องที่ลงตัวที่สุดสำหรับการ์ด 8GB และยังทำภาษาไทยได้พอใช้
    "ollama": "qwen3:8b",
}


class Config:
    """ค่าตั้งของ gateway — ตั้งจาก env, .env หรือ argument ตอนรัน"""

    def __init__(self):
        self.provider = os.environ.get("SKILLPASS_AI_PROVIDER", "gemini").lower()
        self.api_key = (os.environ.get("GEMINI_API_KEY")
                        or os.environ.get("GOOGLE_API_KEY") or "").strip()
        self._model = os.environ.get("SKILLPASS_AI_MODEL", "").strip()
        self.ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")

    @property
    def model(self):
        # ถ้าไม่ได้ระบุ (หรือระบุค้างไว้จาก provider อื่น) ให้ใช้ค่าตั้งต้นของ provider ปัจจุบัน
        if self._model and not (self.provider == "ollama" and self._model.startswith("gemini")):
            return self._model
        return DEFAULT_MODEL.get(self.provider, self._model)

    @model.setter
    def model(self, v):
        self._model = (v or "").strip()

    def set_key(self, key):
        if key:
            self.api_key = key.strip()

    @property
    def enabled(self):
        if self.provider == "ollama":
            return True          # ตรวจจริงตอนเรียก — ถ้าโปรแกรมไม่เปิดจะได้ ollama-down
        return bool(self.api_key)

    def status(self):
        st = {
            "ok": self.enabled,
            "provider": self.provider,
            "model": self.model,
            "roles": sorted(ROLES.keys()),
            # ไม่ส่งคีย์ออกไป ส่งแค่ว่ามีหรือยังและลงท้ายด้วยอะไร พอให้ยืนยันว่าใส่ถูกใบ
            "keyHint": (self.api_key[:4] + "…" + self.api_key[-4:]) if self.api_key else "",
            "reason": "" if self.enabled else "no-api-key",
        }

        if self.provider == "ollama":
            models = ollama_models(self)
            st["installed"] = models or []
            if models is None:                       # ต่อไม่ได้เลย
                st["ok"] = False
                st["reason"] = "ollama-down"
            elif not any(m == self.model or m.split(":")[0] == self.model.split(":")[0]
                         for m in models):          # ต่อได้ แต่ยังไม่มีโมเดลที่ตั้งไว้
                st["ok"] = False
                st["reason"] = "model-missing"
        return st


CONFIG = Config()

# ------------------------------------------------------------ โควตา
# free tier มีเพดานต่อนาที จึงกันไว้ฝั่งเราด้วย ไม่ให้ยิงรัวจนโดนบล็อก

class RateLimiter:
    def __init__(self, per_minute=12):
        self.per_minute = per_minute
        self.hits = []
        self.lock = Lock()

    def take(self):
        now = time.time()
        with self.lock:
            self.hits = [t for t in self.hits if now - t < 60]
            if len(self.hits) >= self.per_minute:
                return False, int(60 - (now - self.hits[0])) + 1
            self.hits.append(now)
            return True, 0


LIMITER = RateLimiter(int(os.environ.get("SKILLPASS_AI_RPM", "12")))


# ============================================================
#   บทบาทของ AI — แบ่งหน้าที่ตามงาน ไม่ใช้ prompt ก้อนเดียวทำทุกอย่าง
#   แต่ละบทบาทมี: คำสั่งประจำตัว, อุณหภูมิ, และรูปแบบผลลัพธ์ที่บังคับไว้
# ============================================================

_BASE = (
    "คุณเป็นผู้ช่วยในระบบ SkillPass ซึ่งเป็นแพลตฟอร์มเตรียมสอบใบรับรองวิชาชีพและทักษะของไทย\n"
    "กติกาที่ต้องทำตามเสมอ:\n"
    "- ตอบเป็นภาษาไทยที่เป็นธรรมชาติ กระชับ ใช้ศัพท์เทคนิคที่ช่างและนักเรียนอาชีวะใช้จริง\n"
    "- ห้ามแต่งตัวเลข มาตรฐาน หรือข้อกฎหมายขึ้นเอง ถ้าไม่มีข้อมูลให้บอกว่าไม่มี\n"
    "- เรื่องความปลอดภัยต้องเตือนเสมอเมื่อเกี่ยวข้อง ห้ามแนะนำวิธีที่เสี่ยงอันตราย\n"
    "- ตอบเป็น JSON ตามโครงที่กำหนดเท่านั้น ห้ามมีข้อความนอก JSON\n"
)

# --- โครงผลลัพธ์ที่ใช้ซ้ำ ---
_BLOCK = {
    "type": "object",
    "properties": {
        "h": {"type": "string", "description": "หัวข้อย่อย เว้นว่างได้"},
        "text": {"type": "string"},
        "list": {"type": "array", "items": {"type": "string"}},
    },
}

ROLES = {
    # ---------------------------------------------------- ติวเตอร์ (RAG)
    "tutor": {
        "label": "ติวเตอร์",
        "temperature": 0.25,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: เป็นติวเตอร์ที่ตอบคำถามผู้เรียน\n"
            "สำคัญที่สุด — ตอบโดยอ้างอิงจาก 'เอกสารอ้างอิง' ที่แนบมาเท่านั้น\n"
            "ถ้าเอกสารที่ให้มาไม่มีคำตอบ ให้ตั้ง grounded=false แล้วบอกตรง ๆ ว่าคลังความรู้ยังไม่ครอบคลุม\n"
            "อย่าเดาจากความรู้ทั่วไปของคุณเองแล้วทำเป็นว่ามาจากเอกสาร\n"
            "usedSources ให้ใส่เฉพาะหมายเลขเอกสารที่คุณใช้จริง"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "lead": {"type": "string", "description": "สรุปคำตอบหนึ่งประโยค"},
                "blocks": {"type": "array", "items": _BLOCK},
                "usedSources": {"type": "array", "items": {"type": "integer"}},
                "grounded": {"type": "boolean"},
                "followUps": {"type": "array", "items": {"type": "string"},
                              "description": "คำถามต่อยอด 2-3 ข้อ"},
            },
            "required": ["lead", "blocks", "grounded"],
        },
        "template": (
            "เส้นทางที่ผู้เรียนกำลังเตรียม: {track}\n"
            "ระดับความสามารถปัจจุบัน: {level}\n\n"
            "=== เอกสารอ้างอิงจากคลังความรู้ ===\n{sources}\n"
            "=== จบเอกสารอ้างอิง ===\n\n"
            "ประวัติการคุยล่าสุด:\n{history}\n\n"
            "คำถามของผู้เรียน: {question}"
        ),
    },

    # ---------------------------------------------------- ผู้อธิบายเฉลย
    "explainer": {
        "label": "ผู้อธิบายเฉลย",
        "temperature": 0.2,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: อธิบายเฉลยข้อสอบให้ผู้เรียนที่เพิ่งตอบไป\n"
            "ถ้าตอบผิด ให้ชี้ว่า 'เข้าใจผิดตรงไหน' ก่อน แล้วค่อยพาคิดใหม่ทีละขั้น\n"
            "อย่าดุ อย่าประชด ให้กำลังใจแบบครูที่อยากให้เด็กเข้าใจจริง\n"
            "misconception ให้ระบุความเข้าใจผิดที่น่าจะเป็นสาเหตุ ถ้าตอบถูกให้เว้นว่าง"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "lead": {"type": "string"},
                "misconception": {"type": "string"},
                "steps": {"type": "array", "items": {"type": "string"},
                          "description": "วิธีคิดทีละขั้น 2-5 ขั้น"},
                "keyPoint": {"type": "string", "description": "ประโยคเดียวที่ควรจำไป"},
                "safety": {"type": "string", "description": "คำเตือนความปลอดภัย ถ้าไม่มีให้เว้นว่าง"},
            },
            "required": ["lead", "steps", "keyPoint"],
        },
        "template": (
            "โจทย์: {stem}\n"
            "ประเภทข้อ: {qtype} · ระดับความยาก: {difficulty}\n"
            "เฉลยที่ถูกต้อง: {answer}\n"
            "ผู้เรียนตอบ: {given}  ({verdict})\n"
            "ทักษะที่ข้อนี้วัด: {skill}\n\n"
            "เนื้อหาอ้างอิงที่เกี่ยวข้อง:\n{sources}"
        ),
    },

    # ---------------------------------------------------- ผู้ประเมินความสามารถ
    "assessor": {
        "label": "ผู้ประเมินความสามารถ",
        "temperature": 0.15,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: อ่านข้อมูลผลการฝึกของผู้เรียนแล้ววินิจฉัยว่า 'เก่ง/อ่อนตรงไหน และเพราะอะไร'\n"
            "คุณได้รับค่าจากโมเดล IRT (θ = ความสามารถ, se = ความคลาดเคลื่อน) และสถิติรายทักษะ\n"
            "ให้ตีความค่าพวกนี้เป็นภาษาคน อย่าพ่นตัวเลขซ้ำเฉย ๆ\n"
            "ถ้าข้อมูลยังน้อยจนสรุปไม่ได้ ให้บอกตรง ๆ ใน confidence และ caveat\n"
            "หลักฐานทุกข้อใน strengths/gaps ต้องอ้างอิงตัวเลขที่ให้มาจริง"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "headline": {"type": "string", "description": "สรุปภาพรวมหนึ่งประโยค"},
                # ใช้ enum ไม่ใช่ description เพราะโมเดลขนาดเล็กมักไม่ทำตามคำบรรยาย
                "stage": {"type": "string",
                          "enum": ["เริ่มต้น", "กำลังสร้างฐาน", "ใกล้พร้อม", "พร้อมสอบ"]},
                "strengths": {"type": "array", "items": {
                    "type": "object",
                    "properties": {"skill": {"type": "string"}, "why": {"type": "string"}},
                    "required": ["skill", "why"],
                }},
                "gaps": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "skill": {"type": "string"},
                        "why": {"type": "string", "description": "อ้างตัวเลขที่ให้มา สั้น ๆ ไม่เกิน 1 ประโยค"},
                        "rootCause": {"type": "string",
                                      "description": "สาเหตุที่น่าจะเป็น เช่น ยังไม่แม่นสูตร / ตีโจทย์ผิด / ขาดการฝึกมือ"},
                        "severity": {"type": "string", "enum": ["สูง", "กลาง", "ต่ำ"]},
                    },
                    "required": ["skill", "why", "rootCause", "severity"],
                }},
                "confidence": {"type": "string", "enum": ["สูง", "กลาง", "ต่ำ"]},
                "caveat": {"type": "string", "description": "ข้อจำกัดของการประเมินครั้งนี้"},
            },
            "required": ["headline", "stage", "gaps", "confidence"],
        },
        "template": (
            "เส้นทาง: {track} (เป้าหมาย: {cert})\n"
            "ค่าความสามารถ θ = {theta} (ช่วง -3 ถึง 3), ความคลาดเคลื่อน ±{se}\n"
            "คะแนนความพร้อม: {readiness}%\n"
            "ทำข้อสอบสะสม {questions} ข้อ · ฝึกภาคปฏิบัติ {drills} ครั้ง\n\n"
            "สถิติรายทักษะ (ทักษะ | ทำไปกี่ข้อ | ถูกกี่ข้อ | ความชำนาญ%):\n{skills}\n\n"
            "ผลการสอบย้อนหลัง (ล่าสุดอยู่บน):\n{exams}\n\n"
            "ผลการฝึกภาคปฏิบัติ:\n{practice}"
        ),
    },

    # ---------------------------------------------------- ผู้วางแผนพัฒนา
    "coach": {
        "label": "ผู้วางแผนพัฒนา",
        "temperature": 0.35,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: ออกแบบ 'แผนทำให้เก่งขึ้น' จากผลวินิจฉัยที่ได้รับ\n"
            "แผนต้องทำได้จริงในเวลาที่ผู้เรียนมี ไม่ใช่รายการยาวเหยียดที่ไม่มีใครทำ\n"
            "แต่ละขั้นต้องบอกว่า 'ทำอะไร ใช้เวลาเท่าไหร่ แล้วจะวัดว่าสำเร็จยังไง'\n"
            "เรียงจากขั้นที่คุ้มเวลาที่สุดก่อน (แก้จุดที่ดันคะแนนรวมได้มากที่สุด)\n"
            "action ต้องเลือกจาก: exam (ทำข้อสอบเจาะทักษะ), drill (ฝึกหน้ากล้อง), "
            "tutor (ให้ติวเตอร์อธิบาย), review (ทบทวนเนื้อหา) เท่านั้น"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "goal": {"type": "string", "description": "เป้าหมายของแผนนี้ วัดผลได้"},
                "horizon": {"type": "string", "description": "กรอบเวลา เช่น 2 สัปดาห์"},
                "steps": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "order": {"type": "integer"},
                        "title": {"type": "string"},
                        "action": {"type": "string", "enum": ["exam", "drill", "tutor", "review"]},
                        "skillId": {"type": "string", "description": "รหัสทักษะจากรายการที่ให้มา"},
                        "detail": {"type": "string"},
                        "minutes": {"type": "integer"},
                        "successCriteria": {"type": "string"},
                        "why": {"type": "string", "description": "ทำไมขั้นนี้ถึงคุ้มที่สุด"},
                    },
                }},
                "expectedGain": {"type": "string", "description": "ถ้าทำครบคาดว่าความพร้อมจะขึ้นเท่าไหร่"},
                "watchOut": {"type": "string", "description": "กับดักที่ผู้เรียนแบบนี้มักเจอ"},
            },
            "required": ["goal", "horizon", "steps"],
        },
        "template": (
            "ผลวินิจฉัย:\n{diagnosis}\n\n"
            "เส้นทาง: {track} · เป้าหมาย: {cert}\n"
            "เวลาที่ผู้เรียนมี: {budget}\n"
            "ความพร้อมตอนนี้ {readiness}%\n\n"
            "ทักษะย่อยที่มีในระบบ (ใช้ skillId จากรายการนี้เท่านั้น):\n{skillList}\n\n"
            "บทฝึกหน้ากล้องที่มีให้ใช้:\n{drills}"
        ),
    },

    # ---------------------------------------------------- ผู้วางแผนการสอน (ฝั่งครู)
    "planner": {
        "label": "ผู้วางแผนการสอน",
        "temperature": 0.4,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: ร่างแผนการสอนรายสัปดาห์ให้ครูอาชีวศึกษา\n"
            "คุณได้รับ: หลักสูตร ทักษะย่อยที่ต้องสอน จำนวนคาบต่อสัปดาห์ และจุดอ่อนของนักเรียนทั้งห้อง\n"
            "หลักการที่ต้องยึด:\n"
            "- เรียงหัวข้อจากพื้นฐานไปซับซ้อน อย่าข้ามขั้น\n"
            "- ทักษะที่ทั้งห้องอ่อนต้องได้เวลามากกว่า และควรมาก่อน\n"
            "- ทุกสัปดาห์ต้องมีทั้งภาคทฤษฎีและกิจกรรมที่ลงมือทำ ไม่ใช่บรรยายล้วน\n"
            "- ระบุวิธีวัดผลของสัปดาห์นั้นให้ชัด ครูต้องรู้ว่าจะดูจากอะไร\n"
            "- skillIds ต้องเลือกจากรายการที่ให้มาเท่านั้น ห้ามคิดรหัสใหม่"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "overview": {"type": "string", "description": "ภาพรวมของแผนทั้งเทอม 1-2 ประโยค"},
                "weeks": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "week": {"type": "integer"},
                        "title": {"type": "string"},
                        "objective": {"type": "string", "description": "จบสัปดาห์นี้แล้วนักเรียนทำอะไรได้"},
                        "skillIds": {"type": "array", "items": {"type": "string"}},
                        "theory": {"type": "string", "description": "หัวข้อบรรยาย"},
                        "activity": {"type": "string", "description": "กิจกรรมลงมือทำ"},
                        "assessment": {"type": "string", "description": "วิธีวัดผลสัปดาห์นี้"},
                    },
                    "required": ["week", "title", "objective", "theory", "activity", "assessment"],
                }},
                "priorityNote": {"type": "string", "description": "เรื่องที่ครูควรให้เวลามากเป็นพิเศษ และเพราะอะไร"},
            },
            "required": ["overview", "weeks"],
        },
        "template": (
            "ชั้นเรียน: {className}\n"
            "หลักสูตร: {track} (เป้าหมาย: {cert})\n"
            "จำนวนสัปดาห์ที่วางแผน: {weeks}\n"
            "คาบต่อสัปดาห์: {slots} (รวม {hours} ชั่วโมง/สัปดาห์)\n"
            "จำนวนนักเรียน: {students} คน\n\n"
            "ทักษะย่อยของหลักสูตร (ใช้ skillId จากรายการนี้เท่านั้น):\n{skillList}\n\n"
            "ภาพรวมความพร้อมของห้อง:\n{classProfile}\n\n"
            "บทฝึกภาคปฏิบัติที่มีให้ใช้:\n{drills}"
        ),
    },

    # ---------------------------------------------------- ผู้วิเคราะห์ชั้นเรียน
    "classanalyst": {
        "label": "ผู้วิเคราะห์ชั้นเรียน",
        "temperature": 0.2,
        # ระวัง: อย่าใส่วลีในเครื่องหมายคำพูดในคำสั่ง โมเดลเล็กจะลอกไปตอบตรง ๆ
        # (เคยเขียนว่า บอกครูว่า 'ควรทำอะไรต่อ' แล้ว headline ออกมาเป็นวลีนั้นทุกครั้ง)
        "system": _BASE + (
            "\nหน้าที่ของคุณ: อ่านผลของนักเรียนทั้งห้องแล้วสรุปให้ครูว่าควรทำอะไรต่อ\n"
            "ครูมีเวลาจำกัด จึงต้องจัดลำดับให้ว่าเรื่องไหนคุ้มที่สุดถ้าสอนซ่อมทั้งห้อง\n"
            "headline ต้องเป็นประโยคสรุปสภาพห้องที่มีตัวเลขจริง ไม่ใช่หัวข้อหรือคำถาม\n"
            "แยกให้ชัดระหว่าง 'ปัญหาทั้งห้อง' (สอนซ่อมรวม) กับ 'ปัญหาเฉพาะคน' (ติวเดี่ยว)\n"
            "อ้างอิงตัวเลขที่ให้มาจริงเสมอ ห้ามเดาจำนวนคน"
        ),
        "schema": {
            "type": "object",
            "properties": {
                # ต้องยกตัวอย่างรูปแบบให้ ไม่งั้นโมเดลเล็กจะลอกคำสั่งมาตอบ ("ควรทำอะไรต่อ")
                "headline": {"type": "string", "description":
                    "สรุปสภาพห้องหนึ่งประโยคพร้อมตัวเลข เช่น "
                    "'ความพร้อมเฉลี่ย 66% · 2 ใน 4 คนอ่อนเรื่องการเดินสายเหมือนกัน' "
                    "ห้ามตอบเป็นหัวข้อลอย ๆ"},
                "teachToAll": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string"},
                        "reason": {"type": "string", "description": "อ้างตัวเลขที่ให้มา"},
                        "suggestion": {"type": "string", "description": "จะสอนซ่อมยังไงให้ได้ผล"},
                    },
                    "required": ["topic", "reason", "suggestion"],
                }},
                "needAttention": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "student": {"type": "string"},
                        "issue": {"type": "string"},
                        "action": {"type": "string"},
                    },
                    "required": ["student", "issue", "action"],
                }},
                "doingWell": {"type": "string", "description": "จุดที่ห้องนี้ทำได้ดี ควรรักษาไว้"},
            },
            "required": ["headline", "teachToAll"],
        },
        # ตัวเลขสรุปคำนวณมาจากฝั่งเรียกใช้แล้ว โมเดลมีหน้าที่ตีความ ไม่ใช่คิดเลข
        # (โมเดลขนาดเล็กบวกเลขพลาดบ่อย เคยได้ค่าเฉลี่ย 68% ทั้งที่ของจริง 66%)
        "template": (
            "ชั้นเรียน: {className} · หลักสูตร {track}\n"
            "จำนวนนักเรียน: {students} คน\n"
            "ตัวเลขสรุปที่คำนวณมาแล้ว (ใช้ค่าเหล่านี้ ห้ามคำนวณเอง):\n{stats}\n\n"
            "ผลรายบุคคล (ชื่อ | ความพร้อม | จุดอ่อนหลัก | ฝึกปฏิบัติ | ใช้งานล่าสุด):\n{roster}\n\n"
            "ค่าเฉลี่ยความชำนาญรายทักษะของทั้งห้อง:\n{classSkills}"
        ),
    },

    # ---------------------------------------------------- ผู้ช่วยประจำหน้า (จำกัดขอบเขต)
    "assistant": {
        "label": "ผู้ช่วยประจำหน้า",
        "temperature": 0.25,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: เป็นผู้ช่วยประจำหน้าจอหนึ่งของระบบ ตอบเฉพาะเรื่องในขอบเขตที่กำหนด\n"
            "กติกาเพิ่มเติมที่เข้มกว่าปกติ:\n"
            "- ตอบจาก 'ข้อมูลบนหน้าจอ' ที่แนบมาเท่านั้น ห้ามใช้ความรู้นอกเหนือจากนี้มาตอบเป็นข้อเท็จจริง\n"
            "- ถ้าคำถามอยู่นอกขอบเขตของหน้านี้ ให้ตั้ง inScope=false แล้วบอกสุภาพ ๆ ว่าหน้านี้ตอบเรื่องนั้นไม่ได้"
            " พร้อมชี้ว่าควรไปหน้าไหนแทน ห้ามพยายามตอบเรื่องนอกขอบเขต\n"
            "- ถ้าอยู่ในขอบเขตแต่ข้อมูลบนหน้าไม่พอ ให้ตั้ง inScope=true แล้วบอกว่าต้องการข้อมูลอะไรเพิ่ม\n"
            "- ตอบสั้น ตรงประเด็น ผู้ใช้กำลังทำงานอยู่หน้าจอนี้"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "inScope": {"type": "boolean"},
                "answer": {"type": "string", "description": "คำตอบ 1-4 ประโยค"},
                "points": {"type": "array", "items": {"type": "string"},
                           "description": "ประเด็นย่อย 0-4 ข้อ ถ้าไม่จำเป็นให้เว้นว่าง"},
                "redirect": {"type": "string",
                             "description": "ถ้านอกขอบเขต ให้บอกว่าควรไปหน้าไหน ไม่งั้นเว้นว่าง"},
            },
            "required": ["inScope", "answer"],
        },
        "template": (
            "หน้าจอที่ผู้ใช้อยู่: {scope}\n"
            "หน้านี้ตอบได้เฉพาะเรื่อง: {topics}\n"
            "เรื่องที่อยู่นอกขอบเขตของหน้านี้: {outOfScope}\n\n"
            "=== ข้อมูลบนหน้าจอตอนนี้ ===\n{context}\n=== จบข้อมูล ===\n\n"
            "คำถามของผู้ใช้: {question}"
        ),
    },

    # ---------------------------------------------------- ผู้ให้ฟีดแบ็กภาคปฏิบัติ
    "practice": {
        "label": "ผู้ให้ฟีดแบ็กภาคปฏิบัติ",
        "temperature": 0.3,
        "system": _BASE + (
            "\nหน้าที่ของคุณ: แปลงตัวเลขที่วัดได้จากกล้อง/ไมค์ เป็นคำแนะนำที่ผู้เรียนเอาไปแก้ได้ทันที\n"
            "อ้างอิงตัวเลขจริงที่วัดได้เสมอ เช่น 'คุณทำได้ 137 ครั้ง/นาที ซึ่งเร็วกว่าเป้า 120'\n"
            "ให้คำแนะนำเชิงกายภาพที่ทำตามได้ ไม่ใช่คำกว้าง ๆ อย่าง 'พยายามให้ดีขึ้น'"
        ),
        "schema": {
            "type": "object",
            "properties": {
                "verdict": {"type": "string", "description": "สรุปผลหนึ่งประโยค"},
                "doNext": {"type": "array", "items": {"type": "string"},
                           "description": "สิ่งที่ควรแก้ 2-3 ข้อ เรียงตามผลกระทบ"},
                "keepDoing": {"type": "string", "description": "สิ่งที่ทำได้ดีแล้ว ควรรักษาไว้"},
                "safety": {"type": "string"},
            },
            "required": ["verdict", "doNext"],
        },
        "template": (
            "บทฝึก: {drill} ({mode})\n"
            "ทักษะที่วัด: {skill}\n"
            "คะแนนรวม: {score}\n"
            "คะแนนตามเกณฑ์:\n{rubric}\n"
            "ค่าที่วัดได้จริง:\n{metrics}\n"
            "เกณฑ์เป้าหมายของบทฝึกนี้: {target}"
        ),
    },
}


# ============================================================
#   ผู้ให้บริการโมเดล
# ============================================================

class UpstreamError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _post_json(url, payload, headers=None, timeout=TIMEOUT):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")[:600]
        if e.code == 429:
            # 429 มาได้จากสองเรื่องที่แก้คนละทาง ต้องแยกให้ผู้ใช้รู้ว่าต้องทำอะไร
            if re.search(r"prepayment|billing|credits", body, re.I):
                raise UpstreamError(
                    "billing",
                    "โปรเจกต์ของคีย์นี้เครดิตหมด (อยู่ในโหมดเติมเงิน จึงใช้โควตาฟรีไม่ได้) — "
                    "สร้างคีย์ใหม่ในโปรเจกต์ที่ยังไม่ผูกบิลที่ https://aistudio.google.com/apikey")
            raise UpstreamError("rate-limit", "ใช้โควตาต่อนาทีหมดแล้ว รอสักครู่แล้วลองใหม่")
        if e.code in (401, 403):
            raise UpstreamError("bad-key", "API key ไม่ถูกต้องหรือยังไม่ได้เปิดใช้งาน Generative Language API")
        if e.code == 400 and "API_KEY_INVALID" in body:
            raise UpstreamError("bad-key", "API key ไม่ถูกต้อง")
        raise UpstreamError("upstream", f"ผู้ให้บริการตอบกลับผิดพลาด ({e.code})")
    except urllib.error.URLError as e:
        raise UpstreamError("offline", f"ต่อออกอินเทอร์เน็ตไม่ได้: {e.reason}")
    except TimeoutError:
        raise UpstreamError("timeout", "โมเดลตอบช้าเกินกำหนด")


def _strip_fence(text):
    """บางครั้งโมเดลห่อ JSON ด้วย ```json ... ``` แม้จะสั่ง responseMimeType แล้ว"""
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*(.+?)\s*```$", t, re.S)
    return m.group(1) if m else t


def call_gemini(role_key, prompt, cfg):
    role = ROLES[role_key]
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{cfg.model}:generateContent?key={cfg.api_key}")

    payload = {
        "systemInstruction": {"parts": [{"text": role["system"]}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": role["temperature"],
            "responseMimeType": "application/json",
            "responseSchema": role["schema"],
            "maxOutputTokens": 2048,
        },
        # ปิดตัวกรองที่เข้มเกินไป เพราะเนื้อหาช่างไฟฟ้า/ปฐมพยาบาลพูดถึงอันตรายเป็นปกติ
        "safetySettings": [
            {"category": c, "threshold": "BLOCK_ONLY_HIGH"} for c in (
                "HARM_CATEGORY_DANGEROUS_CONTENT", "HARM_CATEGORY_HARASSMENT",
                "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT")
        ],
    }

    res = _post_json(url, payload)
    cands = res.get("candidates") or []
    if not cands:
        fb = (res.get("promptFeedback") or {}).get("blockReason")
        raise UpstreamError("blocked", f"โมเดลไม่ตอบกลับ ({fb or 'ไม่ทราบสาเหตุ'})")

    cand = cands[0]
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise UpstreamError("empty", f"โมเดลตอบว่าง (finishReason={cand.get('finishReason')})")

    try:
        return json.loads(_strip_fence(text))
    except json.JSONDecodeError:
        raise UpstreamError("bad-json", "โมเดลตอบกลับไม่ใช่ JSON ที่อ่านได้")


def _to_ollama_schema(schema):
    """
    Ollama รับ JSON Schema มาตรฐาน แต่ต้องมี required และไม่รู้จัก 'description'
    ที่ซ้อนลึกบางแบบ จึงแปลงให้เรียบง่ายและใส่ required ให้ครบทุกชั้นบนสุด
    """
    s = json.loads(json.dumps(schema))          # copy
    if s.get("type") == "object" and "required" not in s:
        s["required"] = list(s.get("properties", {}).keys())
    return s


_THINK = re.compile(r"<think>.*?</think>\s*", re.S)


def call_ollama(role_key, prompt, cfg):
    """
    ทางเลือกแบบรันในเครื่อง — ไม่ต้องมีคีย์ ไม่มีโควตา ข้อมูลไม่ออกนอกเครื่อง
    ต้องติดตั้ง Ollama และดึงโมเดลไว้ก่อน (ดู README)
    """
    role = ROLES[role_key]
    payload = {
        "model": cfg.model,
        "system": role["system"],
        "prompt": prompt,
        # ส่ง schema จริงไป ไม่ใช่แค่ "json" — โมเดลเล็กจะทำตามโครงได้แม่นขึ้นมาก
        "format": _to_ollama_schema(role["schema"]),
        "stream": False,
        "think": False,                         # ปิดโหมดคิดออกเสียงของ Qwen3/DeepSeek
        "options": {
            "temperature": role["temperature"],
            "num_ctx": 8192,
            "num_predict": 1600,
        },
        "keep_alive": "10m",                    # คงโมเดลไว้ในแรม คำขอถัดไปจะเร็วขึ้นมาก
    }

    try:
        res = _post_json(f"{cfg.ollama_url}/api/generate", payload, timeout=180)
    except UpstreamError as e:
        if e.code == "offline":
            raise UpstreamError(
                "ollama-down",
                "ต่อกับ Ollama ไม่ได้ — เปิดโปรแกรม Ollama หรือรัน `ollama serve` ก่อน")
        raise

    text = _THINK.sub("", res.get("response", "")).strip()
    if not text:
        raise UpstreamError("empty", "โมเดลในเครื่องตอบว่าง")
    try:
        return json.loads(_strip_fence(text))
    except json.JSONDecodeError:
        raise UpstreamError("bad-json", "โมเดลในเครื่องตอบกลับไม่ใช่ JSON ที่อ่านได้")


def ollama_models(cfg=CONFIG):
    """
    รายชื่อโมเดลที่ดึงไว้แล้วในเครื่อง
    คืน None เมื่อ 'ต่อ Ollama ไม่ได้' ซึ่งต่างจาก [] ที่แปลว่า 'ต่อได้แต่ยังไม่มีโมเดล'
    — สองกรณีนี้แก้คนละวิธี จึงต้องแยกให้ผู้ใช้เห็น
    """
    try:
        with urllib.request.urlopen(f"{cfg.ollama_url}/api/tags", timeout=5) as r:
            return [m["name"] for m in json.loads(r.read()).get("models", [])]
    except Exception:
        return None


PROVIDERS = {"gemini": call_gemini, "ollama": call_ollama}


# ============================================================
#   จุดเข้าใช้งาน
# ============================================================

def _fill(template, data):
    """เติมค่าลง template โดยไม่ให้ค่าที่ขาดทำให้ทั้งคำขอพัง"""
    class _Safe(dict):
        def __missing__(self, k):
            return "(ไม่มีข้อมูล)"
    return template.format_map(_Safe(data))


MAX_FIELD = 6000     # กันไม่ให้ client ยัดข้อความยาวจนเปลืองโควตา


def handle(role_key, payload, cfg=CONFIG):
    """
    เรียกโมเดลตามบทบาทที่ระบุ
    @returns dict พร้อมส่งเป็น JSON กลับไปให้เบราว์เซอร์
    """
    started = time.time()

    if role_key not in ROLES:
        return {"ok": False, "error": "unknown-role",
                "message": f"ไม่รู้จักบทบาท '{role_key}'"}

    if not cfg.enabled:
        return {"ok": False, "error": "no-provider",
                "message": "ยังไม่ได้ตั้งค่า API key — ระบบจะใช้เอนจินในเครื่องแทน"}

    ok, wait = LIMITER.take()
    if not ok:
        return {"ok": False, "error": "rate-limit", "retryAfter": wait,
                "message": f"ส่งคำขอถี่เกินไป ลองใหม่ในอีก {wait} วินาที"}

    # client ส่งได้เฉพาะ "ข้อมูล" ที่เป็นข้อความ ไม่ใช่โครงสร้างที่แทรกคำสั่งได้
    fields = {k: str(v)[:MAX_FIELD] for k, v in (payload.get("input") or {}).items()}
    prompt = _fill(ROLES[role_key]["template"], fields)

    try:
        data = PROVIDERS[cfg.provider](role_key, prompt, cfg)
    except UpstreamError as e:
        return {"ok": False, "error": e.code, "message": e.message}
    except Exception as e:                                   # กันพังทั้งเซิร์ฟเวอร์
        return {"ok": False, "error": "internal", "message": f"เกิดข้อผิดพลาดภายใน: {e}"}

    return {
        "ok": True,
        "role": role_key,
        "data": data,
        "meta": {
            "provider": cfg.provider,
            "model": cfg.model,
            "ms": int((time.time() - started) * 1000),
        },
    }


def health(cfg=CONFIG):
    return cfg.status()


def warmup(cfg=CONFIG):
    """
    โหลดโมเดลเข้าหน่วยความจำการ์ดจอไว้ล่วงหน้า
    เพราะคำขอแรกหลังเปิดเครื่องใช้เวลาราว 50 วินาทีไปกับการโหลดโมเดล
    ส่วนคำขอถัดไปเหลือราว 5 วินาที — ผู้ใช้คนแรกไม่ควรต้องรับภาระนั้น
    """
    if cfg.provider != "ollama" or not cfg.status()["ok"]:
        return False
    try:
        _post_json(f"{cfg.ollama_url}/api/generate",
                   {"model": cfg.model, "prompt": "hi", "stream": False,
                    "options": {"num_predict": 1}, "keep_alive": "30m"},
                   timeout=180)
        return True
    except Exception:
        return False
