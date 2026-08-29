const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIG (ตั้งค่าใน Render > Environment Variables)
// ============================================================
const TRW_API_KEY   = process.env.TRW_API_KEY;   // API key จริง
const ACCESS_TOKEN  = process.env.ACCESS_TOKEN;   // token ที่คุณกำหนดเอง

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(cors({ origin: false })); // ปิด CORS คนอื่น

// ============================================================
// AUTH MIDDLEWARE — ต้องส่ง header: Authorization: Bearer <token>
// ============================================================
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!ACCESS_TOKEN || token !== ACCESS_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
}

// ============================================================
// ROUTE: GET /bypass?url=...
// ============================================================
app.get("/bypass", requireAuth, async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ success: false, message: "Missing url parameter" });
  }

  try {
    new URL(url); // validate url format
  } catch {
    return res.status(400).json({ success: false, message: "Invalid URL format" });
  }

  try {
    const apiUrl =
      "https://trw.lat/api/bypass" +
      "?apikey=" + encodeURIComponent(TRW_API_KEY) +
      "&url="    + encodeURIComponent(url);

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "BypassAD/1.0" },
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Upstream error: HTTP " + response.status,
      });
    }

    const data = await response.json();

    if (!data || !data.success || !data.result) {
      return res.status(502).json({
        success: false,
        message: data?.message || "No result from upstream",
      });
    }

    return res.json({ success: true, result: data.result });

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ success: false, message: "Upstream timeout" });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`BypassAD server running on port ${PORT}`);
});
