# Project_conference

Credential page for a port that has fallen back to paper manifests. An officer
enters a **Ship ID**, presses the button, and the value is printed as a QR code
that travels on paper.

Nothing here reaches the network: no CDN, no fonts, no backend. The QR encoder
is vendored locally.

## Running it

```sh
python3 -m http.server 8012     # from this folder, then http://localhost:8012
```

Opening `index.html` directly works too.

## The split

| File | Owns |
| --- | --- |
| `index.html` | the page **and `window.start()`** — what a credential *is* |
| `js/app.js` | rendering the QR from `#result`, and printing |

`app.js` deliberately does not define `start()`. The button calls
`windows.start()`, and that function's only obligation is to put a value into
`#result`:

```js
document.getElementById('result').textContent = yourCredentialValue;
```

A `MutationObserver` in `app.js` sees the change and draws the code. So every
route into `#result` renders: `start()`, typing in the field, a paste, or an
edit from the DevTools Elements panel. `#result` is the single source of truth
for the QR payload.

The `start()` currently in `index.html` is a placeholder that just echoes the
Ship ID. Replace its body with the real thing — a database lookup, a signature,
whatever the credential is — and nothing in `app.js` needs to change.

`windows` is an alias of `window`, set in `app.js`, so the inline
`onclick="windows.start()"` resolves as written.

## Files

```
index.html          the page, plus your start()
js/app.js           QR follows #result; print button
js/qrcode.js        QR encoder      ) vendored, MIT, © Kazuhiko Arase, via
js/qrcode_UTF8.js   UTF-8 byte mode ) github.com/hamzaharoon1314/QR-Code-Scan
css/style.css       screen styles and the @media print rules
```

[CODE_EXPLAINED.md](CODE_EXPLAINED.md) walks through the code.

## Related

The port-side authentication page (challenge/response over QR) lives on the
`port-webpage` branch of this repository. It is a separate app with no files in
common with this one.
