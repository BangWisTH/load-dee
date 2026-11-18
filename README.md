# โหลดดี

เว็บภาษาไทยสำหรับดาวน์โหลดวิดีโอ MP4 หรือเสียง MP3 จากลิงก์ YouTube, TikTok และ Facebook โดยใช้ `yt-dlp` กับ FFmpeg ฝั่งเซิร์ฟเวอร์ หน้าแรกใช้ธีมหุบเขาดอกไม้ยามค่ำคืน มีฉาก canvas วาดขึ้นใหม่ที่เคลื่อนไหวตามเมาส์และปุ่มเสียงบรรยากาศ

หน้าสนับสนุนใช้ Thai QR Payment / PromptPay แบบไม่ระบุยอดเงิน สร้าง QR ใหม่ได้ด้วย `npm run generate:promptpay` (เบอร์ PromptPay ตั้งไว้ใน `scripts/generate-promptpay-qr.mjs` และส่วนคัดลอกเบอร์ใน `app.js`)

## เริ่มใช้งานบน Windows

ต้องมี Node.js และ Python 3 ติดตั้งไว้แล้ว จากโฟลเดอร์โปรเจกต์ รัน:

```powershell
npm install
npm install-scripts approve ffmpeg-static
npm rebuild ffmpeg-static
py -3 -m pip install -r requirements.txt
npm start
```

จากนั้นเปิด <http://localhost:3000> ในเบราว์เซอร์ เซิร์ฟเวอร์จะเตรียมไฟล์แล้วส่งให้ดาวน์โหลดโดยตรง และลบไฟล์ชั่วคราวหลังส่งเสร็จ

บน macOS/Linux ใช้ `python3 -m pip install -r requirements.txt` แล้วรัน `npm start` เช่นกัน

## การตั้งค่า

- `PORT` เปลี่ยนพอร์ตเว็บได้ (ค่าเริ่มต้น `3000`)
- `PYTHON` ระบุคำสั่ง Python สำหรับ `yt-dlp` ได้ (บน Windows ค่าเริ่มต้นคือ Python Launcher `py -3`)
- จำกัดขนาดไฟล์ไว้ที่ 500 MB และยกเลิกรายการที่ใช้เวลาเกิน 20 นาที
- `HOST` เปลี่ยนโฮสต์ที่เซิร์ฟเวอร์รับการเชื่อมต่อได้ (ค่าเริ่มต้น `0.0.0.0`)
- `MAX_CONCURRENT_DOWNLOADS` จำกัดจำนวนรายการที่ประมวลผลพร้อมกัน (ค่าเริ่มต้น `2`)
- `PUBLIC_SITE_URL` ใช้ตั้ง URL หลักของเว็บไซต์ เช่น `https://example.com` สำหรับ canonical URL และ sitemap (ถ้าไม่กำหนด จะดูจาก URL ที่เปิดอยู่)
- ลิงก์ที่ส่งให้ API ถูกจำกัดไว้เฉพาะโดเมน YouTube, TikTok และ Facebook

## เผยแพร่สู่สาธารณะ

แอปนี้ต้องใช้เซิร์ฟเวอร์ Node.js + Python + FFmpeg จึงต้อง deploy เป็น **Web Service/Container** ไม่ใช่ Static Site อย่างเดียว มี `Dockerfile` เตรียมไว้แล้ว ตัวอย่างใช้ Render:

1. นำโฟลเดอร์โปรเจกต์ขึ้น GitHub repository
2. ใน Render เลือก **New → Web Service** แล้วเชื่อม repository
3. เลือก runtime แบบ Docker ให้ build จาก `Dockerfile`
4. ตั้ง health check path เป็น `/api/health` และใช้ `PORT` ที่แพลตฟอร์มกำหนด
5. Deploy แล้วทดสอบ URL `onrender.com`; เพิ่มโดเมนของตัวเองได้ภายหลัง
6. หลังเว็บมี URL สาธารณะ ให้เพิ่มเว็บใน Google Search Console แล้วส่ง `https://โดเมนของคุณ/sitemap.xml`; หรือปล่อยให้ Google พบ sitemap ผ่าน `/robots.txt`

Render ต้องให้แอปรับการเชื่อมต่อบน `0.0.0.0` และพอร์ตจาก `PORT` ซึ่งเซิร์ฟเวอร์รองรับแล้ว Free instance จะพักเมื่อไม่มีผู้ใช้ 15 นาทีและเริ่มใหม่เมื่อมี request จึงไม่เหมาะกับประสบการณ์พร้อมใช้งานตลอดเวลา งานดาวน์โหลดใช้ CPU, RAM, พื้นที่ชั่วคราว และแบนด์วิดท์ ควรเลือก paid instance ที่มี RAM อย่างน้อย 2 GB และเริ่มจาก concurrency ต่ำ ปรับตามโหลดและค่าใช้จ่ายจริง [Render Web Services](https://render.com/docs/web-services) · [Render pricing](https://render.com/pricing) · [Render Free limits](https://render.com/docs/free)

บริการสาธารณะอาจถูกใช้งานหนักหรือส่งลิงก์ที่ผู้ใช้ไม่มีสิทธิ์บันทึก ควรตรวจการใช้งานและค่าใช้จ่ายเป็นประจำ ปัจจุบันแอปจำกัด 2 งานพร้อมกัน, ไฟล์ 500 MB, เวลางาน 20 นาที และโดเมนต้นทางที่ยอมรับไว้ แต่ยังไม่มีระบบบัญชีหรือจำกัดโควตาต่อผู้ใช้

การมี sitemap ช่วยให้ Google ค้นพบ URL แต่ไม่ได้รับประกันว่าจะจัดทำดัชนีหรือแสดงในผลค้นหา การยืนยันเว็บและส่ง URL ผ่าน Search Console ต้องใช้บัญชี Google ที่เป็นเจ้าของเว็บไซต์ [คู่มือ Google Search Central](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) · [ขอให้ Google จัดทำดัชนี](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)

ดาวน์โหลดเฉพาะเนื้อหาที่คุณเป็นเจ้าของหรือได้รับอนุญาต และปฏิบัติตามข้อกำหนดของแพลตฟอร์มต้นทาง
