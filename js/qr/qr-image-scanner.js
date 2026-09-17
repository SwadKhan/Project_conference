export async function scanQRFromImage(imageInput) {
    if (typeof jsQR === 'undefined') {
        throw new Error('jsQR library is not loaded. Please include jsQR.js.');
    }

    return new Promise((resolve, reject) => {
        const processImage = (img) => {
            const canvas = document.createElement('canvas');
            const maxDimension = 1200;
            let width = img.width;
            let height = img.height;
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width *= ratio;
                height *= ratio;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, width, height);

            const barcodeDetector = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
            
            const runFallback = () => {
                const imageData = ctx.getImageData(0, 0, width, height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'attemptBoth',
                });
                if (code && code.data) {
                    resolve({ data: code.data, source: 'jsQR' });
                } else {
                    reject(new Error('No QR code detected in this image.'));
                }
            };

            if (barcodeDetector) {
                barcodeDetector.detect(canvas).then(barcodes => {
                    if (barcodes.length > 0) {
                        resolve({ data: barcodes[0].rawValue, source: 'BarcodeDetector' });
                    } else {
                        runFallback();
                    }
                }).catch(() => {
                    runFallback();
                });
            } else {
                runFallback();
            }
        };

        if (imageInput instanceof File || imageInput instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => processImage(img);
                img.onerror = () => reject(new Error('Invalid image file.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(imageInput);
        } else if (imageInput instanceof HTMLImageElement) {
            if (imageInput.complete) {
                processImage(imageInput);
            } else {
                imageInput.onload = () => processImage(imageInput);
                imageInput.onerror = () => reject(new Error('Failed to load image element.'));
            }
        } else if (typeof imageInput === 'string') {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => processImage(img);
            img.onerror = () => reject(new Error('Failed to load image from URL.'));
            img.src = imageInput;
        } else {
            reject(new Error('Unsupported image input type. Please provide a File, Blob, HTMLImageElement, or URL string.'));
        }
    });
}
