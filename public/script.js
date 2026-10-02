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

function projectMeta(project) {
  const statusLabel = project.status === "draft" ? "مسودة" : "منشور";
  return `
    ${admin ? `<div class="meta-row"><span class="status-badge ${project.status}">${statusLabel}</span><span class="category-badge">${esc(project.category || "عام")}</span></div>` : ""}
  `;
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
        ${admin && !p.seed ? `<div class="admin-actions"><button class="edit" data-id="${esc(p.id)}" title="تعديل" aria-label="تعديل المشروع">✎</button><button class="del" data-id="${esc(p.id)}" title="حذف" aria-label="حذف المشروع">🗑</button></div>` : ""}
        ${projectMeta(p)}
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
  loadProjects();
}

$("#adminBtn").onclick = async () => {
  if (admin) {
    try {
      await api("/logout", { method: "POST" });
    } catch (err) {
      // تجاهل، لأنه قد يكون قد انتهت الجلسة بالفعل
    }
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
};
$("#cancel").onclick = () => {
  modal.hidden = true;
  resetProjectForm();
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
    toast(err.message || "تعذّر حفظ المشروع");
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
