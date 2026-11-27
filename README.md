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

Book notes are part of the website itself, so there's nothing to copy, paste or pay for. Open a book in the Learning Center and its chapter numbers are listed; pick one to read detailed notes for every section of that chapter.

- `notes/index.json` lists the books that have notes (matched by ISBN, or by title and author) and their chapters.
- Each chapter's notes are a Markdown file, for example `notes/kurose-ross-8e/ch3.md`.
- To add notes for another book, ask Claude in a Claude Code session for this repository: "Add notes for <book title>".

Notes currently included: *Computer Networking: A Top-Down Approach*, 8th edition (Kurose & Ross), chapters 1–8.

## Hosting

The site is hosted on [Vercel](https://vercel.com) and connected to this GitHub repository, so every change pushed to `main` goes live automatically.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | How it looks (also supports dark mode) |
| `app.js` | Reads the feed and draws the calendar |
| `book.html`, `book.js` | The book dashboard page, with Book Notes |
| `notes/` | The book notes: an index plus one Markdown file per chapter |
| `learn.js` | The Learning Center tab (class cards and book search) |
| `api/feed.js` | Runs on Vercel and downloads the Canvas feed for the page |
| `server.py` | Optional: runs the site on your own computer for testing (`python server.py`) |
