import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { buildLinkGraph, extractWikiLinks } from '@/lib/memory-utils'
import { readFile } from 'fs/promises'
import { logger } from '@/lib/logger'
import { isPathAllowed, resolveSafeMemoryPath } from '@/lib/memory-path'
import { resolveWorkspaceMemoryAccess } from '@/lib/workspace-isolation'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  const memoryAccess = resolveWorkspaceMemoryAccess(auth.user)
  if (!memoryAccess) {
    return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('file')

  try {
    if (filePath) {
      if (!isPathAllowed(filePath)) {
        return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
      }
      const fullPath = await resolveSafeMemoryPath(memoryAccess.root, filePath)
      const content = await readFile(fullPath, 'utf-8')
      const links = extractWikiLinks(content)

      // Also find backlinks from the full graph
      const graph = await buildLinkGraph(memoryAccess.root)
      const node = graph.nodes[filePath]
      const incoming = node?.incoming ?? []
      const outgoing = node?.outgoing ?? []

      return NextResponse.json({
        file: filePath,
        wikiLinks: links,
        outgoing,
        incoming,
      })
    }

    // Return full link graph
    const graph = await buildLinkGraph(memoryAccess.root)

    // Serialize for the frontend (strip wikiLinks detail for the full graph)
    const nodes = Object.values(graph.nodes).map((n) => ({
      path: n.path,
      name: n.name,
      outgoing: n.outgoing,
      incoming: n.incoming,
      linkCount: n.outgoing.length + n.incoming.length,
      hasSchema: n.schema !== null,
    }))

    return NextResponse.json({
      nodes,
      totalFiles: graph.totalFiles,
      totalLinks: graph.totalLinks,
      orphans: graph.orphans,
    })
  } catch (err) {
    logger.error({ err }, 'Memory links API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
