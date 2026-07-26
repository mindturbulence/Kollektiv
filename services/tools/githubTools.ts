import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

async function callReachGithub(body: Record<string, any>): Promise<{ ok: boolean; data: any }> {
  const res = await fetch('/api/reach/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export const githubTools: AssistantTool[] = [
  {
    name: 'github_get_repo',
    description: 'Get metadata for a GitHub repository — description, stars, forks, open issues, license, default branch, topics. Use when the user asks about a specific repo.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner/org, e.g. "facebook".' },
        repo: { type: 'string', description: 'Repository name, e.g. "react".' },
      },
      required: ['owner', 'repo'],
    },
    execute: async ({ owner, repo }) => {
      const { ok, data } = await callReachGithub({ op: 'repo_info', owner: String(owner), repo: String(repo) });
      if (!ok) return `Error: ${data?.error || 'GitHub request failed'}`;
      appEventBus.emit('webSearchResults', [{
        title: data.fullName,
        url: data.url,
        markdown: `${data.description || '(no description)'}\n\n⭐ ${data.stars} stars · 🍴 ${data.forks} forks · ${data.openIssues} open issues${data.license ? ` · ${data.license}` : ''}`,
        source: 'fetch',
        engine: 'github',
        timestamp: Date.now(),
      } as WebResult]);
      return JSON.stringify(data);
    },
  },
  {
    name: 'github_search',
    description: 'Search GitHub for repositories, code, or issues/PRs matching a query. Use `type` to pick which. Note: `type: "code"` requires GITHUB_TOKEN to be configured server-side (GitHub\'s code search API has no unauthenticated tier, unlike repo/issue search) — prefer "repos" or "issues" if that\'s not set.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['repos', 'code', 'issues'], description: 'What to search: "repos", "code", or "issues" (also covers PRs).' },
        query: { type: 'string', description: 'GitHub search query, e.g. "language:typescript stars:>1000 llm agent".' },
        maxResults: { type: 'integer', description: 'Max results to return (default 10, max 20).' },
      },
      required: ['type', 'query'],
    },
    execute: async ({ type, query, maxResults }) => {
      const { ok, data } = await callReachGithub({ op: 'search', type, query: String(query), maxResults: maxResults ? Number(maxResults) : undefined });
      if (!ok) return `Error: ${data?.error || 'GitHub search failed'}`;
      const items = Array.isArray(data) ? data : [];
      if (items.length > 0) {
        appEventBus.emit('webSearchResults', items.slice(0, 3).map((i: any): WebResult => ({
          title: i.title, url: i.url, markdown: i.description || '', source: 'fetch', engine: 'github', timestamp: Date.now(),
        })));
      }
      return JSON.stringify(data);
    },
  },
  {
    name: 'github_get_file',
    description: 'Fetch the raw content of a file from a GitHub repo (or its README if no path is given). Returns decoded text, truncated if very large.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner/org.' },
        repo: { type: 'string', description: 'Repository name.' },
        path: { type: 'string', description: 'File path within the repo. Omit to fetch the README.' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA. Omit for the default branch.' },
      },
      required: ['owner', 'repo'],
    },
    execute: async ({ owner, repo, path, ref }) => {
      const { ok, data } = await callReachGithub({
        op: 'file', owner: String(owner), repo: String(repo),
        path: path ? String(path) : undefined, ref: ref ? String(ref) : undefined,
      });
      if (!ok) return `Error: ${data?.error || 'GitHub file fetch failed'}`;
      appEventBus.emit('webSearchResults', [{
        title: `${owner}/${repo}: ${data.path}`,
        url: data.url,
        markdown: data.content,
        source: 'fetch',
        engine: 'github',
        timestamp: Date.now(),
      } as WebResult]);
      return `${data.content}${data.truncated ? '\n\n[...truncated]' : ''}`;
    },
  },
];
