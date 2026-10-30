// RUOK Cafe — frontend (vanilla JS, ไม่ต้อง build)
const API = window.RUOK_API_BASE || "";
const LOW = 10; // สต็อกที่ถือว่าใกล้หมด
const PAY = { cash: "เงินสด", qr: "QR พร้อมเพย์" };
const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const baht = (amount) =>
  Number(amount || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const menuImage = (name) => `/images/${encodeURIComponent(name)}`;
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4)
    .toISOString()
    .slice(0, 10);
const S = {
  branch: 0,
  cats: [],
  menu: [],
  orders: [],
  emps: [],
  cart: {},
  q: "",
  cat: 0,
};

async function api(path, method = "GET", body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เปิด backend ด้วย npm start และ frontend ด้วย npm run start:frontend",
    );
  }
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "ไม่พบ API proxy — กรุณาเปิดเว็บที่ http://localhost:5173 ด้วย npm run start:frontend (อย่าเปิดผ่าน Live Server)",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

function toast(msg, bad) {
  const toastElement = Object.assign(document.createElement("div"), {
    className: "toast" + (bad ? " bad" : ""),
    textContent: msg,
  });
  $("#toasts").append(toastElement);
  setTimeout(() => toastElement.remove(), 4000);
}

const run = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (error) {
    toast(error.message, true);
  }
};

function modal(html) {
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
}

dlg.onclick = (e) => e.target === dlg && dlg.close();

async function load() {
  const [menu, orders, categories, employees] = await Promise.all([
    api("/api/menu"),
    api("/api/orders"),
    api("/api/categories"),
    api("/api/employees"),
  ]);
  S.menu = menu;
  S.orders = orders;
  const branchIds = [
    ...new Set(
      [...menu, ...employees, ...orders]
        .map((item) => item.branch_id)
        .filter((branchId) => Number.isInteger(branchId) && branchId > 0),
    ),
  ].sort((a, b) => a - b);
  S.branch = branchIds[0] || 0;
  S.cats = categories.map((category) => ({
    id: category.category_id,
    name: category.name,
  }));
  S.emps = employees.map((employee) => ({
    id: employee.employee_id,
    name: employee.name,
    branch_id: employee.branch_id,
  }));
}

const branchMenu = () => S.menu.filter((m) => m.branch_id === S.branch);
const latestOrderId = () =>
  S.orders.find((order) => order.branch_id === S.branch)?.order_id;
const sortedBranchMenu = () =>
  branchMenu()
    .slice()
    .sort(
      (a, b) =>
        a.category_name.localeCompare(b.category_name, "th") ||
        Number(a.menu_id) - Number(b.menu_id),
    );

/* ---------- POS ---------- */
function pos() {
  const orderId = latestOrderId();
  $("#view").innerHTML = `<div class="pos">
    <section class="card">
      <input id="q" class="in" placeholder="🔍 ค้นหาเมนู..." value="${esc(S.q)}">
      <div class="chips" id="chips"></div><div class="grid" id="grid"></div>
    </section>
    <aside class="card">
      <h3>ORDER SUMMARY</h3>
      <p class="order-id">${orderId ? `Order ID ล่าสุด: #${orderId}` : "Order ID: จะแสดงหลังยืนยันคำสั่งซื้อ"}</p>
      <div id="cart"></div>
      <div class="row total"><span>ยอดรวมทั้งหมด</span><b id="total"></b></div>
      <label>พนักงาน</label><select id="emp" class="in"></select>
      <input id="empid" class="in" type="number" min="1" placeholder="รหัสพนักงาน" hidden>
      <div class="pay">วิธีชำระเงิน:
        <label><input type="radio" name="pay" value="cash"> เงินสด</label>
        <label><input type="radio" name="pay" value="qr"> QR พร้อมเพย์</label>
      </div>
      <button class="btn" id="ok">ยืนยันคำสั่งซื้อ</button>
    </aside></div>`;
  $("#q").oninput = (event) => {
    S.q = event.target.value;
    drawGrid();
  };
  $("#chips").onclick = (event) => {
    if (event.target.dataset.c) {
      S.cat = +event.target.dataset.c;
      drawGrid();
    }
  };
  $("#grid").onclick = (event) => {
    const button = event.target.closest("[data-id]");
    if (button) bump(+button.dataset.id, 1);
  };
  $("#cart").onclick = (event) => {
    const button = event.target.closest("[data-d]");
    if (button) bump(+button.dataset.id, +button.dataset.d);
  };

  const branchEmployees = S.emps.filter((employee) => employee.branch_id === S.branch);
  $("#emp").innerHTML =
    branchEmployees
      .map(
        (employee) =>
          `<option value="${employee.id}" ${String(employee.id) === localStorage["emp" + S.branch] ? "selected" : ""}>${esc(employee.name)}</option>`,
      )
      .join("") + '<option value="">ระบุรหัสพนักงานเอง…</option>';

  const syncEmployeeInput = () => {
    $("#empid").hidden = $("#emp").value !== "";
  };
  $("#emp").onchange = syncEmployeeInput;
  syncEmployeeInput();

  $("#ok").onclick = run(checkout);
  drawGrid(); drawCart();
}

function drawGrid() {
  const list = branchMenu();
  const query = S.q.trim().toLowerCase();
  const categories = [
    { id: 0, name: "ทั้งหมด" },
    ...S.cats.filter((category) =>
      list.some((menuItem) => menuItem.category_id === category.id),
    ),
  ];
  $("#chips").innerHTML = categories
    .map(
      (category) =>
        `<button class="chip ${S.cat === category.id ? "on" : ""}" data-c="${category.id}">${esc(category.name)}</button>`,
    )
    .join("");

  const items = list.filter(
    (menuItem) =>
      (!S.cat || menuItem.category_id === S.cat) &&
      menuItem.name.toLowerCase().includes(query),
  );
  $("#grid").innerHTML = items.map((m) => `<button class="item has-image" data-id="${m.menu_id}" ${m.stock_quantity < 1 ? "disabled" : ""}>
    <img class="item-image" src="${menuImage(m.name)}" alt="${esc(m.name)}" onerror="this.parentElement.classList.remove('has-image'); this.remove()">
    <b>${esc(m.name)}</b><span>${baht(m.price)}.-</span>
    ${m.stock_quantity < 1 ? '<em class="bad">หมด</em>' : m.stock_quantity <= LOW ? `<em>เหลือ ${m.stock_quantity}</em>` : ""}</button>`).join("") || '<p class="mut">ไม่พบข้อมูลเมนู</p>';
}

function drawCart() {
  const rows = Object.entries(S.cart)
    .map(([id, quantity]) => ({
      menuItem: S.menu.find((item) => item.menu_id === +id),
      quantity,
    }))
    .filter((row) => row.menuItem);

  $("#cart").innerHTML = rows.map(({ menuItem, quantity }) => `<div class="row cart-row">
    <span class="cart-name" title="${esc(menuItem.name)}">${esc(menuItem.name)}</span>
    <span class="step cart-step"><button aria-label="ลด ${esc(menuItem.name)}" data-d="-1" data-id="${menuItem.menu_id}">−</button><b>${quantity}</b><button aria-label="เพิ่ม ${esc(menuItem.name)}" data-d="1" data-id="${menuItem.menu_id}">+</button></span>
    <span class="cart-price">${baht(menuItem.price * quantity)} บาท</span></div>`).join("") || '<p class="mut">ยังไม่มีรายการ</p>';

  const total = rows.reduce(
    (sum, row) => sum + row.menuItem.price * row.quantity,
    0,
  );
  $("#total").textContent = baht(total) + " บาท";
}

function bump(id, d) {
  const menuItem = S.menu.find((item) => item.menu_id === id);
  const quantity = (S.cart[id] || 0) + d;

  if (quantity <= 0) {
    delete S.cart[id];
  } else if (quantity > menuItem.stock_quantity) {
    return toast(
      `${menuItem.name} เหลือในสต็อก ${menuItem.stock_quantity}`,
      true,
    );
  } else {
    S.cart[id] = quantity;
  }

  drawCart();
}

async function checkout() {
  const items = Object.entries(S.cart).map(([id, quantity]) => ({
    menu_id: +id,
    quantity,
  }));
  const employeeId = +($("#emp").value || $("#empid").value);
  const paymentMethod = document.querySelector("[name=pay]:checked")?.value;

  if (!items.length) throw new Error("กรุณาเลือกเมนูอย่างน้อย 1 รายการ");
  if (!employeeId) throw new Error("กรุณาระบุพนักงาน");
  if (!paymentMethod) throw new Error("กรุณาเลือกวิธีชำระเงิน");

  const result = await api("/api/orders", "POST", {
    branch_id: S.branch,
    employee_id: employeeId,
    payment_method: paymentMethod,
    items,
  });
  localStorage["emp" + S.branch] = employeeId;
  S.cart = {};
  await load();
  pos();
  await receipt(result.order_id);
}

async function receipt(id, manage) {
  const order = await api(`/api/orders/${id}`);
  const orderItems = order.items
    .map(
      (item) =>
        `<tr><td>${esc(item.name)}</td><td>${item.quantity} × ${baht(item.unit_price)}</td><td class="r">${baht(item.subtotal)}</td></tr>`,
    )
    .join("");

  modal(`<div class="mbody receipt"><h3 class="c">RUOK COFFEE</h3>
    <p class="c">ใบเสร็จ #${order.order_id} · ${new Date(order.created_at).toLocaleString("th-TH")}</p>
    <table>${orderItems}</table>
    <div class="row total"><span>ยอดสุทธิ</span><b>${baht(order.total_price)} บาท</b></div>
    <p class="c mut">ชำระด้วย ${PAY[order.payment_method] || esc(order.payment_method)} · พนักงาน ${esc(order.employee_name)}</p>
    <div class="acts no-print"><button class="btn" onclick="print()">🖨 พิมพ์</button>
    ${manage ? `<button class="btn danger" onclick="delOrder(${id})">ลบออเดอร์</button>` : ""}
    <button class="btn ghost" onclick="dlg.close()">ปิด</button></div></div>`);
}

const delOrder = run(async (id) => {
  if (!confirm(`ลบออเดอร์ #${id} และคืนสต็อก?`)) return;
  await api(`/api/orders/${id}`, "DELETE");
  dlg.close(); toast("ลบออเดอร์และคืนสต็อกแล้ว");
  await load();
  route();
});

/* ---------- Menu management ---------- */
function menu() {
  const menuRows = sortedBranchMenu()
    .map((menuItem) => {
      const isLowStock = menuItem.stock_quantity <= LOW;
      return `<tr>
        <td class="menu-id">${menuItem.menu_id}</td>
        <td>${esc(menuItem.name)}</td>
        <td>${esc(menuItem.category_name)}</td>
        <td class="r">${baht(menuItem.price)}</td>
        <td class="r"><span class="pill ${isLowStock ? "warn" : ""}">${menuItem.stock_quantity}${isLowStock ? " ⚠️" : ""}</span></td>
        <td class="r">
          <button class="ic" title="ปรับสต็อก" onclick="stockForm(${menuItem.menu_id})">📦</button>
          <button class="ic" title="แก้ไข" onclick="menuForm(${menuItem.menu_id})">✏️</button>
          <button class="ic del" title="ลบ" onclick="delMenu(${menuItem.menu_id})">🗑</button>
        </td>
      </tr>`;
    })
    .join("");

  $("#view").innerHTML = `<section class="card">
    <div class="bar">
      <h2>MENU MANAGEMENT</h2>
      <button class="btn" onclick="menuForm()">+ เพิ่มเมนู</button>
    </div>
    <div class="tw">
      <table class="tbl">
        <thead>
          <tr>
            <th>Menu ID</th>
            <th>รายการเมนู</th>
            <th>หมวด</th>
            <th class="r">ราคา (฿)</th>
            <th class="r">คงเหลือ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${menuRows || '<tr><td colspan="6" class="mut">ยังไม่มีเมนู</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}

function menuForm(id) {
  const menuItem = S.menu.find((item) => item.menu_id === id) || {};
  const categories = `<select class="in" name="category_id" required>
      ${S.cats
        .map(
          (category) =>
            `<option value="${category.id}" ${category.id === menuItem.category_id ? "selected" : ""}>${esc(category.name)}</option>`,
        )
        .join("")}
      <option value="__new__">+ เพิ่มหมวดหมู่ใหม่</option>
    </select>
    <input class="in new-category" name="new_category_name" maxlength="50" placeholder="ชื่อหมวดหมู่ใหม่" hidden>`;

  modal(`<form class="mbody" onsubmit="saveMenu(event,${id || 0})">
    <h3>${id ? "แก้ไขเมนู" : "เพิ่มเมนู"}</h3>
    <label>Menu ID<input class="in" value="${id ? menuItem.menu_id : "กำหนดอัตโนมัติหลังบันทึก"}" readonly></label>
    <label>ชื่อเมนู<input class="in" name="name" required maxlength="100" value="${esc(menuItem.name)}"></label>
    <label>หมวดหมู่${categories}</label>
    <label>ราคา (บาท)<input class="in" name="price" type="number" step="0.01" min="0.01" required value="${menuItem.price ?? ""}"></label>
    ${id ? "" : '<label>สต็อกเริ่มต้น<input class="in" name="stock_quantity" type="number" min="0" step="1" value="0"></label>'}
    <div class="acts">
      <button class="btn" type="submit" onclick="saveMenu(event,${id || 0})">บันทึก</button>
      <button type="button" class="btn ghost" onclick="dlg.close()">ยกเลิก</button>
    </div>
  </form>`);

  const categorySelect = $('dialog [name="category_id"]');
  const newCategoryInput = $('dialog [name="new_category_name"]');
  categorySelect.onchange = () => {
    const adding = categorySelect.value === "__new__";
    newCategoryInput.hidden = !adding;
    newCategoryInput.required = adding;
    if (adding) newCategoryInput.focus();
  };
}

function saveMenu(e, id) {
  e.preventDefault();
  const form = e.target.closest("form");
  if (!form || form.dataset.saving) return;
  if (!form.reportValidity()) return;

  const formValues = Object.fromEntries(new FormData(form));
  const name = formValues.name.trim();
  if (!name) return toast("กรุณาระบุชื่อเมนู", true);

  const isNewCategory = formValues.category_id === "__new__";
  const newCategoryName = isNewCategory ? formValues.new_category_name.trim() : "";
  if (isNewCategory && !newCategoryName) {
    return toast("กรุณาระบุชื่อหมวดหมู่ใหม่", true);
  }

  form.dataset.saving = "true";
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  return run(async () => {
    try {
      let categoryId = Number(formValues.category_id);
      if (isNewCategory) {
        const category = await api("/api/categories", "POST", { name: newCategoryName });
        categoryId = category.category_id;
      }

      const body = {
        name,
        category_id: categoryId,
        price: +formValues.price,
      };
      if (id) await api(`/api/menu/${id}`, "PUT", body);
      else {
        await api("/api/menu", "POST", {
          ...body,
          branch_id: S.branch,
          stock_quantity: +formValues.stock_quantity || 0,
        });
      }

      dlg.close();
      toast("บันทึกเมนูแล้ว");
      await load();
      menu();
    } finally {
      delete form.dataset.saving;
      submitButton.disabled = false;
    }
  })();
}

function stockForm(id) {
  const menuItem = S.menu.find((item) => item.menu_id === id);
  modal(`<form class="mbody" onsubmit="saveStock(event,${id})">
    <h3>ปรับสต็อก: ${esc(menuItem.name)}</h3>
    <p class="mut">คงเหลือ ${menuItem.stock_quantity} — ใส่ค่าบวกเพื่อเพิ่ม ค่าลบเพื่อลด</p>
    <input class="in" name="q" type="number" step="1" required placeholder="เช่น 10 หรือ -3">
    <div class="acts">
      <button class="btn" type="submit" onclick="saveStock(event,${id})">บันทึก</button>
      <button type="button" class="btn ghost" onclick="dlg.close()">ยกเลิก</button>
    </div>
  </form>`);
}

function saveStock(e, id) {
  e.preventDefault();
  const form = e.target.closest("form");
  if (!form || form.dataset.saving) return;
  const quantityChange = Number(new FormData(form).get("q"));
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    return toast("กรุณาระบุจำนวนเต็มที่ไม่ใช่ 0", true);
  }

  form.dataset.saving = "true";
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  return run(async () => {
    try {
      const result = await api("/api/stock-movements", "POST", {
        menu_id: id,
        quantity_change: quantityChange,
      });
      dlg.close();
      toast(`สต็อกคงเหลือ ${result.stock_quantity}`);
      await load();
      menu();
    } finally {
      delete form.dataset.saving;
      submitButton.disabled = false;
    }
  })();
}
const delMenu = run(async (id) => {
  const menuItem = S.menu.find((item) => item.menu_id === id);
  if (!confirm(`นำเมนู "${menuItem.name}" ออกจากรายการเมนู? หากเคยขายแล้ว ระบบจะเก็บประวัติการขายไว้`)) {
    return;
  }

  const result = await api(`/api/menu/${id}`, "DELETE");
  toast(
    result.archived
      ? "เก็บเมนูเข้าคลังแล้ว โดยยังเก็บประวัติการขายไว้"
      : "ลบเมนูแล้ว",
  );
  await load();
  menu();
});

/* ---------- Sales report ---------- */
const tbl = (head, rows, ids) => {
  const headings = head
    .map((heading, index) => `<th class="${index ? "r" : ""}">${heading}</th>`)
    .join("");
  const body =
    rows
      .map((row, rowIndex) => {
        const cells = row
          .map(
            (cell, cellIndex) =>
              `<td class="${cellIndex ? "r" : ""}">${cell}</td>`,
          )
          .join("");
        const clickHandler = ids ? `class="clk" onclick="receipt(${ids[rowIndex]},1)"` : "";
        return `<tr ${clickHandler}>${cells}</tr>`;
      })
      .join("") ||
    `<tr><td colspan="${head.length}" class="mut">ไม่มีข้อมูลการขาย</td></tr>`;

  return `<div class="tw"><table class="tbl"><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table></div>`;
};

async function report() {
  const reportState = (S.rep ||= { date: today() });

  $("#view").innerHTML = `<section class="card">
    <div class="bar"><h2>SALES REPORT</h2></div>
    <div class="filters">
      <label>วันที่<input id="rd" class="in" type="date" value="${reportState.date}"></label>
      <button class="btn" id="rs">🔍 ค้นหา</button>
    </div>
  </section>
  <div id="rep"></div>`;
  $("#rs").onclick = run(drawReport);
  await drawReport();
}

async function drawReport() {
  const reportState = S.rep;
  reportState.date = $("#rd").value || today();
  const queryString = (extra) =>
    `?branch_id=${S.branch}${extra ? `&${extra}` : ""}`;

  const [day, all, orders, top, pay, low] = await Promise.all([
    api(`/api/reports/daily-sales${queryString(`date=${reportState.date}`)}`),
    api(`/api/reports/summary${queryString()}`),
    api(`/api/orders${queryString(`date=${reportState.date}`)}`),
    api(`/api/reports/top-menu${queryString("limit=10")}`),
    api(`/api/reports/sales-by-payment${queryString()}`),
    api(`/api/reports/low-stock${queryString()}`),
  ]);
  const formatTime = (value) =>
    new Date(value).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const stat = (label, value) =>
    `<div class="stat"><span>${label}</span><b>${value}</b></div>`;

  const orderRows = orders.map((order) => [
    `#${order.order_id}`,
    formatTime(order.created_at),
    esc(order.employee_name),
    PAY[order.payment_method] || esc(order.payment_method),
    baht(order.total_price),
  ]);
  const topMenuRows = top.map((item) => [
    esc(item.name),
    item.total_quantity,
    baht(item.total_sales),
  ]);
  const paymentRows = pay.map((payment) => [
    PAY[payment.payment_method] || esc(payment.payment_method),
    payment.total_orders,
    baht(payment.total_sales),
  ]);
  const lowStockRows = low.map((item) => [
    esc(item.name),
    item.stock_quantity,
  ]);

  $("#rep").innerHTML = `<div class="stats">
    ${stat(`ยอดขาย ${reportState.date}`, baht(day.total_sales) + " บาท")}
    ${stat("จำนวนออเดอร์", day.total_orders + " รายการ")}
    ${stat("จำนวนชิ้นที่ขาย", day.total_items)}
    ${stat("ยอดขายสะสมทั้งหมด", baht(all.total_sales) + " บาท")}
  </div>
  <div class="two">
    <section class="card">
      <h3>ประวัติการขาย ${reportState.date} (คลิกเพื่อดูใบเสร็จ)</h3>
      ${tbl(["Order ID", "เวลา", "พนักงาน", "ชำระ", "ยอด (฿)"], orderRows, orders.map((order) => order.order_id))}
    </section>
    <section class="card">
      <h3>เมนูขายดี</h3>
      ${tbl(["รายการเมนู", "จำนวน", "ยอดขาย (฿)"], topMenuRows)}
    </section>
    <section class="card">
      <h3>แยกตามวิธีชำระเงิน</h3>
      ${tbl(["วิธีชำระ", "ออเดอร์", "ยอดขาย (฿)"], paymentRows)}
    </section>
    <section class="card">
      <h3>สต็อกใกล้หมด (≤ ${LOW})</h3>
      ${tbl(["เมนู", "คงเหลือ"], lowStockRows)}
    </section>
  </div>`;
}

/* ---------- Router / boot ---------- */
const views = { pos, menu, report };
function route() {
  const requestedView = location.hash.slice(1);
  const viewName = views[requestedView] ? requestedView : "pos";
  document
    .querySelectorAll("nav a")
    .forEach((link) => link.classList.toggle("on", link.hash === "#" + viewName));

  if (!S.branch) {
    $("#view").innerHTML = '<p class="mut">ยังไม่พบข้อมูลร้าน — ให้ตรวจสอบฐานข้อมูลก่อน</p>';
    return;
  }

  run(views[viewName])();
}

addEventListener("hashchange", route);
load()
  .then(route)
  .catch((error) => {
    $("#view").innerHTML = `<p class="mut">${esc(error.message)}</p>`;
  });
