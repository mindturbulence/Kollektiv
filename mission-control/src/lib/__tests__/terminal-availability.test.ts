import { describe, it, expect } from 'vitest'
import { isTerminalSupported } from '../terminal-availability'

describe('isTerminalSupported', () => {
  it('is false on Windows, where tmux does not exist', () => {
    expect(isTerminalSupported('win32')).toBe(false)
  })

  it('is true on platforms where tmux can be installed', () => {
    expect(isTerminalSupported('darwin')).toBe(true)
    expect(isTerminalSupported('linux')).toBe(true)
  })

  it('is false for unknown platforms rather than optimistically true', () => {
    expect(isTerminalSupported('haiku')).toBe(false)
  })
})
