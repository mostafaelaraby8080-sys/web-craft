# Web Craft Studio (مع Backend)

## التشغيل محليًا

يلزم Node.js 18 أو أحدث.

    npm install
    cp .env.example .env   # ثم عدّل القيم داخل .env
    npm start

أو مباشرة بدون ملف:

    ADMIN_PASSWORD="كلمة-مرور-قوية" SECRET="مفتاح-عشوائي-طويل" node server.js

السيرفر يقرأ ملف `.env` تلقائيًا إن وُجد (بدون أي مكتبة إضافية).

ثم افتح http://localhost:3000

## البنية

- `server.js`: السيرفر، ويخدم الموقع من `public/` ويوفر الـ API.
- `public/`: ملفات الموقع (index.html, style.css, script.js, images).
- `data/`: يُنشأ تلقائيًا، ويحتوي `database.json` ورسائل التواصل وصور المشاريع
  في `uploads/`. **خذ منه نسخة احتياطية.**

## المتغيرات

- `ADMIN_PASSWORD`: كلمة مرور المدير. لا توجد كلمة مرور افتراضية؛ دخول المدير
  يتوقف حتى تضبط هذا المتغير.
- `SECRET`: مفتاح طويل وعشوائي لتوقيع الجلسات. يُحفظ تلقائيًا محليًا إذا لم
  تضبطه، لكنه مطلوب في Vercel وبيئات serverless حتى تظل الجلسة صالحة بين الطلبات.
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
- `POST /api/contact`: حفظ رسالة تواصل (للجميع، مع تحديد للمحاولات).
- `GET /api/contact` (مدير): عرض أحدث 100 رسالة تواصل.
- `POST /api/login` `{password}`: يرجع `token` (صالح 7 أيام).
- `POST /api/projects` (مدير): `{title, desc, url?, image}`.
- `DELETE /api/projects/:id` (مدير).

تُحفظ رسائل التواصل محليًا في `data/contacts.json`، أو في مجموعة `contacts`
داخل MongoDB عند استخدام Vercel أو قاعدة بيانات. لا تستخدم التخزين المحلي
لمحتوى الزوار على استضافة serverless.

بعد تسجيل دخول المدير، يظهر زر **رسائل العملاء** في قسم التواصل لعرض الرسائل
وتحديثها. يتحقق الموقع من صلاحية الجلسة المحفوظة عند فتح الصفحة، ويخفي أدوات
الإدارة إذا انتهت صلاحيتها.

## النشر

للنشر على Vercel أو AWS Lambda اضبط `ADMIN_PASSWORD` و`SECRET` و`MONGODB_URI`
وكل بيانات Cloudinary في متغيرات البيئة. عندها تُحفظ بيانات المشاريع في MongoDB
Atlas والصور في Cloudinary، ولا يعتمد التطبيق على القرص المؤقت. لا تضع هذه القيم
داخل GitHub.

ملف `vercel.json` يوجّه الطلبات إلى دالة Vercel serverless، لذلك بعد ربط
المستودع بـ Vercel يجب إعادة النشر (Redeploy) وإضافة متغيرات البيئة في إعدادات
المشروع.
