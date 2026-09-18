//---------------------------------------------------------------------
// auth.html - scan the port's challenge, hand it to window.start(),
// and show whatever start() writes back as a QR code.
//
// The scanned code is a plain string, not JSON.
//
// The camera is released with destroy() the moment a code is read:
// on some Samsung devices NFC is unavailable while the camera is open,
// and start() may need it.
//---------------------------------------------------------------------

import { generateQR } from './qr/qr-generator.js';
import { QRScanner } from './qr/qr-scanner.js';

// --- Elements --------------------------------------------------------
const startScan     = document.getElementById('start-scan');
const inputdiv      = document.getElementById('inputdiv');
const result        = document.getElementById('result');
const resultQr      = document.getElementById('result-qr');
const manageLicense = document.getElementById('manage-license');

const scannerPanel  = document.getElementById('scanner-panel');
const scannerVideo  = document.getElementById('scanner-video');
const cameraControl = document.getElementById('camera-control');

const status        = document.getElementById('status');

const QR_OPTIONS = { errorCorrection: 'M', cellSize: 6, margin: 2 };

// --- State -----------------------------------------------------------
let scanner = null;    // created lazily, on the first scan
let cameraIndex = 0;   // which of scanner.availableCameras is in use
let observer = null;   // watches #result
let lastText = null;   // last value drawn, so a repeat is not redrawn

function setStatus(text) {
    status.textContent = text || '';
}

//-----------------------------------------------------------------
// Watch #result and draw whatever appears there.
//
// start() writes asynchronously, so this is attached before it is
// called and left in place.
//-----------------------------------------------------------------
function watchResult() {
    if (observer) return;

    observer = new MutationObserver(() => {
        const text = result.textContent;
        if (text && text !== lastText) {
            lastText = text;
            try {
                const qr = generateQR(text, QR_OPTIONS);
                resultQr.innerHTML = '';
                resultQr.appendChild(qr.createImageElement());
                resultQr.hidden = false;
            } catch (e) {
                console.error('QR generation failed:', e);
                setStatus('QR generation failed: ' + e.message);
            }
        }
    });

    observer.observe(result, { childList: true, characterData: true, subtree: true });
}

//-----------------------------------------------------------------
// Start scanning.
//-----------------------------------------------------------------
async function onStartScan() {
    scannerPanel.hidden = false;
    setStatus('Point the camera at the port\'s QR code…');

    if (!scanner) {
        scanner = new QRScanner({
            video: scannerVideo,
            onResult: onScanned,
            onError: (e) => {
                console.error('scanner error:', e);
                scannerPanel.hidden = true;
                setStatus('Scanner: ' + e.message);
            }
        });
    }

    cameraIndex = 0;
    await scanner.start();
}

function onScanned({ data }) {
    // The code is a string; it is used as-is.
    inputdiv.innerText = data;

    // Release the camera completely before anything else runs.
    scanner.destroy();
    scannerPanel.hidden = true;

    watchResult();

    if (typeof window.start === 'function') {
        setStatus('Scanned. Working…');
        window.start();
    } else {
        setStatus('Scanned, but window.start() is not defined on this page.');
        console.warn('window.start() is missing: load the script that defines it.');
    }
}

//-----------------------------------------------------------------
// Camera control: next camera, or stop.
//-----------------------------------------------------------------
async function onCameraControl() {
    if (!scanner) return;

    if (window.confirm('Switch to different camera?')) {
        const cameras = scanner.availableCameras || [];
        if (cameras.length < 2) {
            setStatus('No other camera available.');
            return;
        }
        cameraIndex = (cameraIndex + 1) % cameras.length;
        setStatus('Switching camera…');
        await scanner.start(cameras[cameraIndex].deviceId);
        setStatus('Point the camera at the port\'s QR code…');
        return;
    }

    scanner.stop();
    scannerPanel.hidden = true;
    setStatus('Scanner stopped.');
}

//-----------------------------------------------------------------
// Wiring
//-----------------------------------------------------------------
startScan.addEventListener('click', onStartScan);
cameraControl.addEventListener('click', onCameraControl);
manageLicense.addEventListener('click', () => { location.href = 'license.html'; });

window.addEventListener('pagehide', () => { if (scanner) scanner.stop(); });
