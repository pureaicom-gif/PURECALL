# PURE Product Roadmap / แผนพัฒนาผลิตภัณฑ์ PURE

**Status date / วันที่สถานะ:** 4 November 2026 / 4 พฤศจิกายน 2569  
**Current version / รุ่นปัจจุบัน:** [0.12.0](https://github.com/pureaicom-gif/PURECALL/releases/tag/v0.12.0)

This plan turns the requested PURE features into release-sized work. Priorities can change with user feedback. A milestone is not complete until its release gate is met; a feature listed here is planned work, not a claim that it already exists.

เอกสารนี้จัดฟีเจอร์ที่วางแผนไว้เป็นงานรายรุ่น ลำดับอาจเปลี่ยนตามการใช้งานจริง แต่ละระยะจะถือว่าเสร็จเมื่อผ่านเกณฑ์ปล่อยรุ่น ฟีเจอร์ที่อยู่ในแผนยังไม่ถือว่ามีอยู่แล้ว

## Product principles / แนวทางหลัก

1. **Trust first / ปลอดภัยก่อน:** correct HTTPS, private-by-default data, explicit consent, backups, and no secrets in Git.
2. **Useful before flashy / ใช้งานจริงก่อน:** make core flows reliable on web and real Android devices before adding more screens.
3. **One PURE experience / ประสบการณ์เดียวกัน:** Thai and English first; web and Android should have clear, consistent behavior.
4. **AI stays behind the scenes / AI ทำงานเบื้องหลัง:** JEV routes tasks; the interface explains the result and asks approval only when a real decision or external action is needed.
5. **User controls their data / ผู้ใช้ควบคุมข้อมูล:** inspect, export, delete, and set retention for profile, chat, media, and AI memory.

## Current state: 0.12.0 / สถานะปัจจุบัน: 0.12.0

- GitHub branch `release/v0.12.0` and tag `v0.12.0` are published; the release contains `PURE-0.12.0.apk`.
- Local debug APK is available from the running development server at `/downloads/PURE-0.12.0-debug.apk`.
- Server-side ComfyUI job flow supports the owner's local video workflow, requires consent, keeps jobs scoped to the owner, and publishes a completed video to that owner's timeline.
- The web hostname currently has a TLS certificate mismatch. Do not use HTTPS sign-in or bypass the browser warning until the certificate is corrected.
- Push notifications need a Firebase project. Cross-network call reliability needs a reachable TURN service. Final device behavior still needs real Android phone QA.

- เผยแพร่ branch `release/v0.12.0` และ tag `v0.12.0` บน GitHub แล้ว พร้อม APK `PURE-0.12.0.apk`
- APK debug ในเครื่องดาวน์โหลดได้จาก `/downloads/PURE-0.12.0-debug.apk` เมื่อเซิร์ฟเวอร์พัฒนาเปิดอยู่
- ระบบ ComfyUI ฝั่งเซิร์ฟเวอร์รองรับ workflow วิดีโอในเครื่องเจ้าของงาน ต้องขอความยินยอม จำกัดสิทธิ์ตามเจ้าของ และโพสต์วิดีโอเมื่อสร้างเสร็จ
- hostname ของเว็บยังมีใบรับรอง TLS ไม่ตรง ห้ามล็อกอินผ่าน HTTPS หรือข้ามคำเตือนจนกว่าจะแก้ใบรับรอง
- push notification ต้องมี Firebase project การโทรข้ามเครือข่ายต้องมี TURN ที่เข้าถึงได้ และต้อง QA บนมือถือ Android จริง

## P0 — Secure, stable launch / เปิดใช้งานอย่างปลอดภัยและเสถียร

**Target / เป้าหมาย:** 0.12.x patch releases  
**Priority / ลำดับ:** immediate / ทำก่อน

### Work / งาน

- Fix DNS and the GitHub Pages custom-domain certificate for `call.purefxai.store`; confirm the hostname, certificate chain, HTTPS redirect, and renewal.
- Separate the static web origin from the API origin. Configure the Android server URL and web API origin deliberately; never silently send users to an old tunnel URL.
- Add a setup/health page showing API reachability, secure-origin status, WebSocket status, storage, database backup age, and TURN availability without showing credentials.
- Document safe backup and restore for SQLite, uploaded files, and server configuration; test restoration into a clean server directory.
- Confirm the release workflow builds a version-matched APK and attaches it to the GitHub Release. Keep the signing key out of Actions until a protected production key is provisioned.
- Audit that `.env`, the personal ComfyUI workflow, uploaded user files, test databases, and keystores are ignored and absent from commits.

- แก้ DNS และใบรับรอง custom domain ของ GitHub Pages สำหรับ `call.purefxai.store`; ตรวจ hostname, certificate chain, HTTPS redirect และการต่ออายุ
- แยก URL เว็บ static กับ API ตั้ง URL เซิร์ฟเวอร์ Android และเว็บอย่างชัดเจน ห้ามส่งผู้ใช้กลับไป tunnel เก่าโดยไม่แจ้ง
- เพิ่มหน้า setup/health แสดง API, secure origin, WebSocket, storage, เวลา backup ฐานข้อมูล และ TURN โดยไม่แสดง credential
- ทำคู่มือ backup/restore สำหรับ SQLite ไฟล์อัปโหลด และค่าตั้งเซิร์ฟเวอร์ พร้อมทดลองกู้คืนไปยังโฟลเดอร์เซิร์ฟเวอร์ใหม่
- ยืนยันว่า release workflow สร้าง APK ชื่อและเลขเวอร์ชันถูกต้อง แล้วแนบใน GitHub Release เก็บ signing key ออกจาก Actions จนกว่าจะมี production key ที่ป้องกันแล้ว
- ตรวจว่า `.env`, workflow ComfyUI ส่วนตัว, ไฟล์ผู้ใช้, ฐานข้อมูลทดสอบ และ keystore ถูก ignore และไม่อยู่ใน commit

### Release gate / เกณฑ์ผ่าน

- No certificate warning on the canonical web URL; API and web app both use HTTPS.
- New account → sign in → profile → friend request → chat → media download works on web and Android.
- APK installs and launches; download endpoint and GitHub Release point to the same version.
- Restore test preserves accounts, chats, and media; no secret is present in repository history for this release.

- URL หลักไม่มีคำเตือนใบรับรอง เว็บและ API ใช้ HTTPS
- สมัคร → เข้าระบบ → โปรไฟล์ → ขอเป็นเพื่อน → แชต → ดาวน์โหลดสื่อ ใช้งานได้บนเว็บและ Android
- ติดตั้งและเปิด APK ได้ endpoint ดาวน์โหลดกับ GitHub Release เป็นรุ่นเดียวกัน
- กู้คืนแล้วบัญชี แชต และสื่อยังอยู่ และไม่มี secret ใน commit ของรุ่นนี้

## P1 — Social core / แกนระบบสังคม

**Target / เป้าหมาย:** 0.13  
**Priority / ลำดับ:** high / สูง

- Feed tabs for text/photo posts and Reels; search and refresh state that preserve scroll position.
- Profile completion: cover image, post/friend/follower counts, privacy modes, follow/unfollow, and visibility rules applied consistently to search, feed, and direct links.
- Groups: invite-only joining, request/approve/decline, roles, member list, owner transfer, leave, and admin moderation.
- Stories: choose audience, show expiry, hide/mute stories, and remove expired media predictably.
- Threaded comments: nested replies with author avatars, `@mentions`, edit/delete rules, and likes/reactions for both comments and replies.
- Media viewer: preview before download, zoom, save/download, file type/size, and reliable image crop with a movable crop window and aspect-ratio controls.
- Automatic translation: selectable display mode (original, translated, both), readable language names, retry on failure, and no provider/model diagnostics in the user-facing interface.
- Realtime typing indicator and per-account settings for message notifications and incoming-call sound.

- แยกแท็บฟีดข้อความ/รูปกับ Reels ค้นหาและรีเฟรชโดยไม่ทำตำแหน่ง scroll หาย
- เติมโปรไฟล์: ภาพปก จำนวนโพสต์/เพื่อน/ผู้ติดตาม โหมดความเป็นส่วนตัว ติดตาม/เลิกติดตาม และบังคับสิทธิ์เดียวกันใน search, feed และลิงก์ตรง
- กลุ่ม: เข้าด้วยคำเชิญ ขอเข้ากลุ่ม อนุมัติ/ปฏิเสธ บทบาท รายชื่อ โอนเจ้าของ ออกจากกลุ่ม และดูแลสมาชิก
- Story: เลือกผู้ชม แสดงวันหมดอายุ ซ่อน/ปิดเสียง และลบสื่อที่หมดอายุอย่างเป็นระบบ
- คอมเมนต์หลายชั้น: แสดงรูปผู้เขียน แท็ก `@ชื่อ` กติกาแก้/ลบ และกดถูกใจ/อารมณ์ทั้งคอมเมนต์และคำตอบ
- ตัวดูสื่อ: ดูก่อนดาวน์โหลด ซูม บันทึก/ดาวน์โหลด ชนิด/ขนาดไฟล์ และ crop ที่ลากกรอบได้พร้อมกำหนดสัดส่วน
- แปลอัตโนมัติ: เลือกแสดงต้นฉบับ/คำแปล/ทั้งคู่ ใช้ชื่อภาษาที่อ่านง่าย ลองใหม่ได้ และซ่อนรายละเอียด provider/model จาก UI
- แสดงสถานะกำลังพิมพ์แบบ realtime และตั้งเสียงแจ้งข้อความ/เสียงเรียกเข้าแยกตามบัญชี

## P2 — JEV personal assistant / ผู้ช่วยส่วนตัว JEV

**Target / เป้าหมาย:** 0.14  
**Priority / ลำดับ:** high / สูง

- JEV is an internal router and task classifier, not a model choice shown to users. Use Gemini first when configured; fall back to local Ollama when available; return a clear unavailable state when neither is ready.
- `@pure` can be invoked in a direct chat, group, timeline post, or comment. Pass only the selected, relevant context; never silently read unrelated conversations.
- Add summarization for a selected chat, thread, link, or uploaded document. Preview external context and ask consent before sending private content to an online AI provider.
- Add decision cards when intent or details are ambiguous. Show 2–4 practical choices and let the user edit before continuing.
- Support reminders and calendar actions only after the user reviews the exact date/time, timezone, title, and target calendar. Nothing is created from an inferred date without confirmation.
- Add per-user memory controls: opt in/out, inspect, correct, forget one item, clear all, and set retention.
- Add task history with provider, outcome, and timing visible only as non-sensitive user diagnostics; never expose API keys or hidden chain-of-thought.

- JEV เป็น router และตัวคัดกรองภายใน ไม่ใช่ตัวเลือกโมเดลที่แสดงให้ผู้ใช้เห็น ใช้ Gemini ก่อนเมื่อพร้อม สลับไป Ollama ในเครื่องเมื่อใช้ได้ และแจ้งสถานะชัดเจนหากไม่มีตัวช่วยพร้อม
- เรียก `@pure` ได้ในแชตส่วนตัว กลุ่ม โพสต์ หรือคอมเมนต์ ส่งเฉพาะบริบทที่เกี่ยวข้องและถูกเลือก ห้ามอ่านห้องอื่นเอง
- สรุปห้องแชต เธรด ลิงก์ หรือไฟล์ที่เลือกได้ แสดงบริบทที่จะส่งและขออนุญาตก่อนส่งเนื้อหาส่วนตัวไป AI ออนไลน์
- เมื่อความต้องการไม่ชัด แสดง decision card พร้อมตัวเลือกที่ใช้งานได้ 2–4 ข้อ และให้แก้ไขก่อนทำต่อ
- สร้างการเตือน/นัดหมายได้เมื่อผู้ใช้ตรวจวัน เวลา เขตเวลา ชื่อ และปฏิทินเป้าหมายแล้ว ห้ามสร้างจากวันที่ที่คาดเดาเองโดยไม่ยืนยัน
- มีการควบคุมความจำรายผู้ใช้: เปิด/ปิด ดู แก้ ลืมบางรายการ ล้างทั้งหมด และกำหนดอายุข้อมูล
- มีประวัติงานพร้อม provider ผลลัพธ์ และเวลาเป็นข้อมูลวินิจฉัยที่ไม่อ่อนไหว ห้ามแสดง API key หรือ chain-of-thought ที่ซ่อนอยู่

## P3 — Calls and notifications / ระบบโทรและแจ้งเตือน

**Target / เป้าหมาย:** 0.15  
**Dependencies / เงื่อนไข:** public TURN endpoint; Firebase project and Android app registration for push  
**เงื่อนไข:** TURN ที่เข้าถึงได้; Firebase project และลงทะเบียน Android app เพื่อใช้ push

- Test one-to-one audio/video calls on at least two Android devices over same Wi-Fi, separate Wi-Fi, and mobile data.
- Configure TURN credentials with rotation/expiry and monitor relay health; document bandwidth and hosting costs.
- Handle call permission states, audio focus, speaker/earpiece, wired/Bluetooth headset, reconnect, and call-ended states.
- Add push notifications and incoming-call notifications with user-controlled categories, sound, quiet time, and per-device registration.
- Add call quality signals (connection type, packet loss, reconnect reason) without recording or exposing media content.

- ทดสอบโทรเสียง/วิดีโอบน Android อย่างน้อยสองเครื่อง ผ่าน Wi-Fi เดียวกัน คนละ Wi-Fi และ mobile data
- ตั้ง TURN credentials ให้หมดอายุ/หมุนเวียนและเฝ้าดูสถานะ relay พร้อมบันทึกค่า bandwidth/hosting
- จัดการ permission, audio focus, ลำโพง/หูฟัง, หูฟังสาย/Bluetooth, reconnect และจบสาย
- เพิ่ม push และสายเข้า พร้อมหมวดเสียง เวลาเงียบ และการลงทะเบียนแยกอุปกรณ์ที่ผู้ใช้ควบคุมได้
- แสดงสัญญาณคุณภาพสาย เช่นชนิดการเชื่อมต่อ packet loss และสาเหตุ reconnect โดยไม่บันทึกหรือเผยเนื้อหาเสียง/วิดีโอ

## P4 — Groups, creators, and marketplace / กลุ่ม ผู้สร้าง และตลาดสินค้า

**Target / เป้าหมาย:** 0.16+  
**Priority / ลำดับ:** after safety and core social / หลังระบบปลอดภัยและ social core

- Group product posts with seller profile, product images, price/currency, stock status, contact method, and report/block tools.
- Keep payment outside PURE until a payment provider, refund flow, seller verification, moderation policy, and legal requirements are chosen.
- User-created sticker packs with crop/preview, ownership attribution, report, moderation, and removal controls.
- AI video creator with opt-in, queue/progress/cancel, prompt and source-image review, cost limits, storage quota, retention, and explicit public-post confirmation.
- Group discovery and friend recommendations based on user-chosen signals; provide hide/disable controls and do not reveal precise location by default.

- โพสต์สินค้าภายในกลุ่ม พร้อมโปรไฟล์ผู้ขาย รูป ราคา/สกุลเงิน สถานะสินค้า ช่องทางติดต่อ และเครื่องมือรายงาน/บล็อก
- ยังไม่รับชำระเงินใน PURE จนกว่าจะเลือก payment provider ขั้นตอนคืนเงิน การยืนยันผู้ขาย นโยบายดูแลเนื้อหา และข้อกำหนดทางกฎหมาย
- ชุดสติกเกอร์ที่ผู้ใช้สร้างได้ พร้อม crop/preview เครดิตเจ้าของ รายงาน ตรวจเนื้อหา และลบชุดได้
- เครื่องมือสร้างวิดีโอ AI แบบเลือกใช้ มีคิว/สถานะ/ยกเลิก ตรวจ prompt และภาพต้นทาง จำกัดค่าใช้จ่าย/พื้นที่ ระยะเก็บ และยืนยันก่อนโพสต์สาธารณะ
- ค้นพบกลุ่มและแนะนำเพื่อนจากสัญญาณที่ผู้ใช้เลือกได้ มีปุ่มซ่อน/ปิด และไม่เปิดเผยตำแหน่งละเอียดเป็นค่าเริ่มต้น

## Quality and release checklist / เช็กลิสต์คุณภาพและปล่อยรุ่น

Every release should:

- pass the project's automated test suite and Android debug build;
- include a migration/rollback note for database changes;
- verify access control and ownership for every user-data endpoint;
- check keyboard, screen-reader labels, contrast, Thai/English layouts, slow networks, and small screens;
- keep credentials, personal media, private workflows, and signing keys out of commits and APK assets;
- publish a versioned changelog, APK, server compatibility note, and known limitations.

ทุกรุ่นควร:

- ผ่านชุดทดสอบอัตโนมัติและ Android debug build
- มีบันทึก migration/rollback เมื่อเปลี่ยนฐานข้อมูล
- ตรวจสิทธิ์และความเป็นเจ้าของใน endpoint ที่แตะข้อมูลผู้ใช้
- ตรวจคีย์บอร์ด screen reader contrast ภาษาไทย/อังกฤษ เน็ตช้า และหน้าจอขนาดเล็ก
- ไม่นำ credential สื่อส่วนตัว workflow ส่วนตัว หรือ signing key เข้า commit หรือไฟล์ APK
- เผยแพร่ changelog, APK, หมายเหตุความเข้ากันได้กับเซิร์ฟเวอร์ และข้อจำกัดของรุ่น

## Dependencies / งานที่ต้องมีจากภายนอก

| Dependency | Needed for | Status |
|---|---|---|
| DNS and GitHub Pages settings for `call.purefxai.store` | Valid HTTPS web URL | TLS hostname mismatch; correction required |
| Public server with stable HTTPS origin | Login, API, real-time and uploads | Development server runs locally; production origin must be verified |
| TURN service and credentials | Reliable calls across NAT/mobile networks | Configure and test before call reliability claims |
| Firebase project, Android app id, signing setup | Push and incoming-call wakeups | Not provisioned |
| Two physical Android phones | Call, Bluetooth, notification, and background QA | Required for release validation |
| Owner's ComfyUI and private workflow | AI video generation | Local workflow is configured on the server machine; never publish it |

| สิ่งที่ต้องมี | ใช้สำหรับ | สถานะ |
|---|---|---|
| DNS และ GitHub Pages settings ของ `call.purefxai.store` | เว็บ HTTPS ที่ใบรับรองถูกต้อง | hostname ของ TLS ยังไม่ตรง ต้องแก้ก่อน |
| เซิร์ฟเวอร์สาธารณะที่มี HTTPS คงที่ | Login, API, realtime และอัปโหลด | ตอนนี้เซิร์ฟเวอร์พัฒนาอยู่ในเครื่อง ต้องยืนยัน production origin |
| TURN service และ credentials | โทรข้าม NAT/เครือข่ายมือถือให้เสถียร | ต้องตั้งและทดสอบก่อนรับรองคุณภาพ |
| Firebase project, Android app id และ signing setup | Push และปลุกแจ้งสายเข้า | ยังไม่ได้ตั้งค่า |
| มือถือ Android จริง 2 เครื่อง | QA สาย, Bluetooth, แจ้งเตือน และเบื้องหลัง | ต้องมีเพื่อยืนยันก่อนปล่อย |
| ComfyUI และ workflow ส่วนตัวของเจ้าของ | สร้างวิดีโอ AI | ตั้งไว้ฝั่งเซิร์ฟเวอร์ส่วนตัว ห้ามเผยแพร่ workflow |
