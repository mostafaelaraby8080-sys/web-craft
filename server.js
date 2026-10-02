"use strict";
// Backend بدون أي مكتبات: Node.js فقط.
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto"),
  os = require("os");

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
const BACKUPS = path.join(DATA, "backups");
const LOGS = path.join(DATA, "logs");
const FAILED_LOGINS_FILE = path.join(DATA, "failed-logins.json");

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(BACKUPS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

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

const PASSWORD = process.env.ADMIN_PASSWORD || "webcraft2026";
if (!process.env.ADMIN_PASSWORD)
  console.warn("⚠ استخدم متغير ADMIN_PASSWORD لتغيير كلمة المرور الافتراضية.");

const keyFile = path.join(DATA, "secret.key");
let SECRET = process.env.SECRET;
if (!SECRET) {
  if (isServerless) {
    SECRET = crypto.randomBytes(32).toString("hex");
  } else {
    try {
      SECRET = fs.readFileSync(keyFile, "utf8");
    } catch {
      SECRET = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(keyFile, SECRET, { mode: 0o600 });
    }
  }
}

function logEvent(level, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOGS, `${timestamp.slice(0, 10).replace(/-/g, "")}.log`);
  fs.appendFileSync(logFile, `${JSON.stringify({ timestamp, level, message, ...details })}\n`, {
    flag: "a",
  });
}

function readFailedLogins() {
  try {
    return JSON.parse(fs.readFileSync(FAILED_LOGINS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeFailedLogins(data) {
  fs.writeFileSync(FAILED_LOGINS_FILE, JSON.stringify(data, null, 2));
}

function readContacts() {
  try {
    return JSON.parse(fs.readFileSync(CONTACTS, "utf8"));
  } catch {
    return [];
  }
}

function writeContacts(list) {
  fs.writeFileSync(CONTACTS, JSON.stringify(list, null, 2));
}

function sanitizeText(value, max = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

const contactRateLimit = new Map();
function checkContactRateLimit(ip) {
  const now = Date.now();
  const entry = contactRateLimit.get(ip) || { count: 0, until: 0 };
  if (entry.until && entry.until > now) return false;
  if (entry.count >= 5 && entry.until && entry.until > now) return false;
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

function backupDatabase() {
  try {
    if (!fs.existsSync(DB)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUPS, `database-${ts}.json`);
    fs.copyFileSync(DB, backupFile);
    const files = fs.readdirSync(BACKUPS).sort().reverse();
    if (files.length > 10) {
      for (let i = 10; i < files.length; i++) {
        fs.rmSync(path.join(BACKUPS, files[i]), { force: true });
      }
    }
  } catch (error) {
    logEvent("ERROR", "فشل في النسخ الاحتياطي", { error: error.message });
  }
}
if (!isServerless) {
  setInterval(backupDatabase, 6 * 60 * 60 * 1000);
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
let mongoClient;
let projectsCollection;
async function getMongoCollection() {
  if (!useMongo) return null;
  if (!projectsCollection) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    projectsCollection = mongoClient
      .db(process.env.MONGODB_DB || "webcraft")
      .collection("projects");
    await projectsCollection.createIndex({ id: 1 }, { unique: true });
  }
  return projectsCollection;
}
const readDB = () => {
  if (useMongo)
    return getMongoCollection().then(async (collection) => {
      const projects = await collection
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      if (projects.length) return projects;
      await collection.insertMany(SEED);
      return SEED.slice();
    });
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch {
    return SEED.slice();
  }
};
const writeDB = async (list) => {
  if (useMongo) {
    const collection = await getMongoCollection();
    await collection.deleteMany({});
    if (list.length) await collection.insertMany(list);
    return;
  }
  const t = DB + ".tmp";
  fs.writeFileSync(t, JSON.stringify(list, null, 2));
  fs.renameSync(t, DB);
};
async function uploadImage(dataUri) {
  if (useMongo && !hasCloudinary) {
    throw new Error("إعداد Cloudinary غير مكتمل في متغيرات بيئة النشر.");
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
const fails = new Map();
const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};
function body(req, limit = 6e6) {
  return new Promise((ok, no) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        no(new Error("الطلب كبير جدًا"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        no(new Error("بيانات غير صالحة"));
      }
    });
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
};

function serveFile(res, base, rel) {
  const file = path.resolve(base, "." + path.sep + decodeURIComponent(rel));
  if (!file.startsWith(base + path.sep))
    return send(res, 403, { error: "ممنوع" });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: "غير موجود" });
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(buf);
  });
}

async function api(req, res, url) {
  const p = url.pathname;
  if (req.method === "GET" && p === "/api/projects")
    return send(res, 200, await readDB());

  if (req.method === "POST" && p === "/api/login") {
    const ip = ipOf(req), f = fails.get(ip) || { n: 0, until: 0 };
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

  if (req.method === "POST" && p === "/api/contact") {
    const ip = ipOf(req);
    if (!checkContactRateLimit(ip)) {
      return send(res, 429, { error: "تم إرسال عدد كبير من الرسائل. حاول بعد قليل." });
    }
    const b = await body(req, 1e5);
    const name = sanitizeText(b.name, 60);
    const email = sanitizeText(b.email, 120);
    const phone = sanitizeText(b.phone, 30);
    const service = sanitizeText(b.service, 60);
    const message = sanitizeText(b.message, 1000);

    if (!name || name.length < 2)
      return send(res, 400, { error: "الاسم مطلوب على الأقل حرفين." });
    if (!isValidEmail(email))
      return send(res, 400, { error: "البريد الإلكتروني غير صالح." });
    if (!message || message.length < 10)
      return send(res, 400, { error: "الرسالة مطلوبة وتجب أن تكون 10 أحرف على الأقل." });

    const list = readContacts();
    const item = {
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      service,
      message,
      ip,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    list.unshift(item);
    writeContacts(list);
    logEvent("INFO", "تم استقبال رسالة عميل جديدة", {
      id: item.id,
      email: item.email,
      ip,
    });
    return send(res, 201, { ok: true, message: "تم إرسال رسالتك بنجاح." });
  }

  if (req.method === "GET" && p === "/api/contacts") {
    if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });
    return send(res, 200, readContacts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }

  if (req.method === "PATCH" && /^\/api\/contacts\/([A-Za-z0-9-]+)$/.test(p)) {
    if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });
    const match = /^\/api\/contacts\/([A-Za-z0-9-]+)$/.exec(p);
    const id = match[1];
    const bodyData = await body(req, 1e4);
    const list = readContacts();
    const item = list.find((x) => x.id === id);
    if (!item) return send(res, 404, { error: "الرسالة غير موجودة." });
    item.status = ["new", "read", "closed"].includes(bodyData.status)
      ? bodyData.status
      : item.status;
    writeContacts(list);
    return send(res, 200, item);
  }

  if (req.method === "DELETE" && /^\/api\/contacts\/([A-Za-z0-9-]+)$/.test(p)) {
    if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });
    const match = /^\/api\/contacts\/([A-Za-z0-9-]+)$/.exec(p);
    const id = match[1];
    const list = readContacts();
    const filtered = list.filter((x) => x.id !== id);
    writeContacts(filtered);
    return send(res, 200, { ok: true });
  }

  if (!isAdmin(req)) return send(res, 401, { error: "يلزم تسجيل الدخول." });

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
    const list = (await readDB()).filter((x) => !x.seed);
    const item = {
      id: uploaded.id,
      title,
      desc,
      url: link,
      img: uploaded.url,
      createdAt: new Date().toISOString(),
    };
    await writeDB([item, ...list]);
    return send(res, 201, item);
  }

  const del = /^\/api\/projects\/([\w-]+)$/.exec(p);
  if (req.method === "DELETE" && del) {
    const list = await readDB(),
      item = list.find((x) => x.id === del[1]);
    if (!item) return send(res, 404, { error: "المشروع غير موجود." });
    if (item.img.startsWith("/uploads/"))
      fs.rmSync(path.join(UPLOADS, path.basename(item.img)), { force: true });
    else await removeImage(item.img);
    await writeDB(list.filter((x) => x.id !== del[1]));
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: "غير موجود" });
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/uploads/"))
      return serveFile(res, UPLOADS, url.pathname.slice(9));
    serveFile(
      res,
      PUB,
      url.pathname === "/" ? "index.html" : url.pathname.slice(1),
    );
  } catch (e) {
    send(res, 400, { error: e.message || "خطأ" });
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
