const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { startServer } = require("./helpers");

const doc = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// "GET /api/orders/{id}" ทั้งหมดที่เอกสารบอกไว้
const documented = new Set();
for (const [p, item] of Object.entries(doc.paths)) {
  for (const m of HTTP_METHODS) if (item[m]) documented.add(`${m.toUpperCase()} ${p}`);
}

// "GET /api/orders/{id}" ทั้งหมดที่ Express รู้จักจริง
async function implementedRoutes() {
  const { close } = await startServer();
  try {
    const app = require(path.join(__dirname, "..", "src", "app"));
    const found = new Set();
    for (const layer of app.router.stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          found.add(`${m.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.name === "router") {
        // routers ทั้งหมดถูก mount ที่ /api ใน app.js
        for (const inner of layer.handle.stack) {
          if (!inner.route) continue;
          for (const m of Object.keys(inner.route.methods)) {
            found.add(`${m.toUpperCase()} /api${inner.route.path.replace(/:(\w+)/g, "{$1}")}`);
          }
        }
      }
    }
    return found;
  } finally {
    await close();
  }
}

test("openapi.yaml: $ref ทุกตัวชี้ไปยังของที่มีอยู่จริง", () => {
  const unresolved = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref") {
        const target = v
          .replace(/^#\//, "")
          .split("/")
          .reduce((acc, key) => (acc ? acc[key] : undefined), doc);
        if (!target) unresolved.push(v);
      } else {
        walk(v);
      }
    }
  })(doc);
  assert.deepEqual(unresolved, []);
});

test("openapi.yaml: ทุก endpoint ที่โค้ดมี ต้องมีในเอกสาร และเอกสารต้องไม่มี endpoint ที่โค้ดไม่มี", async () => {
  const implemented = await implementedRoutes();
  const missingInDocs = [...implemented].filter((r) => !documented.has(r));
  const missingInCode = [...documented].filter((r) => !implemented.has(r));
  assert.deepEqual(missingInDocs, [], "มีในโค้ดแต่ไม่มีในเอกสาร");
  assert.deepEqual(missingInCode, [], "มีในเอกสารแต่ไม่มีในโค้ด");
});

test("openapi.yaml: servers ไม่ล็อกพอร์ต (Try it out ใช้ได้เมื่อเปลี่ยน PORT)", () => {
  assert.ok(doc.servers.every((s) => !/localhost:\d+/.test(s.url)));
});

test("openapi.yaml: payment_method ระบุ enum ตรงกับที่ระบบรองรับ", () => {
  const { PAYMENT_METHODS } = require("../src/utils/validate");
  const post = doc.paths["/api/orders"].post.requestBody.content["application/json"].schema;
  assert.deepEqual(post.properties.payment_method.enum, PAYMENT_METHODS);
  const put = doc.paths["/api/orders/{id}"].put.requestBody.content["application/json"].schema;
  assert.deepEqual(put.properties.payment_method.enum, PAYMENT_METHODS);
});

test("db pool คืน DECIMAL เป็น number ตามที่เอกสารระบุ", () => {
  // โหลด config จริง (ไม่ใช่ pool ปลอม) — createPool ไม่เชื่อมต่อจนกว่าจะมี query
  const dbPath = require.resolve("../src/config/db");
  const saved = require.cache[dbPath];
  delete require.cache[dbPath];
  try {
    const pool = require("../src/config/db");
    assert.equal(pool.pool.config.connectionConfig.decimalNumbers, true);
    pool.end();
  } finally {
    require.cache[dbPath] = saved;
  }
  const price = doc.components.schemas.MenuItem.properties.price;
  assert.equal(price.type, "number");
});

test("schema.sql และ wk07-schema.sql เหมือนกัน และมีข้อกำหนดสำคัญครบ", () => {
  const a = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "..", "docs", "wk07-schema.sql"), "utf8");
  assert.equal(a, b);
  assert.match(a, /stock_quantity INT NOT NULL DEFAULT 0/);
  assert.match(a, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(a, /CHECK \(payment_method IN \('cash', 'qr'\)\)/);
  assert.match(a, /UNIQUE \(branch_id, name\)/);
});
