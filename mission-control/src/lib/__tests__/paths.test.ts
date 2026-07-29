import { describe, it, expect } from 'vitest'
import { resolveWithin } from '../paths'
import path from 'node:path'
import os from 'node:os'

/**
 * Build a platform-appropriate base dir. On Unix we use /tmp/sandbox;
 * on Windows we use a proper absolute temp dir so path.resolve works.
 */
const base = path.resolve(os.tmpdir(), 'mc-paths-sandbox')

/** Shortcut to join the base with sub-paths using the OS separator. */
const p = (...segments: string[]) => path.join(base, ...segments)

describe('resolveWithin', () => {
  it('resolves a simple relative path within base', () => {
    const result = resolveWithin(base, 'file.txt')
    expect(result).toBe(p('file.txt'))
  })

  it('resolves nested relative path', () => {
    const result = resolveWithin(base, 'subdir/file.txt')
    expect(result).toBe(p('subdir', 'file.txt'))
  })

  it('throws when path escapes base with ..', () => {
    expect(() => resolveWithin(base, '../escape.txt')).toThrow('Path escapes base directory')
  })

  it('throws when path tries deep escape', () => {
    expect(() => resolveWithin(base, '../../etc/passwd')).toThrow('Path escapes base directory')
  })

  it('throws for absolute path outside base', () => {
    expect(() => resolveWithin(base, '/etc/passwd')).toThrow('Path escapes base directory')
  })

  it('allows an absolute path within the base', () => {
    const result = resolveWithin(base, p('file.txt'))
    expect(result).toBe(p('file.txt'))
  })

  it('handles double slashes and normalizes', () => {
    const result = resolveWithin(base, 'subdir//file.txt')
    expect(result).toBe(p('subdir', 'file.txt'))
  })

  it('does not allow sibling directory access', () => {
    expect(() => resolveWithin(base, '../other/file.txt')).toThrow()
  })

  it('handles base dir with trailing slash', () => {
    const result = resolveWithin(base + path.sep, 'file.txt')
    expect(result).toBe(p('file.txt'))
  })
})
