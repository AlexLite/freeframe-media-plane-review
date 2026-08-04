'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import {
  PUBLIC_LOCALE_STORAGE_KEY,
  isLocale,
  useLocaleStore,
} from '@/stores/locale-store'

export function LocaleInitializer() {
  const locale = useLocaleStore((state) => state.locale)
  const applyLocale = useLocaleStore((state) => state.applyLocale)
  const syncFromServer = useLocaleStore((state) => state.syncFromServer)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    applyLocale(locale)
  }, [applyLocale, locale])

  useEffect(() => {
    const publicShare = window.location.pathname.startsWith('/share/')
    if (!publicShare) {
      if (user?.preferences) syncFromServer(user.preferences)
      return
    }

    const requestedLocale = new URLSearchParams(window.location.search).get('lang')
    if (isLocale(requestedLocale)) {
      applyLocale(requestedLocale)
      return
    }

    const profileLocale = user?.preferences?.locale
    if (isLocale(profileLocale)) {
      applyLocale(profileLocale)
      return
    }

    const localPublicLocale = localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY)
    applyLocale(isLocale(localPublicLocale) ? localPublicLocale : 'ru')
  }, [applyLocale, syncFromServer, user?.preferences])

  return null
}

export function PublicLocaleSwitcher() {
  const locale = useLocaleStore((state) => state.locale)
  const setPublicLocale = useLocaleStore((state) => state.setPublicLocale)

  return (
    <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-2 text-xs text-text-tertiary">
      <span>{locale === 'ru' ? 'Язык' : 'Language'}</span>
      <select
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value === 'ru' ? 'ru' : 'en'
          setPublicLocale(nextLocale)
          const url = new URL(window.location.href)
          url.searchParams.set('lang', nextLocale)
          window.history.replaceState({}, '', url)
        }}
        aria-label={locale === 'ru' ? 'Язык страницы' : 'Page language'}
        className="bg-transparent text-xs font-medium text-text-primary outline-none"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  )
}
