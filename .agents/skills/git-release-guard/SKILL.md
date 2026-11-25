---
name: git-release-guard
description: ตรวจสอบความพร้อมของโค้ด ความปลอดภัยของไฟล์ .env และความเข้ากันได้กับการ Deploy บน Cloudflare ก่อน commit หรือ push โค้ดในโปรเจกต์ anva-Co-ERP
---

# ขั้นตอนการทำงาน
1. ตรวจสอบว่าไม่มีข้อมูลลับ รหัสผ่าน หรือ API Key ถูกเขียนฝังไว้ในโค้ดโดยตรง (ต้องเรียกผ่าน Environment Variables)
2. ตรวจสอบไฟล์ `.gitignore` ว่าครอบคลุม `.env` และโฟลเดอร์ `node_modules` และ `dist`
3. ตรวจสอบผลกระทบต่อการทำงานบน Cloudflare (โฟลเดอร์ `functions/` และการตั้งค่า routing ของ Vite SPA)

# ข้อห้าม (Do not)
- ห้ามแก้ไขหรือเปิดเผยค่าจริงในไฟล์ `.env` ลงในโค้ดหรือเอกสาร
- ห้ามลบไฟล์ตั้งค่าพื้นฐานของ Vite, Tailwind หรือ Cloudflare โดยไม่ตรวจสอบการ Build