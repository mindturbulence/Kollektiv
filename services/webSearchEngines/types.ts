export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Engine source identifier, e.g. "duckduckgo", "brave", "exa" */
  source: string;
}

/** Every search engine module implements this interface. */
export interface SearchEngine {
  readonly name: string;
  search(query: string, maxResults?: number): Promise<WebSearchResult[]>;
}

export interface FetchedContent {
  url: string;
  title: string;
  content: string;           // Full Markdown content
  excerpt: string;            // ~200 char excerpt
  success: boolean;
  error?: string;
}

export interface SearchOptions {
  engines?: string[];        // engine names to use; defaults to env DEFAULT_SEARCH_ENGINES
  maxResults?: number;        // total max results across all engines (default 8)
  maxPerEngine?: number;      // max per engine before merging (default 5)
  fetchContent?: boolean;     // if true, fetch full page content for top results
}

export interface SearchResponse {
  query: string;
  results: WebSearchResult[];
  enginesUsed: string[];
  engineFailures: { engine: string; error: string }[];
  fetchedContent?: FetchedContent[];  // populated when fetchContent is true
}
