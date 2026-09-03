const navItems = document.querySelectorAll(".nav-item");
const panels = document.querySelectorAll(".panel");

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    navItems.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
  });
});

async function refreshStatus() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.logged_in) {
      dot.className = "dot ok";
      text.textContent = "Авторизован";
    } else {
      dot.className = "dot err";
      text.textContent = "Не авторизован";
    }
  } catch (e) {
    dot.className = "dot err";
    text.textContent = "Панель офлайн";
  }
}
refreshStatus();
setInterval(refreshStatus, 15000);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findKeyRecursive(obj, targetKey, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return undefined;
  seen.add(obj);
  if (!Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    return obj[targetKey];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findKeyRecursive(v, targetKey, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function findFirst(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return undefined;
  seen.add(obj);
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findFirst(v, keys, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// Digs a container-shaped object like {"PROFILE": {url, isDefault}} and returns the first sub-field.
function digContainerField(data, containerKey, field) {
  const containers = findKeyRecursive(data, containerKey);
  if (containers && typeof containers === "object") {
    for (const v of Object.values(containers)) {
      if (v && typeof v === "object" && v[field]) return v[field];
    }
  }
  return undefined;
}

function buildSummaryCard(data) {
  const name = findFirst(data, ["fullname", "full_name", "name", "displayName", "player_name"]);
  const email = digContainerField(data, "emails", "value") || findFirst(data, ["email_address"]);
  const picture = digContainerField(data, "profilePhotos", "url");
  const gaiaId = findFirst(data, ["personId", "gaia_id", "gaiaId"]);

  if (!name && !email && !picture && !gaiaId) return null;

  const card = el("div", "card summary-card");
  if (picture) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.src = picture;
    img.onerror = () => { img.style.display = "none"; };
    card.appendChild(img);
  }
  const kv = el("div", "kv");
  const addRow = (k, v) => {
    if (!v) return;
    const kEl = el("div", "k", k);
    const vEl = el("div", "v", String(v));
    kv.appendChild(kEl);
    kv.appendChild(vEl);
  };
  addRow("Имя", name);
  addRow("Email", email);
  addRow("Gaia ID", gaiaId);
  card.appendChild(kv);
  return card;
}

// --- Small DOM helper ---
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const URL_RE = /^https?:\/\/\S+$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?|$)/i;

function renderLeafValue(value) {
  const wrap = el("span");
  if (value === null) {
    wrap.className = "tval t-null";
    wrap.textContent = "null";
    return wrap;
  }
  const type = typeof value;
  if (type === "string" && URL_RE.test(value)) {
    const link = document.createElement("a");
    link.href = value;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "tval t-url";
    link.textContent = value.length > 90 ? value.slice(0, 90) + "…" : value;
    wrap.appendChild(link);
    if (IMAGE_RE.test(value) || value.includes("googleusercontent.com")) {
      const thumb = document.createElement("img");
      thumb.src = value;
      thumb.className = "tthumb";
      thumb.onerror = () => thumb.remove();
      wrap.appendChild(thumb);
    }
    return wrap;
  }
  if (type === "string") {
    wrap.className = "tval t-str";
    if (value.length > 200) {
      wrap.textContent = value.slice(0, 200) + "… ";
      const more = document.createElement("button");
      more.type = "button";
      more.className = "tmore";
      more.textContent = "показать всё";
      more.onclick = () => {
        wrap.textContent = value;
      };
      wrap.appendChild(more);
    } else {
      wrap.textContent = `"${value}"`;
    }
    return wrap;
  }
  if (type === "number") {
    wrap.className = "tval t-num";
    wrap.textContent = value;
    return wrap;
  }
  if (type === "boolean") {
    wrap.className = "tval t-bool";
    wrap.textContent = value ? "true" : "false";
    return wrap;
  }
  wrap.className = "tval";
  wrap.textContent = String(value);
  return wrap;
}

function buildTree(value, depth = 0) {
  if (value === null || typeof value !== "object") {
    return renderLeafValue(value);
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);

  if (entries.length === 0) {
    const empty = el("span", "tval t-null", isArray ? "[]" : "{}");
    return empty;
  }

  const details = el("details", "tnode");
  if (depth < 1) details.open = true;

  const summary = el("summary");
  const countLabel = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  summary.appendChild(el("span", "ttype", countLabel));
  details.appendChild(summary);

  const children = el("div", "tchildren");
  for (const [k, v] of entries) {
    const row = el("div", "trow");
    const keyEl = el("span", "tkey", isArray ? `${k}` : k);
    row.appendChild(keyEl);
    row.appendChild(el("span", "tsep", ":"));
    const childNode = buildTree(v, depth + 1);
    row.appendChild(childNode);
    children.appendChild(row);
  }
  details.appendChild(children);
  return details;
}

function buildJsonViewer(data) {
  const wrapper = el("div", "card json-card");

  const toolbar = el("div", "json-toolbar");
  const expandBtn = el("button", "mini-btn", "Развернуть всё");
  const collapseBtn = el("button", "mini-btn", "Свернуть всё");
  const copyBtn = el("button", "mini-btn", "Копировать JSON");
  const filterInput = document.createElement("input");
  filterInput.type = "text";
  filterInput.placeholder = "Фильтр по ключу/значению...";
  filterInput.className = "json-filter";

  toolbar.appendChild(expandBtn);
  toolbar.appendChild(collapseBtn);
  toolbar.appendChild(copyBtn);
  toolbar.appendChild(filterInput);
  wrapper.appendChild(toolbar);

  const treeRoot = el("div", "json-tree");
  treeRoot.appendChild(buildTree(data, 0));
  wrapper.appendChild(treeRoot);

  expandBtn.onclick = () => {
    treeRoot.querySelectorAll("details").forEach((d) => (d.open = true));
  };
  collapseBtn.onclick = () => {
    treeRoot.querySelectorAll("details").forEach((d) => (d.open = false));
  };
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      copyBtn.textContent = "Скопировано!";
      setTimeout(() => (copyBtn.textContent = "Копировать JSON"), 1500);
    } catch (e) {
      copyBtn.textContent = "Ошибка копирования";
    }
  };

  filterInput.addEventListener("input", () => {
    const q = filterInput.value.trim().toLowerCase();
    const rows = treeRoot.querySelectorAll(".trow");
    if (!q) {
      rows.forEach((r) => r.classList.remove("dim"));
      return;
    }
    rows.forEach((row) => {
      const matches = row.textContent.toLowerCase().includes(q);
      row.classList.toggle("dim", !matches);
      if (matches) {
        let d = row.closest("details");
        while (d) {
          d.open = true;
          d = d.parentElement && d.parentElement.closest("details");
        }
      }
    });
  });

  return wrapper;
}

// --- Human-readable ("pretty") rendering ---

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function humanizeKey(key) {
  const raw = String(key);
  // Leave URLs, emails, ids, fingerprints etc. untouched — only humanize identifier-like keys.
  if (!/^[A-Za-z0-9_]+$/.test(raw)) return raw;
  let s = raw.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatPrimitive(v) {
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (typeof v === "string" && ISO_DATE_RE.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleString("ru-RU");
  }
  return String(v);
}

function naturalTitle(item) {
  if (!item || typeof item !== "object") return null;
  const keys = ["fullname", "full_name", "name", "title", "site", "package_name", "app_name", "email", "url", "address"];
  for (const k of keys) if (item[k]) return String(item[k]);
  return null;
}

function buildLeafRow(label, value) {
  const row = el("div", "prow");
  row.appendChild(el("div", "plabel", label));
  const valWrap = el("div", "pvalue");

  if (typeof value === "string" && URL_RE.test(value)) {
    const isImg = IMAGE_RE.test(value) || value.includes("googleusercontent.com");
    if (isImg) {
      const img = document.createElement("img");
      img.src = value;
      img.className = "pphoto";
      img.onerror = () => img.remove();
      valWrap.appendChild(img);
    }
    const a = document.createElement("a");
    a.href = value;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "plink";
    a.textContent = isImg ? "Открыть изображение" : value;
    valWrap.appendChild(a);
  } else if (typeof value === "boolean") {
    valWrap.appendChild(el("span", `pill ${value ? "pill-ok" : "pill-muted"}`, value ? "Да" : "Нет"));
  } else {
    valWrap.textContent = formatPrimitive(value);
  }

  row.appendChild(valWrap);
  return row;
}

function appendPrettyChildren(container, value, depth) {
  if (Array.isArray(value)) {
    const allPrimitive = value.every((v) => v === null || typeof v !== "object");
    if (allPrimitive) {
      const chipRow = el("div", "chiprow");
      let any = false;
      value.forEach((v) => {
        if (isEmptyValue(v)) return;
        any = true;
        chipRow.appendChild(el("span", "chip", formatPrimitive(v)));
      });
      if (any) container.appendChild(chipRow);
      return;
    }
    value.forEach((item, idx) => {
      if (isEmptyValue(item)) return;
      const title = naturalTitle(item) || `Элемент ${idx + 1}`;
      container.appendChild(buildPrettyCard(title, item, depth + 1));
    });
    return;
  }

  const entries = Object.entries(value).filter(([, v]) => !isEmptyValue(v));
  entries.forEach(([k, v]) => {
    const label = humanizeKey(k);
    if (v !== null && typeof v === "object") {
      container.appendChild(buildPrettyCard(label, v, depth + 1));
    } else {
      container.appendChild(buildLeafRow(label, v));
    }
  });
}

function buildPrettyCard(title, value, depth) {
  if (depth === 0) {
    const card = el("div", "pretty-card");
    const body = el("div", "pbody");
    card.appendChild(body);
    appendPrettyChildren(body, value, depth);
    return card;
  }

  const node = el("details", "pretty-sub");
  node.open = depth < 3;
  const summary = el("summary", "psummary");
  summary.textContent = title;
  node.appendChild(summary);
  const body = el("div", "pbody nested");
  node.appendChild(body);
  appendPrettyChildren(body, value, depth);
  return node;
}

function buildPrettyView(data) {
  const wrap = el("div");
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    wrap.appendChild(el("div", "card", "Нет структурированных данных для отображения."));
    return wrap;
  }
  wrap.appendChild(buildPrettyCard(null, data, 0));
  return wrap;
}

function buildJsonToggle(data) {
  const details = el("details", "json-toggle");
  const summary = el("summary", "json-toggle-summary", "🔧 Показать JSON (для разработчиков)");
  details.appendChild(summary);
  details.appendChild(buildJsonViewer(data));
  return details;
}

function renderResult(container, payload) {
  const { ok, data, error, stderr } = payload;
  container.innerHTML = "";

  const badge = el("span", `badge ${ok ? "ok" : "err"}`, ok ? "OK" : "Ошибка");
  container.appendChild(badge);

  if (error) {
    container.appendChild(el("div", "card", error));
  }

  if (data) {
    const summary = buildSummaryCard(data);
    if (summary) container.appendChild(summary);
    container.appendChild(buildPrettyView(data));
    container.appendChild(buildJsonToggle(data));
  } else if (payload.stdout) {
    const card = el("div", "card");
    card.appendChild(el("div", "card-title", "Вывод GHunt"));
    card.appendChild(el("div", "raw", payload.stdout));
    container.appendChild(card);
  }

  if (!ok && stderr) {
    const card = el("div", "card");
    card.appendChild(el("div", "card-title", "stderr"));
    card.appendChild(el("div", "raw", stderr));
    container.appendChild(card);
  }
}

document.querySelectorAll("form[data-endpoint]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const endpoint = form.dataset.endpoint;
    const resultKey = form.closest(".panel").dataset.panel;
    const container = document.querySelector(`[data-result="${resultKey}"]`);
    const btn = form.querySelector("button");

    let body = {};
    if (form.dataset.field) {
      body[form.dataset.field] = form.elements[form.dataset.field].value;
    } else if (form.dataset.fields) {
      form.dataset.fields.split(",").forEach((f) => {
        body[f] = form.elements[f].value;
      });
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    container.innerHTML = `<div class="card">Запрос выполняется...</div>`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      renderResult(container, payload);
    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--err)">Сетевая ошибка: ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const method = form.elements["method"].value;
  const value = form.elements["value"].value;
  const container = document.querySelector('[data-result="login"]');
  const btn = form.querySelector("button");

  btn.disabled = true;
  container.innerHTML = `<div class="card">Логинимся, это может занять до минуты...</div>`;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, value }),
    });
    const payload = await res.json();
    container.innerHTML = `
      <span class="badge ${payload.ok ? "ok" : "err"}">${payload.ok ? "Успешно" : "Ошибка"}</span>
      <div class="card"><div class="card-title">Вывод</div><div class="raw">${escapeHtml(payload.stdout || "")}\n${escapeHtml(payload.stderr || "")}</div></div>
    `;
    refreshStatus();
  } catch (err) {
    container.innerHTML = `<div class="card" style="color:var(--err)">Сетевая ошибка: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const container = document.querySelector('[data-result="logout"]');
  container.innerHTML = `<div class="card">Удаляем сессию...</div>`;
  try {
    const res = await fetch("/api/logout", { method: "POST" });
    const payload = await res.json();
    container.innerHTML = `<span class="badge ${payload.ok ? "ok" : "err"}">${payload.ok ? "Готово" : "Ошибка"}</span>
      <div class="card"><div class="raw">${escapeHtml(payload.stdout || "")}</div></div>`;
    refreshStatus();
  } catch (err) {
    container.innerHTML = `<div class="card" style="color:var(--err)">Сетевая ошибка: ${escapeHtml(err.message)}</div>`;
  }
});
