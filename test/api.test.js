const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

let ctx;
before(async () => {
  ctx = await startServer();
});
after(async () => {
  await ctx.close();
});

const { call } = new Proxy({}, { get: () => (...args) => ctx.call(...args) });
const db = new Proxy({}, { get: (_, k) => ctx.db[k] });

const dbError = (code) => Object.assign(new Error(code), { code });

// ---------------------------------------------------------------- ทั่วไป

test("GET / ตอบ JSON ปกติ และ /api-docs เปิดได้", async () => {
  const root = await call("GET", "/");
  assert.equal(root.status, 200);
  assert.equal(root.json.status, "ok");

  const docs = await call("GET", "/api-docs/");
  assert.equal(docs.status, 200);
  assert.match(docs.type, /text\/html/);
});

test("route ที่ไม่มี -> 404 เป็น JSON (ไม่ใช่หน้า HTML)", async () => {
  const r = await call("GET", "/api/nothing-here");
  assert.equal(r.status, 404);
  assert.match(r.type, /application\/json/);
  assert.match(r.json.message, /not found/i);
});

test("JSON ใน body ผิดรูปแบบ -> 400 เป็น JSON", async () => {
  const r = await call("POST", "/api/orders", undefined, "{bad json");
  assert.equal(r.status, 400);
  assert.equal(r.json.message, "Request body is not valid JSON");
});

test("error ที่ไม่คาดคิด -> 500 ข้อความกลางๆ ไม่เปิดเผยรายละเอียดภายใน", async () => {
  db.reset(() => {
    throw new Error("boom: password=secret at /home/user/app.js");
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const r = await call("GET", "/api/menu");
    assert.equal(r.status, 500);
    assert.equal(r.json.message, "Internal server error");
    assert.doesNotMatch(r.text, /secret|\/home\//);
  } finally {
    console.error = originalError;
  }
});

test("error จาก constraint ของฐานข้อมูลถูกแปลงเป็น 4xx", async () => {
  db.reset(() => {
    throw dbError("ER_ROW_IS_REFERENCED_2");
  });
  const r = await call("GET", "/api/menu");
  assert.equal(r.status, 409);
});

// ---------------------------------------------------------------- orders

const orderDb = (menus) => (sql) => {
  if (/FROM employee/.test(sql)) return [[{ employee_id: 1 }]];
  if (/FROM menu_item/.test(sql) && /FOR UPDATE/.test(sql)) return [menus];
  if (/^INSERT INTO orders/.test(sql)) return [{ insertId: 77 }];
  return [{ affectedRows: 1 }];
};

const validOrder = (extra = {}) => ({
  branch_id: 1,
  employee_id: 1,
  payment_method: "cash",
  items: [{ menu_id: 1, quantity: 1 }],
  ...extra,
});

test("POST /api/orders ไม่ส่ง body -> 400 (ไม่ crash)", async () => {
  db.reset();
  const r = await call("POST", "/api/orders");
  assert.equal(r.status, 400);
  assert.match(r.json.message, /required/);
});

test("POST /api/orders menu_id เป็น string -> 400 ชัดเจน (เดิมตอบว่าไม่พบเมนู)", async () => {
  db.reset();
  const r = await call("POST", "/api/orders", validOrder({ items: [{ menu_id: "1", quantity: 1 }] }));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /positive integers/);
  assert.equal(db.calls.length, 0, "ต้องปฏิเสธก่อนแตะฐานข้อมูล");
});

test("POST /api/orders item เป็น null -> 400 (เดิม 500)", async () => {
  db.reset();
  const r = await call("POST", "/api/orders", validOrder({ items: [null] }));
  assert.equal(r.status, 400);
});

test("POST /api/orders payment_method นอก cash/qr -> 400 (เดิมผ่านเป็น 201)", async () => {
  db.reset();
  const r = await call("POST", "/api/orders", validOrder({ payment_method: "bitcoin" }));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /cash, qr/);
});

test("POST /api/orders สำเร็จ: รวมเมนูซ้ำ คำนวณยอด ตัดสต็อก บันทึก movement", async () => {
  db.reset(
    orderDb([
      { menu_id: 1, name: "Latte", price: 60, stock_quantity: 10 },
      { menu_id: 2, name: "Tea", price: 45, stock_quantity: 5 },
    ])
  );
  const r = await call(
    "POST",
    "/api/orders",
    validOrder({
      payment_method: "qr",
      items: [
        { menu_id: 1, quantity: 1 },
        { menu_id: 2, quantity: 1 },
        { menu_id: 1, quantity: 1 }, // ซ้ำ -> รวมเป็น 2
      ],
    })
  );
  assert.equal(r.status, 201);
  assert.equal(r.json.order_id, 77);
  assert.equal(r.json.total_price, 165); // 60*2 + 45

  const lock = db.sqlLike(/FOR UPDATE/)[0];
  assert.deepEqual(lock.params, [1, [1, 2]]);
  assert.match(lock.sql, /is_active = TRUE/);
  assert.match(lock.sql, /ORDER BY menu_id FOR UPDATE/);

  const movements = db.sqlLike(/INSERT INTO stock_movement/).map((c) => c.params);
  assert.deepEqual(movements, [
    [1, -2],
    [2, -1],
  ]);
  assert.equal(db.sqlLike(/UPDATE menu_item SET stock_quantity = stock_quantity -/).length, 2);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("POST /api/orders สต็อกไม่พอ -> 400 และ rollback โดยไม่สร้างออเดอร์", async () => {
  db.reset(orderDb([{ menu_id: 1, name: "Latte", price: 60, stock_quantity: 1 }]));
  const r = await call("POST", "/api/orders", validOrder({ items: [{ menu_id: 1, quantity: 2 }] }));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /Insufficient stock for "Latte": 1 left/);
  assert.equal(db.sqlLike(/^INSERT INTO orders/).length, 0);
  assert.ok(db.events.includes("rollback"));
  assert.ok(db.events.includes("release"));
});

test("GET /api/orders ตรวจ query ก่อนใช้ และกรองวันที่เป็นช่วงเวลา", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("GET", "/api/orders?branch_id=1abc")).status, 400);
  assert.equal((await call("GET", "/api/orders?employee_id=0")).status, 400);
  assert.equal((await call("GET", "/api/orders?date=2026-02-30")).status, 400);
  assert.equal(db.calls.length, 0);

  const ok = await call("GET", "/api/orders?branch_id=2&date=2026-10-16");
  assert.equal(ok.status, 200);
  const q = db.calls[0];
  assert.deepEqual(q.params, [2, "2026-10-16", "2026-10-17"]);
  assert.doesNotMatch(q.sql, /DATE\(o\.created_at\)/);
});

test("GET /api/orders/:id id ไม่ใช่ตัวเลข -> 400 (เดิม '1abc' ถูกอ่านเป็น 1)", async () => {
  db.reset();
  assert.equal((await call("GET", "/api/orders/1abc")).status, 400);
  assert.equal((await call("DELETE", "/api/orders/abc")).status, 400);
  assert.equal(db.calls.length, 0);
});

test("PUT /api/orders/:id ไม่ส่ง body -> 400 (เดิม 500)", async () => {
  db.reset();
  const r = await call("PUT", "/api/orders/1");
  assert.equal(r.status, 400);
});

test("PUT /api/orders/:id payment_method ผิด -> 400", async () => {
  db.reset();
  const r = await call("PUT", "/api/orders/1", { payment_method: "card" });
  assert.equal(r.status, 400);
});

test("PUT /api/orders/:id ล็อกออเดอร์ระหว่างตรวจสาขาพนักงานและแก้ไข", async () => {
  db.reset((sql) => {
    if (/FROM orders/.test(sql)) return [[{ branch_id: 1 }]];
    if (/FROM employee/.test(sql)) return [[{ employee_id: 2 }]];
    return [{ affectedRows: 1 }];
  });
  const r = await call("PUT", "/api/orders/5", { payment_method: "qr", employee_id: 2 });
  assert.equal(r.status, 200);
  assert.match(db.sqlLike(/FROM orders/)[0].sql, /FOR UPDATE/);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("DELETE /api/orders/:id คืนสต็อกและบันทึก movement", async () => {
  db.reset((sql) => {
    if (/FROM orders/.test(sql)) return [[{ order_id: 5 }]];
    if (/FROM order_item/.test(sql)) return [[{ menu_id: 1, quantity: 2 }]];
    return [{ affectedRows: 1 }];
  });
  const r = await call("DELETE", "/api/orders/5");
  assert.equal(r.status, 200);
  assert.deepEqual(db.sqlLike(/INSERT INTO stock_movement/)[0].params, [1, 2]);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("DELETE /api/orders/:id ไม่พบ -> 404 (ผ่าน error handler กลาง)", async () => {
  db.reset(() => [[]]);
  const r = await call("DELETE", "/api/orders/999");
  assert.equal(r.status, 404);
  assert.equal(r.json.message, "Order not found");
  assert.ok(db.events.includes("rollback"));
});

// ---------------------------------------------------------------- menu

const menuBody = (extra = {}) => ({ branch_id: 1, category_id: 1, name: "มอคค่า", price: 60, ...extra });

test("GET /api/categories คืนรายการหมวดหมู่", async () => {
  db.reset((sql) => {
    if (/FROM category/.test(sql)) return [[{ category_id: 1, name: "กาแฟ" }]];
    return [[]];
  });
  const r = await call("GET", "/api/categories");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, [{ category_id: 1, name: "กาแฟ" }]);
});

test("GET /api/employees คืนรายชื่อพนักงานและกรองตามสาขาได้", async () => {
  db.reset((sql, params) => {
    if (/FROM employee/.test(sql)) {
      if (params?.[0] === 1) {
        return [[{ employee_id: 6, branch_id: 1, name: "ลัคกี้", role: "cashier" }]];
      }
      return [[{ employee_id: 6, branch_id: 1, name: "ลัคกี้", role: "cashier" }]];
    }
    return [[]];
  });

  const all = await call("GET", "/api/employees");
  assert.equal(all.status, 200);
  assert.equal(all.json[0].name, "ลัคกี้");

  const branch = await call("GET", "/api/employees?branch_id=1");
  assert.equal(branch.status, 200);
  assert.equal(branch.json[0].branch_id, 1);
  assert.equal(db.sqlLike(/FROM employee/).at(-1).params[0], 1);

  const invalid = await call("GET", "/api/employees?branch_id=1abc");
  assert.equal(invalid.status, 400);
});

test("POST /api/categories ตรวจชื่อและสร้างหมวดหมู่", async () => {
  db.reset((sql) => {
    if (/SELECT category_id FROM category/.test(sql)) return [[]];
    if (/^INSERT INTO category/.test(sql)) return [{ insertId: 3 }];
    return [[]];
  });
  for (const name of ["", " ".repeat(2), "x".repeat(51)]) {
    assert.equal((await call("POST", "/api/categories", { name })).status, 400);
  }
  const r = await call("POST", "/api/categories", { name: " เครื่องดื่มเย็น " });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, {
    message: "Category created",
    category_id: 3,
    name: "เครื่องดื่มเย็น",
  });
  assert.deepEqual(db.sqlLike(/^INSERT INTO category/)[0].params, ["เครื่องดื่มเย็น"]);
});

test("POST /api/categories ไม่สร้างชื่อซ้ำ", async () => {
  db.reset((sql) => {
    if (/SELECT category_id FROM category/.test(sql)) return [[{ category_id: 1 }]];
    return [[]];
  });
  const r = await call("POST", "/api/categories", { name: "กาแฟ" });
  assert.equal(r.status, 409);
  assert.equal(db.sqlLike(/^INSERT INTO category/).length, 0);
});

test("POST /api/menu ตรวจราคา ชื่อ และสต็อก", async () => {
  db.reset();
  for (const bad of [
    { price: -5 },
    { price: 0 },
    { price: "abc" },
    { price: 10.555 },
    { name: "   " },
    { name: "x".repeat(101) },
    { stock_quantity: -1 },
    { stock_quantity: 1.5 },
    { branch_id: "1" },
  ]) {
    const r = await call("POST", "/api/menu", menuBody(bad));
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(db.calls.length, 0);
});

test("POST /api/menu สำเร็จ บันทึกสต็อกตั้งต้นลงประวัติ", async () => {
  db.reset((sql) => {
    if (/FROM branch/.test(sql)) return [[{ branch_id: 1 }]];
    if (/FROM category/.test(sql)) return [[{ category_id: 1 }]];
    if (/^INSERT INTO menu_item/.test(sql)) return [{ insertId: 8 }];
    return [{ affectedRows: 1 }];
  });
  const r = await call("POST", "/api/menu", menuBody({ stock_quantity: 30 }));
  assert.equal(r.status, 201);
  assert.equal(r.json.menu_id, 8);
  assert.deepEqual(db.sqlLike(/INSERT INTO stock_movement/)[0].params, [8, 30]);
});

test("POST /api/menu ชื่อซ้ำในสาขาเดียวกัน -> 409", async () => {
  db.reset((sql) => {
    if (/FROM branch/.test(sql)) return [[{ branch_id: 1 }]];
    if (/FROM category/.test(sql)) return [[{ category_id: 1 }]];
    if (/^INSERT INTO menu_item/.test(sql)) throw dbError("ER_DUP_ENTRY");
    return [{ affectedRows: 1 }];
  });
  const r = await call("POST", "/api/menu", menuBody());
  assert.equal(r.status, 409);
  assert.match(r.json.message, /already exists/);
  assert.ok(db.events.includes("rollback"));
});

test("PUT /api/menu/:id ย้ายสาขาของเมนูที่เคยถูกสั่งแล้ว -> 409", async () => {
  db.reset((sql) => {
    if (/FROM menu_item/.test(sql)) return [[{ branch_id: 1 }]];
    if (/FROM branch/.test(sql)) return [[{ branch_id: 2 }]];
    if (/FROM order_item/.test(sql)) return [[{ 1: 1 }]];
    return [{ affectedRows: 1, changedRows: 1 }];
  });
  const r = await call("PUT", "/api/menu/3", { branch_id: 2 });
  assert.equal(r.status, 409);
  assert.equal(db.sqlLike(/^UPDATE menu_item/).length, 0);
  assert.match(db.sqlLike(/FROM menu_item/)[0].sql, /FOR UPDATE/);
  assert.deepEqual(db.events, ["begin", "rollback", "release"]);
});

test("PUT /api/menu/:id แก้ชื่อ/ราคาได้ และตรวจราคาทศนิยม", async () => {
  db.reset((sql) => {
    if (/FROM menu_item/.test(sql)) return [[{ branch_id: 1 }]];
    return [{ affectedRows: 1, changedRows: 1 }];
  });
  assert.equal((await call("PUT", "/api/menu/3", { price: 12.345 })).status, 400);
  const ok = await call("PUT", "/api/menu/3", { price: 65, name: " ลาเต้เย็น " });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.changed, true);
  assert.deepEqual(db.sqlLike(/^UPDATE menu_item/)[0].params, [null, null, "ลาเต้เย็น", 65, 3]);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("DELETE /api/menu/:id ลบเมนูที่ไม่เคยถูกสั่งได้ (พร้อมประวัติสต็อกของมัน)", async () => {
  db.reset((sql) => {
    if (/FROM menu_item/.test(sql)) return [[{ menu_id: 5 }]];
    if (/FROM order_item/.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  });
  const r = await call("DELETE", "/api/menu/5");
  assert.equal(r.status, 200);
  const deletes = db.calls.filter((c) => /^DELETE/.test(c.sql)).map((c) => c.sql);
  assert.match(deletes[0], /stock_movement/);
  assert.match(deletes[1], /menu_item/);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("DELETE /api/menu/:id เมนูที่เคยถูกสั่งแล้ว -> เก็บเข้าคลังและรักษาประวัติการขาย", async () => {
  db.reset((sql) => {
    if (/FROM menu_item/.test(sql)) return [[{ menu_id: 5 }]];
    if (/FROM order_item/.test(sql)) return [[{ 1: 1 }]];
    return [{ affectedRows: 1 }];
  });
  const r = await call("DELETE", "/api/menu/5");
  assert.equal(r.status, 200);
  assert.equal(r.json.archived, true);
  assert.match(r.json.message, /sales history preserved/);
  assert.equal(db.calls.filter((c) => /^DELETE/.test(c.sql)).length, 0);
  assert.match(db.sqlLike(/^UPDATE menu_item SET is_active/)[0].sql, /is_active = FALSE/);
  assert.deepEqual(db.events, ["begin", "commit", "release"]);
});

test("DELETE /api/menu/:id ไม่พบ -> 404", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("DELETE", "/api/menu/99")).status, 404);
});

test("GET /api/menu ตรวจ query", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("GET", "/api/menu?branch_id=abc")).status, 400);
  assert.equal((await call("GET", "/api/menu?category_id=0")).status, 400);
  assert.equal((await call("GET", "/api/menu?branch_id=1&category_id=2")).status, 200);
  assert.deepEqual(db.calls.at(-1).params, [1, 2]);
  assert.match(db.calls.at(-1).sql, /m\.is_active = TRUE/);
});

// ---------------------------------------------------------------- stock

test("POST /api/stock-movements ตรวจชนิดข้อมูลแบบเข้มงวด", async () => {
  db.reset();
  for (const bad of [
    undefined, // ไม่มี body
    { menu_id: true, quantity_change: 5 }, // Number(true) = 1 เดิมผ่าน
    { menu_id: "2", quantity_change: 5 },
    { menu_id: 2, quantity_change: 0 },
    { menu_id: 2, quantity_change: 1.5 },
    { menu_id: 2, quantity_change: "5" },
    { menu_id: 2, quantity_change: 3000000000 },
  ]) {
    const r = await call("POST", "/api/stock-movements", bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(db.calls.length, 0);
});

test("POST /api/stock-movements เพิ่ม/ลดสต็อก และไม่ให้ติดลบ", async () => {
  db.reset((sql) => {
    if (/SELECT stock_quantity/.test(sql)) return [[{ stock_quantity: 3 }]];
    if (/^INSERT INTO stock_movement/.test(sql)) return [{ insertId: 9 }];
    return [{ affectedRows: 1 }];
  });
  const add = await call("POST", "/api/stock-movements", { menu_id: 2, quantity_change: 5 });
  assert.equal(add.status, 201);
  assert.equal(add.json.stock_quantity, 8);
  assert.match(db.sqlLike(/SELECT stock_quantity/)[0].sql, /is_active = TRUE/);

  const tooMuch = await call("POST", "/api/stock-movements", { menu_id: 2, quantity_change: -10 });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.json.message, "Insufficient stock");
});

test("POST /api/stock-movements ไม่พบเมนู -> 404", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("POST", "/api/stock-movements", { menu_id: 99, quantity_change: 1 })).status, 404);
});

// ---------------------------------------------------------------- reports

test("low-stock: threshold=0 ใช้ค่า 0 จริง (เดิมกลายเป็น 10)", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("GET", "/api/reports/low-stock?threshold=0")).status, 200);
  assert.equal(db.calls[0].params[0], 0);

  db.reset(() => [[]]);
  await call("GET", "/api/reports/low-stock");
  assert.equal(db.calls[0].params[0], 10);

  assert.equal((await call("GET", "/api/reports/low-stock?threshold=-1")).status, 400);
  assert.equal((await call("GET", "/api/reports/low-stock?threshold=abc")).status, 400);
});

test("top-menu: limit ต้อง >= 1 และถูกจำกัดที่ 50 (เดิม limit ติดลบทำให้ SQL error)", async () => {
  db.reset(() => [[]]);
  assert.equal((await call("GET", "/api/reports/top-menu?limit=-3")).status, 400);
  assert.equal((await call("GET", "/api/reports/top-menu?limit=0")).status, 400);
  assert.equal(db.calls.length, 0);

  await call("GET", "/api/reports/top-menu?limit=999&branch_id=2");
  assert.deepEqual(db.calls[0].params, [2, 50]);

  db.reset(() => [[]]);
  await call("GET", "/api/reports/top-menu");
  assert.deepEqual(db.calls[0].params, [5]);
});

test("daily-sales: ตรวจวันที่ และตอบวันที่จริง (เดิมตอบคำว่า today)", async () => {
  db.reset(() => [[{ today: "2026-10-29", total_orders: 2, total_items: 3, total_sales: 150 }]]);
  assert.equal((await call("GET", "/api/reports/daily-sales?date=garbage")).status, 400);
  assert.equal(db.calls.length, 0);

  const def = await call("GET", "/api/reports/daily-sales");
  assert.equal(def.json.date, "2026-10-29");
  assert.equal(def.json.total_sales, 150);
  assert.equal("today" in def.json, false);

  const withDate = await call("GET", "/api/reports/daily-sales?date=2026-10-16&branch_id=1");
  assert.equal(withDate.json.date, "2026-10-16");
  assert.deepEqual(db.calls.at(-1).params, ["2026-10-16", "2026-10-17", 1]);
});

test("reports/sales: ต้องมี branch_id และตอบ snake_case เหมือน report อื่น", async () => {
  db.reset(() => [[{ menu_id: 1, name: "Latte", total_quantity: 4, total_sales: 240 }]]);
  assert.equal((await call("GET", "/api/reports/sales")).status, 400);
  assert.equal((await call("GET", "/api/reports/sales?branch_id=x")).status, 400);

  const r = await call("GET", "/api/reports/sales?branch_id=1");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json[0]), ["menu_id", "name", "total_quantity", "total_sales"]);
});

test("reports ที่มี branch_id ตรวจชนิดข้อมูลทุกตัว", async () => {
  db.reset(() => [[{}]]);
  for (const url of ["summary", "sales-by-payment", "top-menu", "low-stock", "daily-sales"]) {
    const r = await call("GET", `/api/reports/${url}?branch_id=1abc`);
    assert.equal(r.status, 400, url);
  }
});
