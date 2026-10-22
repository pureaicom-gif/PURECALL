# PURE 0.1 — ผลตรวจสอบ 9 กันยายน 2026

## ผ่านแล้ว

- `npm test`: 12 tests ผ่าน ครอบคลุมการยืนยันตัวตน, origin/CSRF protection, friend acceptance,
  Socket.IO ข้อความและ deduplication, read cursor, การป้องกันเข้าถึงไฟล์ข้ามบัญชี,
  blocking, call signaling/accept/busy/end, pet cooldown/coins, logout และข้อมูลหลังรีสตาร์ต
- Gemini: mocked API ทดสอบ pagination ของ model catalog และ fallback ไปโมเดลที่ตั้งค่า
- `node tests/ui.mjs`: Chrome desktop + mobile viewport สองบัญชี สมัครผ่าน UI, เพิ่มเพื่อน/รับคำขอ,
  สนทนาเรียลไทม์, แนบไฟล์, escape ข้อความ HTML, pet name/species/state persistence,
  และสถานะ Gemini ที่ยังไม่ตั้งค่า ไม่มี JavaScript page errors
- WebRTC: peer connection จริงระหว่างสอง browser contexts โดยใช้กล้อง/ไมค์จำลอง
  ยืนยัน remote video track, connected state, mute และ hangup
- `LocalChannelTest`: สองทิศทางบน TCP, ข้อความ Unicode, และปฏิเสธรหัสจับคู่ผิด
- Android SDK 35 emulator: ติดตั้ง APK สำเร็จ, เปิด MainActivity, โหลดหน้าออนไลน์ผ่าน WebView
- Native Nearby บน Android emulator: ทดสอบ Android เป็นทั้ง Wi-Fi host และ client
  เชื่อมต่อกับ JVM test peer ผ่าน emulator networking/ADB forwarding, รับข้อความภาษาไทย,
  ส่งตอบและแสดง ACK ว่าถึงเครื่องเพื่อนแล้ว
- `assembleDebug` ผ่าน; `apksigner verify` ผ่านและยืนยันเป็น Android Debug certificate
- อ่าน AndroidRuntime log หลัง smoke test ไม่พบ crash
- Portable Windows: เรียก `START-SERVER.cmd` จริงด้วย Node ที่อยู่ในแพ็ก ตรวจ health endpoint,
  สมัครบัญชีในฐานข้อมูลชั่วคราว และโหลดหน้าแอปสำเร็จ ไม่ต้องใช้ Node ที่ติดตั้งในระบบสำหรับการรัน

ภาพใน `docs/screenshots/` มาจากการทดสอบจริง บัญชี Alice/Mint และข้อความในภาพเป็น test fixtures
ฐานข้อมูลทดสอบถูกแยกจากข้อมูลจริง ไม่สร้างบัญชี demo ในแพ็กส่งมอบ

## ยังไม่ได้ตรวจบนสภาพแวดล้อมจริง

- Bluetooth ระหว่างโทรศัพท์จริงสองเครื่อง (emulator ไม่มีการจับคู่กับโทรศัพท์จริงในการทดสอบนี้)
- Wi-Fi/ฮอตสปอตระหว่างโทรศัพท์จริงสองเครื่อง และข้อจำกัดของเราเตอร์แต่ละรุ่น
- เสียง/กล้องจริง, echo, speaker routing, การโทรข้าม 4G/5G และ TURN บน public server
- การเรียก Gemini จริงด้วยคีย์ใหม่; ไม่มี live API key ในไฟล์โปรเจกต์
- Docker/Caddy/coturn deployment จริง และการโหลดจำนวนผู้ใช้สูง

ผลการทดสอบ emulator/JVM ไม่ใช่หลักฐานว่า Bluetooth หรือเสียงบนโทรศัพท์ทุกรุ่นผ่านแล้ว
รุ่นนี้ไม่มี background incoming call / push notifications และโหมดออฟไลน์รองรับข้อความเท่านั้น
