# Canvas Assignment Calendar

A bold, colorful assignment board built from your Canvas calendar feed. It shows:

- A week board with one column per day and each assignment as a colored card
- Each course in its own color
- A "Due in the next…" list you can set to 1 week, 2 weeks, or a month
- A time estimate on every assignment (guessed from its title and description; click a card to change it), plus totals per day, per week and for the "Due in the next…" list
- A **Learning Center** tab with a card for every class, where you can add each class's books by ISBN or by searching (with cover previews, from Open Library or Google Books)
- A **book dashboard** for each book (click **Open**), with AI-written **Chapter Notes**: pick a chapter and get its key concepts, terms and test takeaways
- Check-offs for finished work (tap the circle on a card; saved in your browser)

No accounts or API tokens needed.

## Use it

1. In Canvas, open **Calendar** (far-left menu) and click **Calendar Feed** (right side, near the bottom).
2. Copy the whole link. It's long and ends in `.ics`.
3. Open the website, paste the link and click **Load**. Click **Refresh** any time to get the latest assignments.

Keep the feed link private. Anyone who has it can see your calendar. The website saves it only in your own browser and never stores it on the server or in this code.

You can also download the `.ics` file from Canvas and use **Load .ics file** instead.

## Setting up AI Chapter Notes

Chapter Notes use Claude, Anthropic's AI, through `api/study.js`. It needs an Anthropic API key:

1. Create a key at [console.anthropic.com](https://console.anthropic.com) (API usage is paid; one chapter's notes typically costs a few cents).
2. In Vercel, open the project, go to **Settings → Environment Variables**, and add `ANTHROPIC_API_KEY` with your key.
3. Redeploy (Deployments → ⋯ → Redeploy) so the site picks it up.

Never put the key in this code. Notes are saved in your browser after the first time, so opening them again is free.

## Hosting

The site is hosted on [Vercel](https://vercel.com) and connected to this GitHub repository, so every change pushed to `main` goes live automatically.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | How it looks (also supports dark mode) |
| `app.js` | Reads the feed and draws the calendar |
| `book.html`, `book.js` | The book dashboard page, with Chapter Notes |
| `api/study.js` | Runs on Vercel and asks Claude for chapter lists and chapter notes |
| `package.json` | Lists the Anthropic code library Vercel installs for `api/study.js` |
| `learn.js` | The Learning Center tab (class cards and book search) |
| `api/feed.js` | Runs on Vercel and downloads the Canvas feed for the page |
| `server.py` | Optional: runs the site on your own computer for testing (`python server.py`) |
