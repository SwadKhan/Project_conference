#!/usr/bin/env python3
"""Development server for the port authentication page.

Serves the static files AND stubs the two endpoints the page calls, so the
flow can be exercised end to end before the real backend exists:

    POST /api/authenticate/begin     -> {"challenge": "<base64>"}
    POST /api/authenticate/complete  -> {"status": "success"} or an error

The completion rule here is deliberately simple: the scanned JSON must be an
object carrying a "challenge" equal to the one last issued. Replace this with
the real verifier (signature check, nonce ledger, expiry) - it is a stub.

    python3 dev-server.py [--port 8021]
"""

import argparse
import base64
import json
import os
import secrets
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# The challenge last handed out. A real port would keep a short-lived,
# per-session store rather than one module-level value.
LAST_CHALLENGE = {"value": None}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

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
    def do_POST(self):
        if self.path == "/api/authenticate/begin":
            challenge = base64.b64encode(secrets.token_bytes(32)).decode()
            LAST_CHALLENGE["value"] = challenge
            print(f"  issued challenge {challenge[:16]}…")
            self._send_json(200, {"challenge": challenge})
            return

        if self.path == "/api/authenticate/complete":
            body = self._read_json()
            print(f"  completion body: {body}")

            if not isinstance(body, dict):
                self._send_json(400, {"status": "error", "reason": "body is not a JSON object"})
                return

            presented = body.get("challenge")
            if not presented:
                self._send_json(400, {"status": "error", "reason": "no challenge in the scanned code"})
                return

            if presented != LAST_CHALLENGE["value"]:
                self._send_json(401, {"status": "error", "reason": "challenge does not match"})
                return

            LAST_CHALLENGE["value"] = None  # one use only
            self._send_json(200, {"status": "success"})
            return

        self.send_error(404, "No such endpoint")

    def end_headers(self):
        # Never let a dev reload serve a stale script.
        if self.path.endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8022)
    args = parser.parse_args()

    print(f"Port authentication page: http://localhost:{args.port}")
    print("  POST /api/authenticate/begin     -> issues a challenge")
    print("  POST /api/authenticate/complete  -> verifies the scanned JSON (stub)")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
