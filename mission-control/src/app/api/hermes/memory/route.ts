import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getHermesMemory } from '@/lib/hermes-memory'
import { denyUnscopedResourceForStrictWorkspace } from '@/lib/workspace-isolation'

/**
 * GET /api/hermes/memory — Returns Hermes memory file contents
 * Read-only bridge: MC reads from ~/.hermes/memories/
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isolationDenied = denyUnscopedResourceForStrictWorkspace(auth.user, 'runtime_memory', new URL(request.url).pathname)
  if (isolationDenied) return isolationDenied

  const result = getHermesMemory()

  return NextResponse.json(result)
}
