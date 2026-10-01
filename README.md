# Web Craft Studio (مع Backend)

## التشغيل محليًا

يلزم Node.js 18 أو أحدث (لا توجد مكتبات للتثبيت).

    ADMIN_PASSWORD="كلمة-مرور-قوية" node server.js

ثم افتح http://localhost:3000

## البنية

- `server.js`: السيرفر، ويخدم الموقع من `public/` ويوفر الـ API.
- `public/`: ملفات الموقع (index.html, style.css, script.js, images).
- `data/`: يُنشأ تلقائيًا، ويحتوي `projects.json` وصور المشاريع في `uploads/`. **خذ منه نسخة احتياطية.**

## المتغيرات

- `ADMIN_PASSWORD`: كلمة مرور المدير (غيّرها دائمًا).
- `SECRET`: مفتاح توقيع الجلسات (اختياري، يُولَّد تلقائيًا).
- `PORT`: المنفذ (الافتراضي 3000).
- `DATA_DIR`: مكان حفظ البيانات (الافتراضي `./data`). يجب أن يشير في بيئات
  الاستضافة إلى قرص دائم، وليس إلى مجلد مؤقت.
- `MONGODB_URI`: رابط MongoDB Atlas. عند ضبطه تُحفظ المشاريع في قاعدة البيانات
  بدل ملف محلي.
- `MONGODB_DB`: اسم قاعدة البيانات (الافتراضي `webcraft`).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`:
  بيانات Cloudinary لرفع صور المشاريع بشكل دائم.

## الـ API

- `GET /api/projects`: عرض المشاريع (للجميع).
- `POST /api/login` `{password}`: يرجع `token` (صالح 7 أيام).
- `POST /api/projects` (مدير): `{title, desc, url?, image}`.
- `DELETE /api/projects/:id` (مدير).

## النشر

للنشر على Vercel أو AWS Lambda اضبط `MONGODB_URI` وبيانات Cloudinary في متغيرات
البيئة. عندها تُحفظ بيانات المشاريع في MongoDB Atlas والصور في Cloudinary، ولا
يعتمد التطبيق على القرص المؤقت. لا تضع هذه القيم داخل GitHub.

ملف `vercel.json` يوجّه الطلبات إلى دالة Vercel serverless، لذلك بعد ربط
المستودع بـ Vercel يجب إعادة النشر (Redeploy) وإضافة متغيرات البيئة في إعدادات
المشروع.
