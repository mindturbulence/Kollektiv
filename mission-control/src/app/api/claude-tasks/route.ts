import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getClaudeCodeTasks } from '@/lib/claude-tasks'
import { denyUnscopedResourceForStrictWorkspace } from '@/lib/workspace-isolation'

/**
 * GET /api/claude-tasks — Returns Claude Code teams and tasks
 * Read-only bridge: MC reads from ~/.claude/tasks/ and ~/.claude/teams/
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isolationDeny = denyUnscopedResourceForStrictWorkspace(
    auth.user,
    'runtime_tasks',
    new URL(request.url).pathname,
  )
  if (isolationDeny) return isolationDeny

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const result = getClaudeCodeTasks(force)

  return NextResponse.json(result)
}
