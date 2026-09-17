export class QRScanner {
    constructor(options = {}) {
        this.videoElement = options.video;
        this.onResult = options.onResult || (() => {});
        this.onError = options.onError || console.error;
        
        if (!this.videoElement || !(this.videoElement instanceof HTMLVideoElement)) {
            throw new Error('A valid HTMLVideoElement is required for the QRScanner.');
        }

        this.currentStream = null;
        this.scanInterval = null;
        this.lastDecodedText = null;
        this.availableCameras = [];
        this.currentCameraIndex = 0;
        
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.barcodeDetector = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
        
        this.tick = this.tick.bind(this);
    }

    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            return this.availableCameras;
        } catch (e) {
            this.onError(new Error('Error enumerating devices: ' + e.message));
            return [];
        }
    }

    async start(deviceId = null) {
        this.stop(); 
        this.lastDecodedText = null; 
        
        try {
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
            };
            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.currentStream;
            this.videoElement.setAttribute('playsinline', true);
            this.videoElement.play();

            this.scanInterval = requestAnimationFrame(this.tick);
            
            if (this.availableCameras.length === 0) {
                await this.getCameras();
            }
        } catch (e) {
            this.onError(new Error('Camera access denied or unavailable: ' + e.message));
        }
    }

    stop() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        if (this.scanInterval) {
            cancelAnimationFrame(this.scanInterval);
            this.scanInterval = null;
        }
    }
    
    destroy() {
        this.stop();
        this.videoElement.srcObject = null;
    }

    async switchCamera() {
        if (this.availableCameras.length > 1) {
            this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
            await this.start(this.availableCameras[this.currentCameraIndex].deviceId);
        }
    }

    async tick() {
        if (!this.currentStream || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            this.scanInterval = requestAnimationFrame(this.tick);
            return;
        }

        this.canvas.width = this.videoElement.videoWidth;
        this.canvas.height = this.videoElement.videoHeight;
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
        
        let found = false;

        if (this.barcodeDetector) {
            try {
                const barcodes = await this.barcodeDetector.detect(this.canvas);
                if (barcodes.length > 0) {
                    this._handleResult(barcodes[0].rawValue);
                    found = true;
                }
            } catch (e) {
            }
        }

        if (!found && typeof jsQR !== 'undefined') {
            try {
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert',
                });
                if (code && code.data) {
                    this._handleResult(code.data);
                }
            } catch (e) {
            }
        }

        if (this.currentStream) {
            this.scanInterval = requestAnimationFrame(this.tick);
        }
    }
    
    _handleResult(text) {
        if (text === this.lastDecodedText) return;
        this.lastDecodedText = text;
        this.onResult({ data: text });
    }
}
