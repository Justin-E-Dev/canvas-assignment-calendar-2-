# How to write book notes

This is the spec Claude follows when adding notes for a book (either in a chat or
automatically from the website's **Ask Claude for notes** button). Follow the
existing example in `notes/kurose-ross-8e/` exactly.

## What to produce

For one book, create a folder `notes/<book-id>/` where `<book-id>` is a short
lowercase slug, e.g. `campbell-biology-11e` (author/title words plus edition).

Inside it, for **every chapter**:

1. `chN.md` – the notes for chapter N (Markdown, format below).
2. `chN.study.json` – key concepts, flashcards and quiz (JSON, format below).

Then add the book to `notes/index.json` (format below). Don't touch other
books' files or anything outside `notes/`.

## Research first

1. Search the web for the book's table of contents for this edition (publisher
   page, course syllabi, library records, previews). Use the ISBN, title,
   author and year you were given.
2. Use the real chapter and section numbers and titles when you can find them.
   If you can't find the exact edition, use the closest edition you can find,
   and say so in the index entry's `source` text.
3. If you can't find the table of contents at all, still write notes: base the
   chapters on what a book with this title and subject normally covers, and
   say clearly in `source` that the chapter list is a best guess.
4. **Write everything in your own words.** Never copy text from the book or
   from websites.

## Detail level

The request says `full` or `condensed`:

- **full**: thorough, section-by-section explanations (roughly 3,000–8,000
  words per chapter), with worked examples, formulas and step-by-step
  processes, like `notes/kurose-ross-8e/ch3.md`.
- **condensed**: the key points of each section as bullets (roughly
  800–2,000 words per chapter).

Both levels get the same study file: 8–12 key concepts, 20–40 flashcards and
12–16 quiz questions per chapter.

## `chN.md` format

The website reads a small subset of Markdown, so stick to this:

```
# Chapter 3: Transport Layer

One intro paragraph about what the chapter covers.

## 3.1 Section Title

Paragraphs, and lists:
- Bullet point with **bold** terms and `code`.
  - One level of nested bullets (indent 2 spaces).
1. Numbered steps
2. Like this

### A sub-heading inside a section

## Key terms
- **Term:** short definition.

## Quick review
- Things a student should be able to do for a test.
```

Rules:
- `#` once at the top (chapter title). `##` for each section, starting with its
  number (`## 3.1 Title`). `###` for sub-headings.
- Only bullets (`- `), numbered lists (`1. `), one nesting level (2-space
  indent), `**bold**`, `*italic*` and `` `code` ``. No tables, images, links or
  HTML.
- Leave a blank line between paragraphs.
- End every chapter with `## Key terms` and `## Quick review`.

## `chN.study.json` format

```json
{
  "keyConcepts": [
    { "title": "Short title", "text": "1-3 sentences. **Bold** allowed." }
  ],
  "flashcards": [
    { "front": "Question or term", "back": "Answer or definition" }
  ],
  "quiz": [
    {
      "q": "Question text?",
      "options": ["Correct answer", "Wrong 1", "Wrong 2", "Wrong 3"],
      "answer": 0,
      "explain": "Why the correct answer is right."
    }
  ]
}
```

Rules:
- Valid JSON (double quotes, no trailing commas). Use single quotes inside
  text if you need quotation marks.
- Every quiz question has exactly 4 different options. `answer` is the index
  (0-3) of the correct one. Putting the correct answer first is fine; the
  website shuffles options.
- Wrong options should be plausible, not silly.

## `notes/index.json` entry

Add one object to the `books` array (keep the existing books):

```json
{
  "id": "campbell-biology-11e",
  "isbns": ["9780134093413"],
  "match": { "title": "campbell biology", "author": "urry" },
  "edition": "Campbell Biology, 11th edition (2016)",
  "source": "Study notes written by Claude from the 11th edition's table of contents and its own knowledge of the topics. Not taken from the book; check anything important against your copy.",
  "chapters": [
    { "number": "1", "title": "Evolution, the Themes of Biology, and Scientific Inquiry", "file": "notes/campbell-biology-11e/ch1.md" }
  ]
}
```

- `isbns`: digits only (no dashes). Include the ISBN you were given, plus other
  ISBNs of the same edition if you find them.
- `match.title`: a lowercase phrase that appears in the book's title.
  `match.author`: lowercase last name of the first author. These let the
  website recognize the book even if it was added with a different ISBN.
- `chapters[].file` must point to the `.md` file; the `.study.json` file must
  sit next to it with the same name.

## Before finishing

- Every chapter listed in `index.json` has both files.
- All JSON files parse.
- No files changed outside `notes/`.
