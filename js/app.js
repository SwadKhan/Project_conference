//---------------------------------------------------------------------
// Port Authority - offline ship credential issuing (Page 1)
//
// One input (#ship), one button -> windows.start(), one result (#result).
// The result string is signed on this machine and encoded as a QR code
// that can be printed and carried on paper. No network is used.
//---------------------------------------------------------------------

(function () {
    'use strict';

    // --- Configuration -------------------------------------------------
    const PORT_CODE     = 'PORT-01';                 // stamped into every credential
    const VALID_HOURS   = 12;                        // one duty shift
    const KEY_STORAGE   = 'portauth.signing-key.v1'; // where this machine keeps its key
    const TOKEN_VERSION = 'PA1';                     // credential format tag
    const QR_CELL_SIZE  = 6;                         // pixels per QR module
    const QR_MARGIN     = 2;                         // quiet zone, in modules
    const BUILD         = self.APP_BUILD || 'dev';   // from version.js

    // --- Element handles (names kept as specified) ----------------------
    const ship        = document.getElementById('ship');
    const result      = document.getElementById('result');
    const qrContainer = document.getElementById('qr-container');
    const qrPrint     = document.getElementById('qr-print');
    const printable   = document.getElementById('printable');
    const error       = document.getElementById('error');

    const metaShip    = document.getElementById('meta-ship');
    const metaPort    = document.getElementById('meta-port');
    const metaIssued  = document.getElementById('meta-issued');
    const metaExpires = document.getElementById('meta-expires');
    const metaKid     = document.getElementById('meta-kid');

    const resultWarning = document.getElementById('result-warning');
    const offlineStatus = document.getElementById('offline-status');
    const installButton = document.getElementById('install');

    // --- State ----------------------------------------------------------
    let resultValue      = null; // whatever #result currently holds -> the QR payload
    let issuedToken      = null; // the token exactly as it was signed
    let currentQrDataUrl = null; // PNG data URL of the rendered QR
    let signingKey       = null; // { privateKey, publicKey, publicJwk, kid }

    // UTF-8 payloads, same guard the reference app uses.
    if (typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }

    //-----------------------------------------------------------------
    // base64url helpers (QR-safe: no +, / or = characters)
    //-----------------------------------------------------------------
    function bytesToB64url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function stringToB64url(text) {
        return bytesToB64url(new TextEncoder().encode(text));
    }

    //-----------------------------------------------------------------
    // Signing key: generated once on this machine, then reused.
    //-----------------------------------------------------------------
    async function computeKid(publicJwk) {
        const material = new TextEncoder().encode(publicJwk.x + '.' + publicJwk.y);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
        return Array.from(digest.slice(0, 4))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    }

    async function loadOrCreateKey() {
        if (signingKey) return signingKey;

        if (!window.crypto || !crypto.subtle) {
            throw new Error('WebCrypto is unavailable in this browser');
        }

        let publicJwk = null;
        let privateJwk = null;

        let stored = null;
        try {
            stored = localStorage.getItem(KEY_STORAGE);
        } catch (e) {
            stored = null; // storage blocked; a session-only key is used below
        }

        if (stored) {
            const parsed = JSON.parse(stored);
            publicJwk = parsed.publicJwk;
            privateJwk = parsed.privateJwk;
        } else {
            const pair = await crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['sign', 'verify']
            );
            publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
            privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
            try {
                localStorage.setItem(KEY_STORAGE, JSON.stringify({ publicJwk, privateJwk }));
            } catch (e) {
                console.warn('Signing key could not be stored; it lasts for this session only.', e);
            }
        }

        const privateKey = await crypto.subtle.importKey(
            'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
        );
        const publicKey = await crypto.subtle.importKey(
            'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']
        );

        signingKey = { privateKey, publicKey, publicJwk, kid: await computeKid(publicJwk) };
        return signingKey;
    }

    //-----------------------------------------------------------------
    // Credential: PA1.<base64url(payload)>.<base64url(signature)>
    //-----------------------------------------------------------------
    async function issueToken(shipId) {
        const key = await loadOrCreateKey();

        const issued = new Date();
        const expires = new Date(issued.getTime() + VALID_HOURS * 3600 * 1000);

        const nonce = new Uint8Array(8);
        crypto.getRandomValues(nonce);

        const payload = {
            v: 1,
            ship: shipId,
            port: PORT_CODE,
            iat: Math.floor(issued.getTime() / 1000),
            exp: Math.floor(expires.getTime() / 1000),
            kid: key.kid,
            nonce: bytesToB64url(nonce)
        };

        // The signature covers the version tag and the payload together, so
        // neither can be swapped without breaking verification.
        const body = TOKEN_VERSION + '.' + stringToB64url(JSON.stringify(payload));
        const signature = new Uint8Array(await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key.privateKey,
            new TextEncoder().encode(body)
        ));

        return {
            token: body + '.' + bytesToB64url(signature),
            payload: payload,
            issued: issued,
            expires: expires,
            kid: key.kid
        };
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
    // UI helpers
    //-----------------------------------------------------------------
    function showError(message) {
        error.textContent = message || '';
        error.hidden = !message;
    }

    function formatStamp(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
            ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    //-----------------------------------------------------------------
    // start() - what the button calls
    //-----------------------------------------------------------------
    async function start() {
        showError('');

        const shipId = ship.value.trim().toUpperCase();
        if (!shipId) {
            showError('Enter a Ship ID first.');
            printable.hidden = true;
            ship.focus();
            return;
        }

        try {
            const issued = await issueToken(shipId);

            issuedToken = issued.token;
            result.textContent = issuedToken; // the observer below renders the QR

            metaShip.textContent    = issued.payload.ship;
            metaPort.textContent    = issued.payload.port;
            metaIssued.textContent  = formatStamp(issued.issued);
            metaExpires.textContent = formatStamp(issued.expires);
            metaKid.textContent     = issued.kid;

            printable.hidden = false;
            syncFromResult(); // render now; the observer would also catch it
        } catch (e) {
            console.error('Credential issuing failed:', e);
            showError('Could not issue a credential: ' + e.message);
            printable.hidden = true;
        }
    }

    //-----------------------------------------------------------------
    // Keep the QR in step with #result.
    //
    // Whatever puts text in #result - start(), typing in the field, or an
    // edit from DevTools - a MutationObserver picks it up and re-renders.
    // #result is the single source of truth for the QR payload.
    //-----------------------------------------------------------------
    function syncFromResult() {
        // A token never contains whitespace, so strip whatever the editor
        // (or a line wrap on paste) introduced.
        resultValue = result.textContent.replace(/\s+/g, '');

        generateQR(resultValue);

        if (!resultValue) {
            resultWarning.textContent = 'Token is empty — nothing to encode.';
            resultWarning.hidden = false;
        } else if (issuedToken && resultValue !== issuedToken) {
            resultWarning.textContent =
                'Edited by hand — this QR no longer carries a valid signature and will be rejected.';
            resultWarning.hidden = false;
        } else {
            resultWarning.textContent = '';
            resultWarning.hidden = true;
        }
    }

    new MutationObserver(syncFromResult).observe(result, {
        childList: true,
        characterData: true,
        subtree: true
    });

    // Keep the token on one line; the QR payload has no newlines in it.
    result.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
    });

    // contenteditable="plaintext-only" is not in every browser. Where it is
    // not honoured, fall back to ordinary editing - harmless here, because the
    // payload is read with textContent, so pasted markup cannot corrupt it.
    if (result.contentEditable !== 'plaintext-only') {
        result.setAttribute('contenteditable', 'true');
    }

    //-----------------------------------------------------------------
    // Wiring
    //-----------------------------------------------------------------
    qrPrint.addEventListener('click', () => window.print());

    ship.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') start();
    });

    // Exposed globals. `windows` is an alias of `window` so the inline
    // onclick="windows.start()" in index.html resolves as written.
    window.start = start;
    window.generateQR = generateQR;
    window.windows = window;

    // For the verifying station: the public half of this machine's key.
    window.exportPublicKey = async function () {
        const key = await loadOrCreateKey();
        return { kid: key.kid, publicJwk: key.publicJwk };
    };

    //-----------------------------------------------------------------
    // Offline app plumbing: precache the whole app, offer installation.
    //-----------------------------------------------------------------
    function setStatus(text, state) {
        offlineStatus.textContent = text;
        offlineStatus.className = 'status status-' + state;
    }

    function registerServiceWorker() {
        // Opened straight off the disk: already offline, but the browser
        // gives file:// pages no service worker and no install option.
        if (location.protocol === 'file:') {
            setStatus('Running from a local file — offline, but not installable. Build ' + BUILD + '.', 'warn');
            return;
        }

        if (!('serviceWorker' in navigator)) {
            setStatus('No offline cache in this browser — keep the app folder in place.', 'warn');
            return;
        }

        // updateViaCache: 'none' forces the browser to revalidate sw.js and
        // its imports instead of trusting its own HTTP cache.
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((registration) => {
            compareBuilds(registration);

            if (navigator.serviceWorker.controller) {
                setStatus('Offline-ready — no network needed. Build ' + BUILD + '.', 'ok');
            } else {
                setStatus('Caching the app for offline use…', 'pending');
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    setStatus('Offline-ready — no network needed. Build ' + BUILD + '.', 'ok');
                });
            }
        }).catch((e) => {
            console.warn('Service worker registration failed:', e);
            setStatus('Offline cache unavailable — serve the folder over localhost or HTTPS.', 'warn');
        });
    }

    // Ask the active cache which build it holds. If it disagrees with this
    // page, the client is stale - say so in plain words and pull an update.
    function compareBuilds(registration) {
        const controller = navigator.serviceWorker.controller;
        if (!controller) return;

        navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data && e.data.build && e.data.build !== BUILD) {
                setStatus('Stale cache: it holds build ' + e.data.build +
                    ', this page is ' + BUILD + '. Reload to update.', 'warn');
                registration.update();
            }
        });

        controller.postMessage('build?');
    }

    let installPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();          // we decide when to ask
        installPrompt = e;
        installButton.hidden = false;
    });

    installButton.addEventListener('click', async () => {
        if (!installPrompt) return;
        installButton.hidden = true;
        const prompt = installPrompt;
        installPrompt = null;
        await prompt.prompt();
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installButton.hidden = true;
    });

    registerServiceWorker();

    // Create the key up front so the first click is not slow.
    loadOrCreateKey().catch((e) => console.warn('Key not ready yet:', e));
})();
