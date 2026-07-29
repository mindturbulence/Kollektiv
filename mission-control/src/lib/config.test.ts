import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The config module uses `path.join()` internally — on Windows, a leading `/`
 * becomes the current-drive root (e.g. `\tmp\...`).  Use `path.join()` here
 * too so the expected values match whatever the module produces.
 */
function p(segment: string): string {
  return path.join(segment)
}

/** Join path segments using `path.join()` — matches config module's behavior. */
function j(...segments: string[]): string {
  return path.join(...segments)
}

async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules()

  const original = {
    MISSION_CONTROL_DATA_DIR: process.env.MISSION_CONTROL_DATA_DIR,
    MISSION_CONTROL_BUILD_DATA_DIR: process.env.MISSION_CONTROL_BUILD_DATA_DIR,
    MISSION_CONTROL_BUILD_DB_PATH: process.env.MISSION_CONTROL_BUILD_DB_PATH,
    MISSION_CONTROL_BUILD_TOKENS_PATH: process.env.MISSION_CONTROL_BUILD_TOKENS_PATH,
    MISSION_CONTROL_DB_PATH: process.env.MISSION_CONTROL_DB_PATH,
    MISSION_CONTROL_TOKENS_PATH: process.env.MISSION_CONTROL_TOKENS_PATH,
    NEXT_PHASE: process.env.NEXT_PHASE,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  const mod = await import('./config')

  if (original.MISSION_CONTROL_DATA_DIR === undefined) delete process.env.MISSION_CONTROL_DATA_DIR
  else process.env.MISSION_CONTROL_DATA_DIR = original.MISSION_CONTROL_DATA_DIR

  if (original.MISSION_CONTROL_BUILD_DATA_DIR === undefined) delete process.env.MISSION_CONTROL_BUILD_DATA_DIR
  else process.env.MISSION_CONTROL_BUILD_DATA_DIR = original.MISSION_CONTROL_BUILD_DATA_DIR

  if (original.MISSION_CONTROL_BUILD_DB_PATH === undefined) delete process.env.MISSION_CONTROL_BUILD_DB_PATH
  else process.env.MISSION_CONTROL_BUILD_DB_PATH = original.MISSION_CONTROL_BUILD_DB_PATH

  if (original.MISSION_CONTROL_BUILD_TOKENS_PATH === undefined) delete process.env.MISSION_CONTROL_BUILD_TOKENS_PATH
  else process.env.MISSION_CONTROL_BUILD_TOKENS_PATH = original.MISSION_CONTROL_BUILD_TOKENS_PATH

  if (original.MISSION_CONTROL_DB_PATH === undefined) delete process.env.MISSION_CONTROL_DB_PATH
  else process.env.MISSION_CONTROL_DB_PATH = original.MISSION_CONTROL_DB_PATH

  if (original.MISSION_CONTROL_TOKENS_PATH === undefined) delete process.env.MISSION_CONTROL_TOKENS_PATH
  else process.env.MISSION_CONTROL_TOKENS_PATH = original.MISSION_CONTROL_TOKENS_PATH

  if (original.NEXT_PHASE === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = original.NEXT_PHASE

  return mod.config
}

describe('config data paths', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('derives db and token paths from MISSION_CONTROL_DATA_DIR', async () => {
    const config = await loadConfigWithEnv({
      MISSION_CONTROL_DATA_DIR: '/tmp/mission-control-data',
      MISSION_CONTROL_DB_PATH: undefined,
      MISSION_CONTROL_TOKENS_PATH: undefined,
    })

    // dataDir stores the raw env var value as-is.
    // dbPath/tokensPath use path.join() when falling through to defaults.
    expect(config.dataDir).toBe('/tmp/mission-control-data')
    expect(config.dbPath).toBe(j('/tmp/mission-control-data', 'mission-control.db'))
    expect(config.tokensPath).toBe(j('/tmp/mission-control-data', 'mission-control-tokens.json'))
  })

  it('respects explicit db and token path overrides', async () => {
    const config = await loadConfigWithEnv({
      MISSION_CONTROL_DATA_DIR: '/tmp/mission-control-data',
      MISSION_CONTROL_DB_PATH: '/tmp/custom.db',
      MISSION_CONTROL_TOKENS_PATH: '/tmp/custom-tokens.json',
    })

    expect(config.dataDir).toBe('/tmp/mission-control-data')
    // Explicit overrides are stored as-is (not run through path.join).
    expect(config.dbPath).toBe('/tmp/custom.db')
    expect(config.tokensPath).toBe('/tmp/custom-tokens.json')
  })

  it('uses a build-scoped worker data dir during next build', async () => {
    const config = await loadConfigWithEnv({
      NEXT_PHASE: 'phase-production-build',
      MISSION_CONTROL_DATA_DIR: '/tmp/runtime-data',
      MISSION_CONTROL_BUILD_DATA_DIR: '/tmp/build-scratch',
      MISSION_CONTROL_DB_PATH: undefined,
      MISSION_CONTROL_TOKENS_PATH: undefined,
    })

    // The scratch root is built via path.join, which on Windows uses `\`.
    const scratchRoot = p('/tmp/build-scratch')
    const sepPattern = path.sep === '\\' ? '\\\\' : '/'
    expect(config.dataDir).toMatch(new RegExp(
      `^${scratchRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${sepPattern}worker-[^\\/]+$`
    ))
    expect(config.dbPath).toMatch(new RegExp(
      `^${scratchRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${sepPattern}worker-[^\\/]+${sepPattern}mission-control\\.db$`
    ))
    expect(config.tokensPath).toMatch(new RegExp(
      `^${scratchRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${sepPattern}worker-[^\\/]+${sepPattern}mission-control-tokens\\.json$`
    ))
  })

  it('allocates a distinct private scratch directory for each build worker', async () => {
    const env = {
      NEXT_PHASE: 'phase-production-build',
      MISSION_CONTROL_BUILD_DATA_DIR: '/tmp/build-scratch',
      MISSION_CONTROL_BUILD_DB_PATH: undefined,
      MISSION_CONTROL_BUILD_TOKENS_PATH: undefined,
    }

    const first = await loadConfigWithEnv(env)
    const second = await loadConfigWithEnv(env)

    expect(first.dataDir).not.toBe(second.dataDir)
  })

  it('prefers build-specific db and token overrides during next build', async () => {
    const config = await loadConfigWithEnv({
      NEXT_PHASE: 'phase-production-build',
      MISSION_CONTROL_DATA_DIR: '/tmp/runtime-data',
      MISSION_CONTROL_DB_PATH: '/tmp/runtime.db',
      MISSION_CONTROL_TOKENS_PATH: '/tmp/runtime-tokens.json',
      MISSION_CONTROL_BUILD_DB_PATH: '/tmp/build.db',
      MISSION_CONTROL_BUILD_TOKENS_PATH: '/tmp/build-tokens.json',
    })

    const expectedBuildRoot = path.join(os.tmpdir(), 'mission-control-build')
    const escapedRoot = expectedBuildRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sepPattern = path.sep === '\\' ? '\\\\' : '/'
    expect(config.dataDir).toMatch(new RegExp(`^${escapedRoot}${sepPattern}worker-[^\\/]+$`))
    // Build-specific overrides are stored as-is (not run through path.join).
    expect(config.dbPath).toBe('/tmp/build.db')
    expect(config.tokensPath).toBe('/tmp/build-tokens.json')
  })
})
