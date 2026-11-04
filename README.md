# PURE 0.12.0

**Chat, calls, community, and AI — your people, closer.**

**แชต โทร กลุ่ม และ AI — เชื่อมต่อคนที่คุณใส่ใจ**

| | English | ไทย |
|---|---|---|
| Web | [PURE web app](http://call.purefxai.store) *(HTTPS certificate is being fixed; do not bypass the browser warning.)* | [เปิด PURE บนเว็บ](http://call.purefxai.store) *(กำลังแก้ใบรับรอง HTTPS โปรดอย่ากดข้ามคำเตือนของเบราว์เซอร์)* |
| Android | [Download PURE 0.12.0 APK](https://github.com/pureaicom-gif/PURECALL/releases/download/v0.12.0/PURE-0.12.0.apk) | [ดาวน์โหลด PURE 0.12.0 APK](https://github.com/pureaicom-gif/PURECALL/releases/download/v0.12.0/PURE-0.12.0.apk) |
| Release notes | [v0.12.0 release](https://github.com/pureaicom-gif/PURECALL/releases/tag/v0.12.0) | [รายละเอียดรุ่น 0.12.0](https://github.com/pureaicom-gif/PURECALL/releases/tag/v0.12.0) |

> **Security / ความปลอดภัย:** `call.purefxai.store` currently presents a certificate for `*.github.io`, not for `call.purefxai.store`. The page may load over HTTP, but sign-in, calls, camera, and microphone require correctly configured HTTPS. The web app is served separately from the PURE API server.
>
> ขณะนี้ใบรับรองของ `call.purefxai.store` ไม่ตรงกับโดเมน หน้าเว็บอาจเปิดผ่าน HTTP ได้ แต่การเข้าสู่ระบบ การโทร กล้อง และไมโครโฟนต้องใช้ HTTPS ที่ตั้งค่าใบรับรองถูกต้อง เว็บแอปและ API ของ PURE เป็นคนละส่วนกัน

## What is PURE? / PURE คืออะไร

PURE is a social messaging app with a responsive web client and an Android app. The current codebase includes direct and group conversations, profile and timeline features, media sharing, reactions and threaded replies, automatic message translation, AI assistance, and an optional 2D virtual pet. Calls use WebRTC and need a secure, reachable server configuration.

PURE เป็นแอปสื่อสารที่ใช้ได้บนเว็บและ Android โค้ดปัจจุบันมีแชตส่วนตัวและกลุ่ม โปรไฟล์ ไทม์ไลน์ การส่งสื่อ อารมณ์และตอบกลับคอมเมนต์ การแปลข้อความอัตโนมัติ ผู้ช่วย AI และสัตว์เลี้ยง 2D เสริม ระบบโทรใช้ WebRTC และต้องตั้งค่าเซิร์ฟเวอร์ที่เข้าถึงได้ผ่านการเชื่อมต่อปลอดภัย

## 0.12.0 / รุ่น 0.12.0

- Versioned Android debug APK (`versionCode 22`) and GitHub Release download.
- Automatic version-named APK creation in the tagged-release workflow.
- Server-side ComfyUI video-generation job flow using the owner's local workflow; generated video is added to the owner's timeline after completion and consent.
- More reliable TTS fallback when a streaming backend does not support streaming.
- Updated PURE launcher icon and web app branding.

- APK รุ่นทดสอบ Android (`versionCode 22`) พร้อมดาวน์โหลดจาก GitHub Release
- workflow สร้างไฟล์ APK โดยตั้งชื่อตาม tag ของรุ่น
- ระบบงานสร้างวิดีโอฝั่งเซิร์ฟเวอร์ผ่าน ComfyUI และ workflow ส่วนตัวของเจ้าของ เมื่อผู้ใช้ยินยอมและประมวลผลเสร็จ วิดีโอจะลงไทม์ไลน์ของเจ้าของงาน
- ปรับการสลับระบบเสียงพูด เมื่อบริการสตรีมเสียงไม่รองรับ
- อัปเดตไอคอนแอปและแบรนด์ PURE

## Run locally / เริ่มใช้งานในเครื่อง

### Web server / เซิร์ฟเวอร์เว็บ

Requirements: Node.js 24 or newer. / ต้องใช้ Node.js 24 ขึ้นไป

```sh
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3000`. The server stores its database and uploaded files in `data/`; back up that folder before moving or reinstalling the server. The `.env` file contains private settings and must not be committed.

เปิด `http://localhost:3000` เซิร์ฟเวอร์เก็บฐานข้อมูลและไฟล์ที่อัปโหลดใน `data/` ควรสำรองโฟลเดอร์นี้ก่อนย้ายหรือติดตั้งเซิร์ฟเวอร์ใหม่ ไฟล์ `.env` มีค่าลับ ห้ามอัปโหลดเข้า repository

### Android APK / สร้าง APK Android

```powershell
cd android
./gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. You need JDK 17+, Android SDK Platform 35, Build Tools 35.0.0, CMake 3.22.1, and NDK 27.2.12479018. Set `PURE_SERVER_URL` at build time to preconfigure the server address; otherwise users enter it in the app. Debug APKs are for testing and are not production-signed.

ไฟล์ APK อยู่ที่ `android/app/build/outputs/apk/debug/app-debug.apk` ต้องมี JDK 17+, Android SDK Platform 35, Build Tools 35.0.0, CMake 3.22.1 และ NDK 27.2.12479018 ตั้ง `PURE_SERVER_URL` ตอน build เพื่อกำหนดเซิร์ฟเวอร์เริ่มต้น หรือให้ผู้ใช้กรอก URL ในแอป APK แบบ debug ใช้ทดสอบและยังไม่ได้เซ็นสำหรับเผยแพร่จริง

### Server deployment / นำเซิร์ฟเวอร์ขึ้นใช้งาน

GitHub Pages hosts static web assets only; it does not run the PURE API, Socket.IO, SQLite, scheduled jobs, ComfyUI, or uploaded-file storage. Deploy the server to a host that supports Node.js or Docker, give it a permanent HTTPS origin, and configure secrets on that host. See the [environment example](.env.example) and [server setup plan](docs/PLAN.md).

GitHub Pages ให้บริการไฟล์เว็บแบบ static เท่านั้น ไม่ได้รัน PURE API, Socket.IO, SQLite, งานตามเวลา, ComfyUI หรือจัดเก็บไฟล์อัปโหลด ต้องนำเซิร์ฟเวอร์ไปไว้บนเครื่องที่รองรับ Node.js หรือ Docker ตั้ง HTTPS แบบถาวร และเก็บ secrets ไว้บนเซิร์ฟเวอร์ ดู [ตัวอย่าง environment](.env.example) และ [แผนตั้งค่าเซิร์ฟเวอร์](docs/PLAN.md)

## Roadmap / แผนพัฒนาต่อ

The roadmap prioritizes safety and reliability before adding more visible features. Each milestone should pass its release checks before moving to the next. Items that require Firebase, a public TURN service, domain DNS access, or physical Android devices are marked as dependencies.

แผนพัฒนาให้ความสำคัญกับความปลอดภัยและความเสถียรก่อนเพิ่มฟีเจอร์ใหม่ แต่ละระยะจะผ่านเกณฑ์ก่อนปล่อยรุ่นถัดไป งานที่ต้องใช้ Firebase, TURN สาธารณะ, สิทธิ์จัดการ DNS หรือมือถือ Android สำหรับทดสอบจะระบุเงื่อนไขไว้

### Now — 0.12.x: Secure launch / ระยะนี้ — เปิดใช้งานให้ปลอดภัย

- Fix the HTTPS certificate and DNS/custom-domain configuration for `call.purefxai.store`; verify the certificate covers the exact hostname before sign-in is enabled.
- Keep the public web client and API server origins explicit; verify login, media, WebSocket, and WebRTC signaling through HTTPS.
- Publish the v0.12.0 APK and release notes; keep the local workflow JSON, `.env`, uploaded media, and signing keys out of Git.
- Add backup/restore guidance and a server health page that reports actionable status without exposing secrets.

- แก้ DNS และใบรับรอง HTTPS ของ `call.purefxai.store` และตรวจว่าใบรับรองครอบคลุม hostname จริงก่อนเปิดให้เข้าสู่ระบบ
- กำหนด URL ของเว็บและ API ให้ชัด ทดสอบล็อกอิน ไฟล์ WebSocket และสัญญาณโทรผ่าน HTTPS
- เผยแพร่ APK และ release notes ของ 0.12.0 โดยไม่นำ workflow JSON ส่วนตัว, `.env`, สื่อของผู้ใช้ หรือ signing key เข้า Git
- เพิ่มคู่มือสำรอง/กู้คืนข้อมูล และหน้าเช็กสุขภาพเซิร์ฟเวอร์ที่แสดงสถานะที่แก้ได้โดยไม่เปิดเผย secrets

### Next — 0.13: Social polish / ถัดไป — ทำระบบสังคมให้ครบ

- Separate text posts, photo posts, and Reels in feed navigation; improve media preview, zoom, and download behavior.
- Finish profiles: friend/follower counts, cover-image editing, privacy controls, and a clear public/private profile state.
- Complete group lifecycle: invite, accept/decline, member roles, admin/moderation actions, and leaving a group.
- Improve stories with a clear expiry period and viewer controls; improve comment threads, reply mentions, profile photos, and reactions.
- Make message translation reliably automatic, with source/translated/both display modes and readable language names.
- Add real-time typing indicators and per-account notification/ringtone settings.

- แยกเมนูโพสต์ข้อความ รูป และ Reels พร้อมปรับการดูตัวอย่าง ซูม และดาวน์โหลดสื่อ
- ทำโปรไฟล์ให้ครบ: จำนวนเพื่อน/ผู้ติดตาม เปลี่ยนภาพปก ตั้งค่าความเป็นส่วนตัว และบอกสถานะโปรไฟล์สาธารณะ/ส่วนตัวให้ชัด
- ทำวงจรกลุ่มให้ครบ: เชิญ รับ/ปฏิเสธคำเชิญ บทบาทสมาชิก เครื่องมือแอดมิน/ผู้ดูแล และออกจากกลุ่ม
- ปรับ Story ให้กำหนดวันหมดอายุและควบคุมผู้ชมได้ พร้อมคอมเมนต์ซ้อน แท็กตอบกลับ รูปโปรไฟล์ และอารมณ์
- ทำให้การแปลข้อความอัตโนมัติเสถียร พร้อมโหมดแสดงต้นฉบับ/คำแปล/ทั้งคู่ และชื่อภาษาที่อ่านเข้าใจง่าย
- เพิ่มสถานะกำลังพิมพ์แบบเรียลไทม์ และแยกเสียงแจ้งเตือน/เสียงเรียกเข้าตามบัญชี

### 0.14: JEV assistant / ผู้ช่วย JEV

- Keep JEV as a background task router: classify the request, select an available provider, and fall back from Gemini to local Ollama when configured.
- Bring context-aware `@pure` help into chats, groups, timeline posts, and comments; only use the specific conversation or post context the user invokes.
- Offer concise summaries of selected chats and documents, with user consent and a clear preview of what context is sent to an online provider.
- Show decision cards when details are missing or an action needs approval; do not silently send messages, create reminders, or make purchases.
- Add optional per-user memory controls: inspect, correct, pause, and delete remembered facts.

- ให้ JEV ทำงานเบื้องหลังเพื่อคัดกรองคำขอ เลือกผู้ให้บริการที่พร้อม และสลับจาก Gemini ไป Ollama ในเครื่องเมื่อมีการตั้งค่า
- เรียก `@pure` ให้เข้าใจบริบทในแชต กลุ่ม โพสต์ และคอมเมนต์ โดยใช้เฉพาะบริบทที่ผู้ใช้เรียกมาช่วย
- สรุปแชตหรือเอกสารที่เลือกได้ โดยขอความยินยอมและแสดงตัวอย่างบริบทที่จะส่งไปยังผู้ให้บริการออนไลน์
- แสดงตัวเลือกเมื่อข้อมูลไม่ครบหรือต้องอนุมัติก่อน ห้ามส่งข้อความ สร้างการเตือน หรือซื้อของเองโดยไม่แจ้ง
- เพิ่มการควบคุมความจำรายผู้ใช้: ดู แก้ หยุดใช้ และลบข้อมูลที่จำไว้ได้

### 0.15: Calls and notifications / โทรและแจ้งเตือน

- Validate audio/video calls on real Android devices across Wi-Fi and mobile networks; deploy and monitor TURN before promising cross-network reliability.
- Separate microphone, speaker, ringtone, and message notification controls; handle Android audio focus and Bluetooth headsets.
- Add push notifications and incoming-call wakeups only after a Firebase project, app signing, and device testing are available.
- Provide call quality diagnostics that show connection state and recovery steps without exposing call content.

- ทดสอบโทรเสียง/วิดีโอบนมือถือ Android จริงทั้ง Wi-Fi และเครือข่ายมือถือ ติดตั้งและเฝ้าระวัง TURN ก่อนรับรองการโทรข้ามเครือข่าย
- แยกการควบคุมไมค์ ลำโพง เสียงเรียกเข้า และแจ้งเตือนข้อความ พร้อมจัดการ audio focus และหูฟัง Bluetooth
- เพิ่ม push notification และปลุกหน้าจอเมื่อมีสายเข้า หลังมี Firebase project, การเซ็นแอป และทดสอบบนอุปกรณ์จริง
- แสดงสถานะคุณภาพการโทรและวิธีแก้การเชื่อมต่อ โดยไม่เปิดเผยเนื้อหาสาย

### 0.16+: Creator tools and scale / ระยะต่อไป: เครื่องมือผู้สร้างและรองรับผู้ใช้

- Add user-created sticker packs with safe uploads, previews, moderation, and attribution.
- Expand groups with product posts, seller profiles, pinned posts, and clear purchase/contact flows; do not process payments until a payment provider and policies are chosen.
- Add opt-in AI video generation controls: prompt preview, queue/cancel status, storage limits, retention, and moderation before public posting.
- Prepare production release signing, automated migration/backup checks, error monitoring, accessibility review, and load testing.

- เพิ่มชุดสติกเกอร์ที่ผู้ใช้สร้างเอง พร้อมอัปโหลดอย่างปลอดภัย ดูตัวอย่าง ตรวจเนื้อหา และระบุเจ้าของงาน
- ขยายกลุ่มด้วยโพสต์สินค้า โปรไฟล์ผู้ขาย ปักหมุด และช่องทางติดต่อ/สั่งซื้อที่ชัดเจน ยังไม่รับชำระเงินจนกว่าจะเลือกผู้ให้บริการและนโยบาย
- เพิ่มการควบคุมสร้างวิดีโอ AI แบบสมัครใจ: ตรวจ prompt ดูคิว/ยกเลิก จำกัดพื้นที่ เก็บรักษา และตรวจเนื้อหาก่อนโพสต์สาธารณะ
- เตรียมเซ็นแอปสำหรับ production ตรวจ migration/backup อัตโนมัติ เฝ้าระวัง error ตรวจ accessibility และทดสอบโหลด

See [the full roadmap](docs/ROADMAP.md) for dependencies and release gates. / ดู [roadmap ฉบับเต็ม](docs/ROADMAP.md) สำหรับเงื่อนไขและเกณฑ์ก่อนปล่อยรุ่น

## Project layout / โครงสร้างโปรเจกต์

- `public/` — web client and static assets / เว็บแอปและไฟล์ static
- `server/` — API, Socket.IO, SQLite, AI routing, and ComfyUI jobs / API, Socket.IO, SQLite, AI router และงาน ComfyUI
- `android/` — Android app and native bridges / แอป Android และ native bridge
- `tests/` — automated tests / ชุดทดสอบอัตโนมัติ
- `docs/` — setup, deployment, release, and roadmap / คู่มือติดตั้ง deploy release และแผนพัฒนา

## Safety notes / ข้อควรทราบ

- Never commit `.env`, API keys, passwords, local workflow JSON, user data, or keystores.
- Keep user consent explicit before sending profile photos to video-generation services or sending private chat context to online AI.
- GitHub Pages is not the backend. A public production API requires a separately hosted server, HTTPS, storage, backups, and TURN for reliable calls.
- The Android APK linked above is a debug build. A production release requires a protected signing key and device QA.

- ห้าม commit `.env`, API key, รหัสผ่าน, workflow JSON ส่วนตัว, ข้อมูลผู้ใช้ หรือ keystore
- ต้องขอความยินยอมก่อนส่งรูปโปรไฟล์ไปบริการสร้างวิดีโอ หรือส่งบริบทแชตส่วนตัวไป AI ออนไลน์
- GitHub Pages ไม่ใช่ backend; API สำหรับใช้งานจริงต้องมีเซิร์ฟเวอร์ HTTPS, พื้นที่เก็บข้อมูล, backup และ TURN เพื่อให้โทรได้เสถียร
- APK ที่ลิงก์อยู่เป็น debug build การปล่อย production ต้องใช้ signing key ที่เก็บปลอดภัยและผ่าน QA บนอุปกรณ์จริง
