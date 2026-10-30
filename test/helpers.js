// ตัวช่วยสำหรับเทสต์: แทนที่ฐานข้อมูลด้วย pool ปลอม แล้วเปิดแอปบนพอร์ตที่ระบบสุ่มให้
// ไม่ต้องมี MySQL ก็รันเทสต์ได้ (SQL จริงต้องทดสอบกับ MySQL อีกชั้นหนึ่ง ดู README)

const path = require("path");

const norm = (sql) => sql.replace(/\s+/g, " ").trim();

function installFakeDb() {
  const state = {
    calls: [], // { sql, params } ทุกคำสั่งที่ถูกเรียก
    events: [], // begin / commit / rollback / release
    handler: () => [[]], // (sql, params) => ผลลัพธ์ในรูป [rows] หรือ [result]
  };

  const query = async (sql, params) => {
    const entry = { sql: norm(sql), params };
    state.calls.push(entry);
    return state.handler(entry.sql, params);
  };

  const conn = {
    query,
    beginTransaction: async () => state.events.push("begin"),
    commit: async () => state.events.push("commit"),
    rollback: async () => state.events.push("rollback"),
    release: () => state.events.push("release"),
  };

  const fakePool = { query, getConnection: async () => conn };

  const dbPath = require.resolve(path.join(__dirname, "..", "src", "config", "db"));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

  state.reset = (handler) => {
    state.calls.length = 0;
    state.events.length = 0;
    state.handler = handler || (() => [[]]);
  };
  state.sqlLike = (re) => state.calls.filter((c) => re.test(c.sql));
  return state;
}

async function startServer() {
  const db = installFakeDb();
  const app = require(path.join(__dirname, "..", "src", "app"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, url, body, rawBody) => {
    const res = await fetch(base + url, {
      method,
      headers: body !== undefined || rawBody !== undefined ? { "content-type": "application/json" } : {},
      body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, type: res.headers.get("content-type") || "", json, text };
  };

  return { db, call, base, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { startServer };
