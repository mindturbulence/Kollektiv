
export interface YouTubeMetadata {
  title: string;
  description: string;
  privacyStatus: 'public' | 'private' | 'unlisted';
}

/**
 * Publishes video to YouTube using the local Vite proxy.
 * Proxying is required to bypass COEP (Cross-Origin Embedder Policy) 
 * which blocks requests to Google APIs from a 'require-corp' environment.
 */
export const publishToYouTube = async (
    videoBlob: Blob,
    metadata: YouTubeMetadata,
    accessToken: string,
    onProgress?: (progress: number) => void
) => {
    // Route through our local proxy defined in vite.config.ts
    const PROXY_BASE = '/google-api';

    // 1. Initialize resumable upload
    const initResponse = await fetch(`${PROXY_BASE}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': videoBlob.size.toString(),
            'X-Upload-Content-Type': videoBlob.type,
        },
        body: JSON.stringify({
            snippet: {
                title: metadata.title,
                description: metadata.description,
                categoryId: '24', // Entertainment
            },
            status: {
                privacyStatus: metadata.privacyStatus,
                selfDeclaredMadeForKids: false,
            }
        })
    });

    if (!initResponse.ok) {
        let errorMsg = "Upload initialization failed.";
        try {
            const error = await initResponse.json();
            errorMsg = error.error?.message || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
    }

    // The vite proxy rewrites this Location header to point back to /google-api/...
    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) throw new Error("Upload location not received from gateway.");

    // 2. Perform the actual upload with XHR to track progress
    return new Promise<{ id: string, url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.setRequestHeader('Content-Type', videoBlob.type);
        
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    onProgress((e.loaded / e.total) * 100);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result = JSON.parse(xhr.response);
                    resolve({
                        id: result.id,
                        url: `https://www.youtube.com/watch?v=${result.id}`
                    });
                } catch (e) {
                    reject(new Error("Failed to parse registry response."));
                }
            } else {
                reject(new Error(`Transmission failed (${xhr.status}): ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => reject(new Error("Neural link interrupted during transmission."));
        xhr.send(videoBlob);
    });
};
