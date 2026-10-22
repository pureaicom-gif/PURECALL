# PURE 0.8.0

## GitHub build and Android download

Push this project to a GitHub repository. The `PURE checks and Android APK` workflow runs the Node tests, checks the Docker image, and builds a debug APK. Download the APK from the workflow run's **Artifacts** section.

Pushing a version tag such as `v0.8.0` also creates a GitHub Release with a downloadable `PURE-0.8.0.apk` installer.

To prefill the server address in the APK, add a repository variable named `PURE_SERVER_URL` with the public HTTPS server URL. Without it, the app asks the user for the server address. GitHub Pages alone cannot host PURE's API, SQLite data, realtime sockets, or uploaded files.

The `Deploy PURE server` workflow builds and publishes a Docker image to GitHub Container Registry (GHCR); configure `PURE_DOMAIN`, `PUBLIC_ORIGIN`, secure cookies, and any AI/TURN secrets on the server before starting the container. The live download button on PURE's sign-in page serves the checked-in debug APK at `/download/pure.apk`; replace it whenever publishing a newer APK.

แอป Android โทนดำขาว: แชต เพื่อน ส่งไฟล์ โทร WebRTC เกมสัตว์เลี้ยง 2D (16 สายพันธุ์ + ทักทายเสียง/ท่าทาง) และ Gemini แบบเลือกใช้
พร้อมข้อความออฟไลน์ผ่าน Wi-Fi/ฮอตสปอต หรือ Bluetooth สำหรับมือถือที่ติดตั้ง PURE เหมือนกัน และรันออนไลน์ได้ทันทีผ่าน Cloudflare Tunnel

## รุ่นนี้เพิ่มอะไร

รุ่น 0.8.0 เพิ่มกราฟิกและไทม์ไลน์ตัวอย่างที่ทดลองใช้งานได้ แปลข้อความอัตโนมัติ 8 ภาษา และคิวข้อความเมื่อเน็ตหลุด ดู [รายละเอียด 0.8.0](docs/UPDATE-0.8.md)


- PURE Photo Studio: ปรับแสง สี คอนทราสต์ โทนขาวดำ และหมุนรูปก่อนส่งในแชตส่วนตัว/กลุ่ม ทำบนเครื่อง ไม่ส่งภาพไป AI อัตโนมัติ
- ปุ่ม Gemini ปรับภาพเป็นตัวเลือก ส่งภาพให้ Google เมื่อกดเท่านั้น ต้องเปิดสิทธิ์และมีโควตาโมเดลภาพ ตรวจภาพก่อนยืนยันส่ง
- สติกเกอร์วาด SVG สำหรับ PURE 10 แบบ เลือกตัวอย่างก่อนส่ง รองรับแชตกลุ่มและการลองส่งใหม่
- ไทม์ไลน์ รูปภาพ Reels ค้นหาโพสต์ แก้ข้อความ ลบความคิดเห็น Bio และ PURE AI ชวนคุยที่แสดงตัวว่าเป็น AI
- เลขา AI โทรเสียงผ่าน Gemini Live มีบันทึกแยกบัญชี เลือกไม่จำและล้างความทรงจำได้
- จำการเข้าสู่ระบบสูงสุด 180 วันใน URL เดิม แก้ QR เพื่อน ปรับเสียงแจ้งเตือน และปุ่มลำโพง Android
- ยกเลิกระบบต่อสู้/ผจญภัยตามคำขอ คงสัตว์เลี้ยงและการดูแลไว้

รายละเอียดและข้อจำกัดการทดสอบ: [บันทึกรุ่น 0.8.0](docs/UPDATE-0.7.md)

## เริ่มใช้งานบน Windows

1. รันออนไลน์ในคลิกเดียว: ดับเบิลคลิก `START-ONLINE.cmd` (สร้างลิงก์ HTTPS ฟรีผ่าน Cloudflare Tunnel ทันที ยิงเข้าแอปในมือถือได้เลย)
   หรือรันเฉพาะในวงแลนด้วย `START-SERVER.cmd`
2. เปิด http://localhost:3000 เพื่อสมัครบัญชี
3. ติดตั้ง `dist/PURE-0.8.0-debug.apk` บน Android 8 ขึ้นไป โดยอนุญาตติดตั้งจากแหล่งที่มาเมื่อ Android ถาม
4. ใน APK กรอก URL เซิร์ฟเวอร์ แล้วเชื่อมต่อ
5. ให้เพื่อนสมัครบัญชีอีกบัญชี ค้นหา PURE ID ในแท็บเพื่อน → ส่งคำขอ → อีกฝ่ายรับคำขอ → เริ่มแชต

สำหรับโทรศัพท์กับคอมใน Wi-Fi เดียวกัน ใช้ `http://<IP คอม>:3000` (ดู IPv4 ด้วย `ipconfig`)
ต้องเปิดไฟร์วอลล์พอร์ต 3000 สำหรับเครือข่ายส่วนตัวเองถ้าถูกบล็อก โปรแกรมไม่แก้ไฟร์วอลล์อัตโนมัติ
HTTP เหมาะกับการทดสอบแชตบน LAN เท่านั้น กล้อง/ไมค์ของ WebView ต้องใช้ secure context: HTTPS หรือ localhost
บน Android emulator ใช้ `http://10.0.2.2:3000` สำหรับทดสอบแชต

เซิร์ฟเวอร์เก็บฐานข้อมูลและไฟล์ใน `data/`; ปิดเซิร์ฟเวอร์ก่อนสำรองทั้งโฟลเดอร์ ห้ามลบถ้าต้องการรักษาบัญชีและแชต
ปิดหน้าต่างตัวรันหรือ Ctrl+C เพื่อหยุด ใช้พอร์ตอื่นได้ด้วย `PORT` ใน `.env`

## ออฟไลน์: ไม่ใช้เซิร์ฟเวอร์ ไม่ใช้อินเทอร์เน็ต

เปิด APK → **ออฟไลน์** ทั้งสองเครื่อง ข้อความโหมดนี้แยกจากบัญชีออนไลน์และไม่ซิงก์ย้อนหลัง

### Wi-Fi หรือฮอตสปอตมือถือ
1. เชื่อมมือถือทั้งสองเข้าวง Wi-Fi เดียวกัน หรือให้เครื่องหนึ่งเปิดฮอตสปอตแล้วอีกเครื่องเชื่อม
2. เครื่องแรกกด **สร้างห้อง Wi-Fi** จะแสดง IP และรหัสจับคู่ 6 หลัก
3. เครื่องที่สองกด **เข้าห้อง Wi-Fi** กรอก IP และรหัสจากเครื่องแรก
4. เมื่อแสดง “เชื่อมต่อแล้ว” ให้ส่งข้อความได้ทันที ป้าย “ถึงเครื่องเพื่อนแล้ว” แสดงเมื่อได้รับการยืนยันจากอีกเครื่อง
5. กดปิดห้องเมื่อเสร็จ; ต้องเปิดหน้าออฟไลน์ค้างไว้ทั้งสองเครื่อง

ไม่ได้ใช้ Wi-Fi Direct discovery: ต้องอยู่ Wi-Fi/ฮอตสปอตเดียวกันและกรอก IP
ถ้าเราเตอร์เปิด AP/client isolation หรือระบบฮอตสปอตห้ามเครื่องในวงคุยกัน โหมดนี้เชื่อมไม่ได้

### Bluetooth
1. เปิด Bluetooth และจับคู่มือถือทั้งสองในตั้งค่า Android ก่อน
2. เครื่องแรกกด **รอรับ Bluetooth** แล้วบอกรหัส PURE ที่แสดง
3. อีกเครื่องกด **เชื่อม Bluetooth** เลือกชื่อเครื่องแรก แล้วกรอกรหัส PURE
4. อนุญาต “อุปกรณ์ใกล้เคียง” เมื่อ Android ขอ แล้วกดปุ่มอีกครั้ง

Bluetooth ใช้ secure RFCOMM และบริการ UUID ของ PURE จึงต้องติดตั้งแอปเดียวกัน
ทั้ง Wi-Fi และ Bluetooth ใช้ ECDH + AES-GCM และรหัสจับคู่ในระดับแอป แต่ยังไม่ได้ผ่านการตรวจสอบ cryptography อิสระ
ห้ามตีความรหัสสั้นนี้ว่าเหมาะกับข้อมูลลับความเสี่ยงสูง ไม่ใช่ระบบยืนยันตัวตนบัญชีออนไลน์
โหมดออฟไลน์ 0.1 รองรับ **ข้อความตัวต่อตัวเท่านั้น** ยังไม่มีไฟล์ โทร หรือเกมหลายคน
ไม่เก็บประวัติออฟไลน์ถาวร: ปิดหน้าแล้วข้อความหาย

## เปิดใช้ผ่านอินเทอร์เน็ตและโทร

เตรียม public server/domain ชี้ DNS มาที่เครื่อง และเปิด 80/443:

```sh
cp .env.example .env
# ตั้งค่าใน .env ตามด้านล่างก่อนรัน
docker compose --profile https up -d --build
```

```dotenv
PURE_DOMAIN=pure.example.com
PUBLIC_ORIGIN=https://pure.example.com
COOKIE_SECURE=true
TURN_URL=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
TURN_SECRET=<shared-secret ของ coturn>
```

`docs/turnserver.conf.example` เป็นตัวอย่าง coturn; ต้องตั้ง public IP, secret, realm และเปิดพอร์ต relay
เซิร์ฟเวอร์ออก TURN credentials อายุหนึ่งชั่วโมงหลังเข้าสู่ระบบ ไม่ส่ง shared secret ให้แอป
ถ้าไม่มี TURN บางเครือข่ายจะโทรได้ แต่ไม่รับรองข้ามเครือข่ายมือถือ/NAT
ข้อมูลเสียง/วิดีโอใช้ WebRTC; กล้องและไมค์ต้องได้รับอนุญาตจากผู้ใช้
สายเรียกเข้า 0.1 ทำงานขณะเปิดแอปและเชื่อมต่ออยู่ ไม่มี FCM หรือโทรปลุกแอปที่ปิดอยู่

## Gemini และการสแกนโมเดลอัตโนมัติ

สร้าง/เปลี่ยนคีย์ใน Google AI Studio แล้วใส่ **คีย์ใหม่** ใน `.env` เท่านั้น คีย์ที่เคยส่งในแชตไม่ถูกฝังหรือคัดลอกลงโปรเจกต์

```dotenv
GEMINI_API_KEY=<new-key>
GEMINI_MODEL=<ชื่อโมเดลที่อนุมัติให้ใช้>
GEMINI_FALLBACK_MODEL=<ชื่อโมเดลสำรอง หรือปล่อยว่าง>
```

รีสตาร์ตเซิร์ฟเวอร์หลังเปลี่ยนค่า เซิร์ฟเวอร์ดึง `models.list` ทุก 24 ชั่วโมง รองรับ pagination
ดู catalog และสถานะสแกนในหน้าโปรไฟล์ เลือกรุ่นที่รองรับ generateContent และข้อความ
การสแกนไม่เรียก generation ไม่ทดลองทุกโมเดลแบบเสียเงิน และไม่เปลี่ยนรุ่นใช้งานเองโดยเงียบ
เมื่อผู้ใช้ส่ง prompt จึงเรียกโมเดลที่ตั้งไว้ ถ้าล้มเหลวจึงลอง fallback ที่ผู้ดูแลตั้ง
ส่งเฉพาะ prompt ที่ผู้ใช้กรอก ไม่อ่านประวัติแชตเอง ไม่มี key ส่งไปยัง APK/เบราว์เซอร์
ยังไม่ได้ทดสอบเรียก Gemini จริงโดยไม่มีคีย์ใหม่ที่ใช้งานได้; unit test ใช้ API จำลอง

## โครงโปรเจกต์และทดสอบ

- `docs/PLAN.md` — แผนงาน, ดีไซน์, ขอบเขตเวอร์ชันแรกและงานถัดไป
- `public/` — หน้าจอ responsive, Canvas pet, WebRTC client
- `server/` — API, Socket.IO, SQLite, Gemini
- `android/` — APK shell, permission handling และ Nearby แบบ native
- `tests/` — integration, UI/WebRTC, encrypted offline channel

```sh
npm ci
npm test
node tests/ui.mjs
```

UI test ใช้ Google Chrome ที่ติดตั้งในเครื่องและกล้อง/ไมค์จำลอง สร้างบัญชีในฐานข้อมูลชั่วคราวแล้วล้างหลังทดสอบ
สร้าง APK บนเครื่องนี้ด้วย `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1`
หรือเปิด `android/` ใน Android Studio (JDK 17, SDK 35, AGP 8.9.1, Gradle 8.11.1)
APK เป็น debug build สำหรับติดตั้งทดสอบ ยังไม่ใช่ release ที่เซ็นด้วย production key

## ข้อจำกัดที่ต้องทราบก่อนใช้งานจริง

- SQLite สำหรับเซิร์ฟเวอร์เดียว; จำกัดไฟล์ 25 MB ต่อไฟล์ / ประมาณ 250 MB ต่อบัญชี
- แชต/ไฟล์ฝั่งเซิร์ฟเวอร์ไม่ได้ E2EE ผู้ดูแลอ่านได้; ใช้ HTTPS เพื่อป้องกันระหว่างส่ง
- ยังไม่มี password recovery, group chat, avatar upload, QR, reaction/reply, reporting dashboard หรือ FCM
- หน้าจอ Android ออนไลน์โหลดจากเซิร์ฟเวอร์; เมื่อเซิร์ฟเวอร์ปิดยังใช้ Nearby native ได้
- ต้องทดสอบอุปกรณ์ Android จริงสองเครื่องสำหรับ Bluetooth, เสียง กล้อง และ Wi-Fi/4G ก่อนเปิด production

อ้างอิง: [Gemini Models API](https://ai.google.dev/api/models), [Android build JDK](https://developer.android.com/build/jdks), [Android command line tools](https://developer.android.com/studio)
