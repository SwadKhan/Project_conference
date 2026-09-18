export function getQRByteLength(text) {
    if (!text) return 0;
    return new Blob([text]).size; 
}
