//---------------------------------------------------------------------
// license.html - hold, show, replace or delete the ship's license.
//
//   page load       GET  /haslicense   -> which buttons apply
//   Add license     scan a JSON QR     -> POST /savelicense  -> reload
//   Delete license  confirm            -> POST /deletelicense -> reload
//   Show license    GET  /getlicense   -> draw it as a QR code
//   Authenticate    -> auth.html
//---------------------------------------------------------------------

import { generateQR } from './qr/qr-generator.js';
import { QRScanner } from './qr/qr-scanner.js';

// --- Elements --------------------------------------------------------
const addLicense    = document.getElementById('add-license');
const showLicense   = document.getElementById('show-license');
const deleteLicense = document.getElementById('delete-license');
const authenticate  = document.getElementById('authenticate');

const scannerPanel  = document.getElementById('scanner-panel');
const scannerVideo  = document.getElementById('scanner-video');
const cameraControl = document.getElementById('camera-control');

const licenseQr     = document.getElementById('license-qr');
const status        = document.getElementById('status');

const QR_OPTIONS = { errorCorrection: 'M', cellSize: 6, margin: 2 };

// --- State -----------------------------------------------------------
let scanner = null;   // created once, on the first scan
let cameraIndex = 0;  // which of scanner.availableCameras is in use

function setStatus(text) {
    status.textContent = text || '';
}

//-----------------------------------------------------------------
// Page load: does this ship hold a license?
//-----------------------------------------------------------------
async function refreshLicenseState() {
    try {
        const response = await fetch('/haslicense', { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error('server answered ' + response.status);

        const payload = await response.json();

        if (payload && payload.status === true) {
            addLicense.hidden = true;
            authenticate.hidden = false;
            showLicense.hidden = false;
            deleteLicense.hidden = false;

            licenseQr.innerHTML = '';
            licenseQr.hidden = true;
            setStatus('Ready.');
            return;
        }

        withoutLicense('No license.');
    } catch (e) {
        // A failure to ask is treated the same as "no license": the only
        // thing the ship can usefully do is add one.
        console.error('haslicense failed:', e);
        withoutLicense('Could not read license state: ' + e.message);
    }
}

function withoutLicense(message) {
    addLicense.hidden = false;
    authenticate.hidden = true;
    showLicense.hidden = true;
    deleteLicense.hidden = true;
    licenseQr.hidden = true;
    setStatus(message);
}

//-----------------------------------------------------------------
// Add license: scan a JSON code, post it, reload.
//-----------------------------------------------------------------
async function startAddLicense() {
    scannerPanel.hidden = false;
    setStatus('Point the camera at the license QR code…');

    if (!scanner) {
        scanner = new QRScanner({
            video: scannerVideo,
            onResult: onLicenseScanned,
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

async function onLicenseScanned({ data }) {
    let license;
    try {
        license = JSON.parse(data);
    } catch (e) {
        // Not a license. Keep the camera running so the next code can be tried.
        setStatus('That code is not JSON — still scanning…');
        return;
    }

    scanner.stop();
    scannerPanel.hidden = true;
    setStatus('Saving license…');

    try {
        await fetch('/savelicense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(license)
        });
    } catch (e) {
        console.error('savelicense failed:', e);
    } finally {
        // Reload either way: the page then shows the true state of things.
        location.reload();
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
        setStatus('Point the camera at the license QR code…');
        return;
    }

    scanner.stop();
    scannerPanel.hidden = true;
    setStatus('Scanner stopped.');
}

//-----------------------------------------------------------------
// Delete license.
//-----------------------------------------------------------------
async function onDeleteLicense() {
    if (!window.confirm('Delete license?')) return;

    setStatus('Deleting license…');
    try {
        await fetch('/deletelicense', { method: 'POST' });
    } catch (e) {
        console.error('deletelicense failed:', e);
    } finally {
        location.reload();
    }
}

//-----------------------------------------------------------------
// Show license as a QR code.
//-----------------------------------------------------------------
async function onShowLicense() {
    setStatus('Reading license…');

    let license;
    try {
        const response = await fetch('/getlicense', { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error('server answered ' + response.status);
        license = await response.json();
    } catch (e) {
        console.error('getlicense failed:', e);
        licenseQr.hidden = true;
        setStatus('Could not read the license: ' + e.message);
        return;
    }

    try {
        const qr = generateQR(JSON.stringify(license), QR_OPTIONS);
        licenseQr.innerHTML = '';
        licenseQr.appendChild(qr.createImageElement());
        licenseQr.hidden = false;
        setStatus('Licence shown as a QR code.');
    } catch (e) {
        // Usually means the licence is too large for one code.
        console.error('QR generation failed:', e);
        licenseQr.innerHTML = '';
        licenseQr.hidden = true;
        setStatus(e.message);
    }
}

//-----------------------------------------------------------------
// Wiring
//-----------------------------------------------------------------
addLicense.addEventListener('click', startAddLicense);
deleteLicense.addEventListener('click', onDeleteLicense);
showLicense.addEventListener('click', onShowLicense);
cameraControl.addEventListener('click', onCameraControl);
authenticate.addEventListener('click', () => { location.href = 'auth.html'; });

// Never leave the camera running behind a closed page.
window.addEventListener('pagehide', () => { if (scanner) scanner.stop(); });

refreshLicenseState();
