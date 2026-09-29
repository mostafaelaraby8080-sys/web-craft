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
- `DATA_DIR`: مكان حفظ البيانات (الافتراضي `./data`).

## الـ API

- `GET /api/projects`: عرض المشاريع (للجميع).
- `POST /api/login` `{password}`: يرجع `token` (صالح 7 أيام).
- `POST /api/projects` (مدير): `{title, desc, url?, image}`.
- `DELETE /api/projects/:id` (مدير).

## النشر

يلزم استضافة تشغّل Node.js وتوفّر قرص تخزين دائم للمجلد `data/` (مثل VPS أو Render مع Disk أو Railway مع Volume). ضع `DATA_DIR` على مسار القرص الدائم، وشغّل خلف HTTPS.
