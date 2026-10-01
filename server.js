"use strict";
// Backend بدون أي مكتبات: Node.js فقط.
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const useMongo = Boolean(process.env.MONGODB_URI);
const cloudinary = useMongo ? require("cloudinary").v2 : null;
const { MongoClient } = useMongo ? require("mongodb") : { MongoClient: null };

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION,
);
const DATA = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, "data"),
);
const UPLOADS = path.join(DATA, "uploads");
const DB = path.join(DATA, "database.json");
fs.mkdirSync(UPLOADS, { recursive: true });

if (isServerless && !process.env.DATA_DIR) {
  console.warn(
    "⚠ بيئة serverless تستخدم تخزينًا مؤقتًا. اضبط DATA_DIR على قرص دائم أو استخدم قاعدة بيانات خارجية حتى لا تختفي المشاريع بعد إعادة التشغيل.",
  );
}
if (useMongo) {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "يلزم ضبط CLOUDINARY_CLOUD_NAME وCLOUDINARY_API_KEY وCLOUDINARY_API_SECRET مع MONGODB_URI.",
    );
  }
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

// مفتاح توقيع الجلسات: من متغير SECRET أو يُولَّد ويُحفظ مرة واحدة
const keyFile = path.join(DATA, "secret.key");
let SECRET = process.env.SECRET;
if (!SECRET) {
  try {
    SECRET = fs.readFileSync(keyFile, "utf8");
  } catch {
    SECRET = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(keyFile, SECRET, { mode: 0o600 });
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

// ---- أدوات
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
