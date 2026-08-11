import * as React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/login'
let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}))

import { LocaleInitializer } from '@/components/shared/locale-initializer'
import { useLocaleStore } from '@/stores/locale-store'
import { useAuthStore } from '@/stores/auth-store'

describe('LocaleInitializer client-side navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    pathname = '/login'
    searchParams = new URLSearchParams()
    useAuthStore.setState({ user: null })
    useLocaleStore.getState().applyLocale('en')
  })

  afterEach(cleanup)

  it('re-evaluates public query language and restores the profile locale after navigation', () => {
    const view = render(<LocaleInitializer />)
    expect(document.documentElement.lang).toBe('en')

    pathname = '/share/token'
    searchParams = new URLSearchParams('lang=ru')
    view.rerender(<LocaleInitializer />)
    expect(document.documentElement.lang).toBe('ru')

    searchParams = new URLSearchParams('lang=en')
    view.rerender(<LocaleInitializer />)
    expect(document.documentElement.lang).toBe('en')

    act(() => {
      pathname = '/projects'
      searchParams = new URLSearchParams()
      view.rerender(<LocaleInitializer />)
    })
    expect(document.documentElement.lang).toBe('en')
  })
})
