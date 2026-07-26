import { SearchEngine, WebSearchResult } from '../types';
import { exaSearchSimple } from '../../exaService';

export const exaEngine: SearchEngine = {
  name: 'exa',
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    return exaSearchSimple(query, maxResults);
  },
};
