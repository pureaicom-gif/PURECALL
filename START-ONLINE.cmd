@echo off
title PURE - Online Server (Cloudflare Tunnel)
cd /d "%~dp0"
node scripts\online-tunnel.mjs
pause
