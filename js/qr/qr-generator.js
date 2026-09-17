export function generateQR(data, options = {}) {
    if (!data) {
        throw new Error('Data is required for QR generation');
    }

    const errorCorrection = options.errorCorrection || 'M';
    const margin = options.margin !== undefined ? options.margin : 2;
    const cellSize = options.cellSize !== undefined ? options.cellSize : 6;

    if (typeof qrcode === 'undefined') {
        throw new Error('qrcode library is not loaded. Please include qrcode.js.');
    }

    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }

    try {
        const qr = qrcode(0, errorCorrection);
        qr.addData(data);
        qr.make();
        
        const dataUrl = qr.createDataURL(cellSize, margin);
        const moduleCount = qr.getModuleCount();
        const size = moduleCount * cellSize + margin * 2;
        
        return {
            data,
            dataUrl,
            width: size,
            height: size,
            moduleCount,
            createCanvas: () => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = size;
                        canvas.height = size;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas);
                    };
                    img.onerror = reject;
                    img.src = dataUrl;
                });
            },
            createImageElement: () => {
                const img = new Image();
                img.src = dataUrl;
                img.width = size;
                img.height = size;
                img.alt = "QR Code";
                return img;
            }
        };
    } catch (e) {
        throw new Error('QR generation failed: ' + e.message);
    }
}
