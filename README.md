# Port Authentication Page

The port side of an offline challenge–response check. Two buttons: the port
issues a challenge as a QR code, the ship answers with a QR code of its own,
and the port posts that answer to its local verifier.

Everything the browser needs is in this folder — the QR generator and camera
scanner are vendored from [qr-toolkit](https://github.com/hamzaharoon1314/qr-toolkit).
No CDN, no fonts, no external requests. The only network traffic is to this
same origin, which is the port's own machine.

## The flow

1. **Initiate authentication** — `POST /api/authenticate/begin`. The response
   is `{"challenge": "<base64>"}`, and the challenge value alone is rendered as
   a QR code. Nothing else is drawn or printed, and the string itself is never
   shown. **Complete authentication** becomes enabled.
2. **Complete authentication** — opens the camera. The scanned code must be a
   JSON document; it is parsed and posted verbatim to
   `POST /api/authenticate/complete`.
3. **Verdict** — HTTP 200 *and* `{"status": "success"}` shows success. Anything
   else — another status, another body, an unreachable server — shows failure,
   with the status code and response body underneath so the operator can say
   what went wrong.

`Complete authentication` starts disabled and only enables once a challenge has
actually been issued, so the second step cannot run without the first.

## Running it

```sh
python3 dev-server.py          # http://localhost:8022
```

`dev-server.py` serves this folder **and stubs the two endpoints**, so the whole
flow can be exercised before the real backend exists. Its rule is deliberately
crude: the scanned JSON must be an object whose `challenge` equals the one last
issued, and each challenge is accepted once.

```
POST /api/authenticate/begin     -> 200 {"challenge": "<base64 of 32 bytes>"}
POST /api/authenticate/complete  -> 200 {"status": "success"}
                                    401 {"status": "error", "reason": "challenge does not match"}
                                    400 {"status": "error", "reason": "body is not a JSON object"}
```

**Replace that stub with the real verifier** — signature check against the
ship's public key, challenge expiry, and a ledger of spent challenges. The page
does not care how the verdict is reached; it only reads the status code and
`status` field.

To point the page at a backend on another path or port, change `API_BEGIN` and
`API_COMPLETE` at the top of [js/app.js](js/app.js).

The camera needs a secure context: `localhost` qualifies, any other host must be
HTTPS. Opening `index.html` from the filesystem will not work — ES modules and
`getUserMedia` both refuse `file://`.

## Files

```
index.html          the page: two buttons, the QR panel, the camera, the verdict
js/app.js           the flow above (ES module)
js/qr/              vendored qr-toolkit module: generateQR, QRScanner, scanQRFromImage
js/qrcode.js        QR encoder        ) the toolkit's dependencies, MIT,
js/qrcode_UTF8.js   UTF-8 byte mode   ) © Kazuhiko Arase
js/jsQR.js          QR decoder, software fallback for BarcodeDetector
css/style.css       styling
dev-server.py       static files + stubbed endpoints, for development
```

## How the code is put together

`js/app.js` is an ES module importing two functions from the toolkit:

- `generateQR(challenge, { errorCorrection: 'M', cellSize: 6, margin: 2 })`
  returns an object whose `createImageElement()` is appended to the QR panel.
- `new QRScanner({ video, onResult, onError })` drives the camera. It uses the
  browser's hardware `BarcodeDetector` where available and falls back to
  `jsQR.js` in software, and it de-duplicates repeat reads of the same code.

The rest is state handling:

- A `busy` flag makes a second click during an in-flight request a no-op.
- A scanned code that is not JSON leaves the camera running and says so, so a
  misread or a wrong code is not a dead end.
- On a successful parse the scanner stops before the request goes out, and the
  camera is also released on `pagehide` — no stream left running behind a
  closed tab.
- The response body is read whatever the status code, so a rejection can be
  displayed rather than swallowed.

## Verified

End to end in a real browser (Chromium with a synthetic camera feed carrying an
actual QR code):

- Initial state: *Initiate* enabled, *Complete* disabled.
- After *Initiate*: challenge QR rendered, nothing else in the panel, *Complete*
  enabled.
- After *Complete* with a matching reply: **✓ Authentication successful**,
  scanner closed.
- With a non-matching reply: **✗ Authentication failed**, showing `HTTP 401` and
  the error body.
