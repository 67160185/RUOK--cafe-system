# RUOK Cafe System (API)

ระบบหลังบ้านร้านกาแฟหลายสาขา: ออเดอร์ เมนู สต็อก และรายงานยอดขาย
เอกสาร API แบบโต้ตอบได้อยู่ที่ **`/api-docs`** (Swagger UI อ่านจาก `openapi.yaml`)

## 1. รายชื่อสมาชิกและบทบาท

| ลำดับ | ชื่อ-นามสกุล | รหัสนักศึกษา | บทบาท | หน้าที่ |
|---:|---|---:|---|---|
| 1 | ธนกฤต วิลาบุตร | 67160185 | Project Lead / PM | วางแผนและประสานงาน |
| 2 | พลเดช สุดศรี | 67160404 | Business / System Analyst | วิเคราะห์ความต้องการระบบ |
| 3 | ธีรภัทร สุไลมาน | 67160186 | Designer (UML / DM) | ออกแบบ UML / Database |
| 4 | พิริยกร ชาตินาฝาย | 67160405 | Developer | พัฒนาและทดสอบระบบ |
| 5 | ธีรภัทร สุไลมาน | 67160015 | Presenter / Documenter | จัดทำเอกสาร รวบรวมข้อมูล และนำเสนอ |

## เอกสารประกอบ

- [รายงานโครงงาน](docs/project-report.pdf.pdf)
- [WK01 - Team Charter](docs/wk01-Team-Chater.md)
- [WK02 - Feasibility Report](docs/wk02-feasibility-report.md)
- [WK03 - Requirements](docs/wk03-requirements.md)
- [WK04 - User Stories](docs/wk04-user-stories.md)
- [WK05 - AI Disclosure](docs/ai-disclosure.md/wk05-ai-disclosure.md)
- [WK06 - Class Diagram](docs/wk06-class-diagram.png)
- [WK06 - Object Diagram](docs/wk06-object-diagram.png)
- [WK06 - Quiz Assignment](docs/wk06-quiz-assignment.md)
- [WK07 - ER Diagram](docs/wk07-er-diagram.png)
- [WK07 - Schema](docs/wk07-schema.sql)
- [WK09 - Sequence Diagram](docs/wk09-sequence-diagram.png)
- [WK09 - AI Disclosure](docs/ai-disclosure.md/wk09-ai-disclosure.md)
- [WK10 - Input/Output Design](docs/wk10-input-output-design.docx)
- [WK10 - Wireframe](docs/wk10-wireframe.docx)
- [WK10 - AI Disclosure](docs/ai-disclosure.md/wk10-ai-disclosure.md)
- [WK11 - Architecture](docs/wk11-architecture.md)
- [WK12 - Usability Testing](docs/wk12-usability-testing.md)
- [WK13 - AI Disclosure](docs/ai-disclosure.md/wk13-ai-disclosure.md)
- [WK14 - Quality Review](docs/wk14-quality-review.md)
- [Architecture Diagram](docs/images/architecture.png)
- [As-Is Diagram](docs/images/As-Is.png)
- [To-Be Diagram](docs/images/To-Be.png)
- [Use-Case Diagram](docs/images/Use-Case-Diagram.png)

## ติดตั้งและรัน

1. สร้างฐานข้อมูล (MySQL 8.0.16+ หรือ MariaDB 10.2+)
   ```
   mysql -u root -p < schema.sql
   mysql -u root -p < seed.sql      # ข้อมูลตัวอย่าง ใช้กับฐานข้อมูลว่างเท่านั้น
   ```
   ถ้ามีฐานข้อมูลเดิมอยู่แล้ว ให้รัน `migrations/002-archive-ordered-menu.sql` เพื่อรองรับการเก็บเมนูที่เคยขายเข้าคลัง หากฐานข้อมูลยังไม่ผ่าน migration 001 ให้รัน `001-harden-schema.sql` ก่อน
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า `DB_PASSWORD` ของเครื่องตัวเอง
3. ```
   npm install
   npm run dev
   ```
   คำสั่งนี้จะเปิด backend แบบ watch ที่พอร์ต 3000 และ frontend ที่พอร์ต 5173 พร้อมกัน กด `Ctrl+C` เพื่อหยุดทั้งคู่ หากพอร์ตถูกใช้งานอยู่ ให้หยุดเซิร์ฟเวอร์เดิมก่อน หรือกำหนด `PORT` (backend) และ `FRONTEND_PORT` (frontend) เป็นพอร์ตว่าง
4. เปิด http://localhost:5173 เพื่อใช้งานหน้าเว็บ หรือ http://localhost:3000/api-docs เพื่อเปิด Swagger UI
   (ตัวอย่างในเอกสารใช้ ID จาก `seed.sql` เช่น branch_id 1, employee_id 1, menu_id 1-2)

## เปิดหน้า Frontend

ปกติใช้ `npm run dev` ตามขั้นตอนด้านบนเพื่อเปิดทั้ง backend และ frontend พร้อมกัน หากต้องการเปิด frontend แยก ให้เปิด backend ก่อน แล้วรัน:

```
npm run start:frontend
```

จากนั้นเปิด http://localhost:5173 หน้าเว็บจะส่งคำขอ `/api` ต่อไปยัง backend ที่ `http://localhost:3000` โดยอัตโนมัติ จึงไม่ต้องตั้งค่า CORS เพิ่ม
อย่าเปิด `frontend/index.html` โดยตรงหรือผ่าน VS Code Live Server (เช่นพอร์ต 5500) เพราะจะไม่สามารถส่งคำขอ `/api` ผ่าน proxy ไปยัง backend ได้

ถ้า backend ใช้พอร์ตหรือเครื่องอื่น ให้กำหนด `BACKEND` ก่อนเริ่ม frontend เช่นใน PowerShell:

```
$env:BACKEND = "http://localhost:3001"
npm run start:frontend
```

## ทดสอบ

```
npm test
```

เทสต์ไม่ต้องใช้ MySQL (ใช้ฐานข้อมูลปลอม) และตรวจด้วยว่า `openapi.yaml` ตรงกับ routes ที่มีอยู่จริง
ถ้าเพิ่ม/ลบ endpoint แล้วลืมแก้เอกสาร เทสต์จะล้ม

## รูปแบบ response

- ข้อมูลทุกฟิลด์ใช้ `snake_case`; ราคาและยอดขายเป็น `number`
- ทุก error ตอบเป็น JSON `{ "message": "..." }` (400 ข้อมูลไม่ถูกต้อง, 404 ไม่พบ, 409 ขัดแย้ง, 500 ข้อผิดพลาดภายใน)
- วิธีชำระเงินที่รองรับ: `cash`, `qr`
- เพิ่มและดูหมวดหมู่ได้ผ่าน `POST /api/categories` และ `GET /api/categories` หรือเพิ่มหมวดใหม่ได้จากฟอร์มเพิ่ม/แก้ไขเมนู

## เรื่องที่ควรรู้

- การลบเมนู: เมนูที่ยังไม่เคยถูกสั่งจะลบถาวรพร้อมประวัติสต็อก ส่วนเมนูที่เคยขายจะถูกเก็บเข้าคลังและซ่อนจากรายการขาย โดยยังคงประวัติออเดอร์และรายงานไว้ ฐานข้อมูลเดิมต้องรัน `migrations/002-archive-ordered-menu.sql` ก่อน
- การลบออเดอร์ (`DELETE /api/orders/:id`) ลบประวัติการขายจริงและคืนสต็อกให้ ระบบยังไม่มี login/สิทธิ์ผู้ใช้ จึงควรใช้ในเครื่องพัฒนาเท่านั้น
- ถ้ามีหน้าเว็บ front-end อยู่คนละโดเมน ให้ตั้ง `CORS_ORIGIN` ใน `.env`
- `node_modules` ถูกติดตามอยู่ใน git เดิม (ก่อนแก้ `.gitignore`) ให้รัน `git rm -r --cached node_modules` แล้ว commit หนึ่งครั้ง
