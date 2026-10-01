"use strict";
// النسخة المرتبطة بالـ Backend: المشاريع وتسجيل الدخول عبر /api
const TOKEN_KEY = "wcs_token";
const THEME_KEY = "wcs_theme";
const $ = (s) => document.querySelector(s);
const grid = $("#projectGrid"),
  modal = $("#modal"),
  form = $("#form");
const login = $("#login"),
  pw = $("#pw"),
  pwErr = $("#pwErr");
let token = null,
  projects = [],
  toastT;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch (e) {}
let admin = !!token;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = $("#themeBtn");
  const dark = theme === "dark";
  button.textContent = dark ? "☀" : "☾";
  button.setAttribute(
    "aria-label",
    dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي",
  );
  button.title = dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
}

$("#themeBtn").onclick = () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
};
applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3500);
}
function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

async function api(path, opts = {}) {
  const r = await fetch("/api" + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token) {
      setAdmin(false);
      throw new Error("انتهت الجلسة، سجّل الدخول من جديد.");
    }
    throw new Error(data.error || "حدث خطأ");
  }
  return data;
}

function render() {
  if (!projects.length) {
    grid.innerHTML = '<p class="empty">لا توجد مشاريع بعد.</p>';
    return;
  }
  grid.innerHTML = projects
    .map(
      (p) => `
    <article class="card proj">
      <div class="wrap"><div class="thumb" style="background-image:${p.img.startsWith("linear") ? p.img : `url(${encodeURI(p.img)})`}"></div></div>
      <div class="body">
        ${admin && !p.seed ? `<button class="del" data-id="${esc(p.id)}" title="حذف" aria-label="حذف المشروع">🗑</button>` : ""}
        <h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p>
        ${p.url ? `<a class="visit" href="${esc(p.url)}" target="_blank" rel="noopener">زيارة المشروع</a>` : ""}
      </div>
    </article>`,
    )
    .join("");
  observeReveals(grid.querySelectorAll(".proj"));
}

let revealObserver;
function observeReveals(elements) {
  if (!elements) {
    elements = document.querySelectorAll("main section, .svc, .contact");
    elements.forEach((element) => element.classList.add("reveal"));
  }
  if (
    !("IntersectionObserver" in window) ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );
  }
  elements.forEach((element) => revealObserver.observe(element));
}

async function loadProjects() {
  try {
    projects = await api("/projects");
    render();
  } catch (e) {
    grid.innerHTML =
      '<p class="empty">تعذّر تحميل المشاريع. تأكد من تشغيل السيرفر.</p>';
  }
}

function setAdmin(on, t) {
  admin = on;
  token = on ? t || token : null;
  try {
    on
      ? sessionStorage.setItem(TOKEN_KEY, token)
      : sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
  $("#addBtn").hidden = !on;
  $("#adminBtn").classList.toggle("on", on);
  $("#adminBtn").textContent = on ? "🔓" : "🔒";
  $("#adminBtn").title = on ? "خروج المدير" : "دخول المدير";
  render();
}

$("#adminBtn").onclick = () => {
  if (admin) {
    setAdmin(false);
    return toast("تم تسجيل الخروج");
  }
  pwErr.hidden = true;
  pw.value = "";
  login.hidden = false;
  pw.focus();
};
$("#loginCancel").onclick = () => {
  login.hidden = true;
};
login.onclick = (e) => {
  if (e.target === login) login.hidden = true;
};
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const { token: t } = await api("/login", {
      method: "POST",
      body: JSON.stringify({ password: pw.value }),
    });
    login.hidden = true;
    setAdmin(true, t);
    toast("تم تسجيل الدخول");
  } catch (err) {
    pwErr.textContent = err.message;
    pwErr.hidden = false;
    pw.select();
  }
};

$("#addBtn").onclick = () => {
  modal.hidden = false;
};
$("#cancel").onclick = () => {
  modal.hidden = true;
  form.reset();
};
modal.onclick = (e) => {
  if (e.target === modal) $("#cancel").click();
};

grid.onclick = async (e) => {
  const b = e.target.closest(".del");
  if (!b) return;
  if (!b.classList.contains("sure")) {
    b.classList.add("sure");
    b.textContent = "تأكيد الحذف";
    setTimeout(() => {
      b.classList.remove("sure");
      b.textContent = "🗑";
    }, 3000);
    return;
  }
  try {
    await api("/projects/" + b.dataset.id, { method: "DELETE" });
    toast("تم حذف المشروع");
    await loadProjects();
  } catch (err) {
    toast(err.message);
  }
};

// تصغير الصورة قبل الرفع
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(),
      url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1200 / img.width),
        c = document.createElement("canvas");
      c.width = img.width * k;
      c.height = img.height * k;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = rej;
    img.src = url;
  });
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(form),
    btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const image = await shrink(f.get("img"));
    await api("/projects", {
      method: "POST",
      body: JSON.stringify({
        title: f.get("title"),
        desc: f.get("desc"),
        url: f.get("url"),
        image,
      }),
    });
    $("#cancel").click();
    toast("تمت إضافة المشروع");
    await loadProjects();
  } catch (err) {
    toast(err.message || "تعذّر رفع المشروع");
  }
  btn.disabled = false;
};

$("#menuBtn").onclick = () => $("#links").classList.toggle("open");
$("#links").onclick = (e) => {
  if (e.target.tagName === "A") $("#links").classList.remove("open");
};

$(".phone").onclick = (e) => {
  if (matchMedia("(pointer:coarse)").matches) return;
  e.preventDefault();
  const n = "01024370764";
  (navigator.clipboard
    ? navigator.clipboard.writeText(n)
    : Promise.reject()
  ).then(
    () => toast("تم نسخ الرقم: " + n),
    () => toast("رقم الهاتف: " + n),
  );
};

setAdmin(admin, token);
observeReveals();
loadProjects();
