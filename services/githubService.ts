import { reachFetch } from './reachHttp';

const API_BASE = 'https://api.github.com';
const MAX_FILE_CHARS = 20_000;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubGet(path: string): Promise<any> {
  const res = await reachFetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Not found (check owner/repo/path).');
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub rate limit exceeded. Set GITHUB_TOKEN to raise the limit (60/hr unauthenticated, 5000/hr with a token).');
    }
    throw new Error(`GitHub returned ${res.status}`);
  }
  return res.json();
}

export interface RepoInfo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  defaultBranch: string;
  topics: string[];
  url: string;
}

export async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const data = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  return {
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    license: data.license?.spdx_id ?? null,
    defaultBranch: data.default_branch,
    topics: data.topics || [],
    url: data.html_url,
  };
}

export interface GithubSearchItem {
  title: string;
  url: string;
  description?: string;
}

export async function search(type: 'repos' | 'code' | 'issues', query: string, maxResults = 10): Promise<GithubSearchItem[]> {
  if (type === 'code' && !process.env.GITHUB_TOKEN) {
    throw new Error('Code search requires a GitHub token — unlike repo/issue search, GitHub\'s code search API does not support unauthenticated requests. Set GITHUB_TOKEN.');
  }
  const endpoint = type === 'repos' ? 'repositories' : type;
  const data = await githubGet(`/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=${Math.min(Math.max(1, maxResults), 20)}`);
  const items = data.items || [];
  if (type === 'repos') {
    return items.map((i: any) => ({ title: i.full_name, url: i.html_url, description: i.description }));
  }
  if (type === 'code') {
    return items.map((i: any) => ({ title: `${i.repository.full_name}: ${i.path}`, url: i.html_url }));
  }
  return items.map((i: any) => ({ title: i.title, url: i.html_url, description: `#${i.number} (${i.state})` }));
}

export interface GithubFileResult {
  path: string;
  content: string;
  truncated: boolean;
  url: string;
}

export async function getFile(owner: string, repo: string, path?: string, ref?: string): Promise<GithubFileResult> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const endpoint = path
    ? `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
    : `${base}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const data = await githubGet(endpoint);
  if (Array.isArray(data)) {
    throw new Error(`"${path}" is a directory, not a file. List entries: ${data.map((d: any) => d.name).join(', ')}`);
  }
  const decoded = data.content ? Buffer.from(data.content, data.encoding || 'base64').toString('utf-8') : '';
  const truncated = decoded.length > MAX_FILE_CHARS;
  return {
    path: data.path,
    content: truncated ? decoded.slice(0, MAX_FILE_CHARS) : decoded,
    truncated,
    url: data.html_url,
  };
}
