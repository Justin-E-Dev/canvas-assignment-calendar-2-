// Checks the book notes in notes/ before they're saved.
// Run: node scripts/check-notes.js   (exits with an error message if something's wrong)

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const problems = [];
const fail = (msg) => problems.push(msg);

let index;
try {
  index = JSON.parse(fs.readFileSync(path.join(root, "notes/index.json"), "utf8"));
} catch (err) {
  console.error("notes/index.json is not valid JSON: " + err.message);
  process.exit(1);
}

if (!Array.isArray(index.books)) fail("notes/index.json needs a \"books\" list");
const ids = new Set();

for (const book of index.books || []) {
  const where = `book "${book.id || book.edition || "?"}"`;
  for (const key of ["id", "isbns", "match", "edition", "source", "chapters"]) {
    if (!(key in book)) fail(`${where}: missing "${key}"`);
  }
  if (ids.has(book.id)) fail(`${where}: duplicate id`);
  ids.add(book.id);
  if (!Array.isArray(book.isbns) || book.isbns.some((i) => !/^[0-9X]{10}([0-9]{3})?$/.test(i))) fail(`${where}: isbns must be digits only`);
  if (!book.match || !book.match.title || !book.match.author) fail(`${where}: match needs title and author`);
  if (!Array.isArray(book.chapters) || !book.chapters.length) {
    fail(`${where}: no chapters`);
    continue;
  }
  for (const ch of book.chapters) {
    const label = `${where} chapter ${ch.number}`;
    if (!ch.number || !ch.title || !ch.file) {
      fail(`${label}: needs number, title and file`);
      continue;
    }
    const md = path.join(root, ch.file);
    if (!ch.file.startsWith("notes/") || !fs.existsSync(md)) {
      fail(`${label}: missing ${ch.file}`);
      continue;
    }
    if (!/^##\s/m.test(fs.readFileSync(md, "utf8"))) fail(`${label}: ${ch.file} has no "## " sections`);

    const studyFile = md.replace(/\.md$/, ".study.json");
    if (!fs.existsSync(studyFile)) {
      fail(`${label}: missing ${path.relative(root, studyFile)}`);
      continue;
    }
    let study;
    try {
      study = JSON.parse(fs.readFileSync(studyFile, "utf8"));
    } catch (err) {
      fail(`${label}: study file is not valid JSON (${err.message})`);
      continue;
    }
    for (const key of ["keyConcepts", "flashcards", "quiz"]) {
      if (!Array.isArray(study[key]) || !study[key].length) fail(`${label}: study file needs a non-empty "${key}" list`);
    }
    (study.keyConcepts || []).forEach((k, i) => { if (!k.title || !k.text) fail(`${label}: key concept ${i + 1} needs title and text`); });
    (study.flashcards || []).forEach((c, i) => { if (!c.front || !c.back) fail(`${label}: flashcard ${i + 1} needs front and back`); });
    (study.quiz || []).forEach((q, i) => {
      const ok = q.q && q.explain && Array.isArray(q.options) && q.options.length === 4 &&
        new Set(q.options).size === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4;
      if (!ok) fail(`${label}: quiz question ${i + 1} needs q, 4 different options, answer 0-3 and explain`);
    });
  }
}

if (problems.length) {
  console.error("Problems with the notes:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Notes OK: ${index.books.length} book(s), ${index.books.reduce((n, b) => n + b.chapters.length, 0)} chapter(s).`);
