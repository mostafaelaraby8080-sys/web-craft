"use strict";
const TOKEN_KEY = "wcs_token";
const THEME_KEY = "wcs_theme";
const $ = (s) => document.querySelector(s);
const grid = $("#projectGrid"),
  modal = $("#modal"),
  form = $("#form");
const login = $("#login"),
  pw = $("#pw"),
  pwErr = $("#pwErr"),
  projectSearch = $("#projectSearch"),
  projectStatusFilter = $("#projectStatusFilter"),
  projectCategoryFilter = $("#projectCategoryFilter"),
  clearFiltersBtn = $("#clearFilters");
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

function projectMeta(project) {
  const statusLabel = project.status === "draft" ? "مسودة" : "منشور";
  return `
    ${admin ? `<div class="meta-row"><span class="status-badge ${project.status}">${statusLabel}</span><span class="category-badge">${esc(project.category || "عام")}</span></div>` : ""}
  `;
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
        ${admin && !p.seed ? `<div class="admin-actions"><button class="edit" data-id="${esc(p.id)}" title="تعديل" aria-label="تعديل المشروع">✎</button><button class="del" data-id="${esc(p.id)}" title="حذف" aria-label="حذف المشروع">🗑</button></div>` : ""}
        ${projectMeta(p)}
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

function buildProjectQuery() {
  const params = new URLSearchParams();
  const search = projectSearch ? projectSearch.value.trim() : "";
  const status = projectStatusFilter ? projectStatusFilter.value : "all";
  const category = projectCategoryFilter ? projectCategoryFilter.value : "all";
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  if (category && category !== "all") params.set("category", category);
  params.set("page", "1");
  params.set("limit", "12");
  return params;
}

async function loadProjects() {
  try {
    const params = buildProjectQuery();
    const data = await api(`/projects?${params.toString()}`);
    const payload = Array.isArray(data) ? { projects: data } : data;
    projects = payload.projects || [];
    const categories = [...new Set(projects.map((p) => p.category).filter(Boolean))];
    if (projectCategoryFilter) {
      const current = projectCategoryFilter.value;
      projectCategoryFilter.innerHTML = `<option value="all">كل التصنيفات</option>${categories
        .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
        .join("")}`;
      projectCategoryFilter.value = categories.includes(current) ? current : "all";
    }
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
  $("#contactInbox").hidden = !on;
  $("#messagesBtn").setAttribute("aria-expanded", "false");
  $("#adminBtn").classList.toggle("on", on);
  $("#adminBtn").textContent = on ? "🔓" : "🔒";
  $("#adminBtn").title = on ? "خروج المدير" : "دخول المدير";
<<<<<<< HEAD
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
=======
  loadProjects();
}

$("#adminBtn").onclick = async () => {
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
  if (admin) {
    try {
      await api("/logout", { method: "POST" });
    } catch (err) {}
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

<<<<<<< HEAD
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
=======
// [التعديل هنا] تحديث دالة تسجيل الدخول لإخفاء النافذة فوراً وتطبيق صلاحيات المدير
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector("[type=submit]");
  submitBtn.disabled = true;
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
  try {
    const { token: t } = await api("/login", {
      method: "POST",
      body: JSON.stringify({ password: pw.value }),
    });
<<<<<<< HEAD
    closeModal(login);
=======
    login.hidden = true;
    pw.value = "";
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
    setAdmin(true, t);
    toast("تم تسجيل الدخول بنجاح");
  } catch (err) {
    pwErr.textContent = err.message || "كلمة المرور غير صحيحة";
    pwErr.hidden = false;
    pw.select();
  } finally {
<<<<<<< HEAD
    button.disabled = false;
  }
};

$("#addBtn").onclick = () => {
  openModal(modal, form.querySelector('[name="title"]'));
=======
    submitBtn.disabled = false;
  }
};

function resetProjectForm() {
  form.reset();
  form.querySelector('[name="id"]').value = "";
  form.querySelector('[name="status"]').value = "published";
  form.querySelector('[name="order"]').value = "0";
}

function openProjectModal(project) {
  modal.hidden = false;
  form.querySelector('[name="id"]').value = project ? project.id : "";
  form.querySelector('[name="title"]').value = project ? project.title : "";
  form.querySelector('[name="desc"]').value = project ? project.desc : "";
  form.querySelector('[name="url"]').value = project ? project.url || "" : "";
  form.querySelector('[name="category"]').value = project ? project.category || "عام" : "عام";
  form.querySelector('[name="status"]').value = project ? project.status : "published";
  form.querySelector('[name="order"]').value = project ? project.order || 0 : 0;
  const fileField = form.querySelector('[name="img"]');
  fileField.required = !project;
}

$("#addBtn").onclick = () => {
  openProjectModal(null);
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
};

$("#cancel").onclick = () => {
<<<<<<< HEAD
  form.reset();
  closeModal(modal);
=======
  modal.hidden = true;
  resetProjectForm();
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
};

modal.onclick = (e) => {
  if (e.target === modal) $("#cancel").click();
};

function getProjectFormValues() {
  const formData = new FormData(form);
  return {
    id: formData.get("id") || "",
    title: String(formData.get("title") || "").trim(),
    desc: String(formData.get("desc") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    status: String(formData.get("status") || "published"),
    category: String(formData.get("category") || "عام").trim() || "عام",
    order: Number(formData.get("order") || 0),
    image: formData.get("img") || null,
  };
}

grid.onclick = async (e) => {
  const editBtn = e.target.closest(".edit");
  if (editBtn) {
    const project = projects.find((item) => item.id === editBtn.dataset.id);
    if (project) openProjectModal(project);
    return;
  }

  const delBtn = e.target.closest(".del");
  if (!delBtn) return;
  if (!delBtn.classList.contains("sure")) {
    delBtn.classList.add("sure");
    delBtn.textContent = "تأكيد الحذف";
    setTimeout(() => {
      delBtn.classList.remove("sure");
      delBtn.textContent = "🗑";
    }, 3000);
    return;
  }
  try {
    await api("/projects/" + delBtn.dataset.id, { method: "DELETE" });
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
  const values = getProjectFormValues();
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const payload = {
      title: values.title,
      desc: values.desc,
      url: values.url,
      status: values.status,
      category: values.category,
      order: values.order,
    };

    if (values.image && values.image.size > 0) {
      payload.image = await shrink(values.image);
    }

    const isEdit = Boolean(values.id);
    const endpoint = isEdit ? `/projects/${values.id}` : "/projects";
    const method = isEdit ? "PUT" : "POST";

    await api(endpoint, {
      method,
      body: JSON.stringify(payload),
    });

    $("#cancel").click();
    toast(isEdit ? "تم تحديث المشروع" : "تمت إضافة المشروع");
    await loadProjects();
  } catch (err) {
<<<<<<< HEAD
    toast(err.message || "تعذّر رفع المشروع");
  } finally {
    btn.disabled = false;
=======
    toast(err.message || "تعذّر حفظ المشروع");
>>>>>>> 463cc31e2cbad20a55fdce6b3356f783e9169724
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
      email.href = `mailto:${encodeURIComponent(message.email)}`;
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

if (projectSearch) {
  projectSearch.addEventListener("input", () => {
    loadProjects();
  });
}
if (projectStatusFilter) {
  projectStatusFilter.addEventListener("change", () => {
    loadProjects();
  });
}
if (projectCategoryFilter) {
  projectCategoryFilter.addEventListener("change", () => {
    loadProjects();
  });
}
if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", () => {
    if (projectSearch) projectSearch.value = "";
    if (projectStatusFilter) projectStatusFilter.value = "all";
    if (projectCategoryFilter) projectCategoryFilter.value = "all";
    loadProjects();
  });
}

setAdmin(admin, token);
observeReveals();
loadProjects();
if (admin) {
  api("/contact").catch((error) => {
    if (token) console.error("تعذّر التحقق من جلسة المدير:", error);
  });
}
// في دالة التعامل مع submit نموذج التواصل
async function handleContactSubmit(e) {
  e.preventDefault();
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  
  try {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    await api("/contact", {
      method: "POST",
      body: JSON.stringify(data)
    });
    
    // إظهار التنبيه وإعادة ضبط الخانات
    toast("✨ تم استلام رسالتك بنجاح! سنتواصل معك في أقرب وقت.");
    form.reset();
  } catch (err) {
    toast("❌ " + (err.message || "حدث خطأ أثناء إرسال الرسالة."));
  } finally {
    submitBtn.disabled = false;
  }
}