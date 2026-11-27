# Canvas Assignment Calendar

A bold, colorful assignment board built from your Canvas calendar feed. It shows:

- A week board with one column per day and each assignment as a colored card
- Each course in its own color
- A "Due in the next…" list you can set to 1 week, 2 weeks, or a month
- A time estimate on every assignment (guessed from its title and description; click a card to change it), plus totals per day, per week and for the "Due in the next…" list
- A **Learning Center** tab with a card for every class, where you can add each class's books by ISBN or by searching (with cover previews, from Open Library or Google Books)
- A **book dashboard** for each book (click **Open**), with **Book Notes**: pick a chapter number to read detailed notes for every section
- Check-offs for finished work (tap the circle on a card; saved in your browser)

No accounts or API tokens needed.

## Use it

1. In Canvas, open **Calendar** (far-left menu) and click **Calendar Feed** (right side, near the bottom).
2. Copy the whole link. It's long and ends in `.ics`.
3. Open the website, paste the link and click **Load**. Click **Refresh** any time to get the latest assignments.

Keep the feed link private. Anyone who has it can see your calendar. The website saves it only in your own browser and never stores it on the server or in this code.

You can also download the `.ics` file from Canvas and use **Load .ics file** instead.

## Book Notes

Book covers are real cover images looked up on Google Books (then Open Library) by ISBN. Book notes are part of the website itself, so there's nothing to copy, paste or pay for. Open a book in the Learning Center and its chapter numbers are listed; pick one to read detailed notes for every section of that chapter.

- `notes/index.json` lists the books that have notes (matched by ISBN, or by title and author) and their chapters.
- Each chapter's notes are a Markdown file, for example `notes/kurose-ross-8e/ch3.md`.
- Each chapter also has study tools in a matching `.study.json` file (for example `notes/kurose-ross-8e/ch3.study.json`): **Key Concepts**, **Flashcards** (flip, shuffle) and a **Practice Quiz** (multiple choice with explanations and a score). They appear at the top of the chapter, above the full notes.
- **Other books: press "Generate this chapter".** Opening a book loads its chapter list; on each chapter, the button has Google's free Gemini write condensed notes, key concepts, flashcards and a quiz in one request (usually 20–60 seconds). Results are saved in your browser; **Regenerate chapter** (top right) writes it again. Needs a free `GEMINI_API_KEY` in Vercel (Settings → Environment Variables; get one at [Google AI Studio](https://aistudio.google.com/apikey)), then redeploy. Free limits reset daily at midnight Pacific time; each Gemini model has its own limit and the site switches models when one runs out.
- Notes can also be added to the site itself by asking Claude in a chat ("Add notes for <book title>"), following `notes/HOW-TO-WRITE-NOTES.md`.

## Use it on any device (phone, other computers)

Save your Canvas feed link in Vercel once, and every device loads your calendar without pasting it:
Vercel → your project → **Settings → Environment Variables** → add `CANVAS_FEED_URL` with your feed link (tick Production) → **Redeploy**.
The link stays private: it lives only in Vercel, not in this code. (Anyone who opens your site can see your assignments, so keep the site's address to yourself.)

## Hosting

The site is hosted on [Vercel](https://vercel.com) and connected to this GitHub repository, so every change pushed to `main` goes live automatically.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | How it looks (also supports dark mode) |
| `app.js` | Reads the feed and draws the calendar |
| `book.html`, `book.js`, `book.css` | The book dashboard: chapters in a sidebar, and notes, key concepts, flashcards and quiz in panels that each scroll on their own |
| `api/gemini.js` | Runs on Vercel and asks Gemini to write a chapter list or a chapter (streamed) |
| `notes/` | The book notes: an index plus one Markdown file per chapter |
| `learn.js` | The Learning Center tab (class cards and book search) |
| `api/feed.js` | Runs on Vercel and downloads the Canvas feed for the page |
| `server.py` | Optional: runs the site on your own computer for testing (`python server.py`) |

## Sync between devices

Books, Gemini notes, check-offs, time estimates and quiz scores sync between your
computer and phone through a free Upstash Redis database (`api/sync.js`, `sync.js`).
Set it up once in Vercel: **Storage → Create Database → Upstash for Redis (free)**,
connect it to this project, then redeploy. Vercel adds the database's URL and token
as environment variables automatically. Without it, everything still works, but
each device keeps its own copy. The Canvas feed link is never synced.
