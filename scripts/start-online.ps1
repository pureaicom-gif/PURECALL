$ErrorActionPreference = 'Continue'
$pureRoot = Split-Path -Parent $PSScriptRoot
Set-Location $pureRoot

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "           PURE 0.5 - ONLINE SERVER (CLOUDFLARE TUNNEL)         " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$cloudflared = Join-Path $pureRoot "tools\cloudflared.exe"
if (!(Test-Path $cloudflared)) {
    Write-Host "[ERROR] tools\cloudflared.exe not found." -ForegroundColor Red
    Pause
    exit 1
}

# 1. Check local server
Write-Host "[1/2] ตรวจสอบเซิร์ฟเวอร์ PURE ภายในเครื่อง (Port 3000)..." -ForegroundColor White
$serverRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $serverRunning = $true
    }
} catch {
    $serverRunning = $false
}

if (-not $serverRunning) {
    Write-Host "[INFO] กำลังเปิดเซิร์ฟเวอร์ PURE ในหน้าต่างใหม่..." -ForegroundColor Yellow
    Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c START-SERVER.cmd" -WorkingDirectory $pureRoot
    Start-Sleep -Seconds 4
} else {
    Write-Host "[OK] เซิร์ฟเวอร์ PURE ทำงานอยู่แล้ว!" -ForegroundColor Green
}

# 2. Launch cloudflared and capture URL
Write-Host ""
Write-Host "[2/2] กำลังเชื่อมต่อ Cloudflare Tunnel (สร้างลิงก์อินเทอร์เน็ต HTTPS ฟรี)..." -ForegroundColor White
$logFile = Join-Path $pureRoot "data\tunnel.log"
if (!(Test-Path (Join-Path $pureRoot "data"))) {
    New-Item -ItemType Directory -Force (Join-Path $pureRoot "data") | Out-Null
}
if (Test-Path $logFile) {
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

$cfProcess = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://localhost:3000" -RedirectStandardError $logFile -WorkingDirectory $pureRoot -PassThru

$tunnelUrl = $null
$maxWait = 35
for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $tunnelUrl = $matches[0]
            break
        }
    }
    if ($cfProcess.HasExited) {
        Write-Host "[ERROR] Cloudflare tunnel exited unexpectedly." -ForegroundColor Red
        break
    }
}

if ($tunnelUrl) {
    $tunnelUrl | Out-File -FilePath (Join-Path $pureRoot "data\tunnel-url.txt") -Encoding utf8
    
    $txt = "================================================================`r`n" +
           "       PURE 0.5 - ลิงก์เชื่อมต่อผ่านอินเทอร์เน็ต (ONLINE URL)`r`n" +
           "================================================================`r`n`r`n" +
           "📱 ลิงก์สำหรับเข้าใช้งานบนมือถือ (ใช้ได้ทั้งเน็ต 4G/5G และ Wi-Fi):`r`n" +
           "   " + $tunnelUrl + "`r`n`r`n" +
           "👑 แอดมินคอนโซล (Admin Console):`r`n" +
           "   " + $tunnelUrl + "/admin`r`n" +
           "   PURE ID : purefxai`r`n" +
           "   Password: use your configured admin password`r`n`r`n" +
           "================================================================`r`n" +
           "อัปเดตล่าสุด: " + (Get-Date).ToString() + "`r`n" +
           "หมายเหตุ: หากปิดหน้าต่างนี้ ลิงก์ออนไลน์จะหยุดทำงานทันที`r`n"

    $txt | Out-File -FilePath (Join-Path $pureRoot "SERVER-URL.txt") -Encoding utf8
    $txt | Out-File -FilePath (Join-Path $pureRoot "dist\SERVER-URL.txt") -Encoding utf8

    $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + [uri]::EscapeDataString($tunnelUrl)
    $html = "<!DOCTYPE html><html lang='th'><head><meta charset='UTF-8'><title>PURE Online</title>" +
            "<style>body{background:#0b0d11;color:#f0f3f8;font-family:system-ui,sans-serif;text-align:center;padding:40px 20px;}" +
            ".card{max-width:520px;margin:0 auto;background:#13161c;border:1px solid #2c3340;border-radius:16px;padding:30px;}" +
            "h1{color:#ffd166;margin-top:0;}.url-box{background:#1a1e26;border:1px solid #3b4252;padding:14px;border-radius:10px;font-size:16px;font-weight:bold;color:#4ade80;word-break:break-all;margin:20px 0;}" +
            ".btn{display:inline-block;background:#f0f3f8;color:#11141a;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;margin:6px;cursor:pointer;border:none;}" +
            ".btn-gold{background:#322814;color:#ffd166;border:1px solid #6d5420;}.qr{margin:20px 0;padding:10px;background:white;display:inline-block;border-radius:12px;}" +
            ".badge{display:inline-block;background:#1b382b;color:#4ade80;border:1px solid #2e684a;padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:15px;}</style></head>" +
            "<body><div class='card'><div class='badge'>● เชื่อมต่อออนไลน์สำเร็จ</div><h1>PURE® ออนไลน์ผ่านอินเทอร์เน็ต</h1>" +
            "<p style='color:#8e98a8;'>สแกน QR Code หรือคัดลอกลิงก์นี้ไปใส่ในแอป PURE บนมือถือ</p>" +
            "<div class='qr'><img src='" + $qrUrl + "' alt='QR' width='220' height='220'></div>" +
            "<div class='url-box'>" + $tunnelUrl + "</div>" +
            "<button class='btn' onclick='navigator.clipboard.writeText(\"" + $tunnelUrl + "\");alert(\"คัดลอกลิงก์แล้ว!\");'>📋 คัดลอกลิงก์</button>" +
            "<a href='" + $tunnelUrl + "' target='_blank' class='btn'>🚀 เปิดหน้าเว็บ</a>" +
            "<a href='" + $tunnelUrl + "/admin' target='_blank' class='btn btn-gold'>👑 แอดมิน</a>" +
            "<div style='margin-top:24px;font-size:12px;color:#8e98a8;text-align:left;background:#181b22;padding:14px;border-radius:10px;'>" +
            "<strong>วิธีใช้บนมือถือ:</strong><br>1. คัดลอกลิงก์ด้านบน หรือใช้มือถือสแกน QR Code<br>" +
            "2. เปิดแอป <strong>PURE</strong> บนมือถือ แล้วกดปุ่ม <code>[📋 วางลิงก์จากคลิปบอร์ด]</code><br>" +
            "3. กด <code>เชื่อมต่อเซิร์ฟเวอร์</code> เข้าใช้งานได้ทันทีทั้งแชต โทร และแอดมิน!</div></div></body></html>"

    $html | Out-File -FilePath (Join-Path $pureRoot "SERVER-URL.html") -Encoding utf8
    $html | Out-File -FilePath (Join-Path $pureRoot "dist\SERVER-URL.html") -Encoding utf8

    try { Start-Process (Join-Path $pureRoot "SERVER-URL.html") } catch {}

    Clear-Host
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "       🚀 PURE 0.5 - เชื่อมต่อผ่านอินเทอร์เน็ตสำเร็จ!           " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📱 ลิงก์สำหรับเข้าใช้งานบนมือถือ (ใช้ได้ทั้ง 4G/5G และ Wi-Fi):" -ForegroundColor White
    Write-Host "   👉 $tunnelUrl 👈" -ForegroundColor Green
    Write-Host ""
    Write-Host "👑 แอดมินคอนโซล (Admin Console):" -ForegroundColor White
    Write-Host "   👉 $tunnelUrl/admin" -ForegroundColor Yellow
    Write-Host "   PURE ID : purefxai | รหัสผ่าน: Darkpure8" -ForegroundColor Gray
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "💡 วิธีใช้งานบนมือถือ:" -ForegroundColor White
    Write-Host "  1. ก๊อปปี้ลิงก์สีเขียวด้านบน แล้วส่งเข้ามือถือ (ผ่าน LINE, Messenger หรือแชต)" -ForegroundColor Gray
    Write-Host "  2. เปิดแอป PURE บนมือถือ แล้วแตะปุ่ม [📋 วางลิงก์จากคลิปบอร์ด]" -ForegroundColor Gray
    Write-Host "  3. หรือสแกน QR Code จากหน้าต่างเว็บที่เปิดขึ้นมา" -ForegroundColor Gray
    Write-Host "  4. เปิดหน้าต่างนี้ค้างไว้ตลอดเวลาที่ต้องการให้ออนไลน์" -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "กด Ctrl+C เพื่อหยุดการออนไลน์..." -ForegroundColor DarkGray

    while (!$cfProcess.HasExited) {
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host "[ERROR] ไม่สามารถรับลิงก์จาก Cloudflare ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต" -ForegroundColor Red
    Pause
}
