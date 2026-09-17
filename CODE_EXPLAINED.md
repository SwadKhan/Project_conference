# Code Walkthrough

Two files matter: `index.html` owns what a credential is, `js/app.js` owns
turning it into a QR code. They meet at one element, `#result`.

## The page (`index.html`)

```html
<label for="ship">Ship ID</label>
<input id="ship" type="text" ...>
<button type="button" id="issue" onclick="windows.start()">Issue credential</button>
```

```html
<section id="printable" hidden>
  <div id="qr-container"></div>
  <div id="result" contenteditable="plaintext-only"></div>
  <button id="qr-print" class="no-print">Print credential</button>
</section>
```

`#printable` is hidden until `#result` has a value. Anything marked
`class="no-print"` — the header, the input card, the print button itself —
disappears when printing, so the paper shows only the credential.

Scripts load at the end of `<body>` in dependency order: `qrcode.js`, then
`qrcode_UTF8.js` (which patches the global `qrcode`), then `app.js`. Because
they load last, `app.js` reads the DOM immediately with no `DOMContentLoaded`
wrapper.

## `window.start()` — yours

The last script in `index.html` defines it. `app.js` does not, on purpose. The
contract is one line:

```js
document.getElementById('result').textContent = value;
```

That is all `start()` has to do. The placeholder shipped here reads `#ship`,
refuses an empty value with a message in `#error`, and writes the Ship ID
straight through. Swap its body for a database lookup, a signed token, a
reference number — the rendering side is unaffected.

`app.js` warns on the console if `window.start` is missing when the page
finishes parsing, since the button would otherwise fail silently.

## `#result` drives the QR (`js/app.js`)

A `MutationObserver` watches `#result` for `childList`, `characterData` and
`subtree` changes, so **every** route into that element re-renders the code:
`start()` writing a value, an officer typing in the field, a paste, or an edit
from the DevTools Elements panel.

`syncFromResult()` is the callback:

1. Read `result.textContent` and trim it.
2. Show `#printable` if there is a value, hide it if there is not.
3. Call `generateQR(value)`.

It never writes back to `#result`, so the observer cannot loop. `Enter` is
suppressed in the field to keep the value on one line, and it runs once at load
so a value already in the HTML is drawn.

`#result` is `contenteditable="plaintext-only"`, with a fallback to plain
`contenteditable` where that value is not honoured. Either way the payload is
read with `textContent`, so pasted markup cannot corrupt it.

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
caught, logged, and shown in place. `image-rendering: pixelated` in the CSS keeps
module edges sharp when the image is scaled.

## Printing

`#qr-print` calls `window.print()`. The `@media print` block drops every
`.no-print` element, flattens the card to a plain bordered box, and widens the
QR to 260 px (~2.7 in at 96 dpi). The value is printed as text under the code as
well, so a smudged QR can still be read and re-keyed.

## Verified

In a real browser:

- On load: panel hidden, print disabled, `app.js` defines no `start()`.
- Button with `IMO9074729`: panel shown, `#result` set, QR drawn, print enabled.
- Editing `#result` programmatically, and typing in it: QR re-rendered each time.
- Clearing `#result`: panel hidden, print disabled again.
- Empty Ship ID: *"Enter a Ship ID first."*
