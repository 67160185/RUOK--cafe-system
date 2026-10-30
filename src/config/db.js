const mysql = require("mysql2/promise");

module.exports = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "cafe_system",
  waitForConnections: true,
  connectionLimit: 10,
  // คืนค่า DECIMAL (ราคา, ยอดขาย) และ SUM() เป็น number แทน string
  // เพื่อให้ response ตรงกับ openapi.yaml
  decimalNumbers: true,
});
