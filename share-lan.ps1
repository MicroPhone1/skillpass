# share-lan.ps1 — เปิดให้เครื่องอื่นในวง Wi-Fi เดียวกันเข้าใช้ SkillPass ได้
#
# ต้องรันด้วยสิทธิ์ Administrator (คลิกขวาที่ PowerShell → Run as administrator)
#     powershell -ExecutionPolicy Bypass -File share-lan.ps1
#
# สิ่งที่สคริปต์นี้ทำ:
#   1) ปิดกฎเดิมที่บล็อก python.exe ขาเข้า (ใน Windows Firewall กฎ Block ชนะ Allow เสมอ
#      ต่อให้เพิ่มกฎ Allow ใหม่ ถ้ายังมี Block ค้างอยู่ก็เข้าไม่ได้)
#   2) เพิ่มกฎอนุญาต TCP ขาเข้าพอร์ต 8443 เฉพาะเครือข่ายภายใน
#   3) บอก URL ที่เครื่องอื่นต้องเปิด
#
# ยกเลิกทีหลังได้ด้วย:  powershell -File share-lan.ps1 -Undo

param(
    [int]$Port = 8443,
    [switch]$Undo
)

$RuleName = "SkillPass (พอร์ต $Port)"

# ---------- ตรวจสิทธิ์ ----------
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ""
    Write-Host "  ต้องรันด้วยสิทธิ์ Administrator" -ForegroundColor Red
    Write-Host "  กด Win แล้วพิมพ์ PowerShell -> คลิกขวา -> Run as administrator" -ForegroundColor DarkGray
    Write-Host "  แล้วรัน:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

# ---------- โหมดยกเลิก ----------
if ($Undo) {
    Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule
    Write-Host "  ลบกฎอนุญาตแล้ว — เครื่องอื่นจะเข้าไม่ได้อีก" -ForegroundColor Yellow
    Write-Host "  (กฎที่บล็อก python.exe ยังปิดอยู่ ถ้าอยากเปิดกลับให้เข้า Windows Defender Firewall)" -ForegroundColor DarkGray
    exit 0
}

Write-Host ""
Write-Host "  ตั้งค่าให้เครื่องอื่นเข้าใช้ SkillPass" -ForegroundColor Cyan
Write-Host "  ------------------------------------------------------"

# ---------- 1) ปิดกฎที่บล็อก python ----------
$blocked = @()
Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
    Where-Object { $_.Program -like "*python*" } |
    ForEach-Object {
        $r = $_ | Get-NetFirewallRule -ErrorAction SilentlyContinue
        if ($r -and $r.Direction -eq 'Inbound' -and $r.Action -eq 'Block' -and $r.Enabled -eq 'True') {
            $blocked += $r
        }
    }

if ($blocked.Count) {
    $blocked | Disable-NetFirewallRule
    Write-Host "  [1] ปิดกฎที่บล็อก python.exe ขาเข้า $($blocked.Count) กฎ" -ForegroundColor Green
} else {
    Write-Host "  [1] ไม่มีกฎบล็อก python.exe ค้างอยู่" -ForegroundColor DarkGray
}

# ---------- 2) เพิ่มกฎอนุญาตพอร์ต ----------
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
    -Profile Private,Public `
    -Description "อนุญาตให้เครื่องในวงเดียวกันเปิดหน้าเว็บ SkillPass" | Out-Null
Write-Host "  [2] เพิ่มกฎอนุญาต TCP ขาเข้าพอร์ต $Port แล้ว" -ForegroundColor Green

# ---------- 3) บอก URL ----------
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.' } |
       Select-Object -First 1).IPAddress

$net = Get-NetConnectionProfile | Select-Object -First 1

Write-Host "  ------------------------------------------------------"
Write-Host ""
Write-Host "  ให้เครื่องอื่นเปิด:  " -NoNewline
Write-Host "https://$ip`:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ครั้งแรกเบราว์เซอร์จะเตือนเรื่องใบรับรอง (self-signed) — กด Advanced -> Proceed" -ForegroundColor DarkGray
Write-Host "  ต้องต่อ Wi-Fi ชื่อเดียวกัน: $($net.Name)" -ForegroundColor DarkGray
Write-Host ""

if ($net.NetworkCategory -eq 'Public') {
    Write-Host "  ข้อควรระวัง" -ForegroundColor Yellow
    Write-Host "  เครือข่ายนี้ถูกจัดเป็น Public ($($net.Name))" -ForegroundColor DarkGray
    Write-Host "  Wi-Fi สาธารณะ/มหาวิทยาลัยหลายที่เปิด client isolation ไว้" -ForegroundColor DarkGray
    Write-Host "  ซึ่งบล็อกไม่ให้เครื่องลูกข่ายคุยกันเองโดยตรง ถ้าเปิดไม่ติดทั้งที่ตั้งค่าครบแล้ว" -ForegroundColor DarkGray
    Write-Host "  ให้ลองเปิดฮอตสปอตจากมือถือแล้วให้ทั้งสองเครื่องต่อฮอตสปอตนั้นแทน" -ForegroundColor DarkGray
    Write-Host ""
}
