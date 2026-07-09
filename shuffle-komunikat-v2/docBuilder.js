// docBuilder.js
// Turns submitted form data into an RTL Hebrew .docx buffer,
// matching the copy/voice of the on-screen preview.

const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, BorderStyle,
} = require("docx");

const RED = "FF0040";
const INK = "0E0E11";
const MUTED = "6B6B72";
const FONT = "Arial"; // reliable Hebrew rendering in Word

const typeLabels = { single: "סינגל", clip: "קליפ", tour: "הופעה", collab: "שיתוף פעולה" };

// ---- small run/paragraph helpers (all RTL) ----
function run(text, opts = {}) {
  return new TextRun({
    text,
    rightToLeft: true,
    font: FONT,
    size: opts.size || 22,          // half-points (22 = 11pt)
    bold: !!opts.bold,
    color: opts.color || INK,
    allCaps: !!opts.caps,
  });
}
function P(children, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align || AlignmentType.RIGHT,
    spacing: { after: opts.after != null ? opts.after : 160, line: 300 },
    border: opts.border,
    children: Array.isArray(children) ? children : [children],
  });
}
const bottomBorder = { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 6 } };
const lightBorder = { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } };

function q(s) { return '"' + s + '"'; }

// ---- the same writing logic as the preview ----
function buildBodyStrings(d) {
  const name = (d.nameHe || "האמן").trim();
  const song = (d.songName || "").trim();
  const album = (d.albumName || "").trim();
  const pos = (d.position || "").trim();
  const about = (d.about || "").trim();
  const back = (d.backstory || "").trim();
  const proc = (d.process || "").trim();
  const parts = [];

  if (d.type === "tour") {
    const tourName = (d.tourName || "").trim();
    let lead = pos ? `${name}, ${pos}, יוצא לדרך.` : `${name} יוצא לדרך.`;
    if (tourName) lead = `${tourName}. ${lead}`;
    parts.push(lead);
    if (back) parts.push(back);
    if (about) parts.push(about);
    return parts;
  }

  const withName = (d.collabWith || "").trim();
  let open;
  if (d.type === "collab" && withName && song) {
    open = `${name} ו${withName} משחררים יחד את ${q(song)}.`;
  } else if (song && album) {
    open = `${name}${pos ? ", " + pos + "," : ""} משחרר את ${q(song)}, מתוך האלבום ${q(album)}.`;
  } else if (song) {
    open = `${name}${pos ? ", " + pos + "," : ""} משחרר את ${q(song)}.`;
  } else {
    open = `${name}${pos ? ", " + pos + "." : "."}`;
  }
  parts.push(open);
  if (back) parts.push(back);
  if (d.type === "collab" && (d.collabWhy || "").trim()) parts.push(d.collabWhy.trim());
  if (proc) parts.push(proc);
  if (about) parts.push(about);
  return parts;
}

function creditsLine(d) {
  const rows = [];
  const add = (lab, val) => { if (val && val.trim()) rows.push(`${lab}: ${val.trim()}`); };
  add("מילים", d.cWords); add("לחן", d.cMusic);
  add("הפקה מוזיקלית", d.cProd); add("עיבוד", d.cArr);
  if (d.type === "clip") add("בימוי הקליפ", d.cClip);
  add("נגנים", d.cMusicians); add("הקלטה", d.cStudio); add("מיקס ומאסטרינג", d.cMix);
  return rows;
}

// Build the hero image paragraph, scaled to fit the content width (~600px).
function imageParagraph(img) {
  try {
    if (!img || !img.data) return null;
    const buf = Buffer.from(img.data, "base64");
    const maxW = 600;
    const natW = Number(img.w) || maxW;
    const natH = Number(img.h) || maxW;
    const width = Math.min(maxW, natW);
    const height = Math.round(width * (natH / natW));
    const type = (img.type === "png" || img.type === "gif" || img.type === "bmp") ? img.type : "jpg";
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 220 },
      children: [new ImageRun({ type, data: buf, transformation: { width, height } })],
    });
  } catch (e) {
    console.warn("image skipped:", e.message);
    return null;
  }
}

function buildDoc(d) {
  const kids = [];

  if (d.bsd) kids.push(P(run('בס"ד', { size: 18, color: MUTED }), { align: AlignmentType.LEFT, after: 120 }));

  const hero = imageParagraph(d.image);
  if (hero) kids.push(hero);

  // eyebrow
  kids.push(P(run(`${typeLabels[d.type] || ""} · לפרסום מיידי`, { size: 16, bold: true, color: RED, caps: false }), { after: 100 }));

  // artist name
  if (d.nameHe) kids.push(P(run(d.nameHe, { size: 44, bold: true }), { after: 40 }));
  if (d.nameEn) kids.push(P(new TextRun({ text: d.nameEn, font: FONT, size: 20, color: MUTED }), { after: 120 }));

  // release line
  if (d.type !== "tour") {
    const bits = [];
    if (d.songName) bits.push(d.type === "clip" ? "וידאו קליפ חדש" : "סינגל חדש");
    if (d.albumName) bits.push(`מתוך האלבום "${d.albumName}"`);
    if (bits.length || d.releaseDate) {
      const runs = [];
      if (bits.length) runs.push(run(bits.join(", ") + (d.releaseDate ? " · " : ""), { size: 22, bold: true }));
      if (d.releaseDate) {
        runs.push(run("יוצא לאוויר ", { size: 22, bold: true }));
        runs.push(run(d.releaseDate, { size: 22, bold: true, color: RED }));
      }
      kids.push(P(runs, { border: bottomBorder, after: 260 }));
    }
  }

  // body
  const body = buildBodyStrings(d).filter(Boolean);
  if (body.length) body.forEach((p) => kids.push(P(run(p, { size: 23 }), { after: 180 })));

  // tour dates
  if (d.type === "tour" && Array.isArray(d.dates)) {
    d.dates.forEach((r) => {
      if (!(r.date || r.venue || r.city)) return;
      const runs = [
        run((r.date || "") + "   ", { bold: true, color: RED }),
        run(r.venue || "", {}),
      ];
      if (r.city) runs.push(run("   " + r.city, { color: MUTED }));
      kids.push(P(runs, { border: lightBorder, after: 60 }));
    });
    kids.push(P(run("", {}), { after: 120 }));
  }

  // credits
  if (d.type !== "tour") {
    const cr = creditsLine(d);
    if (cr.length) {
      kids.push(P(run("קרדיטים", { bold: true, size: 20 }), { after: 60 }));
      cr.forEach((c) => kids.push(P(run(c, { size: 20, color: "333333" }), { after: 40 })));
    }
    const meta = [];
    if (d.bpm) meta.push("BPM " + d.bpm);
    if (d.key) meta.push("סולם " + d.key);
    if (d.dur) meta.push("אורך " + d.dur);
    if (meta.length) kids.push(P(run("מטא דאטה לרדיו: " + meta.join(" · "), { size: 18, color: MUTED }), { after: 120 }));
  }

  // links
  const links = [];
  if (d.lStream) links.push("סטרימינג: " + d.lStream);
  if (d.lFolder) links.push("תיקיית חומרים: " + d.lFolder);
  if (d.lInsta) links.push("אינסטגרם: " + d.lInsta);
  if (links.length) links.forEach((l) => kids.push(P(run(l, { size: 20, color: RED }), { after: 40 })));

  // contact
  const cp = [];
  if (d.prName) cp.push(d.prName);
  if (d.prPhone) cp.push(d.prPhone);
  if (d.prMail) cp.push(d.prMail);
  if (cp.length) kids.push(P(run("ליצירת קשר: " + cp.join(" · "), { size: 18, color: MUTED }), { border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 8 } }, after: 80 }));

  kids.push(P(run("Made with Shuffle", { size: 15, color: MUTED }), { align: AlignmentType.LEFT, after: 0 }));

  const doc = new Document({
    creator: "Shuffle",
    title: "קומוניקט",
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } },
      },
      children: kids,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDoc };
