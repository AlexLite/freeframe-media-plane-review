import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCALE_STORAGE_KEY,
  isLocale,
  useLocaleStore,
} from '@/stores/locale-store'

describe('locale store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'en'
    useLocaleStore.setState({ locale: 'en' })
    vi.restoreAllMocks()
  })

  it('switches the document language and persists the choice', () => {
    useLocaleStore.getState().setLocale('ru')

    expect(useLocaleStore.getState().locale).toBe('ru')
    expect(document.documentElement.lang).toBe('ru')
    expect(JSON.parse(localStorage.getItem(LOCALE_STORAGE_KEY) ?? '{}').state.locale).toBe('ru')
  })

  it('synchronizes a valid profile locale and ignores invalid values', () => {
    useLocaleStore.getState().syncFromServer({ locale: 'ru' })
    expect(useLocaleStore.getState().locale).toBe('ru')

    useLocaleStore.getState().syncFromServer({ locale: 'de' })
    expect(useLocaleStore.getState().locale).toBe('ru')
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
  })

  it('saves the selected locale to the authenticated profile', async () => {
    localStorage.setItem('ff_access_token', 'test-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    useLocaleStore.getState().setLocale('ru')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/preferences'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ locale: 'ru' }),
      }),
    )
  })
})
