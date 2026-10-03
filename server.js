"use strict";
// Backend بدون أي مكتبات: Node.js فقط.
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto"),
  os = require("os");

// تحميل ملف .env محليًا (بدون مكتبات). المتغيرات الموجودة فعلًا لا تُستبدل.
try {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {}

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const useMongo = Boolean(process.env.MONGODB_URI);
const cloudinary = useMongo ? require("cloudinary").v2 : null;
const { MongoClient } = useMongo ? require("mongodb") : { MongoClient: null };

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION,
);
const DATA = path.resolve(
  process.env.DATA_DIR ||
    path.join(isServerless ? os.tmpdir() : __dirname, "data"),
);
const UPLOADS = path.join(DATA, "uploads");
const DB = path.join(DATA, "database.json");
const CONTACTS = path.join(DATA, "contacts.json");
fs.mkdirSync(UPLOADS, { recursive: true });

function readContacts() {
  try {
    const contacts = JSON.parse(fs.readFileSync(CONTACTS, "utf8"));
    if (!Array.isArray(contacts))
      throw new Error("ملف رسائل التواصل لا يحتوي على قائمة صالحة.");
    return contacts;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeContacts(list) {
  const temporaryFile = CONTACTS + ".tmp";
  fs.writeFileSync(temporaryFile, JSON.stringify(list, null, 2));
  fs.renameSync(temporaryFile, CONTACTS);
}

async function saveContact(contact) {
  if (useMongo) {
    await (await getMongoCollection("contacts")).insertOne(contact);
    return;
  }
  if (isServerless) {
    throw Object.assign(
      new Error("إعداد قاعدة بيانات دائمة لاستقبال الرسائل غير مكتمل."),
      { status: 503 },
    );
  }
  writeContacts([contact, ...readContacts()].slice(0, 1000));
}

const hasCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (useMongo && hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD)
  console.warn("⚠ دخول المدير معطّل: اضبط ADMIN_PASSWORD في متغيرات البيئة.");

// On serverless, keep a fallback secret in memory; configure SECRET to keep
// login tokens valid across separate function instances.
const keyFile = path.join(DATA, "secret.key");
let SECRET = process.env.SECRET;
if (!SECRET) {
  if (isServerless) {
    SECRET = crypto.randomBytes(32).toString("hex");
    console.warn(
      "⚠ دخول المدير يحتاج SECRET ثابتًا في بيئة serverless حتى تعمل الجلسات بين الطلبات.",
    );
  } else {
    try {
      SECRET = fs.readFileSync(keyFile, "utf8");
    } catch {
      SECRET = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(keyFile, SECRET, { mode: 0o600 });
    }
  }
}

const g = (a, b) => `linear-gradient(135deg,${a},${b})`;
const SEED = [
  {
    id: "seed1",
    title: "متجر إلكتروني",
    desc: "متجر سريع مع سلة شراء وصفحات منتجات واضحة.",
    img: g("#2f7bff", "#7a5cff"),
    seed: true,
  },
  {
    id: "seed2",
    title: "موقع شركة",
    desc: "موقع تعريفي احترافي لشركة خدمات.",
    img: g("#0f1733", "#2f7bff"),
    seed: true,
  },
  {
    id: "seed3",
    title: "صفحة هبوط",
    desc: "صفحة إطلاق تركّز على تحويل الزوار إلى عملاء.",
    img: g("#7a5cff", "#0f1733"),
    seed: true,
  },
];

let mongoDatabasePromise;
async function getMongoDatabase() {
  if (!useMongo) return null;
  if (!mongoDatabasePromise) {
    mongoDatabasePromise = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      return client.db(process.env.MONGODB_DB || "webcraft");
    })().catch((error) => {
      mongoDatabasePromise = null;
      throw error;
    });
  }
  return mongoDatabasePromise;
}

const indexedCollections = new Set();
async function getMongoCollection(name = "projects") {
  const db = await getMongoDatabase();
  if (!db) return null;
  const collection = db.collection(name);
  if (!indexedCollections.has(name)) {
    await collection.createIndex({ id: 1 }, { unique: true });
    indexedCollections.add(name);
  }
  return collection;
}

const readFileProjects = () => {
  try {
    const projects = JSON.parse(fs.readFileSync(DB, "utf8"));
    if (!Array.isArray(projects))
      throw new Error("ملف المشاريع لا يحتوي على قائمة صالحة.");
    return projects;
  } catch (error) {
    if (error.code === "ENOENT") return null; // لم يُنشأ الملف بعد
    throw error;
  }
};

const writeFileProjects = (list) => {
  const t = DB + ".tmp";
  fs.writeFileSync(t, JSON.stringify(list, null, 2));
  fs.renameSync(t, DB);
};

// الأمثلة الافتراضية (SEED) لا تُخزَّن في MongoDB؛ تظهر فقط إذا لم يوجد أي
// مشروع ولم يُخفها المدير. علامة الإخفاء تُحفظ في مستند id="seedsHidden".
const hideSeeds = async () => {
  const meta = await getMongoCollection("meta");
  await meta.updateOne(
    { id: "seedsHidden" },
    { $setOnInsert: { id: "seedsHidden" } },
    { upsert: true },
  );
};

const readDB = async () => {
  if (useMongo) {
    const projects = await (await getMongoCollection())
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    if (projects.length) return projects;
    const hidden = await (await getMongoCollection("meta")).findOne({
      id: "seedsHidden",
    });
    return hidden ? [] : SEED.map((x) => ({ ...x }));
  }
  return readFileProjects() || SEED.map((x) => ({ ...x }));
};

async function addProject(item) {
  if (useMongo) {
    await (await getMongoCollection()).insertOne({ ...item });
    await hideSeeds();
    return;
  }
  const list = (readFileProjects() || []).filter((x) => !x.seed);
  writeFileProjects([item, ...list]);
}

async function removeProject(id, wasSeed) {
  if (useMongo) {
    if (wasSeed) await hideSeeds();
    else await (await getMongoCollection()).deleteOne({ id });
    return;
  }
  const list = (readFileProjects() || SEED).filter((x) => x.id !== id);
  writeFileProjects(list);
}

async function uploadImage(dataUri) {
  if (useMongo && !hasCloudinary) {
    throw Object.assign(
      new Error("إعداد Cloudinary غير مكتمل في متغيرات بيئة النشر."),
      { status: 503 },
    );
  }

  if (!useMongo) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUri,
    );
    const buf = Buffer.from(m[2], "base64");
    const id = crypto.randomUUID();
    const name = id + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return { id, url: "/uploads/" + name };
  }

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "webcraft/projects",
    resource_type: "image",
  });
  return { id: crypto.randomUUID(), url: result.secure_url };
}

async function removeImage(url) {
  if (!url || !useMongo || !url.includes("res.cloudinary.com")) return;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^/?]+$/);
  if (match) await cloudinary.uploader.destroy(match[1], { invalidate: true });
}

// ---- الجلسات (توكن موقّع، صالح 7 أيام)
const sign = (s) =>
  crypto.createHmac("sha256", SECRET).update(s).digest("base64url");

const makeToken = () => {
  const exp = String(Date.now() + 7 * 864e5);
  return exp + "." + sign(exp);
};

function validToken(t) {
  const [exp, sig] = String(t || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig),
    b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isAdmin = (req) =>
  validToken((req.headers.authorization || "").replace(/^Bearer /, ""));

const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();

// ---- تحديد محاولات الدخول الخاطئة: 5 محاولات ثم حظر 10 دقائق
const fails = new Map();
const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();

function sanitizeText(value, max = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

const contactRateLimit = new Map();
function checkContactRateLimit(ip) {
  const now = Date.now();
  const entry = contactRateLimit.get(ip) || { count: 0, until: 0 };
  if (entry.until && entry.until > now) return false;
  if (entry.until && entry.until <= now) {
    entry.count = 0;
    entry.until = 0;
  }
  entry.count += 1;
  if (entry.count >= 5) {
    entry.until = now + 10 * 60 * 1000;
    entry.count = 0;
  }
  contactRateLimit.set(ip, entry);
  return true;
}

// ---- أدوات
const send = (res, code, obj) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(obj));
};

function body(req, limit = 6e6) {
  return new Promise((ok, no) => {
    let n = 0;
    const chunks = [];
    let tooLarge = false;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge)
        return no(Object.assign(new Error("الطلب كبير جدًا"), { status: 413 }));
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        ok(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch {
        no(Object.assign(new Error("بيانات غير صالحة"), { status: 400 }));
      }
    });
    req.on("error", no);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
};

function serveFile(res, base, rel, immutable = false) {
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return send(res, 400, { error: "رابط غير صالح" });
  }
  if (decoded.includes("\0")) return send(res, 400, { error: "رابط غير صالح" });
  const file = path.resolve(base, "." + path.sep + decoded);
  if (!file.startsWith(base + path.sep))
    return send(res, 403, { error: "ممنوع" });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: "غير موجود" });
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(buf);
  });
}

async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === "GET" && p === "/api/projects")
    return send(res, 200, await readDB());

  if (req.method === "GET" && p === "/api/contact") {
    if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });
    if (useMongo) {
      const contactsCollection = await getMongoCollection("contacts");
      const contacts = await contactsCollection
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      return send(res, 200, contacts);
    }
    if (isServerless) {
      return send(res, 503, {
        error: "قراءة رسائل التواصل تحتاج إلى قاعدة بيانات دائمة.",
      });
    }
    return send(res, 200, readContacts().slice(0, 100));
  }

  if (req.method === "POST" && p === "/api/contact") {
    const b = await body(req, 32e3);
    const name = sanitizeText(b.name, 60);
    const email = String(b.email || "")
      .trim()
      .slice(0, 120);
    const phone = sanitizeText(b.phone, 30);
    const service = sanitizeText(b.service, 60);
    const message = sanitizeText(b.message, 1000);

    if (!name || !isValidEmail(email) || !message) {
      return send(res, 400, {
        error: "أدخل الاسم والبريد الإلكتروني ورسالة صحيحة.",
      });
    }

    if (!checkContactRateLimit(ipOf(req))) {
      return send(res, 429, {
        error: "تم استلام رسائل كثيرة. حاول مرة أخرى بعد قليل.",
      });
    }

    await saveContact({
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      service,
      message,
      createdAt: new Date().toISOString(),
    });

    return send(res, 201, { ok: true });
  }

  if (req.method === "POST" && p === "/api/login") {
    if (!PASSWORD || (isServerless && !process.env.SECRET)) {
      req.resume();
      return send(res, 503, {
        error: "دخول المدير غير مُعدّ. راجع إعدادات ADMIN_PASSWORD و SECRET.",
      });
    }

    const ip = ipOf(req),
      f = fails.get(ip) || { n: 0, until: 0 };

    if (f.until > Date.now())
      return send(res, 429, { error: "محاولات كثيرة. حاول بعد قليل." });

    const { password } = await body(req, 1e4);
    if (crypto.timingSafeEqual(hash(password), hash(PASSWORD))) {
      fails.delete(ip);
      return send(res, 200, { token: makeToken() });
    }

    f.n++;
    if (f.n >= 5) {
      f.until = Date.now() + 10 * 60e3;
      f.n = 0;
    }
    fails.set(ip, f);
    return send(res, 401, { error: "كلمة المرور غير صحيحة." });
  }

  if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });

  if (isServerless && !useMongo)
    return send(res, 503, {
      error: "حفظ المشاريع على Vercel يحتاج MONGODB_URI وبيانات Cloudinary.",
    });

  if (req.method === "POST" && p === "/api/projects") {
    const b = await body(req);
    const title = String(b.title || "").trim(),
      desc = String(b.desc || "").trim(),
      link = String(b.url || "").trim();

    if (!title || title.length > 60)
      return send(res, 400, { error: "عنوان المشروع مطلوب (حتى 60 حرفًا)." });
    if (!desc || desc.length > 160)
      return send(res, 400, { error: "الوصف مطلوب (حتى 160 حرفًا)." });
    if (link && !/^https?:\/\/\S+$/.test(link))
      return send(res, 400, { error: "الرابط غير صالح." });

    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      b.image || "",
    );
    if (!m)
      return send(res, 400, { error: "الصورة مطلوبة (JPG أو PNG أو WebP)." });

    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 3e6)
      return send(res, 400, { error: "الصورة أكبر من 3MB." });

    const uploaded = await uploadImage(b.image);
    const item = {
      id: uploaded.id,
      title,
      desc,
      url: link,
      img: uploaded.url,
      createdAt: new Date().toISOString(),
    };
    await addProject(item);
    return send(res, 201, item);
  }

  const del = /^\/api\/projects\/([\w-]+)$/.exec(p);
  if (req.method === "DELETE" && del) {
    const list = await readDB(),
      item = list.find((x) => x.id === del[1]);
    if (!item) return send(res, 404, { error: "المشروع غير موجود." });
    const img = String(item.img || "");
    if (img.startsWith("/uploads/"))
      fs.rmSync(path.join(UPLOADS, path.basename(img)), { force: true });
    else
      await removeImage(img).catch((e) =>
        console.error("Cloudinary delete failed:", e.message || e),
      );
    await removeProject(item.id, Boolean(item.seed));
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "غير موجود" });
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/uploads/"))
      return serveFile(res, UPLOADS, url.pathname.slice(9), true);
    serveFile(
      res,
      PUB,
      url.pathname === "/" ? "index.html" : url.pathname.slice(1),
    );
  } catch (e) {
    const status = Number.isInteger(e.status) ? e.status : 500;
    if (status >= 500) console.error("Web Craft Studio request failed:", e);
    send(res, status, {
      error:
        status >= 500 ? "تعذّر إكمال الطلب. حاول مرة أخرى لاحقًا." : e.message,
    });
  }
}

module.exports = requestHandler;

if (require.main === module) {
  http
    .createServer(requestHandler)
    .listen(PORT, () =>
      console.log("Web Craft Studio: http://localhost:" + PORT),
    );
}
