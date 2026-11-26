// Learning Center: a card for every class where you can add its books.
// Books are found by ISBN or by searching Open Library (with Google Books as a
// backup). Your book list is saved only in this browser.

const LearningCenter = (() => {
  const BOOKS_KEY = "cac.books";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loadBooks() {
    try {
      return JSON.parse(localStorage.getItem(BOOKS_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveBooks() {
    try {
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    } catch {
      /* storage full or unavailable */
    }
  }
  let books = loadBooks(); // { "BIO 101": [ {title, authors, year, isbn, cover} ] }

  // ---------- ISBN ----------
  function cleanIsbn(text) {
    const s = String(text).replace(/[\s-]/g, "").toUpperCase();
    return /^\d{9}[\dX]$/.test(s) || /^97[89]\d{10}$/.test(s) ? s : null;
  }

  // ---------- Book lookups ----------
  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const httpsUrl = (u) => (u ? u.replace(/^http:\/\//, "https://") : "");

  function fromGoogle(item) {
    const v = item.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn = (ids.find((i) => i.type === "ISBN_13") || ids.find((i) => i.type === "ISBN_10") || {}).identifier || "";
    const img = v.imageLinks || {};
    return {
      title: v.title + (v.subtitle ? `: ${v.subtitle}` : ""),
      authors: v.authors || [],
      year: (v.publishedDate || "").slice(0, 4),
      isbn,
      cover: httpsUrl(img.thumbnail || img.smallThumbnail).replace("&edge=curl", ""),
    };
  }

  async function lookupIsbn(isbn) {
    try {
      const data = await getJson(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
      );
      const b = data[`ISBN:${isbn}`];
      if (b) {
        return [{
          title: b.title + (b.subtitle ? `: ${b.subtitle}` : ""),
          authors: (b.authors || []).map((a) => a.name),
          year: (String(b.publish_date || "").match(/\d{4}/) || [""])[0],
          isbn,
          cover: (b.cover && (b.cover.large || b.cover.medium)) || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
        }];
      }
    } catch {
      /* try Google Books next */
    }
    const g = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    return (g.items || []).slice(0, 1).map(fromGoogle).map((b) => ({ ...b, isbn }));
  }

  async function searchBooks(query) {
    const q = encodeURIComponent(query);
    try {
      const data = await getJson(
        `https://openlibrary.org/search.json?q=${q}&limit=12&fields=key,title,subtitle,author_name,first_publish_year,isbn,cover_i`
      );
      const found = (data.docs || []).map((d) => {
        const isbns = d.isbn || [];
        return {
          title: d.title + (d.subtitle ? `: ${d.subtitle}` : ""),
          authors: d.author_name || [],
          year: d.first_publish_year ? String(d.first_publish_year) : "",
          isbn: isbns.find((i) => i.length === 13) || isbns[0] || "",
          cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : "",
        };
      });
      if (found.length) return found;
    } catch {
      /* try Google Books next */
    }
    const g = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=12&printType=books`);
    return (g.items || []).map(fromGoogle);
  }

  // ---------- Rendering ----------
  function coverHtml(b) {
    const fallback = `<div class="cover-fallback"><span>${esc(b.title)}</span></div>`;
    if (!b.cover) return `<div class="cover">${fallback}</div>`;
    // If the image fails to load, show a plain colored cover with the title.
    return `<div class="cover"><img src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}" loading="lazy"
      onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cover-fallback',innerHTML:this.dataset.fb}))"
      data-fb="${esc(`<span>${esc(b.title)}</span>`)}"></div>`;
  }

  function bookTile(b, buttonLabel, buttonClass) {
    const by = b.authors && b.authors.length ? b.authors.slice(0, 2).join(", ") : "";
    return `<div class="book">
      ${coverHtml(b)}
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        ${by ? `<div class="book-meta">${esc(by)}</div>` : ""}
        <div class="book-meta">${[b.year, b.isbn && `ISBN ${b.isbn}`].filter(Boolean).map(esc).join(" · ")}</div>
      </div>
      <button class="btn btn-small ${buttonClass}">${buttonLabel}</button>
    </div>`;
  }

  const sameBook = (a, b) => (a.isbn && a.isbn === b.isbn) || (a.title === b.title && a.year === b.year);

  function renderShelf(card, course) {
    const shelf = card.querySelector(".shelf");
    const list = books[course] || [];
    if (!list.length) {
      shelf.innerHTML = `<p class="shelf-empty">No books yet.</p>`;
      return;
    }
    shelf.innerHTML = list.map((b) => bookTile(b, "Remove", "btn-ghost")).join("");
    shelf.querySelectorAll(".book").forEach((el, i) => {
      el.querySelector("button").onclick = () => {
        books[course].splice(i, 1);
        if (!books[course].length) delete books[course];
        saveBooks();
        renderShelf(card, course);
      };
    });
  }

  function showResults(card, course, results, note) {
    const box = card.querySelector(".results");
    box.innerHTML =
      `<div class="results-head"><span>${esc(note)}</span><button class="link-btn">Close</button></div>` +
      `<div class="result-grid${results.length === 1 ? " single" : ""}">${results
        .map((b) => {
          const added = (books[course] || []).some((x) => sameBook(x, b));
          return bookTile(b, added ? "Added" : "Add", added ? "btn-ghost" : "");
        })
        .join("")}</div>`;
    box.querySelector(".link-btn").onclick = () => (box.innerHTML = "");
    box.querySelectorAll(".result-grid .book").forEach((el, i) => {
      const btn = el.querySelector("button");
      if (btn.textContent === "Added") btn.disabled = true;
      btn.onclick = () => {
        (books[course] ||= []).push(results[i]);
        saveBooks();
        btn.textContent = "Added";
        btn.classList.add("btn-ghost");
        btn.disabled = true;
        renderShelf(card, course);
      };
    });
  }

  async function find(card, course, query) {
    const box = card.querySelector(".results");
    query = query.trim();
    if (!query) return;
    const isbn = cleanIsbn(query);
    box.innerHTML = `<p class="results-msg">${isbn ? "Looking up that ISBN…" : "Searching…"}</p>`;
    try {
      const results = isbn ? await lookupIsbn(isbn) : await searchBooks(query);
      if (!results.length) {
        box.innerHTML = `<p class="results-msg">${
          isbn ? "No book found with that ISBN. Check the number, or search by title instead." : "No books found. Try different words."
        }</p>`;
        return;
      }
      showResults(card, course, results, isbn ? "Found this book:" : `${results.length} results for “${query}”`);
    } catch {
      box.innerHTML = `<p class="results-msg error">Couldn't reach the book search. Check your connection and try again.</p>`;
    }
  }

  function render(courses, colors) {
    const list = document.getElementById("classList");
    list.innerHTML = "";
    if (!courses.length) {
      list.innerHTML = `<p class="learn-intro">No classes found yet. Load your Canvas feed first.</p>`;
      return;
    }
    for (const course of courses) {
      const card = document.createElement("section");
      card.className = "class-card";
      card.style.setProperty("--c", colors[course]);
      card.innerHTML = `
        <div class="class-band"><h3>${esc(course)}</h3></div>
        <div class="class-body">
          <h4>Books</h4>
          <div class="shelf"></div>
          <form class="book-form">
            <input type="search" placeholder="ISBN, or search by title or author" aria-label="ISBN or book search for ${esc(course)}">
            <button class="btn" type="submit">Find</button>
          </form>
          <div class="results"></div>
        </div>`;
      card.querySelector("form").onsubmit = (ev) => {
        ev.preventDefault();
        find(card, course, card.querySelector("input").value);
      };
      renderShelf(card, course);
      list.appendChild(card);
    }
  }

  return { render, cleanIsbn };
})();

if (typeof module !== "undefined") module.exports = LearningCenter;
