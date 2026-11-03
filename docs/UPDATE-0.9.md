# PURE 0.9.0 — สรุปการอัปเดต

## ฟีเจอร์ใหม่
1. **โทรกลุ่ม** สูงสุด 6 คน (mesh WebRTC) + แชร์หน้าจอ + บันทึกการโทร (ทุกคนเห็นแจ้งเตือนว่ากำลังบันทึก)
2. **แจ้งเตือนสายเรียกเข้า** (Web Push / FCM)
3. **คำบรรยายสด TH↔EN** ด้วย Gemini Live + อ่านออกเสียงคำแปลได้
4. **แชท 1:1 เข้ารหัสปลายทาง (E2E)** — เซิร์ฟเวอร์เก็บแค่ ciphertext
5. **Stories** 24 ชั่วโมง
6. **อัปเดตในแอป** (ตรวจ `version.json` + sha256 ก่อนติดตั้ง)
7. **ค้นหาเซิร์ฟเวอร์อัตโนมัติ** ผ่าน `server.json` + **PURE Node failover** (ดู `docs/PURE-NODE.md`)
8. **เสียงเลขา PURE (Drama3)** เป็นเสียงเริ่มต้นของผู้ช่วย; ถ้า Drama3 ไม่ทำงานจะใช้เสียงในเครื่องแทน
9. **AI ในเครื่อง (ออฟไลน์)** — ดูด้านล่าง
10. ธีม **ดำ + เขียว**, ไอคอนใหม่, หน้าเว็บแนะนำ (web guide)

## AI ในเครื่อง (Android)
- เครื่องยนต์: **llama.cpp** (MIT) คอมไพล์เป็น JNI ในแอป (arm64-v8a, x86_64)
- โมเดล (ไม่รวมใน APK — กดดาวน์โหลดเองในหน้า ผู้ช่วย AI → ตั้งค่า):
  | โมเดล | ขนาด | RAM แนะนำ | License |
  |---|---|---|---|
  | Qwen2.5-1.5B-Instruct Q4_K_M (ค่าเริ่มต้น) | 1.12 GB | ≥ 4 GB | Apache-2.0 (Alibaba Qwen) |
  | Qwen2.5-0.5B-Instruct Q4_K_M (lite) | 491 MB | ≥ 3 GB | Apache-2.0 |
- ดาวน์โหลดจาก Hugging Face (Qwen official), ต่อจากที่ค้างได้, ตรวจ sha256, แนะนำ Wi-Fi, ลบได้ทุกเมื่อ; เก็บใน storage ของแอป
- ใช้ทำ: ผู้ช่วย AI, สรุป, แปลไทย↔อังกฤษ, ตอบกลับอัจฉริยะ (ปุ่ม ✨ ในแชท), คำสั่งในแอป
- ลำดับการเลือก: AI ในเครื่อง (ถ้าดาวน์โหลดแล้ว + RAM พอ) → Gemini บนเซิร์ฟเวอร์ → คู่มือออฟไลน์
- ข้อจำกัด: รุ่น 0.5B ภาษาไทยพอใช้แต่พลาดบ่อย (เช่นแปลวันผิด) แนะนำ 1.5B

## สำหรับผู้ดูแลระบบ
### ตัวแปรสภาพแวดล้อม (.env — ห้าม commit)
`PORT, HOST, DATA_DIR, PUBLIC_ORIGIN, TRUST_PROXY, COOKIE_SECURE, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_LIVE_MODEL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, FCM_SERVICE_ACCOUNT, TURN_URL, TURN_SECRET, DRAMA3_URL, DRAMA3_BACKEND, DRAMA3_TIMEOUT_MS, UPDATE_MANIFEST_URL, SERVER_JSON_URL, WEB_GUIDE_RATE`
สคริปต์: `PURE_PAGES_TOKEN, PURE_PAGES_REPO, PURE_CLUSTER_SECRET, PURE_TUNNEL_TOKEN, PURE_KEYSTORE, PURE_KEYSTORE_PASSWORD, PURE_KEY_ALIAS, PURE_KEY_PASSWORD`

### Drama3 (เสียงเลขา)
1. เปิด Drama3 (ค่าเริ่มต้น `http://127.0.0.1:7860`)
2. คัดลอกไฟล์เสียงอ้างอิง `server/voices/pure-secretary.wav` ไปไว้ที่ `G:\Drama3\voice-samples\pure-secretary.wav` (ไฟล์ wav ไม่อยู่ใน git)
3. ใช้เสียงนี้เป็น preset เท่านั้น ไม่ clone เสียงคนอื่น

### เซ็น APK สำหรับ release
สร้าง keystore ครั้งเดียว (`keytool -genkeypair -keystore pure-release.jks -alias pure -keyalg RSA -keysize 4096 -validity 10000`) เก็บนอก repo แล้วตั้ง `PURE_KEYSTORE*` ก่อนรัน
`node scripts/publish-release.mjs --release --th "..." --en "..." --publish`
(อัปโหลด APK เป็น GitHub Release asset ก่อน แล้วค่อย publish version.json) — ทำ keystore หายจะอัปเดตทับแอปเดิมไม่ได้

### Named tunnel (โดเมนคงที่)
Cloudflare Zero Trust → Tunnels → สร้าง tunnel ชี้ `http://localhost:3000` ที่ `call.purefxai.store` แล้วตั้ง `PURE_TUNNEL_TOKEN`. ถ้าไม่มี จะใช้ quick tunnel (URL เปลี่ยนทุกครั้ง) และ `server.json` จะบอกแอปให้เอง

### รหัสผ่านแอดมิน
0.9 ไม่มีรหัสแอดมินค่าเริ่มต้นแล้ว ตั้ง/เปลี่ยนด้วย
`echo {"handle":"admin","password":"<รหัสใหม่ยาว>"} | node scripts/set-admin.mjs` — เปลี่ยนแล้ว session เดิมจะถูกออกจากระบบ
**ถ้าเคยใช้รหัสเดิมที่เคยอยู่ในโค้ดเวอร์ชันเก่า ให้เปลี่ยนทันที**

### สำรองข้อมูล
`node scripts/backup.mjs --out D:\PURE-backups --keep 14` (ปลอดภัยขณะเซิร์ฟเวอร์ทำงาน) — ตั้งใน Task Scheduler วันละครั้ง

### Docker
มี HEALTHCHECK เรียก `/healthz` แล้ว: `docker build -t pure . && docker run -p 3000:3000 -v pure-data:/app/data --env-file .env pure`

### Clone repo
llama.cpp เป็น submodule: `git clone --recursive ...` หรือ `git submodule update --init`

## เพิ่มเติม: โหมด Helper บนมือถือ (opt-in)
มือถือ Android ช่วยส่งต่อข้อความเข้ารหัส (store-and-forward) และกระจาย heartbeat/discovery ใน Wi-Fi เดียวกัน — เปิดที่ "🛰️ โหมด Helper" ในรายการแชต ทำงานเฉพาะตอนชาร์จ/Wi-Fi/แบตพอ ดูรายละเอียดใน docs/PURE-NODE.md
