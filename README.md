# Project_conference

Offline ship authentication for a port that has fallen back to paper manifests.

When network connectivity at the port is compromised, the port computer still
has its database, its screen and its printer. This is an issuing station that
works under exactly those conditions: an officer types a **Ship ID**, the
machine signs a credential with a key that never leaves it, and the credential
is printed as a QR code that travels on paper.

No network is used at any point — no CDN, no fonts, no backend, no telemetry —
and a service worker precaches the whole app, so it installs to a desktop or
home screen and keeps working on a machine that has never been online.

## Status

**Page 1 — issuing — is built.** The verifying station is not: scanning a
credential and checking its signature is the next piece of work. See
[Where this goes next](CODE_EXPLAINED.md#where-this-goes-next).

## Running it

```sh
python3 -m http.server 8000     # from this folder
```

Then open <http://localhost:8000> and click **Install app** to get a standalone
window and icon. After that first load the network is never needed again.

Opening `index.html` by double-clicking also works and is equally offline, but
browsers refuse service workers on `file://`, so it cannot install or precache.
The status line under the header tells you which mode you are in.

Nothing to install: no npm, no build step, no dependencies to fetch.

## How it works

1. `windows.start()` reads `#ship`, then signs a credential with this machine's
   **ECDSA P-256** key (WebCrypto). The key is generated once on first run and
   kept in `localStorage`; the private half is re-imported non-extractable.
2. The credential is a compact token —
   `PA1.<base64url(payload)>.<base64url(signature)>` — where the payload carries
   the ship id, the port code, issue and expiry times, the key id and a random
   nonce.
3. The token goes into `#result`, which is the single source of truth for the QR
   payload. A `MutationObserver` re-renders the code on any change to it, so
   editing the token live re-renders the QR.
4. **Print credential** puts the QR, the readable metadata and the token text on
   paper. The token is printed as text as well, so a smudged code can still be
   read and re-keyed.

Hand-editing the token produces a valid QR code carrying an invalid credential.
The app says so in orange under the field rather than letting it reach a printer
unremarked.

## Layout

```
index.html              the page
version.js              build tag, shared by the page and the service worker
sw.js                   precaches the app, serves it cache-first
manifest.webmanifest    makes it installable
css/style.css           screen styles and the @media print rules
js/app.js               issuing, signing, QR rendering
js/qrcode.js            QR encoder            ) vendored, MIT, Kazuhiko Arase
js/qrcode_UTF8.js       UTF-8 byte mode       ) via github.com/hamzaharoon1314/QR-Code-Scan
icons/                  app icons
tools/make-icons.py     regenerates them; Python stdlib only
```

[CODE_EXPLAINED.md](CODE_EXPLAINED.md) is the full walkthrough — every function,
the credential format, the caching rules and the versioning gotcha.

## Caveats

This is a working prototype of the issuing half, not a hardened deployment.
Before it guards a real gangway:

- The signing key sits in `localStorage` as a JWK. Moving it to a
  non-extractable `CryptoKey` in IndexedDB, or to a hardware token, would stop
  any script on that origin from reading it.
- Public keys have to reach the verifying stations by hand — on paper or a USB
  stick, never over the network. `window.exportPublicKey()` returns this
  machine's `{ kid, publicJwk }`.
- Replay is only preventable at the verifier: it must record each credential's
  nonce and refuse a second presentation.

## Licence

`js/qrcode.js` and `js/qrcode_UTF8.js` are MIT, © 2009/2011 Kazuhiko Arase.
