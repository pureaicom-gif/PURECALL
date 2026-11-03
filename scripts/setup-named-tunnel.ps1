# PURE: permanent server origin via named Cloudflare Tunnel (api.purefxai.store -> http://localhost:3000)
# Prereq: purefxai.store zone must be on Cloudflare (nameservers changed at GoDaddy) and
#         `cloudflared tunnel login` completed once (browser sign-in, creates %USERPROFILE%\.cloudflared\cert.pem).
# Run in an elevated PowerShell from F:\PURECALL.
$ErrorActionPreference = 'Stop'
$cf = Join-Path $PSScriptRoot '..\dist\PURE-Server-Windows\tools\cloudflared.exe'
$dir = Join-Path $env:USERPROFILE '.cloudflared'
if (!(Test-Path "$dir\cert.pem")) { Write-Host "Run first: `"$cf`" tunnel login"; exit 1 }
$list = & $cf tunnel list --output json | ConvertFrom-Json
$t = $list | Where-Object name -eq 'pure'
if (!$t) { & $cf tunnel create pure | Out-Host; $t = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object name -eq 'pure' }
$id = $t.id
& $cf tunnel route dns pure api.purefxai.store | Out-Host
$cfg = "C:\Windows\System32\config\systemprofile\.cloudflared"
New-Item -ItemType Directory -Force $cfg | Out-Null
Copy-Item "$dir\$id.json" "$cfg\$id.json" -Force
@"
tunnel: $id
credentials-file: $cfg\$id.json
ingress:
  - hostname: api.purefxai.store
    service: http://localhost:3000
  - service: http_status:404
"@ | Set-Content -Encoding ascii "$cfg\config.yml"
& $cf --config "$cfg\config.yml" service install | Out-Host
Start-Service cloudflared
Write-Host "Tunnel $id -> https://api.purefxai.store"
