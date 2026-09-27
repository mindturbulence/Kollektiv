import { describe, expect, it } from 'vitest'
import { createScopes } from './index'

describe('createScopes', () => {
  it('returns null when navigator.gpu is unavailable', async () => {
    const scopes = await createScopes()
    expect(scopes).toBeNull()
  })
})
