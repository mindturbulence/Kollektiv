import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function handlerBody(source: string, method: string): string {
  const start = source.indexOf(`export async function ${method}(`)
  expect(start, `${method} handler`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

function expectGuardBefore(source: string, method: string, firstSensitiveOperation: string) {
  const handler = handlerBody(source, method)
  const authIndex = handler.indexOf('requireRole(')
  const guardIndex = handler.indexOf('denyUnscopedResourceForStrictWorkspace(')
  const sensitiveIndex = handler.indexOf(firstSensitiveOperation)

  expect(authIndex, `${method} authenticates first`).toBeGreaterThanOrEqual(0)
  expect(guardIndex, `${method} has an isolation guard`).toBeGreaterThan(authIndex)
  expect(sensitiveIndex, `${method} sensitive operation`).toBeGreaterThanOrEqual(0)
  expect(guardIndex, `${method} guard precedes sensitive work`).toBeLessThan(sensitiveIndex)
}

describe('deployment runtime configuration isolation', () => {
  it('guards cron reads and mutations before global state access or body parsing', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/cron/route.ts'), 'utf8')

    expectGuardBefore(source, 'GET', 'const { searchParams }')
    expectGuardBefore(source, 'POST', 'request.json()')
  })

  it('guards integration reads and mutations before probes, parsing, or limiting', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/integrations/route.ts'), 'utf8')

    expectGuardBefore(source, 'GET', 'readEnvFile()')
    expectGuardBefore(source, 'PUT', 'request.json()')
    expectGuardBefore(source, 'DELETE', 'request.json()')
    expectGuardBefore(source, 'POST', 'mutationLimiter(request)')
  })
})
