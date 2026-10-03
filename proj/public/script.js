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
  activeModal = null,
  modalTrigger = null,
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

applyTheme(
  document.documentElement.dataset.theme === "dark" ? "dark" : "light",
);

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
      ...opts.headers,
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
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "لا توجد مشاريع بعد.";
    grid.replaceChildren(empty);
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
  const cards = grid.querySelectorAll(".proj");
  cards.forEach((card) => card.classList.add("reveal"));
  observeReveals(cards);
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
  } catch (error) {
    projects = [];
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent =
      error.message || "تعذّر تحميل المشاريع. حاول تحديث الصفحة.";
    grid.replaceChildren(message);
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
  $("#messagesBtn").hidden = !on;
  if (!on) closeModal(login);
  $("#contactInbox").hidden = true; // يُفتح بزر "رسائل العملاء"
  $("#messagesBtn").setAttribute("aria-expanded", "false");
  $("#adminBtn").classList.toggle("on", on);
  $("#adminBtn").textContent = on ? "🔓" : "🔒";
  $("#adminBtn").title = on ? "خروج المدير" : "دخول المدير";
  $("#adminBtn").setAttribute(
    "aria-label",
    on ? "تسجيل خروج المدير" : "دخول المدير",
  );
  render();
}

function openModal(dialog, initialFocus) {
  modalTrigger = document.activeElement;
  activeModal = dialog;
  dialog.hidden = false;
  (initialFocus || dialog.querySelector("input, button"))?.focus();
}

function closeModal(dialog) {
  if (dialog.hidden) return;
  dialog.hidden = true;
  if (activeModal === dialog) activeModal = null;
  if (modalTrigger instanceof HTMLElement && modalTrigger.isConnected) {
    modalTrigger.focus();
  }
}

document.addEventListener("keydown", (event) => {
  if (!activeModal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (activeModal === modal) $("#cancel").click();
    else closeModal(activeModal);
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [
    ...activeModal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.hidden);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

$("#adminBtn").onclick = () => {
  if (admin) {
    setAdmin(false);
    return toast("تم تسجيل الخروج");
  }
  pwErr.hidden = true;
  pw.value = "";
  openModal(login, pw);
};

$("#loginCancel").onclick = () => {
  closeModal(login);
};

login.onclick = (e) => {
  if (e.target === login) closeModal(login);
};

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const { token: t } = await api("/login", {
      method: "POST",
      body: JSON.stringify({ password: pw.value }),
    });
    closeModal(login);
    setAdmin(true, t);
    toast("تم تسجيل الدخول");
  } catch (err) {
    pwErr.textContent = err.message;
    pwErr.hidden = false;
    pw.select();
  } finally {
    button.disabled = false;
  }
};

$("#addBtn").onclick = () => {
  openModal(modal, form.querySelector('[name="title"]'));
};

$("#cancel").onclick = () => {
  form.reset();
  closeModal(modal);
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

function shrink(file) {
  return new Promise((res, rej) => {
    if (!(file instanceof Blob)) {
      rej(new Error("اختر صورة للمشروع أولًا."));
      return;
    }
    const img = new Image(),
      url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const k = Math.min(1, 1200 / img.width),
          canvas = document.createElement("canvas");
        canvas.width = img.width * k;
        canvas.height = img.height * k;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("تعذّر تجهيز صورة المشروع.");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", 0.82));
      } catch (error) {
        rej(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("تعذّر فتح الصورة. اختر صورة JPG أو PNG أو WebP."));
    };
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
  } finally {
    btn.disabled = false;
  }
};

const messagesBtn = $("#messagesBtn");
const contactInbox = $("#contactInbox");
const contactMessages = $("#contactMessages");

async function loadContactMessages() {
  contactMessages.setAttribute("aria-busy", "true");
  try {
    const messages = await api("/contact");
    contactMessages.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "لا توجد رسائل حتى الآن.";
      contactMessages.append(empty);
      return;
    }

    messages.forEach((message) => {
      const card = document.createElement("article");
      card.className = "message-card";

      const heading = document.createElement("div");
      heading.className = "message-heading";
      const sender = document.createElement("h4");
      sender.textContent = message.name;
      const date = document.createElement("time");
      date.dateTime = message.createdAt;
      date.textContent = new Date(message.createdAt).toLocaleString("ar-EG");
      heading.append(sender, date);

      const email = document.createElement("a");
      email.href = "mailto:" + message.email;
      email.textContent = message.email;
      email.dir = "ltr";

      const details = document.createElement("p");
      details.textContent = [message.service, message.phone]
        .filter(Boolean)
        .join(" · ");

      const content = document.createElement("p");
      content.textContent = message.message;

      card.append(heading, email);
      if (details.textContent) card.append(details);
      card.append(content);
      contactMessages.append(card);
    });
  } catch (error) {
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = error.message || "تعذّر تحميل الرسائل.";
    contactMessages.replaceChildren(message);
  } finally {
    contactMessages.setAttribute("aria-busy", "false");
  }
}

messagesBtn.onclick = async () => {
  const isOpening = contactInbox.hidden;
  contactInbox.hidden = !isOpening;
  messagesBtn.setAttribute("aria-expanded", String(isOpening));
  if (isOpening) await loadContactMessages();
};

$("#refreshMessages").onclick = loadContactMessages;

const WA_NUMBER = "201024370764";
function sendViaWhatsApp(d) {
  const lines = [
    "رسالة جديدة من موقع Web Craft Studio",
    "الاسم: " + d.name,
    "البريد: " + d.email,
    d.phone && "الهاتف: " + d.phone,
    d.service && "الخدمة: " + d.service,
    "الرسالة: " + d.message,
  ].filter(Boolean);
  const url = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(lines.join("\n"));
  toast("سيتم فتح واتساب لإرسال رسالتك، اضغط إرسال هناك.");
  const w = window.open(url, "_blank");
  if (w) w.opener = null;
  else location.href = url; // لو حجب المتصفح النافذة الجديدة
}

const contactForm = $("#contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = contactForm.querySelector('[type="submit"]');
    const originalLabel = submitButton.textContent;
    const data = new FormData(contactForm);
    const payload = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      service: String(data.get("service") || "").trim(),
      message: String(data.get("message") || "").trim(),
    };
    submitButton.disabled = true;
    submitButton.textContent = "جارٍ الإرسال…";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 503) {
        // قاعدة البيانات غير مُعدّة (مثلًا على Vercel بدون MongoDB): نرسل الرسالة عبر واتساب بدل ضياعها.
        sendViaWhatsApp(payload);
        contactForm.reset();
        return;
      }
      if (!response.ok) {
        throw new Error(json.error || "تعذّر إرسال الرسالة.");
      }
      toast("تم إرسال رسالتك بنجاح. سنعاود التواصل معك قريبًا.");
      contactForm.reset();
      if (admin && !contactInbox.hidden) await loadContactMessages();
    } catch (error) {
      toast(error.message || "حدث خطأ أثناء الإرسال.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
}

const menuButton = $("#menuBtn");
const links = $("#links");
function closeMenu() {
  links.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "فتح القائمة");
}
menuButton.onclick = () => {
  const isOpening = !links.classList.contains("open");
  links.classList.toggle("open", isOpening);
  menuButton.setAttribute("aria-expanded", String(isOpening));
  menuButton.setAttribute(
    "aria-label",
    isOpening ? "إغلاق القائمة" : "فتح القائمة",
  );
};
$("#links").onclick = (e) => {
  if (e.target.closest("a")) closeMenu();
};
document.addEventListener("click", (event) => {
  if (
    links.classList.contains("open") &&
    !links.contains(event.target) &&
    !menuButton.contains(event.target)
  ) {
    closeMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && links.classList.contains("open")) {
    closeMenu();
    menuButton.focus();
  }
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 720) closeMenu();
});

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
if (admin) {
  api("/contact").catch((error) => {
    if (token) console.error("تعذّر التحقق من جلسة المدير:", error);
  });
}
