export const webSearchService = {
    search: async (query: string): Promise<string> => {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.formattedText) {
                    return `Web Search Results (via DuckDuckGo/Web):\n\n${data.formattedText}\n\n`;
                }
            }
            
            // Client-side fallback to Wikipedia API if the route fails
            const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
            const wikiResp = await fetch(url);
            const wikiData = await wikiResp.json();
            
            if (wikiData.query && wikiData.query.search && wikiData.query.search.length > 0) {
                const results = wikiData.query.search.slice(0, 3);
                let snippets = results.map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet.replace(/<\/?span[^>]*>/g, '').replace(/&quot;/g, '"')}`).join('\n\n');
                return `Web Search Results (via Wikipedia Fallback):\n\n${snippets}\n\n`;
            }
            return "No web search results found for the query.";
        } catch (err) {
            console.error("Web Search error:", err);
            return "Failed to perform web search.";
        }
    }
};
