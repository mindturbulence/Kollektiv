export interface YouTubeMetadata {
  title: string;
  description: string;
  privacyStatus: 'public' | 'private' | 'unlisted';
}

export const publishToYouTube = async (
    videoBlob: Blob,
    metadata: YouTubeMetadata,
    accessToken: string,
    onProgress?: (progress: number) => void
) => {
    // 1. Initialize resumable upload
    const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
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
        const error = await initResponse.json();
        throw new Error(error.error?.message || "Upload initialization failed.");
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) throw new Error("Upload location not received.");

    // 2. Perform the actual upload with XHR to track progress (fetch doesn't support upload progress yet)
    return new Promise<{ id: string, url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
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
                    reject(new Error("Failed to parse YouTube response."));
                }
            } else {
                reject(new Error(`YouTube upload failed with status ${xhr.status}: ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => reject(new Error("Network error during YouTube upload."));
        xhr.send(videoBlob);
    });
};