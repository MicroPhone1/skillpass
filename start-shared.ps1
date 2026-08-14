# start-shared.ps1 — เปิดเซิร์ฟเวอร์ + Cloudflare Tunnel ในคำสั่งเดียว
#
#   powershell -ExecutionPolicy Bypass -File start-shared.ps1
#
# ไม่ต้องใช้สิทธิ์ admin · ได้ URL https ที่เปิดได้จากทุกที่
# ปิดทั้งหมดด้วย Ctrl+C ที่หน้าต่างนี้
#
# ⚠️ เว็บจะเปิดสู่อินเทอร์เน็ตสาธารณะ ใครได้ URL ไปก็เข้าได้
#    ระบบล็อกอินทำงานฝั่งเบราว์เซอร์ล้วน กันคนที่ตั้งใจเจาะไม่ได้
#    เหมาะกับการสาธิตช่วงสั้น ๆ แล้วปิด

param(
    [int]$Port = 8443,
    [switch]$KeepServer      # ใช้เมื่อเปิด serve.py ไว้เองแล้ว ไม่ต้องให้สคริปต์เปิดซ้ำ
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# คอนโซล Windows ใช้ codepage ที่พิมพ์ภาษาไทยไม่ได้ ต้องสลับเป็น UTF-8 ก่อน
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    chcp 65001 | Out-Null
} catch {}

# ---------- หา cloudflared ----------
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
    foreach ($p in @(
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
    )) { if (Test-Path $p) { $cf = $p; break } }
}
if (-not $cf) {
    Write-Host "`n  ไม่พบ cloudflared — ติดตั้งด้วย: winget install Cloudflare.cloudflared`n" -ForegroundColor Red
    exit 1
}

# ---------- ข้ามการตรวจใบรับรอง self-signed ตอนเช็กสถานะ ----------
Add-Type @"
using System.Net;using System.Security.Cryptography.X509Certificates;
public class SkipCert : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p){return true;}
}
"@ -ErrorAction SilentlyContinue
[System.Net.ServicePointManager]::CertificatePolicy = New-Object SkipCert

function Test-Server {
    try { Invoke-WebRequest "https://localhost:$Port/" -TimeoutSec 3 -UseBasicParsing | Out-Null; $true }
    catch { $false }
}

Write-Host ""
Write-Host "  SkillPass — เปิดให้เข้าจากภายนอก" -ForegroundColor Cyan
Write-Host "  ------------------------------------------------------"

# ---------- 1) เซิร์ฟเวอร์ ----------
$serverProc = $null
if (Test-Server) {
    Write-Host "  [1] เซิร์ฟเวอร์เปิดอยู่แล้วที่พอร์ต $Port" -ForegroundColor DarkGray
} elseif ($KeepServer) {
    Write-Host "  [1] เซิร์ฟเวอร์ยังไม่เปิด และสั่ง -KeepServer ไว้ — หยุด" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  [1] กำลังเปิดเซิร์ฟเวอร์…" -NoNewline
    $env:PYTHONIOENCODING = "utf-8"
    $serverProc = Start-Process python -ArgumentList "serve.py" -PassThru -WindowStyle Minimized
    for ($i = 0; $i -lt 20 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 500 }
    if (Test-Server) { Write-Host " เปิดแล้ว (PID $($serverProc.Id))" -ForegroundColor Green }
    else {
        Write-Host " ไม่สำเร็จ" -ForegroundColor Red
        Write-Host "      ลองรัน python serve.py เองเพื่อดูข้อความผิดพลาด" -ForegroundColor DarkGray
        exit 1
    }
}

# ---------- 2) สถานะ AI ----------
try {
    $ai = Invoke-RestMethod "https://localhost:$Port/api/ai/health" -TimeoutSec 5
    if ($ai.ok) { Write-Host "  [2] AI: $($ai.provider) · $($ai.model) · $($ai.roles.Count) บทบาท" -ForegroundColor Green }
    else { Write-Host "  [2] AI ยังใช้ไม่ได้ ($($ai.reason)) — ระบบจะใช้เอนจินในเครื่องแทน" -ForegroundColor Yellow }
} catch { Write-Host "  [2] เช็กสถานะ AI ไม่ได้" -ForegroundColor Yellow }

# ---------- 3) tunnel ----------
Write-Host "  [3] กำลังขอ URL สาธารณะจาก Cloudflare…" -ForegroundColor DarkGray
Write-Host "  ------------------------------------------------------"

# ปิด tunnel เก่าที่ค้างอยู่ ไม่งั้นจะมีหลาย URL ชี้ที่เดียวกันจนสับสน
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$urlFile = Join-Path $root ".tunnel-url.txt"
$logFile = Join-Path $env:TEMP "skillpass-tunnel.log"
Remove-Item $logFile, $urlFile -ErrorAction SilentlyContinue

# หมายเหตุสำคัญของ PowerShell 5.1:
# ห้ามใช้ `& exe ... 2>&1 | ForEach-Object` กับโปรแกรมภายนอก เพราะ PS จะห่อ
# ทุกบรรทัดของ stderr เป็น ErrorRecord แล้ว pipeline จะพังทันที
# (cloudflared เขียน log ทั้งหมดลง stderr) จึงต้องเขียนลงไฟล์แล้วค่อยอ่านแทน
$tunnel = Start-Process $cf `
    -ArgumentList @("tunnel", "--url", "https://localhost:$Port", "--no-tls-verify") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardError $logFile -RedirectStandardOutput "$logFile.out"

try {
    $url = $null
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if ($tunnel.HasExited) { break }
        $text = Get-Content $logFile, "$logFile.out" -Raw -ErrorAction SilentlyContinue
        if ($text -match "https://[a-z0-9-]+\.trycloudflare\.com") { $url = $Matches[0] }
    }

    if (-not $url) {
        Write-Host "  ขอ URL ไม่สำเร็จ — ดู log ที่ $logFile" -ForegroundColor Red
        Get-Content $logFile -Tail 6 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        return
    }

    Set-Content -Path $urlFile -Value $url -Encoding utf8
    try { Set-Clipboard -Value $url } catch {}

    Write-Host ""
    Write-Host "      $url " -ForegroundColor Black -BackgroundColor Green
    Write-Host ""
    Write-Host "  คัดลอกไว้ในคลิปบอร์ดแล้ว · บันทึกไว้ที่ .tunnel-url.txt" -ForegroundColor DarkGray
    Write-Host "  ไม่มีคำเตือนใบรับรอง กล้อง/ไมค์จึงใช้ได้ทันทีบนเครื่องอื่น" -ForegroundColor DarkGray
    Write-Host "  URL นี้จะเปลี่ยนทุกครั้งที่เปิดใหม่ (quick tunnel ไม่ต้องมีบัญชี)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  กด Ctrl+C เพื่อปิดทั้งหมด" -ForegroundColor DarkGray
    Write-Host "  ------------------------------------------------------"

    # ค้างไว้จนกว่าผู้ใช้จะกด Ctrl+C หรือ tunnel หลุด
    while (-not $tunnel.HasExited) { Start-Sleep -Seconds 1 }
    Write-Host "`n  tunnel หลุดการเชื่อมต่อ" -ForegroundColor Yellow
}
finally {
    if ($tunnel -and -not $tunnel.HasExited) {
        Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    }
    # ปิดเซิร์ฟเวอร์เฉพาะตัวที่สคริปต์นี้เปิดเอง ไม่ไปยุ่งกับที่ผู้ใช้เปิดไว้ก่อน
    if ($serverProc -and -not $serverProc.HasExited) {
        Write-Host "  ปิดเซิร์ฟเวอร์ที่เปิดไว้ (PID $($serverProc.Id))" -ForegroundColor DarkGray
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $urlFile, $logFile, "$logFile.out" -ErrorAction SilentlyContinue
    Write-Host "  ปิดการแชร์แล้ว`n" -ForegroundColor Yellow
}
