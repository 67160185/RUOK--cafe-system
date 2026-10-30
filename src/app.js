require("dotenv").config();
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const app = express();
app.disable("x-powered-by");

// เปิด CORS เฉพาะเมื่อกำหนด CORS_ORIGIN ใน .env (คั่นหลายโดเมนด้วย ,)
// เช่น CORS_ORIGIN=http://localhost:5173
if (process.env.CORS_ORIGIN) {
  const allowedOrigins = process.env.CORS_ORIGIN.split(",").map((origin) =>
    origin.trim(),
  );
  app.use(cors({ origin: allowedOrigins }));
}

app.use(express.json());

// Swagger UI
const swaggerPath = path.join(__dirname, "..", "openapi.yaml");
const swaggerDocument = YAML.parse(fs.readFileSync(swaggerPath, "utf8"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API routes
app.use("/api", require("./routes/orderRoutes"));
app.use("/api", require("./routes/menuRoutes"));
app.use("/api", require("./routes/reportRoutes"));
app.use("/api", require("./routes/stockRoutes"));
app.use("/api", require("./routes/employeeRoutes"));

app.get("/", (req, res) => {
  res.json({
    message: "RUOK Cafe System API is running",
    status: "ok",
  });
});

// ไม่พบ route -> ตอบเป็น JSON เหมือน error อื่นๆ (แทนหน้า HTML "Cannot GET ...")
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

// Error handler กลาง: ทุก error ตอบเป็น JSON { message }
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // JSON ใน request body ผิดรูปแบบ
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body is not valid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }

  // ข้อมูลอ้างอิงไม่มีอยู่ / ซ้ำ / ถูกอ้างอิงอยู่ (จาก constraint ของฐานข้อมูล)
  switch (err.code) {
    case "ER_NO_REFERENCED_ROW_2":
    case "ER_NO_REFERENCED_ROW":
      return res.status(400).json({ message: "Referenced record does not exist" });
    case "ER_DUP_ENTRY":
      return res.status(409).json({ message: "Duplicate record" });
    case "ER_ROW_IS_REFERENCED_2":
    case "ER_ROW_IS_REFERENCED":
      return res.status(409).json({ message: "Cannot delete because related records exist" });
    case "ER_CHECK_CONSTRAINT_VIOLATED":
    case "ER_CONSTRAINT_FAILED":
      return res.status(400).json({ message: "Data violates a database constraint" });
    default:
  }

  const isValidStatus =
    Number.isInteger(err.status) && err.status >= 400 && err.status < 600;
  const status = isValidStatus ? err.status : 500;
  if (status === 500) console.error("Unhandled error:", err);

  res.status(status).json({
    message: status === 500 ? "Internal server error" : err.message,
  });
});

// เริ่มเซิร์ฟเวอร์เฉพาะเมื่อรันไฟล์นี้โดยตรง (เทสต์ require app ไปใช้ได้โดยไม่เปิดพอร์ต)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`API docs: http://localhost:${PORT}/api-docs`);
  });
}

module.exports = app;
