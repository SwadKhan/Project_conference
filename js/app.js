//---------------------------------------------------------------------
// Port authentication page.
//
//   Initiate authentication -> POST /api/authenticate/begin
//                              show the returned challenge as a QR code
//   Complete authentication -> scan the ship's QR (a JSON document)
//                              POST it to /api/authenticate/complete
//
// The QR generator and camera scanner come from the vendored qr-toolkit
// module in js/qr/. Nothing here talks to anything but this origin.
//---------------------------------------------------------------------

import { generateQR, QRScanner } from './qr/index.js';

// --- Endpoints -------------------------------------------------------
const API_BEGIN    = '/api/authenticate/begin';
const API_COMPLETE = '/api/authenticate/complete';

// --- Elements --------------------------------------------------------
const initiate       = document.getElementById('initiate');
const complete       = document.getElementById('complete');
const status         = document.getElementById('status');

const challengePanel = document.getElementById('challenge-panel');
const challengeQr    = document.getElementById('challenge-qr');

const scannerPanel   = document.getElementById('scanner-panel');
const scannerVideo   = document.getElementById('scanner-video');
const cancelScan     = document.getElementById('cancel-scan');

const resultPanel    = document.getElementById('result-panel');
const result         = document.getElementById('result');
const resultDetail   = document.getElementById('result-detail');

// --- State -----------------------------------------------------------
let scanner = null;   // the QRScanner instance, created on first scan
let busy    = false;  // a request is in flight

//-----------------------------------------------------------------
// Small UI helpers
//-----------------------------------------------------------------
function setStatus(text, state) {
    status.textContent = text;
    status.className = 'status' + (state ? ' status-' + state : '');
}

function showResult(text, state, detail) {
    result.textContent = text;
    result.className = 'result result-' + state;
    resultPanel.hidden = false;

    if (detail) {
        resultDetail.textContent = detail;
        resultDetail.hidden = false;
    } else {
        resultDetail.textContent = '';
        resultDetail.hidden = true;
    }
}

function clearResult() {
    resultPanel.hidden = true;
    resultDetail.hidden = true;
}

//-----------------------------------------------------------------
// Step 1 - initiate: ask for a challenge, show it as a QR code.
//-----------------------------------------------------------------
async function beginAuthentication() {
    if (busy) return;
    busy = true;

    clearResult();
    stopScanner();
    initiate.disabled = true;
    complete.disabled = true;
    setStatus('Requesting a challenge…', 'pending');

    try {
        const response = await fetch(API_BEGIN, {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('server answered ' + response.status + ' ' + response.statusText);
        }

        const payload = await response.json();
        const challenge = payload && payload.challenge;

        if (typeof challenge !== 'string' || !challenge) {
            throw new Error('response carried no "challenge" string');
        }

        // Only the challenge value goes into the code - nothing else.
        const qr = generateQR(challenge, { errorCorrection: 'M', cellSize: 6, margin: 2 });

        challengeQr.innerHTML = '';
        challengeQr.appendChild(qr.createImageElement());
        challengePanel.hidden = false;

        setStatus('Challenge issued. Scan it, then complete authentication.', 'ok');
        complete.disabled = false;   // step 2 is now available
    } catch (e) {
        console.error('begin failed:', e);
        challengePanel.hidden = true;
        challengeQr.innerHTML = '';
        setStatus('Could not start authentication: ' + e.message, 'error');
        complete.disabled = true;
    } finally {
        initiate.disabled = false;
        busy = false;
    }
}

//-----------------------------------------------------------------
// Step 2 - complete: scan the ship's reply, post it, judge the answer.
//-----------------------------------------------------------------
async function completeAuthentication() {
    if (busy) return;

    clearResult();
    scannerPanel.hidden = false;
    setStatus('Point the camera at the ship\'s QR code…', 'pending');

    if (!scanner) {
        scanner = new QRScanner({
            video: scannerVideo,
            onResult: handleScan,
            onError: (e) => {
                console.error('scanner error:', e);
                setStatus('Scanner: ' + e.message, 'error');
                scannerPanel.hidden = true;
            }
        });
    }

    await scanner.start();
}

function stopScanner() {
    if (scanner) scanner.stop();
    scannerPanel.hidden = true;
}

async function handleScan(scan) {
    // The scanned code must be a JSON document.
    let body;
    try {
        body = JSON.parse(scan.data);
    } catch (e) {
        // Keep the camera running so the operator can try another code.
        setStatus('That code is not JSON — still scanning…', 'error');
        return;
    }

    stopScanner();
    busy = true;
    setStatus('Verifying with the port…', 'pending');

    try {
        const response = await fetch(API_COMPLETE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body)   // exactly what the QR carried
        });

        // Read the body whatever the status, so a failure can be shown.
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }

        if (response.status === 200 && payload && payload.status === 'success') {
            showResult('✓ Authentication successful', 'ok');
            setStatus('Done.', 'ok');
        } else {
            showResult('✗ Authentication failed', 'error',
                'HTTP ' + response.status + '\n' +
                (payload ? JSON.stringify(payload, null, 2) : '(no JSON in the response)'));
            setStatus('Rejected.', 'error');
        }
    } catch (e) {
        console.error('complete failed:', e);
        showResult('✗ Authentication failed', 'error', 'Request error: ' + e.message);
        setStatus('Could not reach the port.', 'error');
    } finally {
        busy = false;
    }
}

//-----------------------------------------------------------------
// Wiring
//-----------------------------------------------------------------
initiate.addEventListener('click', beginAuthentication);
complete.addEventListener('click', completeAuthentication);

cancelScan.addEventListener('click', () => {
    stopScanner();
    setStatus('Scanner stopped.', '');
});

// Release the camera if the page is closed or hidden mid-scan.
window.addEventListener('pagehide', stopScanner);
