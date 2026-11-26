"""
Local test server for Canvas Assignment Calendar.

On the real website, Vercel runs api/feed.js to download your Canvas feed.
This file does the same job on your own computer, for testing.

Run:   python server.py
Open:  http://localhost:8000
Stop:  Ctrl + C
"""

import http.server
import json
import socketserver
import urllib.parse
import urllib.request

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/feed":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            url = json.loads(self.rfile.read(length) or b"{}").get("url", "")
        except (ValueError, AttributeError):
            return self.reply_error(400, "Bad request")

        url = str(url).strip()
        if url.lower().startswith("webcal://"):
            url = "https://" + url[len("webcal://"):]
        target = urllib.parse.urlparse(url)
        if target.scheme != "https" or not target.hostname or not target.path.startswith("/feeds/calendars/"):
            return self.reply_error(
                400, "That doesn't look like a Canvas calendar feed link. It should contain /feeds/calendars/."
            )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "canvas-assignment-calendar"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read()
        except Exception as err:
            return self.reply_error(502, f"Couldn't download the feed ({err}). Check that you copied the whole link.")

        self.send_response(200)
        self.send_header("Content-Type", "text/calendar; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def reply_error(self, code, message):
        body = json.dumps({"error": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Keep the terminal quiet, and never print the private feed link.
        pass


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Canvas Assignment Calendar running at http://localhost:{PORT}")
        print("Press Ctrl + C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
