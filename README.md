# Ship Web App

The ship side of the offline port authentication scheme. Two pages:

- **license.html** — hold, show, replace or delete the ship's license
- **auth.html** — scan the port's challenge, hand it to `window.start()`, and
  show the answer as a QR code

Everything is local: the QR generator and camera scanner are vendored into
`js/`, so no CDN, no fonts, no external requests. The only traffic is to this
same origin.

## Running it

```sh
python3 dev-server.py          # http://localhost:8031/license.html
```

`dev-server.py` serves the pages **and stubs the four endpoints**, keeping the
license in `license-store.json` next to it so it survives the reloads the app
does. Replace it with the real ship backend:

```
GET  /haslicense     -> {"status": true|false}
GET  /getlicense     -> the license JSON
POST /savelicense    -> stores the posted JSON
POST /deletelicense  -> clears it
```

The camera needs a secure context — `localhost` qualifies, anything else must be
HTTPS. Opening the files directly will not work: ES modules and `getUserMedia`
both refuse `file://`.

## license.html

On load it calls `GET /haslicense`:

- `{"status": true}` → **Authenticate** (big, blue), **Show license**, and a
  small red **Delete license**. Status: *Ready.*
- anything else — `{"status": false}`, a bad response, a parse failure, a dead
  network — → only the green **Add license**. Status: *No license.* or the
  error. A ship that cannot ask about its license can still add one.

| Button | Does |
| --- | --- |
| Add license | opens the camera; on a JSON code, `POST /savelicense`, then reloads |
| Delete license | `confirm('Delete license?')`, then `POST /deletelicense`, then reloads |
| Show license | `GET /getlicense`, draws the JSON as a QR code |
| Authenticate | → `auth.html` |

Both reloads happen in a `finally`, so a failed request still leaves the page
showing the true state rather than a stale guess. A scanned code that is not
JSON leaves the camera running and says *"That code is not JSON — still
scanning…"*, so a misread is not a dead end. If the license is too large for one
QR code, `generateQR` throws, the message goes to the status line and the QR
panel stays hidden.

## auth.html

**Start scanning** opens the camera. The code is a plain string, not JSON. On a
read:

1. `inputdiv.innerText = v`
2. `scanner.destroy()` — the camera is released completely, then the panel hides
3. `window.start()` is called

**The camera release is not incidental.** On some Samsung devices NFC is
unavailable while the camera is open, and `start()` may need it. `destroy()`
stops every track and clears `video.srcObject`; the tests below assert it.

`window.start()` is **not defined here** — you already have it. Load it before
`js/auth.js`; there is a commented-out `<script src="js/start.js">` in
`auth.html` marking the spot. If it is missing, the page says so instead of
failing silently.

Before `start()` is called, a `MutationObserver` is attached to `#result`.
`start()` writes there asynchronously; whenever the text changes, it is drawn as
a QR code in `#result-qr`. A repeat of the same text is not redrawn.

**Manage license** → `license.html`.

## The camera control

Both pages show one button while the camera is open. It asks
`confirm('Switch to different camera?')`:

- **Yes** → rotates to the next entry in `scanner.availableCameras`
- **No** → stops the scanner, hides the panel, status *Scanner stopped.*

`qr-scanner.js` is the version from
[hackathon-cybermacs-rough@portwebsite](https://github.com/AdityaMitra5102/hackathon-cybermacs-rough/tree/portwebsite),
which enumerates cameras *before* opening the stream and starts on an explicit
`deviceId` rather than `facingMode: 'environment'` — phones often expose several
back cameras and the plain constraint picks the wrong one. Rotating with the
confirm dialog finds the usable one without hardcoding an index for one handset.

## Files

```
license.html        page + its buttons
auth.html           page + its buttons (and where to load your start())
js/license.js       license flow
js/auth.js          scan -> start() -> QR of the result
js/qr/qr-generator.js   generateQR(text, options)
js/qr/qr-scanner.js     QRScanner
js/qr/qr-utils.js       getQRByteLength
js/qrcode.js            QR encoder       ) MIT, © Kazuhiko Arase
js/qrcode_UTF8.js       UTF-8 byte mode  )
js/jsQR.js              QR decoder, software fallback for BarcodeDetector
css/style.css       styling for both pages
dev-server.py       static files + stubbed endpoints, for development
```

## Verified

The whole flow, in a real browser driven with a synthetic camera carrying actual
QR codes:

1. No license → only **Add license**, status *No license.*
2. **Add license** → camera opens, JSON code read, `POST /savelicense`, reload →
   **Authenticate / Show / Delete**, status *Ready.*
3. **Show license** → the stored JSON drawn as a QR code.
4. **Authenticate** → `auth.html`.
5. Scanning a string → `inputdiv` set, panel hidden, **`video.srcObject === null`**
   (camera released).
6. `window.start()` writing into `#result` → observer drew the result QR.
7. **Manage license** → back to `license.html`.
8. **Delete license** declined → nothing changes.
9. **Delete license** confirmed → `POST /deletelicense`, reload → back to
   **Add license**.
