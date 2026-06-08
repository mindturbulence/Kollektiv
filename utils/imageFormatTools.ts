import piexifModule from './piexif';
const piexif = piexifModule as any;

function extractPngTextChunks(buffer: ArrayBuffer): Record<string, string> {
    const dataView = new DataView(buffer);
    let offset = 8;
    const texts: Record<string, string> = {};

    while (offset < dataView.byteLength) {
        const length = dataView.getUint32(offset);
        const type = String.fromCharCode(
            dataView.getUint8(offset + 4),
            dataView.getUint8(offset + 5),
            dataView.getUint8(offset + 6),
            dataView.getUint8(offset + 7)
        );

        if (type === 'tEXt') {
            const data = new Uint8Array(buffer, offset + 8, length);
            let nullSec = 0;
            for (let i = 0; i < length; i++) {
                if (data[i] === 0) {
                    nullSec = i;
                    break;
                }
            }
            const keyword = new TextDecoder('utf-8').decode(data.subarray(0, nullSec));
            const textData = new TextDecoder('utf-8').decode(data.subarray(nullSec + 1));
            texts[keyword] = textData;
        } else if (type === 'iTXt') {
            const data = new Uint8Array(buffer, offset + 8, length);
            // iTXt structure:
            // Keyword (null terminated)
            // Compression flag (1 byte)
            // Compression method (1 byte)
            // Language tag (null terminated)
            // Translated keyword (null terminated)
            // Text
            let nullIndices = [];
            for (let i = 0; i < length; i++) {
                if (data[i] === 0) {
                    nullIndices.push(i);
                    if (nullIndices.length === 4) break; 
                }
            }
            // For simplicity, we just look at ComfyUI cases which may not compress
            if (nullIndices.length >= 2) {
                // The actual text is after the last null (which could be the 3rd or 4th depending on fields)
                // We'll roughly map it by just parsing string matching if standard fails, but ComfyUI usually uses tEXt.
            }
        }

        offset += 12 + length;
    }
    // Deep fallback search for string matching for ComfyUI if chunks failed parsing somehow
    if (!texts['prompt']) {
         const rawData = new Uint8Array(buffer);
         const fullText = new TextDecoder('utf-8').decode(rawData);
         if (fullText.includes('prompt') && fullText.includes('workflow')) {
              // Try to find the JSON objects
              const promptMatch = fullText.match(/prompt\u0000(\{"[^{]+\})/);
              if (promptMatch && promptMatch[1]) texts['prompt'] = promptMatch[1];
              const workflowMatch = fullText.match(/workflow\u0000(\{"[^{]+\})/);
              if (workflowMatch && workflowMatch[1]) texts['workflow'] = workflowMatch[1];
         }
    }
    
    return texts;
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64: string, type: string = 'image/jpeg'): Blob {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type });
}

function stringToUtf8Bytes(str: string): number[] {
    const utf8 = unescape(encodeURIComponent(str));
    const arr: number[] = [];
    for (let i = 0; i < utf8.length; i++) {
        arr.push(utf8.charCodeAt(i));
    }
    return arr;
}

export async function convertToJpgWithMetadata(blob: Blob, quality: number = 0.9): Promise<Blob> {
    // Determine if we actually need conversion (e.g. if it is already JPG, we might still want to recompress, but let's re-encode everything)
    
    const img = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        URL.revokeObjectURL(url);
        return blob;
    }
    
    // Draw white background in case it's a transparent PNG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const jpgDataUrl = canvas.toDataURL('image/jpeg', quality);
    const buffer = await blob.arrayBuffer();
    const header = new Uint8Array(buffer, 0, 8);
    const isPng = header.join(',') === '137,80,78,71,13,10,26,10';
    let userCommentStr = '';

    if (isPng) {
        const texts = extractPngTextChunks(buffer);
        if (texts['parameters']) {
            userCommentStr = texts['parameters'];
        } 
        else if (texts['prompt'] && texts['workflow']) {
            userCommentStr = `prompt:${texts['prompt']}\nworkflow:${texts['workflow']}`;
        }
    } else {
        const b64 = await blobToBase64(blob);
        try {
            const exifData = piexif.load(b64);
            // If it already has Exif UserComment, we just preserve all exif!
            const hasExif = (exifData["Exif"] && Object.keys(exifData["Exif"]).length > 0) || 
                            (exifData["0th"] && Object.keys(exifData["0th"]).length > 0);
            if (hasExif) {
                const dumped = piexif.dump(exifData);
                const newB64 = piexif.insert(dumped, jpgDataUrl);
                return base64ToBlob(newB64);
            }
        } catch(e) {
            console.warn("Failed to parse Exif from original JPEG", e);
        }
    }

    if (userCommentStr) {
        const signature = "UNICODE\0";
        const commentBytes = stringToUtf8Bytes(signature + userCommentStr);
        
        const newExif = {
            "0th": {},
            "Exif": {
                [piexif.ExifIFD.UserComment]: commentBytes
            },
            "GPS": {}
        };
        try {
            const exifStr = piexif.dump(newExif);
            const finalDataUrl = piexif.insert(exifStr, jpgDataUrl);
            return base64ToBlob(finalDataUrl);
        } catch(e) {
             console.error("Failed to write Exif to new JPEG", e);
             return base64ToBlob(jpgDataUrl);
        }
    }
    
    return base64ToBlob(jpgDataUrl);
}
