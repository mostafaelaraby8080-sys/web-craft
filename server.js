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

const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error(
    "❌ خطأ حرج: يجب تعيين ADMIN_PASSWORD في متغيرات البيئة.\n" +
      "   مثال: ADMIN_PASSWORD='كلمة-مرور-قوية-جدًا' node server.js\n" +
      "   لا تستخدم كلمات مرور ضعيفة أو معروفة.",
  );
  process.exit(1);
}

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
  const logPath = path.join(
    LOGS,
    `${timestamp.slice(0, 10).replace(/-/g, "")}.log`,
  );
  const entry = { timestamp, level, message, ...details };
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, { flag: "a" });
  if (level === "ERROR" || level === "CRITICAL") {
    console.error(`[${level}] ${message}`, details);
  }
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

const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();

function backupDatabase() {
  if (useMongo) return;
  try {
    if (!fs.existsSync(DB)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUPS, `database-${timestamp}.json`);
    fs.copyFileSync(DB, backupFile);
    const files = fs.readdirSync(BACKUPS).sort().reverse();
    if (files.length > 10) {
      for (let i = 10; i < files.length; i++) {
        fs.rmSync(path.join(BACKUPS, files[i]), { force: true });
      }
    }
    logEvent("INFO", "تم إنشاء نسخة احتياطية من قاعدة البيانات", {
      backupFile,
    });
  } catch (error) {
    logEvent("ERROR", "فشل إنشاء النسخة الاحتياطية", { error: error.message });
  }
}
if (!isServerless) {
  setInterval(backupDatabase, 6 * 60 * 60 * 1000);
  backupDatabase();
}

const activeSessions = new Map();
const sign = (s) =>
  crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const makeToken = (ip) => {
  const exp = String(Date.now() + 7 * 864e5);
  const token = exp + "." + sign(exp);
  activeSessions.set(token, {
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ip,
  });
  return token;
};
function validToken(t) {
  const [exp, sig] = String(t || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) {
    activeSessions.delete(t);
    return false;
  }
  const a = Buffer.from(sig),
    b = Buffer.from(sign(exp));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }
  const session = activeSessions.get(t);
  if (session) session.lastActivity = Date.now();
  return true;
}
function revokeToken(token) {
  activeSessions.delete(token);
}
const isAdmin = (req) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  return validToken(token) ? token : null;
};
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();

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
    logEvent("INFO", "تم حفظ المشاريع في MongoDB", { count: list.length });
    return;
  }
  backupDatabase();
  const t = DB + ".tmp";
  fs.writeFileSync(t, JSON.stringify(list, null, 2));
  fs.renameSync(t, DB);
  logEvent("INFO", "تم حفظ المشاريع في الملف", { count: list.length });
};
async function uploadImage(dataUri) {
  if (useMongo && !hasCloudinary) {
    throw new Error("إعداد Cloudinary غير مكتمل في متغيرات بيئة النشر.");
  }
  if (!useMongo) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUri,
    );
    if (!m) throw new Error("الصورة غير صالحة.");
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
    const ip = ipOf(req);
    const failedLogins = readFailedLogins();
    const f = failedLogins[ip] || { n: 0, until: 0 };

    if (f.until > Date.now()) {
      logEvent("WARN", "محاولة دخول من عنوان IP محظور", { ip });
      return send(res, 429, { error: "محاولات كثيرة. حاول بعد قليل." });
    }

    const { password = "" } = await body(req, 1e4);
    const providedHash = hash(String(password));
    const passwordHash = hash(PASSWORD);
    if (crypto.timingSafeEqual(providedHash, passwordHash)) {
      delete failedLogins[ip];
      writeFailedLogins(failedLogins);
      const token = makeToken(ip);
      logEvent("INFO", "تسجيل دخول ناجح", { ip });
      return send(res, 200, { token });
    }

    f.n += 1;
    logEvent("WARN", "محاولة دخول فاشلة", { ip, attempt: f.n });

    if (f.n >= 5) {
      f.until = Date.now() + 10 * 60e3;
      f.n = 0;
      logEvent("WARN", "تم حظر عنوان IP بسبب محاولات دخول متعددة", { ip });
    }
    failedLogins[ip] = f;
    writeFailedLogins(failedLogins);
    return send(res, 401, { error: "كلمة المرور غير صحيحة." });
  }

  if (req.method === "POST" && p === "/api/logout") {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    revokeToken(token);
    logEvent("INFO", "تسجيل خروج", { ip: ipOf(req) });
    return send(res, 200, { ok: true });
  }

  const adminToken = isAdmin(req);
  if (!adminToken) return send(res, 401, { error: "يلزم تسجيل الدخول." });

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
    logEvent("INFO", "تم إضافة مشروع جديد", {
      id: item.id,
      title: item.title,
      ip: ipOf(req),
    });
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
    logEvent("INFO", "تم حذف مشروع", {
      id: item.id,
      title: item.title,
      ip: ipOf(req),
    });
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
  } catch (error) {
    logEvent("ERROR", "خطأ في معالجة الطلب", {
      error: error.message,
      url: req.url,
    });
    send(res, 400, { error: error.message || "خطأ" });
  }
}

module.exports = requestHandler;

if (require.main === module) {
  http
    .createServer(requestHandler)
    .listen(PORT, () =>
      console.log(
        "🚀 Web Craft Studio: http://localhost:" +
          PORT +
          "\n📁 البيانات: " +
          DATA,
      ),
    );
}
