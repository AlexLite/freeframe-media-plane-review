'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { isLocale, useLocaleStore } from '@/stores/locale-store'

export function LocaleInitializer() {
  const locale = useLocaleStore((state) => state.locale)
  const applyLocale = useLocaleStore((state) => state.applyLocale)
  const syncFromServer = useLocaleStore((state) => state.syncFromServer)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    applyLocale(locale)
  }, [applyLocale, locale])

  useEffect(() => {
    if (user?.preferences) syncFromServer(user.preferences)
  }, [user?.preferences, syncFromServer])

  useEffect(() => {
    const publicShare = window.location.pathname.startsWith('/share/')
    if (!publicShare) return

    const requestedLocale = new URLSearchParams(window.location.search).get('lang')
    if (isLocale(requestedLocale)) {
      applyLocale(requestedLocale)
      return
    }

    applyLocale('ru')
  }, [applyLocale])

  return null
}

export function PublicLocaleSwitcher() {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)

  return (
    <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-2 text-xs text-text-tertiary">
      <span>{locale === 'ru' ? 'Язык' : 'Language'}</span>
      <select
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value === 'ru' ? 'ru' : 'en'
          setLocale(nextLocale)
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
