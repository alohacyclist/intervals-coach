import { describe, expect, it, vi } from 'vitest'
import { settle } from '../src/ui/components/StrengthCard.tsx'
import { ApiError } from '../src/ui/api.ts'

describe('strength toggle', () => {
  it('surfaces a failed save instead of swallowing it', async () => {
    const onSaved = vi.fn()
    const message = await settle(() => Promise.reject(new ApiError('Keine Verbindung.', 0)), onSaved)
    expect(message).toBe('Keine Verbindung.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('reloads and reports nothing when the save worked', async () => {
    const onSaved = vi.fn()
    expect(await settle(() => Promise.resolve({ ok: true }), onSaved)).toBeNull()
    expect(onSaved).toHaveBeenCalledOnce()
  })
})
