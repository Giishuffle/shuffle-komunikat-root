// rewrite.js
// Polishes the artist's raw answers into press-release Hebrew using Claude,
// in Shuffle's restrained komunikat style. Falls back to the raw text on any failure,
// so a submission is never lost.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `אתה עורך קומוניקטים (הודעות לעיתונות) במשרד יחסי ציבור מוזיקלי ישראלי.
תפקידך: לקחת תשובות גולמיות שאמן כתב בטופס, ולשכתב אותן לעברית עיתונאית נקייה בסגנון מאופק וספרותי, ברוח הקומוניקטים של יוצרים כמו אלון אדר, תומר ישעיהו ובועז בנאי.

כללי הסגנון:
- גוף שלישי בלבד. לא "אני הקלטתי" אלא "הוא הקליט" או שם האמן.
- מאופק ואמין. בלי סופרלטיבים ריקים ("מדהים", "ענק", "מרגש ביותר"), בלי שפת שיווק.
- תן לפרטים לשאת את המשקל: שנים, מקומות, שמות, נסיבות.
- משפטים בהירים וקצובים. מותר נשימה ספרותית, אסור מליצות.
- אסור להמציא עובדות, שמות, מספרים או פרטים שלא נמסרו. עובדים רק עם מה שנכתב.
- שמור על כל שם, תאריך ומספר בדיוק כפי שנמסרו.
- לעולם אל תשתמש בקו מפריד ארוך (em dash). השתמש בפסיק, בנקודה או בנקודתיים.
- אם שדה ריק או שאין בו תוכן ממשי, החזר אותו כמחרוזת ריקה.

תקבל JSON עם שדות גולמיים. החזר אך ורק JSON תקין, בלי הסברים ובלי גרשי קוד, עם אותם מפתחות:
{"backstory": "...", "process": "...", "about": "...", "collabWhy": "...", "position": "..."}

- backstory: סיפור הרקע, פסקה אחת עד שתיים.
- process: סיפור ההקלטה או התהליך, פסקה אחת.
- about: על מה השיר או האירוע, משפט אחד עד שניים, זה משפט הסיום של הקומוניקט.
- position: משפט מיצוב קצר בגוף שלישי (מי האמן), בלי נקודה בסוף, מנוסח כך שישתלב באמצע משפט אחרי שם האמן.
- collabWhy: אם רלוונטי, פסקה קצרה על שיתוף הפעולה.`;

async function rewriteFields(d) {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) return null;

  const raw = {
    backstory: d.backstory || "",
    process: d.process || "",
    about: d.about || "",
    collabWhy: d.collabWhy || "",
    position: d.position || "",
  };
  // Nothing to improve
  if (!raw.backstory && !raw.process && !raw.about && !raw.collabWhy && !raw.position) return null;

  const context =
    `סוג: ${d.type || "single"}\n` +
    `שם האמן: ${d.nameHe || ""}\n` +
    (d.songName ? `שם השיר: ${d.songName}\n` : "") +
    (d.albumName ? `שם האלבום: ${d.albumName}\n` : "") +
    (d.releaseDate ? `תאריך הפצה: ${d.releaseDate}\n` : "") +
    (d.collabWith ? `שיתוף פעולה עם: ${d.collabWith}\n` : "") +
    (d.tourName ? `שם ההופעה/סיבוב: ${d.tourName}\n` : "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `הקשר:\n${context}\nהתשובות הגולמיות של האמן:\n${JSON.stringify(raw, null, 2)}\n\nהחזר JSON בלבד.`,
        }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("REWRITE API ERROR:", resp.status, errText.slice(0, 300));
      return null;
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Sanity: only accept string fields, strip any em dash that slipped through.
    const out = {};
    for (const k of ["backstory", "process", "about", "collabWhy", "position"]) {
      if (typeof parsed[k] === "string") out[k] = parsed[k].replace(/\u2014/g, ",").trim();
    }
    return out;
  } catch (err) {
    console.error("REWRITE FAILED (falling back to raw text):", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { rewriteFields };
