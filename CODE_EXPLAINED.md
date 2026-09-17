# Offline Ship Credential — Page 1 (Code Walkthrough)

Page 1 of the port-authority UI. An officer types a **Ship ID**, presses one
button, and the machine prints a paper credential carrying a signed QR code.

It is an **offline app** in both senses: nothing in it ever reaches the network
(no CDN, no fonts, no backend, no telemetry), and a service worker precaches
every file so it installs to the desktop or home screen and keeps working with
the network cable pulled, indefinitely.

[README.md](README.md) is the short version — what this is and how to run it.
This file is the walkthrough: every moving part, in the order it runs.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page: `#ship` input, one button, `#result`, QR, print button |
| `js/app.js` | Our logic: key handling, credential signing, QR rendering, `start()` |
| `js/qrcode.js` | QR encoder, vendored from the reference repo (MIT, Kazuhiko Arase) |
| `js/qrcode_UTF8.js` | UTF-8 byte mode for the encoder, same source |
| `css/style.css` | Screen styling plus the `@media print` rules |
| `sw.js` | Service worker: precaches the app, serves it cache-first |
| `version.js` | The build tag, shared by the page and the service worker |
| `manifest.webmanifest` | Makes it installable — name, colours, icons, standalone display |
| `icons/*.png` | App icons (192, 512, maskable 512) |
| `tools/make-icons.py` | Regenerates those icons; stdlib only, no build step |

The reference repo is [QR-Code-Scan](https://github.com/hamzaharoon1314/QR-Code-Scan).
Its own `app.js` is bound to that page's element IDs, so it is not importable —
what we reuse is its two generator libraries and its generation call pattern
(`qrcode(0, 'M')` → `addData` → `make` → `createDataURL`). The scanner half of
that repo (`jsQR.js`) is what the verifying station will use to read these codes.

## Page structure (`index.html`)

Two sections, exactly as specified:

```html
<label for="ship">Ship ID</label>
<input id="ship" type="text" ...>
<button type="button" id="issue" onclick="windows.start()">Issue credential</button>
```

```html
<section id="printable" hidden>
  <div id="qr-container"></div>
  <dl class="meta">…</dl>
  <div id="result"></div>
  <button id="qr-print" class="no-print">Print credential</button>
</section>
```

`#printable` starts hidden and is revealed once a credential exists. Anything
carrying `class="no-print"` (the header, the input card, the print button
itself) disappears when printing, so the paper shows only the credential.

The three scripts load at the end of `<body>` in dependency order —
`qrcode.js`, then `qrcode_UTF8.js` (which patches the global `qrcode`), then
`app.js`. Because they load last, `app.js` can read the DOM immediately and
needs no `DOMContentLoaded` wrapper.

## Names kept as instructed

| Name | What it is |
| --- | --- |
| `ship` | the `<input id="ship">` element |
| `result` | the `<div id="result">` element |
| `resultValue` | the signed token string — the QR payload |
| `windows.start()` | what the button calls |
| `issuedToken` | the token exactly as signed, for the edited/unedited comparison |

`windows` is not a typo left unhandled: the last lines of `app.js` set
`window.windows = window`, so the inline `onclick="windows.start()"` resolves
as written. `window.start()` works too. If you prefer the plain form, change
the `onclick` in `index.html` and delete that alias line.

## What `start()` does

`app.js` is one IIFE with `'use strict'`, so nothing leaks to the global scope
except the handful of functions exported at the bottom.

1. Clear any previous error, read `ship.value`, trim it, upper-case it. Empty
   input → error message, hide `#printable`, refocus the field, return.
2. `issueToken(shipId)` builds and signs the credential.
3. Put the token in `resultValue` and in `result.textContent`.
4. Fill the human-readable rows (`#meta-ship`, `#meta-port`, `#meta-issued`,
   `#meta-expires`, `#meta-kid`) — these matter on paper, where a scanner may
   not be at hand.
5. Unhide `#printable` and call `generateQR(resultValue)`.

`start()` is `async` (WebCrypto is promise-based). The button fires it without
awaiting; every failure path is caught inside and surfaced in `#error`.

## The signing key

`loadOrCreateKey()` gives the machine one long-lived identity:

- First run: `crypto.subtle.generateKey` makes an **ECDSA P-256** pair, both
  halves are exported as JWK and stored in `localStorage` under
  `portauth.signing-key.v1`.
- Later runs: the stored JWKs are read back and imported. The private key is
  imported with `extractable: false`.
- If `localStorage` is blocked, the key is generated in memory for that session
  only and a warning goes to the console — credentials still issue, but they
  are signed by a key the verifier does not know. Fix the storage instead.
- `computeKid()` hashes the public coordinates (`x.y`) with SHA-256 and takes
  the first 4 bytes as an 8-hex-character **key id**, printed on the paper so a
  verifier knows which public key to check against.

The key is warmed at load (`loadOrCreateKey().catch(...)`) so the first button
press is not waiting on key generation.

## The credential format

```
PA1.<base64url(payload JSON)>.<base64url(ECDSA signature)>
```

```json
{
  "v": 1,
  "ship": "IMO9074729",
  "port": "PORT-01",
  "iat": 1789666051,
  "exp": 1789709251,
  "kid": "8D00C1AB",
  "nonce": "apaN77Q8VbU"
}
```

- The signature covers `PA1.<payload>` — version tag included, so the format
  tag cannot be swapped without breaking verification.
- `iat`/`exp` are Unix seconds; `VALID_HOURS` (12, one duty shift) sets the
  window.
- `nonce` is 8 random bytes from `crypto.getRandomValues`, so two credentials
  for the same ship in the same second are still distinct tokens — that gives
  the verifier something to record against replay.
- Base64url (`-`, `_`, no `=`) keeps the token inside the QR alphanumeric-safe
  range and out of trouble in URLs and logs.

A real credential is ~247 characters, which the encoder places in a 61×61
module QR at error-correction level **M** — comfortable for a phone camera off
a printed page.

## `#result` drives the QR

`#result` is the single source of truth for the QR payload. It is
`contenteditable`, and a `MutationObserver` watches it for `childList`,
`characterData` and `subtree` changes, so **every** route into that element
re-renders the code: `start()` writing a fresh token, an officer typing in the
field, a paste, or an edit made from the DevTools Elements panel.

`syncFromResult()` is the callback:

1. Read `result.textContent` and strip all whitespace — a token never contains
   any, so whatever the editor or a wrapped paste introduced is dropped.
2. Store it in `resultValue` and call `generateQR(resultValue)`.
3. Set the warning line: empty token, or **edited by hand** when `resultValue`
   no longer equals `issuedToken` (the string as it was actually signed).

It never writes back to `#result`, so the observer cannot loop. `Enter` is
suppressed in the field to keep the token on one line.

The edit warning matters: hand-editing the token produces a perfectly valid QR
code carrying an invalid credential. The verifying station will reject it, and
the line under the field says so before anyone prints it.

## QR rendering

`generateQR(text)` mirrors the reference app's call pattern:

```js
const qr = qrcode(0, 'M');   // 0 = auto-pick the smallest fitting version
qr.addData(text);
qr.make();
currentQrDataUrl = qr.createDataURL(QR_CELL_SIZE, QR_MARGIN); // 6 px/module, 2-module quiet zone
```

The data URL goes into an `<img>` inside `#qr-container`. Empty text resets the
container to its placeholder and disables the print button; an encoder throw is
caught, logged, and shown in place. `image-rendering: pixelated` in the CSS
keeps module edges sharp when the image is scaled.

## Printing

`#qr-print` calls `window.print()`. The `@media print` block drops every
`.no-print` element, flattens the card to a plain bordered box, and widens the
QR to 260 px (~2.7 in at 96 dpi). What lands on paper: title, QR, the metadata
rows, and the token as text — so a credential stays readable and re-keyable
even if the printed QR is smudged.

## The offline app

### Service worker (`sw.js`)

- **install** — opens cache `portauth-v1` and `addAll`s the ten files that make
  up the app, then `skipWaiting()` so a fresh copy takes over at once.
- **activate** — deletes every cache whose name is not the current `CACHE`, then
  `clients.claim()` so the open page is controlled immediately.
- **fetch** — same-origin GETs only. Cache first; on a miss it tries the network
  and stores anything new; if that fails too, navigations get `index.html` back
  and everything else a 504. After the first load the network is never needed,
  and since no asset points off this machine, it is never reached.

### Versioning — read this before editing an asset

`version.js` holds one constant, `APP_BUILD`. `index.html` loads it as a plain
script and `sw.js` pulls it in with `importScripts`, so the cache name
(`portauth-<build>`) and the build shown in the status line can never disagree.
**Bump `APP_BUILD` whenever you change an asset** — cache-first means clients
otherwise keep serving the old copy forever.

Two details that make the bump actually take effect:

- `install` precaches with `new Request(url, { cache: 'reload' })`. A plain
  `cache.addAll(ASSETS)` reads through the browser's *HTTP* cache, which can
  bake a stale asset into a freshly named cache — the page updates, one script
  does not, and the app half-works in a way that looks like a code bug.
- The page registers with `{ updateViaCache: 'none' }`, so the browser
  revalidates `sw.js` and its imports rather than trusting its own cache.

The status line prints the live build (*"Offline-ready — no network needed.
Build v4."*), which is the quickest way to tell a stale client from a real bug.

On top of that the page asks the cache to identify itself: `app.js` posts
`'build?'` to the controlling service worker, `sw.js` replies with its
`APP_BUILD`, and a mismatch turns the status line orange —
*"Stale cache: it holds build vX, this page is vY. Reload to update."* — and
calls `registration.update()`. A half-updated client diagnoses itself instead of
looking like a code bug, which is exactly the trap this app fell into once.

While developing, tick *Application → Service Workers → Update on reload* in
DevTools instead of bumping on every save.

### Manifest and installation

`manifest.webmanifest` sets `display: standalone`, `start_url: "."`, the navy
theme colour and the three icons, so Chrome/Edge offer an install and Android
gets a proper home-screen app. iOS uses the `apple-mobile-web-app-*` meta tags
and `apple-touch-icon` in the `<head>` for Add to Home Screen; the standard
`mobile-web-app-capable` sits alongside the Apple one because Chrome deprecated
the latter. `rel="icon"` points at the app icon so the browser stops asking for
a `favicon.ico` that isn't there.

`app.js` holds `beforeinstallprompt` (preventing the default banner), reveals
the header's **Install app** button, and calls `prompt()` on click. The button
stays hidden where the browser offers no install.

### The status line

`#offline-status` under the header reports what the cache is actually doing, so
an officer can tell before the network goes away:

| Line | Meaning |
| --- | --- |
| *Offline-ready — no network needed.* | Service worker is in control; every asset is cached |
| *Caching the app for offline use…* | First load; flips to offline-ready on `controllerchange` |
| *Running from a local file — offline, but not installable.* | Opened over `file://` |
| *Offline cache unavailable — serve over localhost or HTTPS.* | Registration failed |

### Icons

`tools/make-icons.py` writes the PNGs by hand with `zlib` and `struct` — no
Pillow, no npm, nothing to install. The mark is a stylised QR code: three finder
patterns and a few data modules, white on `#0b1b3a`. The maskable variant keeps
26% of each edge clear so Android can crop it to any shape. Re-run it from the
project root after editing `DATA_MODULES` or the colours.

## Running it

For the full app — installable, cached, standalone window — serve the folder:

```sh
python3 -m http.server 8000   # then http://localhost:8000
```

Service workers are refused on `file://`, so opening `index.html` by
double-clicking still works and is still entirely offline, it just cannot
install or precache. On the port machine, point a local static server at this
folder at boot and open `http://localhost:8000` once; from then on the app is
installed and the server only needs to be there to start it.

`crypto.subtle` needs a secure context. `file://` and `localhost` both qualify
in current browsers; any other host must be HTTPS.

## Where this goes next

Page 1 only issues. The other halves of the system, not in this code yet:

- **Verifying station** — scan with `jsQR.js`, split the token on `.`, check the
  ECDSA signature against the public key named by `kid`, check `exp`, and record
  the `nonce` so the same credential cannot be walked through twice.
- **Key distribution** — `window.exportPublicKey()` returns
  `{ kid, publicJwk }` for this machine, which is what a verifying station must
  be loaded with (by hand, on paper, or on a USB stick — never over the network).
- **Config** — `PORT_CODE`, `VALID_HOURS`, `QR_CELL_SIZE`, `QR_MARGIN` and
  `KEY_STORAGE` sit together at the top of `app.js`.
