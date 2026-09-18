#!/usr/bin/env python3
"""Development server for the ship web app.

Serves the two pages AND stubs the four endpoints they call, so the whole
flow can be exercised before the real ship backend exists:

    GET  /haslicense     -> {"status": true|false}
    GET  /getlicense     -> the stored license JSON
    POST /savelicense    -> stores the posted JSON
    POST /deletelicense  -> clears it

The license is kept in license-store.json next to this file, so it survives
the page reloads the app does after saving and deleting.

    python3 dev-server.py [--port 8031]
"""

import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, "license-store.json")


def read_license():
    try:
        with open(STORE) as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def write_license(value):
    if value is None:
        if os.path.exists(STORE):
            os.remove(STORE)
        return
    with open(STORE, "w") as fh:
        json.dump(value, fh, indent=2)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    # --- helpers -----------------------------------------------------
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return None
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    # --- routes ------------------------------------------------------
    def do_GET(self):
        if self.path == "/haslicense":
            self._send_json(200, {"status": read_license() is not None})
            return

        if self.path == "/getlicense":
            license = read_license()
            if license is None:
                self._send_json(404, {"status": False, "reason": "no license stored"})
            else:
                self._send_json(200, license)
            return

        super().do_GET()

    def do_POST(self):
        if self.path == "/savelicense":
            body = self._read_json()
            if body is None:
                self._send_json(400, {"status": False, "reason": "body is not JSON"})
                return
            write_license(body)
            print(f"  saved license: {json.dumps(body)[:80]}")
            self._send_json(200, {"status": True})
            return

        if self.path == "/deletelicense":
            write_license(None)
            print("  deleted license")
            self._send_json(200, {"status": True})
            return

        self.send_error(404, "No such endpoint")

    def end_headers(self):
        if self.path.endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8031)
    args = parser.parse_args()

    print(f"Ship web app: http://localhost:{args.port}/license.html")
    print(f"  license store: {STORE}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
