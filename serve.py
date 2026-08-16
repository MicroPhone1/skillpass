#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serve.py — เซิร์ฟเวอร์สำหรับพัฒนา/สาธิต Check Chang

ทำไมต้องมีไฟล์นี้แทนการเปิด index.html ตรง ๆ:
  1) แอปใช้ ES modules (import/export) ซึ่งเบราว์เซอร์บล็อกเมื่อเปิดผ่าน file://
  2) กล้องและไมโครโฟน (getUserMedia) ทำงานเฉพาะบน HTTPS หรือ localhost
     ถ้าจะเปิดบนมือถือผ่าน Wi-Fi เดียวกัน "ต้อง" เป็น https เท่านั้น

สคริปต์นี้จะสร้างใบรับรองแบบ self-signed ให้อัตโนมัติถ้ามี openssl
(Git for Windows มีมาให้อยู่แล้ว) แล้วเปิดเซิร์ฟเวอร์ https
พร้อมพิมพ์ลิงก์สำหรับเครื่องนี้และสำหรับมือถือ

วิธีใช้:
    python serve.py                # https ที่พอร์ต 8443 (แนะนำ)
    python serve.py --http         # บังคับใช้ http (กล้องจะใช้ได้เฉพาะบนเครื่องนี้)
    python serve.py --port 9000
"""

import argparse
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import ssl
import subprocess
import sys
import threading
from pathlib import Path

import aigateway

ROOT = Path(__file__).resolve().parent
CERT_DIR = ROOT / ".certs"
CERT = CERT_DIR / "cert.pem"
KEY = CERT_DIR / "key.pem"

C = {
    "b": "\033[1m", "dim": "\033[2m", "off": "\033[0m",
    "blue": "\033[38;5;33m", "cyan": "\033[36m",
    "green": "\033[32m", "yellow": "\033[33m", "red": "\033[31m",
}

if os.name == "nt":
    os.system("")  # เปิด ANSI colour บน Windows console
    # คอนโซล Windows ตั้งค่าเริ่มต้นเป็น cp1252 ซึ่งพิมพ์ภาษาไทยไม่ได้
    for stream in (sys.stdout, sys.stderr):
        try:
            if (stream.encoding or "").lower().replace("-", "") != "utf8":
                stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def lan_ip() -> str:
    """หา IP ของเครื่องในวง LAN (ไม่ต้องต่อเน็ตจริง)"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def find_openssl():
    exe = shutil.which("openssl")
    if exe:
        return exe
    # Git for Windows ติดตั้ง openssl มาให้ แต่ไม่ได้อยู่ใน PATH
    for p in (
        r"C:\Program Files\Git\mingw64\bin\openssl.exe",
        r"C:\Program Files\Git\usr\bin\openssl.exe",
        r"C:\Program Files (x86)\Git\mingw64\bin\openssl.exe",
    ):
        if Path(p).exists():
            return p
    return None


def make_cert(ip: str) -> bool:
    """สร้างใบรับรอง self-signed ที่ครอบคลุม localhost และ IP ในวง LAN"""
    if CERT.exists() and KEY.exists():
        # ถ้า IP เปลี่ยน (ย้าย Wi-Fi) ให้สร้างใหม่
        try:
            txt = CERT.read_text(errors="ignore")
            marker = (CERT_DIR / "ip.txt")
            if marker.exists() and marker.read_text().strip() == ip:
                return True
        except Exception:
            pass

    exe = find_openssl()
    if not exe:
        return False

    CERT_DIR.mkdir(exist_ok=True)
    san = f"subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{ip}"
    cmd = [
        exe, "req", "-x509", "-newkey", "rsa:2048", "-sha256",
        "-days", "825", "-nodes",
        "-keyout", str(KEY), "-out", str(CERT),
        "-subj", "/CN=Check Chang Dev",
        "-addext", san,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        (CERT_DIR / "ip.txt").write_text(ip)
        return True
    except subprocess.CalledProcessError as e:
        print(C["red"] + "สร้างใบรับรองไม่สำเร็จ:" + C["off"], e.stderr.decode(errors="ignore")[:400])
        return False


class Handler(http.server.SimpleHTTPRequestHandler):
    """เสิร์ฟจากโฟลเดอร์โปรเจกต์ + ตั้ง MIME ให้ถูกต้อง + ปิดแคชระหว่างพัฒนา"""

    # HTTP/1.1 เปิด keep-alive ให้เบราว์เซอร์ใช้การเชื่อมต่อเดิมซ้ำได้
    # หน้าเว็บนี้โหลด ES module ~35 ไฟล์ ถ้าเป็น HTTP/1.0 (ค่าเริ่มต้นของ
    # SimpleHTTPRequestHandler) จะต้องเปิด TCP+TLS ใหม่ทุกไฟล์ ซึ่งช้ามาก
    # เมื่อผ่าน tunnel จนเบราว์เซอร์ยอมแพ้ก่อนโหลดครบ
    protocol_version = "HTTP/1.1"

    # ตัดการเชื่อมต่อที่เปิดค้างไว้เฉย ๆ ไม่ให้กินเธรด
    timeout = 30

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        "": "application/octet-stream",
    }

    MAX_BODY = 256 * 1024        # คำขอ AI ที่ใหญ่กว่านี้ถือว่าผิดปกติ

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        # จำเป็นสำหรับ getUserMedia บนบางเบราว์เซอร์เมื่ออยู่ใน iframe
        self.send_header("Permissions-Policy", "camera=(self), microphone=(self)")
        super().end_headers()

    # ---------------------------------------------------------- API

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/ai/health":
            return self._json(aigateway.health())
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/api/ai":
            return self._json({"ok": False, "error": "not-found",
                               "message": f"ไม่มีปลายทาง {path}"}, 404)

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > self.MAX_BODY:
            return self._json({"ok": False, "error": "bad-request",
                               "message": "ขนาดคำขอไม่ถูกต้อง"}, 400)

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._json({"ok": False, "error": "bad-request",
                               "message": "เนื้อหาคำขอไม่ใช่ JSON"}, 400)

        role = str(payload.get("role") or "")
        result = aigateway.handle(role, payload)

        if result.get("ok"):
            ms = result["meta"]["ms"]
            sys.stderr.write(C["dim"] + f"  AI {role} ← {ms} ms" + C["off"] + "\n")
        else:
            sys.stderr.write(C["yellow"] + f"  AI {role} ✗ {result.get('error')}" + C["off"] + "\n")
        return self._json(result)

    def log_message(self, fmt, *args):
        msg = fmt % args
        if " 200 " in msg or " 304 " in msg:
            return  # เงียบไว้ เอาเฉพาะ error
        if "timed out" in msg:
            return  # keep-alive ที่ครบเวลาแล้วปิดเอง ไม่ใช่ความผิดพลาด
        sys.stderr.write(C["dim"] + f"  {self.address_string()} {msg}" + C["off"] + "\n")


class ThreadingTLSServer(socketserver.ThreadingTCPServer):
    """เซิร์ฟเวอร์ที่ทำ TLS handshake ในเธรดของแต่ละคำขอ

    ห้าม wrap_socket() ทับ "ซ็อกเก็ตที่ฟังอยู่" เด็ดขาด เพราะ handshake จะไป
    เกิดใน accept() บนเธรดหลักซึ่งมีเธรดเดียว ทุกคนที่ต่อเข้ามาจึงต้องรอ
    ต่อคิวกันทีละราย และถ้าใครสักคน handshake ค้าง คนอื่นจะค้างตามไปหมด
    ผลคือเปิดจากเครื่องอื่น/ผ่าน tunnel แล้วโหลดไฟล์ไม่ครบ
    """

    daemon_threads = True       # Ctrl+C แล้วต้องปิดได้จริง ไม่ค้างรอเธรดลูก
    ssl_ctx = None
    HANDSHAKE_TIMEOUT = 15

    def process_request_thread(self, request, client_address):
        if self.ssl_ctx is not None:
            try:
                request.settimeout(self.HANDSHAKE_TIMEOUT)
                request = self.ssl_ctx.wrap_socket(request, server_side=True)
            except OSError:
                # เบราว์เซอร์ที่ทิ้งการเชื่อมต่อกลางคัน หรือคนสแกนพอร์ต
                # ไม่ใช่เรื่องต้องรายงาน แค่ปิดทิ้งแล้วรับรายต่อไป
                self.shutdown_request(request)
                return
        super().process_request_thread(request, client_address)


def banner(scheme: str, port: int, ip: str, secure: bool):
    line = "─" * 58
    print()
    print(C["blue"] + C["b"] + "  Check Chang" + C["off"] + C["dim"] + "  ระบบเตรียมความพร้อมและฝึกทักษะ" + C["off"])
    print(C["dim"] + "  " + line + C["off"])
    print(f"  {C['b']}บนเครื่องนี้{C['off']}   {C['cyan']}{scheme}://localhost:{port}{C['off']}")
    print(f"  {C['b']}เครื่องอื่น{C['off']}    {C['cyan']}{scheme}://{ip}:{port}{C['off']}   {C['dim']}(ต่อ Wi-Fi วงเดียวกัน){C['off']}")
    print(C["dim"] + "  " + line + C["off"])

    if os.name == "nt":
        print(C["dim"] + "  เปิดไม่ติดจากเครื่องอื่น? Windows Firewall บล็อกอยู่ — รันด้วยสิทธิ์ admin:" + C["off"])
        print(C["dim"] + "    powershell -ExecutionPolicy Bypass -File share-lan.ps1" + C["off"])

    if secure:
        print(C["yellow"] + "  หมายเหตุ:" + C["off"] + " ใบรับรองเป็นแบบ self-signed เบราว์เซอร์จะเตือนครั้งแรก")
        print(C["dim"] + "    Chrome/Edge : กด “Advanced” → “Proceed to … (unsafe)”" + C["off"])
        print(C["dim"] + "    Safari/iOS  : กด “Show Details” → “visit this website”" + C["off"])
        print(C["green"] + "  กล้องและไมโครโฟนใช้งานได้ทั้งบนคอมและบนมือถือ" + C["off"])
    else:
        print(C["yellow"] + "  กำลังใช้ HTTP:" + C["off"] + " กล้องจะใช้ได้เฉพาะบนเครื่องนี้ (localhost) เท่านั้น")
        print(C["dim"] + "    ถ้าต้องการทดสอบกล้องบนมือถือ ให้ติดตั้ง openssl แล้วรันใหม่โดยไม่ใส่ --http" + C["off"])

    # ---- สถานะ AI ----
    st = aigateway.health()
    if st["ok"]:
        detail = f"(key {st['keyHint']})" if st["keyHint"] else "(รันในเครื่อง)"
        print(C["green"] + "  AI:" + C["off"] +
              f" {st['provider']} · {st['model']} · {len(st['roles'])} บทบาท "
              + C["dim"] + detail + C["off"])
        if st["provider"] == "ollama":
            print(C["dim"] + "     กำลังอุ่นโมเดลไว้เบื้องหลัง คำขอแรกจะได้ไม่ช้า…" + C["off"])
            threading.Thread(target=aigateway.warmup, daemon=True).start()
    else:
        reason = st.get("reason", "")
        print(C["yellow"] + "  AI: ยังใช้ไม่ได้" + C["off"] +
              " — ระบบจะใช้เอนจิน RAG ในเครื่องแทน (ทุกฟีเจอร์ยังทำงานปกติ)")
        if reason == "ollama-down":
            print(C["dim"] + "    เปิดโปรแกรม Ollama หรือรัน `ollama serve` ก่อน" + C["off"])
        elif reason == "model-missing":
            print(C["dim"] + f"    ยังไม่มีโมเดล {st['model']} ในเครื่อง — รัน `ollama pull {st['model']}`" + C["off"])
            if st.get("installed"):
                print(C["dim"] + f"    (ที่มีอยู่: {', '.join(st['installed'])})" + C["off"])
        else:
            print(C["dim"] + "    ขอคีย์ฟรีที่ https://aistudio.google.com/apikey แล้วใส่ใน .env:" + C["off"])
            print(C["dim"] + "    GEMINI_API_KEY=xxxxx" + C["off"])

    print(C["dim"] + f"\n  โฟลเดอร์ที่เสิร์ฟ: {ROOT}" + C["off"])
    print(C["dim"] + "  กด Ctrl+C เพื่อหยุด\n" + C["off"])


def main():
    ap = argparse.ArgumentParser(description="Check Chang dev server")
    ap.add_argument("--port", type=int, default=0, help="พอร์ต (ค่าเริ่มต้น 8443 สำหรับ https, 8000 สำหรับ http)")
    ap.add_argument("--http", action="store_true", help="บังคับใช้ HTTP แทน HTTPS")
    ap.add_argument("--api-key", help="API key ของผู้ให้บริการ AI (ทับค่าใน .env)")
    ap.add_argument("--ai-provider", help="gemini | ollama")
    ap.add_argument("--ai-model", help="ชื่อโมเดล เช่น gemini-2.5-flash")
    args = ap.parse_args()

    if args.api_key:     aigateway.CONFIG.set_key(args.api_key)
    if args.ai_provider: aigateway.CONFIG.provider = args.ai_provider.lower()
    if args.ai_model:    aigateway.CONFIG.model = args.ai_model

    ip = lan_ip()
    secure = False

    if not args.http:
        secure = make_cert(ip)
        if not secure:
            print(C["yellow"] + "  ไม่พบ openssl — จะเปิดแบบ HTTP แทน" + C["off"])
            print(C["dim"] + "  (Git for Windows มี openssl มาให้ ลองติดตั้ง Git แล้วรันใหม่)" + C["off"])

    port = args.port or (8443 if secure else 8000)

    socketserver.TCPServer.allow_reuse_address = True
    httpd = ThreadingTLSServer(("0.0.0.0", port), Handler)

    if secure:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
        httpd.ssl_ctx = ctx      # handshake ไปเกิดในเธรดของแต่ละคำขอแทน

    banner("https" if secure else "http", port, ip, secure)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n" + C["dim"] + "  หยุดเซิร์ฟเวอร์แล้ว" + C["off"])
        httpd.server_close()


if __name__ == "__main__":
    main()
