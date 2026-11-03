# PURE Node — ให้เครื่องอื่นช่วยรันเซิร์ฟเวอร์ + สลับอัตโนมัติ (failover)

PURE Node คือการเอาเครื่องหลายเครื่อง (PC เจ้าของ, PC เพื่อนที่ไว้ใจได้, VPS) มารวมเป็นคลัสเตอร์
- **primary** 1 เครื่องให้บริการจริง, **standby** ดึงสำเนาฐานข้อมูล/ไฟล์ทุก ~5 วินาที
- primary หาย (ไม่มี heartbeat เกิน lease) → standby ที่ priority สูงสุดขึ้นแทนเอง แล้วเผยแพร่ `server.json` ใหม่ แอปจะย้ายตามเอง
- เครื่องที่จะเข้ากลุ่มได้ต้องอยู่ใน **registry ที่เจ้าของเซ็น** (Ed25519) เท่านั้น; การ sync ใช้ `PURE_CLUSTER_SECRET` (HMAC)

> ข้อควรรู้: standby ถือสำเนาข้อมูลผู้ใช้ทั้งหมด (แชทที่ไม่ใช่ E2E, รูป, บัญชี) ให้ใช้เฉพาะเครื่องที่ไว้ใจได้จริง

## 1) เจ้าของ (ทำครั้งเดียว บนเครื่องเจ้าของ)
```
node scripts/pure-node.mjs init-owner            # → ~/.pure-node/owner-key.json  (ห้าม commit/ห้ามส่งใคร)
```
จด `owner public key` ที่พิมพ์ออกมา

## 2) ทุกเครื่องที่จะเป็น node
```
node scripts/pure-node.mjs init-node --id home   # พิมพ์บรรทัด  home:<publicKey>  ส่งให้เจ้าของ
```

## 3) เจ้าของเซ็น registry
```
node scripts/pure-node.mjs sign --owner ~/.pure-node/owner-key.json --out registry.json \
  --node home:<pubA>:primary+standby:10 --node friend1:<pubB>:standby:5 --node phone1:<pubC>:helper:0
```
roles: `primary`, `standby`, `helper` (helper = ช่วยกระจายข้อมูล discovery เท่านั้น ไม่ถือฐานข้อมูล). ส่ง `registry.json` ให้ทุก node (ไฟล์นี้เปิดเผยได้ ไม่มีความลับ)
เพิ่ม/ถอดเครื่อง: เซ็นใหม่ด้วย `--prev registry.json` (เลข version จะเพิ่มขึ้น)

## 4) ตั้งค่าและรัน
```
node scripts/pure-node.mjs init-config --id home --registry registry.json --owner-pub <ownerPub> \
  --port 3000 --peer https://friend1.example:3000 --tunnel
set PURE_CLUSTER_SECRET=<สุ่มยาว ≥24 ตัว ค่าเดียวกันทุกเครื่อง>
PURE-NODE.cmd            (Windows)    |    ./pure-node.sh   (Linux/macOS)
```
- `--tunnel` = เปิด Cloudflare quick tunnel ให้เองเมื่อเครื่องนี้เป็น primary (ดาวน์โหลด cloudflared อัตโนมัติ). ถ้ามี named tunnel ให้ตั้ง `PURE_TUNNEL_TOKEN`
- `PURE_PAGES_TOKEN` (fine-grained token, Contents: read/write เฉพาะ repo หน้าเว็บ) = อัปโหลด `server.json` อัตโนมัติ; ไม่ตั้งก็ได้ ไฟล์จะอยู่ที่ `data/server.json`
- สลับเอง (เช่นจะปิดเครื่องหลัก): `node scripts/pure-node.mjs promote` บนเครื่องที่จะขึ้นแทน
- ดูสถานะ: `node scripts/pure-node.mjs status`

## ไฟล์ exe ตัวเดียว (ทางเลือก)
Node 24 รองรับ Single Executable Application แต่ PURE ใช้ไฟล์ใน `server/` + `public/` + `node_modules` จึงแจกเป็นโฟลเดอร์ + `PURE-NODE.cmd` ง่ายและอัปเดตได้ดีกว่า (ยังไม่ได้ทำ SEA)

## มือถือเป็น helper (สถานะ: implemented ใน v0.9 — ยังไม่ได้ทดสอบบนเครื่องจริง)
- เปิดใน app Android: รายการแชต → "🛰️ โหมด Helper" (opt-in, ค่าเริ่มต้น: เฉพาะเสียบชาร์จ + Wi-Fi + แบต ≥30%)
- Foreground service (`HelperService`, type dataSync) ทุก 60 วินาที: cache heartbeat, ส่งคิวไป `POST /api/relay/deliver`, ถ้าเซิร์ฟเวอร์ล่มส่งต่อให้ helper อื่นใน LAN (NSD `_purehelper._tcp`)
- คิวเก็บเฉพาะ envelope ที่เข้ารหัส E2E (`e2e1:`) + MAC ที่ผูก from/to/clientId ด้วยคีย์ต่อผู้ใช้ (`GET /api/relay/key`) → helper อ่าน/ปลอม/เปลี่ยนผู้รับไม่ได้; เซิร์ฟเวอร์ dedup ด้วย clientId; อายุ 7 วัน; คิวบนเครื่องเข้ารหัสด้วย AndroidKeyStore
- origin ที่ได้จาก peer ไม่ถูกนำมาใช้อัตโนมัติ (ยังไม่ verify)

heartbeat `/cluster/heartbeat` ของ primary เป็นข้อความที่ **เซ็นด้วย node key** อยู่แล้ว มือถือที่อยู่ใน registry (role helper) จึงเก็บ heartbeat ล่าสุดและส่งต่อให้แอปอื่นตรวจลายเซ็นได้เองเมื่อ server.json เข้าไม่ได้
ยังไม่มี: บริการเบื้องหลังบน Android ที่ทำหน้าที่นี้ (มือถือไม่เหมาะเป็น primary/standby: แบตหมด, NAT, ระบบปิดแอปเบื้องหลัง)
