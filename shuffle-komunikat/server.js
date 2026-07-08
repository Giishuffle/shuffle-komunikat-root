// server.js
// Serves the intake form and handles submissions:
// build a Word doc from the answers and email it to Shuffle.

const express = require("express");
const cors = require("cors");
const path = require("path");
const { buildDoc } = require("./docBuilder");
const { Resend } = require("resend");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- config from environment (never hardcode secrets) ---
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const TO_EMAIL = process.env.TO_EMAIL || "";          // where komunikats land (you)
const FROM_EMAIL = process.env.FROM_EMAIL || "Shuffle <onboarding@resend.dev>";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function safe(s) { return String(s || "").replace(/[^\p{L}\p{N}\-_. ]/gu, "").trim().slice(0, 60); }

app.post("/api/komunikat", async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.nameHe && !d.songName && !d.tourName) {
      return res.status(400).json({ ok: false, error: "empty" });
    }

    const buffer = await buildDoc(d);
    const artist = safe(d.nameHe) || "artist";
    const title = safe(d.songName || d.tourName) || "komunikat";
    const filename = `komunikat_${artist}_${title}.docx`.replace(/\s+/g, "_");

    if (!resend || !TO_EMAIL) {
      // Not configured yet: still confirm the doc built, so you can test locally.
      console.warn("Email not configured (RESEND_API_KEY / TO_EMAIL missing).");
      return res.json({ ok: true, emailed: false, note: "doc built, email not configured" });
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `קומוניקט חדש: ${d.nameHe || "אמן"} ${d.songName || d.tourName || ""}`.trim(),
      text:
        `הגשה חדשה מהטופס.\n\n` +
        `אמן: ${d.nameHe || ""}\n` +
        `סוג: ${d.type || ""}\n` +
        `שיר/אירוע: ${d.songName || d.tourName || ""}\n` +
        `תאריך: ${d.releaseDate || ""}\n` +
        `איש קשר: ${d.prName || ""} ${d.prPhone || ""} ${d.prMail || ""}\n\n` +
        `קובץ ה-Word מצורף, מוכן לעריכה.`,
      attachments: [{ filename, content: buffer.toString("base64") }],
    });

    res.json({ ok: true, emailed: true });
  } catch (err) {
    console.error("submit error:", err);
    res.status(500).json({ ok: false, error: "server" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shuffle komunikat running on :${PORT}`));
