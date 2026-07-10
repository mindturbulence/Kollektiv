import { useEffect, useRef } from 'react';

/**
 * Tracks object URLs created by a component and revokes them all on unmount.
 * Wrap creations inline: setUrl(track(URL.createObjectURL(blob)));
 * Early release (replaced/removed items): revoke(oldUrl);
 */
export function useObjectUrls() {
    const urlsRef = useRef(new Set<string>());

    useEffect(() => {
        const urls = urlsRef.current;
        return () => {
            urls.forEach(u => URL.revokeObjectURL(u));
            urls.clear();
        };
    }, []);

    const track = (url: string): string => {
        urlsRef.current.add(url);
        return url;
    };

    const revoke = (url: string | null | undefined): void => {
        if (!url) return;
        URL.revokeObjectURL(url);
        urlsRef.current.delete(url);
    };

    return { track, revoke };
}
