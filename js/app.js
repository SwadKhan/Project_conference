//---------------------------------------------------------------------
// Port Authority - QR rendering for the credential page.
//
// This file does ONE job: keep the QR code in step with #result.
//
// It does not define start(). Whatever start() is - it lives in
// index.html - only has to put a value into #result; the observer below
// notices and draws the code. Typing in the field or editing it from
// DevTools works the same way: #result is the single source of truth.
//---------------------------------------------------------------------

(function () {
    'use strict';

    // --- Configuration -------------------------------------------------
    const QR_CELL_SIZE = 6;  // pixels per QR module
    const QR_MARGIN    = 2;  // quiet zone, in modules

    // --- Element handles -----------------------------------------------
    const result      = document.getElementById('result');
    const qrContainer = document.getElementById('qr-container');
    const qrPrint     = document.getElementById('qr-print');
    const printable   = document.getElementById('printable');

    // --- State ----------------------------------------------------------
    let resultValue      = null; // whatever #result holds -> the QR payload
    let currentQrDataUrl = null; // PNG data URL of the rendered QR

    // UTF-8 payloads, same guard the reference app uses.
    if (typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }

    //-----------------------------------------------------------------
    // QR rendering (same call pattern as the reference QR-Code-Scan app)
    //-----------------------------------------------------------------
    function generateQR(text) {
        if (!text) {
            qrContainer.innerHTML = '<span class="qr-placeholder">QR code will appear here</span>';
            currentQrDataUrl = null;
            qrPrint.disabled = true;
            return;
        }

        try {
            const qr = qrcode(0, 'M'); // auto type number, medium error correction
            qr.addData(text);
            qr.make();

            currentQrDataUrl = qr.createDataURL(QR_CELL_SIZE, QR_MARGIN);
            qrContainer.innerHTML =
                '<img src="' + currentQrDataUrl + '" alt="Ship credential QR code">';
            qrPrint.disabled = false;
        } catch (e) {
            console.error('QR generation error:', e);
            qrContainer.innerHTML = '<span class="qr-placeholder">Failed to render QR code</span>';
            currentQrDataUrl = null;
            qrPrint.disabled = true;
        }
    }

    //-----------------------------------------------------------------
    // Keep the QR in step with #result.
    //
    // A MutationObserver catches every route into that element: start()
    // writing a value, typing in the field, a paste, or an edit made from
    // the DevTools Elements panel.
    //-----------------------------------------------------------------
    function syncFromResult() {
        // A QR payload has no use for surrounding whitespace, and the
        // editor (or a wrapped paste) likes to add some.
        resultValue = result.textContent.trim();

        printable.hidden = !resultValue;   // no value, nothing to show
        generateQR(resultValue);
    }

    new MutationObserver(syncFromResult).observe(result, {
        childList: true,
        characterData: true,
        subtree: true
    });

    // Keep the value on one line.
    result.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
    });

    // contenteditable="plaintext-only" is not in every browser. Where it is
    // not honoured, fall back to ordinary editing - harmless here, because
    // the payload is read with textContent, so pasted markup cannot corrupt it.
    if (result.contentEditable !== 'plaintext-only') {
        result.setAttribute('contenteditable', 'true');
    }

    //-----------------------------------------------------------------
    // Printing
    //-----------------------------------------------------------------
    qrPrint.addEventListener('click', () => window.print());

    //-----------------------------------------------------------------
    // Exposed globals.
    //
    // `windows` is an alias of `window`, so the inline
    // onclick="windows.start()" in index.html resolves as written.
    // start() itself is NOT defined here - index.html owns it.
    //-----------------------------------------------------------------
    window.windows = window;
    window.generateQR = generateQR;

    // Draw whatever is already in #result at load time.
    syncFromResult();

    // Checked once the page is parsed - index.html defines start() in a
    // script that runs after this one.
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.start !== 'function') {
            console.warn('window.start() is not defined. The button calls it; ' +
                'define it so it puts a value into #result.');
        }
    });
})();
