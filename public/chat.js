// المساعد الذكي لموقع Webcraft Studio: زر عائم + نافذة دردشة
// يتصل بـ /api/chat، وعند أي مشكلة يرد بإجابات جاهزة (بدون إنترنت أو بدون مفتاح API)
(() => {
  "use strict";
  const WA = "https://wa.me/201024370764";
  const KEY = "wcs_chat";
  const WELCOME =
    "أهلًا بيك في Webcraft Studio 👋\nأنا المساعد الذكي، أقدر أشرحلك خدماتنا وأجاوب على أسئلتك. تحب تعرف إيه؟";
  const CHIPS = [
    "إيه الخدمات اللي بتقدموها؟",
    "إزاي أبدأ مشروعي؟",
    "فين أشوف أعمالكم؟",
    "إزاي أتواصل معاكم؟",
  ];

  // ---------- إجابات جاهزة (احتياطي) ----------
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0640]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي");
  const KB = [
    {
      k: ["سعر", "اسعار", "بكام", "تكلف", "تكلفه", "price", "cost"],
      a: "السعر بيختلف حسب نوع المشروع وحجمه. ابعتلنا فكرتك على واتساب ونحدد معاك التفاصيل.",
    },
    {
      k: ["مده", "وقت", "ياخد", "يستغرق", "امتي", "قد ايه"],
      a: "مدة التنفيذ بتتحدد حسب المشروع. كلّمنا على واتساب واحكيلنا تفاصيله ونقولك.",
    },
    {
      k: [
        "ابدا",
        "ابدأ",
        "اطلب",
        "عايز موقع",
        "محتاج موقع",
        "عاوز موقع",
        "start",
      ],
      a: "سهلة! احكيلنا عن نشاطك والموقع اللي محتاجه على واتساب أو من نموذج التواصل، ونبدأ بفهم هدفك وجمهورك.",
    },
    {
      k: ["خدم", "service", "بتقدم", "تقدموا", "تقدمو"],
      a: "بنقدم 3 خدمات:\n• تصميم واجهات حديثة ومتناسقة مع هوية علامتك.\n• تطوير مواقع سريعة ومتجاوبة بكود نظيف.\n• تحسين تجربة المستخدم عشان التنقل يبقى بسيط وترتفع نسبة التفاعل والتحويل.",
    },
    {
      k: ["تطبيق", "تطبيقات", "app", "ios", "اندرويد"],
      a: "تخصصنا الأساسي تصميم وتطوير مواقع الويب. لو محتاج حاجة تانية كلّمنا على واتساب ونشوف معاك الأنسب.",
    },
    {
      k: ["اعمال", "مشاريع", "مشروعات", "نماذج", "portfolio", "project"],
      a: "تقدر تشوف أعمالنا في قسم «المشاريع» هنا في الموقع، زي موقع مطعم Town Burger.",
    },
    {
      k: [
        "تواصل",
        "رقم",
        "واتس",
        "هاتف",
        "تليفون",
        "فون",
        "فيس",
        "انستجرام",
        "contact",
        "call",
      ],
      a: "تقدر تكلمنا على واتساب أو الهاتف 01024370764، ولينا كمان صفحة على فيسبوك وانستجرام (web_craft_studio11). وفي آخر الصفحة نموذج «أرسل رسالة».",
    },
    {
      k: ["مين انتم", "مين انتو", "من انتم", "عنكم", "نبذه", "about", "ايه هو"],
      a: "Webcraft Studio استوديو متخصص في تصميم وتطوير مواقع الويب بواجهات عصرية وأداء سريع، ومواقع بتعبّر عن نشاطك. بنبدأ بفهم هدفك وجمهورك وبعدها نبني موقع واضح وسريع على كل الأجهزة.",
    },
    {
      k: ["اهلا", "مرحبا", "السلام", "هاي", "صباح", "مساء", "hello", "hi"],
      a: "أهلًا بيك! أقدر أساعدك في معرفة خدماتنا أو إزاي تبدأ مشروعك. تحب تسأل عن إيه؟",
    },
    {
      k: ["شكرا", "تسلم", "thanks"],
      a: "العفو! لو عندك أي سؤال تاني أنا موجود 🌟",
    },
  ];
  KB.forEach((e) => (e.k = e.k.map(norm)));
  const FALLBACK =
    "مش متأكد من إجابة سؤالك بالتفصيل. أحسن حاجة تكلم فريقنا مباشرة على واتساب 01024370764 وهيساعدوك.";
  const localAnswer = (q) => {
    const t = norm(q);
    const hit = KB.find((e) => e.k.some((w) => t.includes(w)));
    return hit ? hit.a : FALLBACK;
  };

  // ---------- بناء الواجهة ----------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const svg = (d, extra = "") =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICON_CHAT = svg(
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.500 3h11A2.500 2.500 0 0 1 20 5.500v8a2.500 2.500 0 0 1-2.500 2.500H10l-4.200 3.800c-.5.400-1.300.100-1.300-.600V16A2.500 2.500 0 0 1 4 13.500z"/><circle cx="9" cy="9.500" r="1.100"/><circle cx="12.500" cy="9.500" r="1.100"/><circle cx="16" cy="9.500" r="1.100"/>',
    'fill="currentColor"',
  );
  const ICON_SEND = svg(
    '<path d="M3.400 20.400 21 12 3.400 3.600l.1 6.500L15 12 3.500 13.900z"/>',
    'fill="currentColor"',
  );
  const ICON_CLOSE = svg(
    '<path d="M6 6l12 12M18 6 6 18"/>',
    'fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"',
  );

  const fab = el("button", "wc-fab");
  fab.type = "button";
  fab.setAttribute("aria-label", "افتح المساعد الذكي");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = ICON_CHAT;
  const nudge = el("span", "wc-nudge", "محتاج مساعدة؟ اسألني 👋");
  nudge.hidden = true;

  const panel = el("section", "wc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "المساعد الذكي");
  panel.hidden = true;

  const head = el("header", "wc-head");
  const av = el("div", "wc-av");
  av.innerHTML = ICON_CHAT;
  const ht = el("div", "wc-ht");
  ht.append(
    el("b", "", "مساعد Webcraft Studio"),
    el("small", "", "بيرد عليك فورًا"),
  );
  const closeBtn = el("button", "wc-x");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "إغلاق");
  closeBtn.innerHTML = ICON_CLOSE;
  head.append(av, ht, closeBtn);

  const log = el("div", "wc-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const chips = el("div", "wc-chips");
  CHIPS.forEach((c) => {
    const b = el("button", "wc-chip", c);
    b.type = "button";
    b.onclick = () => send(c);
    chips.append(b);
  });

  const form = el("form", "wc-form");
  const input = el("input");
  input.type = "text";
  input.maxLength = 300;
  input.placeholder = "اكتب سؤالك هنا…";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "اكتب سؤالك");
  const sendBtn = el("button", "wc-send");
  sendBtn.type = "submit";
  sendBtn.setAttribute("aria-label", "إرسال");
  sendBtn.innerHTML = ICON_SEND;
  form.append(input, sendBtn);

  const foot = el("footer", "wc-foot");
  const wa = el("a", "", "كلّمنا على واتساب");
  wa.href = WA;
  wa.target = "_blank";
  wa.rel = "noopener";
  const cf = el("a", "", "نموذج التواصل");
  cf.href = "#contact";
  cf.onclick = () => toggle(false);
  foot.append(wa, cf);

  panel.append(head, log, chips, form, foot);
  document.body.append(panel, fab, nudge);

  // ---------- الحالة ----------
  let history = [];
  let busy = false;
  try {
    history = JSON.parse(sessionStorage.getItem(KEY) || "[]").slice(-20);
  } catch (e) {}
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(history.slice(-20)));
    } catch (e) {}
  };

  function add(role, text) {
    const m = el("div", "wc-msg " + (role === "user" ? "me" : "bot"));
    m.textContent = text;
    log.append(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }
  function typing(on) {
    let t = log.querySelector(".wc-typing");
    if (on && !t) {
      t = el("div", "wc-msg bot wc-typing");
      t.setAttribute("aria-label", "المساعد بيكتب");
      t.innerHTML = "<i></i><i></i><i></i>";
      log.append(t);
      log.scrollTop = log.scrollHeight;
    } else if (!on && t) t.remove();
  }

  async function send(raw) {
    const text = String(raw).replace(/\s+/g, " ").trim().slice(0, 300);
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips.hidden = true;
    input.value = "";
    add("user", text);
    history.push({ role: "user", content: text });
    typing(true);
    let answer = "";
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-10) }),
      });
      const d = await r.json().catch(() => ({}));
      answer = d.reply || (r.status === 429 && d.error) || "";
    } catch (e) {}
    if (!answer) {
      await new Promise((ok) => setTimeout(ok, 600));
      answer = localAnswer(text);
    }
    typing(false);
    add("bot", answer);
    history.push({ role: "assistant", content: answer });
    save();
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  function toggle(open) {
    panel.hidden = !open;
    fab.hidden = open && matchMedia("(max-width:520px)").matches;
    nudge.hidden = true;
    fab.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("wc-open", open);
    if (open) input.focus();
    else fab.hidden = false;
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    send(input.value);
  };
  fab.onclick = () => toggle(panel.hidden);
  closeBtn.onclick = () => toggle(false);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      toggle(false);
      fab.focus();
    }
  });

  // رسالة الترحيب + استرجاع المحادثة السابقة
  add("bot", WELCOME);
  history.forEach((m) => add(m.role === "user" ? "user" : "bot", m.content));
  if (history.length) chips.hidden = true;

  // تلميح صغير مرة واحدة في الجلسة
  let nudged = false;
  try {
    nudged = sessionStorage.getItem(KEY + "_n") === "1";
  } catch (e) {}
  if (!nudged) {
    setTimeout(() => {
      if (panel.hidden) {
        nudge.hidden = false;
        try {
          sessionStorage.setItem(KEY + "_n", "1");
        } catch (e) {}
        setTimeout(() => (nudge.hidden = true), 7000);
      }
    }, 5000);
  }
  nudge.onclick = () => toggle(true);

  window.__wcChat = { localAnswer }; // للاختبار فقط
})();
