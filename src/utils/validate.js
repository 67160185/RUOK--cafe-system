// ตัวช่วยตรวจสอบข้อมูลที่ใช้ร่วมกันทุก route
// ทุกฟังก์ชันที่ตรวจไม่ผ่านจะ throw error ที่มี status = 400
// ซึ่ง error handler ใน app.js จะแปลงเป็น JSON { message } ให้เอง

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

// วิธีชำระเงินที่ระบบรองรับ (FR-03: เงินสด / QR)
const PAYMENT_METHODS = ["cash", "qr"];

// ค่ามากสุดของคอลัมน์ INT ใน MySQL
const MAX_INT = 2147483647;

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

// รับค่าจาก query string / path (เป็น string เสมอ) -> number
// ใช้ regex เพราะ MySQL แปลง "1abc" เป็น 1 เงียบๆ ถ้าส่งต่อเป็น string
const parsePositiveIntString = (value, name) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw httpError(400, `${name} must be a positive integer`);
  }
  return Number(value);
};

// query ที่ไม่บังคับ: ไม่ส่ง/ส่งค่าว่าง -> undefined
const optionalQueryId = (query, name) =>
  query[name] === undefined || query[name] === ""
    ? undefined
    : parsePositiveIntString(query[name], name);

const pathId = (params, name = "id") => parsePositiveIntString(params[name], name);

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const optionalQueryDate = (query, name = "date") => {
  const value = query[name];
  if (value === undefined || value === "") return undefined;
  if (!isValidDate(value)) {
    throw httpError(400, `${name} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
};

// วันถัดไปของ YYYY-MM-DD ใช้ทำช่วงเวลา created_at >= วัน AND created_at < วันถัดไป
// (ดีกว่า DATE(created_at) = ? เพราะใช้ index ได้)
const nextDay = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

// ราคา: ตัวเลข > 0, ทศนิยมไม่เกิน 2 ตำแหน่ง (ตรงกับ DECIMAL(10,2))
const isValidPrice = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value < 100000000 &&
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const PRICE_MESSAGE =
  "price must be a positive number with at most 2 decimal places";

module.exports = {
  httpError,
  PAYMENT_METHODS,
  MAX_INT,
  isPositiveInt,
  optionalQueryId,
  pathId,
  isValidDate,
  optionalQueryDate,
  nextDay,
  isValidPrice,
  PRICE_MESSAGE,
};
