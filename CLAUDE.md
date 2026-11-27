# Notes for Claude

- The live site is deployed by Vercel from the `main` branch.
- The owner wants every finished update pushed live: after committing a change
  and testing it, push it to `main` as well as the working branch, without asking first.

## Adding book notes

When asked to "add notes for <book>": follow `notes/HOW-TO-WRITE-NOTES.md`
exactly. Default to **condensed** notes unless full notes are requested, write
only the chapters asked for (all chapters if not specified), run
`node scripts/check-notes.js`, then commit and push. Keep it quick: one web
search for the table of contents, one Write per file, no browser testing.
