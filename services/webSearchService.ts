export const webSearchService = {
    search: async (query: string): Promise<string> => {
        try {
            const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.query && data.query.search && data.query.search.length > 0) {
                const results = data.query.search.slice(0, 3);
                let snippets = results.map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet.replace(/<\/?span[^>]*>/g, '').replace(/&quot;/g, '"')}`).join('\n\n');
                return `Web Search Results (via Wikipedia):\n\n${snippets}\n\n`;
            }
            return "No web search results found for the query.";
        } catch (err) {
            console.error("Web Search error:", err);
            return "Failed to perform web search.";
        }
    }
};
