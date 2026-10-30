# WK05: Coding Sprint 1 — โครงสร้างโปรเจกต์และการเชื่อมต่อฐานข้อมูล

## 1. ข้อมูลโครงงาน

**ชื่อโครงงาน:** ระบบบริหารร้านกาแฟ (Coffee Shop POS & Inventory System)

**Sprint:** Coding Sprint 1

**สัปดาห์:** Week 5

**เป้าหมายของ Sprint:**  
พัฒนาโครงสร้าง Backend ด้วย Node.js/Express เชื่อมต่อฐานข้อมูล MySQL และ implement Use Case หลัก **"รับคำสั่งซื้อและคำนวณราคา"** ให้สามารถทำงานผ่าน API ได้จริง

---

## 2. Use Case ที่เลือกมา Implement

### UC-01: รับคำสั่งซื้อและคำนวณราคา

**Actor หลัก:** พนักงานแคชเชียร์

**ผู้เกี่ยวข้อง:** ลูกค้า

### ขอบเขตการทำงาน

ระบบต้องสามารถรับรายการสั่งซื้อจากลูกค้า คำนวณราคารวมของรายการสินค้า และบันทึกข้อมูลออเดอร์ลงในฐานข้อมูล

ระบบรองรับช่องทางการชำระเงินตาม Requirement ของโครงงาน ได้แก่

- เงินสด (Cash)
- QR Payment

### ความเชื่อมโยงกับ Requirement

| Requirement | รายละเอียด |
|---|---|
| FR-01 | ระบบสามารถบันทึกรายการสั่งซื้อของลูกค้าผ่าน POS |
| FR-02 | ระบบคำนวณยอดรวมของคำสั่งซื้อโดยอัตโนมัติ |
| FR-03 | ระบบรองรับการชำระเงินด้วยเงินสดและ QR Payment |

---

## 3. User Story ที่นำมา Implement

### US-01: รับคำสั่งซื้อและคำนวณราคา

**As a** ลูกค้า  
**I want** สั่งสินค้าและเลือกวิธีการชำระเงิน พร้อมให้ระบบคำนวณยอดรวมโดยอัตโนมัติ  
**So that** มั่นใจว่ายอดเงินที่ต้องชำระถูกต้อง

### US-02: ตรวจสอบวิธีการชำระเงิน

**As a** ลูกค้า  
**I want** ระบบตรวจสอบวิธีการชำระเงินก่อนบันทึกออเดอร์  
**So that** ระบบไม่บันทึกข้อมูลการสั่งซื้อที่มีวิธีชำระเงินไม่ถูกต้อง

### US-03: ตรวจสอบรายการสินค้า

**As a** พนักงานแคชเชียร์  
**I want** ระบบตรวจสอบรายการสินค้า ราคา และจำนวนก่อนบันทึกออเดอร์  
**So that** ลดความผิดพลาดในการรับคำสั่งซื้อและคำนวณยอดเงิน

---

## 4. Acceptance Criteria ที่นำมา Implement

### AC-01: ต้องมีรายการสินค้า

**Given** ลูกค้าสั่งซื้อสินค้า  
**When** ส่งคำสั่งซื้อโดยไม่มีรายการสินค้า  
**Then** ระบบต้องแจ้งเตือนว่าต้องมีรายการสินค้าอย่างน้อย 1 รายการ และไม่บันทึกออเดอร์

### AC-02: ชื่อสินค้าต้องถูกต้อง

**Given** มีรายการสินค้าในออเดอร์  
**When** รายการใดไม่มีชื่อสินค้า หรือชื่อสินค้าเป็นค่าว่าง  
**Then** ระบบต้องแจ้งเตือน และไม่บันทึกออเดอร์

### AC-03: ราคาสินค้าต้องมากกว่า 0

**Given** มีรายการสินค้าในออเดอร์  
**When** ราคาสินค้าเป็น 0 หรือติดลบ หรือไม่ใช่ตัวเลข  
**Then** ระบบต้องแจ้งเตือน และไม่บันทึกออเดอร์

### AC-04: จำนวนสินค้าต้องมากกว่า 0

**Given** มีรายการสินค้าในออเดอร์  
**When** จำนวนสินค้าเป็น 0 หรือติดลบ หรือไม่ใช่จำนวนเต็ม  
**Then** ระบบต้องแจ้งเตือน และไม่บันทึกออเดอร์

### AC-05: วิธีชำระเงินต้องถูกต้อง

**Given** ลูกค้าต้องการยืนยันคำสั่งซื้อ  
**When** ไม่เลือกวิธีชำระเงิน หรือเลือกวิธีที่ระบบไม่รองรับ  
**Then** ระบบต้องแจ้งเตือน และไม่บันทึกออเดอร์

### AC-06: คำนวณยอดรวมอัตโนมัติ

**Given** รายการสินค้าและจำนวนสินค้าถูกต้อง  
**When** ลูกค้ายืนยันคำสั่งซื้อ  
**Then** ระบบต้องคำนวณยอดรวมจากราคาสินค้า × จำนวนสินค้า และบันทึกยอดรวมลงฐานข้อมูล

---

# 5. API Endpoint

สำหรับ Sprint นี้กำหนด Endpoint หลักดังนี้

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/orders` | รับคำสั่งซื้อและคำนวณราคา |
| GET | `/api/orders` | ตรวจสอบรายการออเดอร์ที่บันทึกไว้ |

### POST `/api/orders`

ใช้สำหรับสร้างคำสั่งซื้อใหม่

#### Request Body

```json
{
  "paymentMethod": "cash",
  "items": [
    {
      "name": "อเมริกาโน่",
      "price": 45,
      "quantity": 2
    },
    {
      "name": "ลาเต้",
      "price": 55,
      "quantity": 1
    }
  ]
}
```

#### การคำนวณ

```text
อเมริกาโน่ = 45 × 2 = 90 บาท
ลาเต้      = 55 × 1 = 55 บาท

ยอดรวม = 145 บาท
```

#### Response สำเร็จ

HTTP Status: `201 Created`

```json
{
  "orderId": 1,
  "totalAmount": 145
}
```

#### Response กรณีข้อมูลไม่ถูกต้อง

HTTP Status: `400 Bad Request`

```json
{
  "error": "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"
}
```

---

# 6. โครงสร้าง Project

โครงสร้าง Backend ที่ใช้ใน Sprint นี้:

```text
cafe-pos-system/
├── src/
│   ├── routes/
│   │   └── orderRoutes.js
│   │
│   ├── controllers/
│   │   └── orderController.js
│   │
│   ├── models/
│   │   └── orderModel.js
│   │
│   ├── config/
│   │   └── db.js
│   │
│   └── app.js
│
├── package.json
├── .env
├── .env.example
└── README.md
```

โครงสร้างนี้แบ่งหน้าที่ของระบบออกเป็นส่วนต่าง ๆ เพื่อให้สามารถพัฒนาต่อใน Sprint ถัดไปได้ง่าย

---

# 7. การตั้งค่า Environment

สร้างไฟล์ `.env.example`

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=cafe_pos
PORT=3000
```

ไฟล์ `.env` จะเก็บค่าจริงของแต่ละเครื่อง และไม่ควร commit ขึ้น GitHub

---

# 8. การเชื่อมต่อ MySQL

ติดตั้ง package:

```bash
npm install mysql2
```

ไฟล์ `src/config/db.js`

```javascript
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
```

ระบบใช้ Connection Pool เพื่อให้สามารถนำ connection กลับมาใช้ซ้ำและรองรับ request หลายรายการได้เหมาะสมกว่าเปิด connection ใหม่ทุกครั้ง

---

# 9. Database

สร้าง Database:

```sql
CREATE DATABASE cafe_pos;
USE cafe_pos;
```

สร้างตาราง `orders`

```sql
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_method VARCHAR(20) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL
);
```

### โครงสร้างตาราง

| Column | Type | Description |
|---|---|---|
| id | INT | รหัสออเดอร์ |
| payment_method | VARCHAR(20) | วิธีการชำระเงิน |
| total_amount | DECIMAL(10,2) | ยอดรวมของออเดอร์ |
| created_at | DATETIME | วันที่และเวลาที่สร้างออเดอร์ |

> ตารางนี้เป็นโครงสร้างเบื้องต้นสำหรับ Sprint 1 ส่วนรายละเอียดรายการสินค้าและความสัมพันธ์ของข้อมูลจะสามารถขยายเพิ่มเติมเมื่อออกแบบ ER Diagram ในสัปดาห์ถัดไป

---

# 10. Route

ไฟล์ `src/routes/orderRoutes.js`

```javascript
const express = require("express");
const router = express.Router();

const orderController = require("../controllers/orderController");

router.post("/", orderController.createOrder);
router.get("/", orderController.getAllOrders);

module.exports = router;
```

---

# 11. Controller

ไฟล์ `src/controllers/orderController.js`

```javascript
const db = require("../config/db");

const VALID_PAYMENT_METHODS = ["cash", "qr"];

exports.createOrder = async (req, res) => {
  const { items, paymentMethod } = req.body || {};

  // ตรวจสอบรายการสินค้า
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ",
    });
  }

  // ตรวจสอบชื่อสินค้า
  const hasInvalidName = items.some(
    (item) =>
      typeof item.name !== "string" ||
      item.name.trim() === ""
  );

  if (hasInvalidName) {
    return res.status(400).json({
      error: "ต้องระบุชื่อสินค้าให้ครบทุกรายการ",
    });
  }

  // ตรวจสอบราคา
  const hasInvalidPrice = items.some(
    (item) =>
      !Number.isFinite(item.price) ||
      item.price <= 0
  );

  if (hasInvalidPrice) {
    return res.status(400).json({
      error: "ราคาสินค้าต้องมากกว่า 0",
    });
  }

  // ตรวจสอบจำนวน
  const hasInvalidQuantity = items.some(
    (item) =>
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
  );

  if (hasInvalidQuantity) {
    return res.status(400).json({
      error: "จำนวนสินค้าต้องมากกว่า 0",
    });
  }

  // ตรวจสอบวิธีชำระเงิน
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      error: "paymentMethod ไม่ถูกต้องหรือไม่ได้ระบุ",
    });
  }

  // คำนวณยอดรวมจากข้อมูลสินค้า
  const totalAmount = items.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  try {
    const [result] = await db.query(
      `INSERT INTO orders
       (payment_method, total_amount, created_at)
       VALUES (?, ?, NOW())`,
      [paymentMethod, totalAmount]
    );

    return res.status(201).json({
      orderId: result.insertId,
      totalAmount,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "เกิดข้อผิดพลาดในการบันทึกออเดอร์",
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM orders ORDER BY id DESC"
    );

    return res.json(rows);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "ไม่สามารถดึงข้อมูลออเดอร์ได้",
    });
  }
};
```

---

# 12. App

ไฟล์ `src/app.js`

```javascript
require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json());

const orderRoutes = require("./routes/orderRoutes");

app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Cafe POS API is running",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Cafe POS server running on port ${PORT}`);
});
```

---

# 13. การติดตั้ง Dependencies

```bash
npm init -y
npm install express mysql2 dotenv
```

หากใช้ nodemon:

```bash
npm install --save-dev nodemon
```

ตัวอย่าง `package.json`

```json
{
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js"
  }
}
```

---

# 14. การทดสอบ API

## Test 1: สร้างออเดอร์สำเร็จ

### Request

```http
POST http://localhost:3000/api/orders
```

```json
{
  "paymentMethod": "cash",
  "items": [
    {
      "name": "อเมริกาโน่",
      "price": 45,
      "quantity": 2
    },
    {
      "name": "ลาเต้",
      "price": 55,
      "quantity": 1
    }
  ]
}
```

### Expected Result

```json
{
  "orderId": 1,
  "totalAmount": 145
}
```

Status:

```text
201 Created
```

---

## Test 2: ไม่มีรายการสินค้า

### Request

```json
{
  "paymentMethod": "cash",
  "items": []
}
```

### Expected Result

```json
{
  "error": "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"
}
```

Status:

```text
400 Bad Request
```

---

## Test 3: ราคาสินค้าไม่ถูกต้อง

### Request

```json
{
  "paymentMethod": "cash",
  "items": [
    {
      "name": "อเมริกาโน่",
      "price": -45,
      "quantity": 1
    }
  ]
}
```

### Expected Result

```json
{
  "error": "ราคาสินค้าต้องมากกว่า 0"
}
```

Status:

```text
400 Bad Request
```

---

## Test 4: จำนวนสินค้าไม่ถูกต้อง

### Request

```json
{
  "paymentMethod": "cash",
  "items": [
    {
      "name": "อเมริกาโน่",
      "price": 45,
      "quantity": 0
    }
  ]
}
```

### Expected Result

```json
{
  "error": "จำนวนสินค้าต้องมากกว่า 0"
}
```

Status:

```text
400 Bad Request
```

---

## Test 5: วิธีชำระเงินไม่ถูกต้อง

### Request

```json
{
  "paymentMethod": "unknown",
  "items": [
    {
      "name": "อเมริกาโน่",
      "price": 45,
      "quantity": 1
    }
  ]
}
```

### Expected Result

```json
{
  "error": "paymentMethod ไม่ถูกต้องหรือไม่ได้ระบุ"
}
```

Status:

```text
400 Bad Request
```

---

# 15. Traceability: WK03 → WK04 → WK05

| WK03 Requirement | WK04 Use Case | WK05 Implementation |
|---|---|---|
| FR-01 รับคำสั่งซื้อ | UC-01 รับคำสั่งซื้อและคำนวณราคา | `POST /api/orders` |
| FR-02 คำนวณยอดรวม | UC-01 รับคำสั่งซื้อและคำนวณราคา | `totalAmount` |
| FR-03 เงินสด / QR Payment | UC-01 / การชำระเงิน | `paymentMethod` |
| Validation ข้อมูลออเดอร์ | User Story ของ UC-01 | HTTP `400 Bad Request` |
| บันทึกประวัติการขาย | UC-01 | ตาราง `orders` |

---

# 16. Git Workflow

การทำงานของกลุ่มใช้ Git เพื่อเก็บประวัติการพัฒนา

ตัวอย่าง Branch:

```text
main
│
├── feature/order-api
├── feature/database
└── feature/testing
```

ตัวอย่าง Commit:

```bash
git add .
git commit -m "feat: add order creation endpoint"
```

```bash
git commit -m "feat: connect mysql database"
```

```bash
git commit -m "test: validate order API"
```

จากนั้น push ขึ้น GitHub

```bash
git push origin main
```

หรือใช้ Pull Request จาก feature branch ตาม workflow ของกลุ่ม

---

# 17. AI Disclosure

### 17.1 มีการใช้ AI หรือไม่

**มี**

AI ถูกใช้เป็นเครื่องมือช่วยในการพัฒนา Coding Sprint 1 โดยเฉพาะการ scaffold โครงสร้างโปรเจกต์ ตัวอย่าง API และช่วยตรวจสอบแนวทางการเขียน validation

### 17.2 เครื่องมือ AI ที่ใช้

**ChatGPT**

### 17.3 วัตถุประสงค์ในการใช้ AI

ใช้ AI เพื่อช่วย:

1. ออกแบบโครงสร้างโปรเจกต์ Node.js/Express
2. สร้างโครงสร้าง Route และ Controller เบื้องต้น
3. ช่วยเขียนตัวอย่างการเชื่อมต่อ MySQL ด้วย `mysql2`
4. ช่วยสร้าง validation สำหรับข้อมูลคำสั่งซื้อ
5. ช่วยตรวจสอบรูปแบบ HTTP response
6. ช่วยตรวจสอบแนวทางการทดสอบ API

### 17.4 ตัวอย่าง Prompt ที่ใช้

```text
ช่วยสร้างโครงสร้าง Node.js/Express API
สำหรับระบบบริหารร้านกาแฟ โดย implement
Use Case "รับคำสั่งซื้อและคำนวณราคา"

ระบบต้องรองรับการชำระเงินด้วยเงินสดและ QR Payment
และต้องตรวจสอบรายการสินค้า ราคา จำนวน
ก่อนบันทึกข้อมูลลง MySQL
```

### 17.5 การตรวจสอบและปรับปรุงจากสมาชิกในกลุ่ม

โค้ดที่ได้รับจาก AI ไม่ได้นำไปใช้งานโดยไม่ตรวจสอบ สมาชิกในกลุ่มต้องตรวจสอบและปรับแก้ให้ตรงกับ Requirement และ Use Case ของโครงงาน ได้แก่

- วิธีชำระเงินต้องเป็น **เงินสดและ QR Payment**
- การคำนวณยอดรวมต้องทำจากรายการสินค้า
- ต้องตรวจสอบข้อมูลสินค้าก่อนบันทึก
- ต้องใช้ MySQL เป็นฐานข้อมูล
- Endpoint ต้องตรงกับ Use Case ที่เลือก
- Response ต้องสามารถตรวจสอบผลการทำงานได้

สมาชิกในกลุ่มต้องสามารถอธิบายการทำงานของโค้ดที่ AI ช่วยสร้างได้