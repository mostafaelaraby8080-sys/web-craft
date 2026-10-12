// api/index.js
const express = require("express");
const app = express();

app.use(express.json());

// ============ انسخ هنا كل كود الـ API من server.js ============
// يعني كل حاجة بتبدأ بـ app.get أو app.post أو app.delete
// زي:
app.get("/api/projects", async (req, res) => {
  // كود جلب المشاريع
});

app.post("/api/contact", async (req, res) => {
  // كود حفظ الرسالة
});

// ... وهكذا لباقي المسارات
// ============================================================

module.exports = app;
