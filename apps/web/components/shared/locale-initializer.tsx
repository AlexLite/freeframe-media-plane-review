'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { isLocale, LOCALE_STORAGE_KEY, useLocaleStore } from '@/stores/locale-store'

export function LocaleInitializer() {
  const locale = useLocaleStore((state) => state.locale)
  const applyLocale = useLocaleStore((state) => state.applyLocale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const syncFromServer = useLocaleStore((state) => state.syncFromServer)
  const user = useAuthStore((state) => state.user)
  const [isSharePage, setIsSharePage] = useState(false)

  useEffect(() => {
    applyLocale(locale)
  }, [applyLocale, locale])

  useEffect(() => {
    if (user?.preferences) syncFromServer(user.preferences)
  }, [user?.preferences, syncFromServer])

  useEffect(() => {
    const publicShare = window.location.pathname.startsWith('/share/')
    setIsSharePage(publicShare)
    if (!publicShare) return

    const requestedLocale = new URLSearchParams(window.location.search).get('lang')
    if (isLocale(requestedLocale)) {
      applyLocale(requestedLocale)
      return
    }

    if (!localStorage.getItem(LOCALE_STORAGE_KEY)) {
      applyLocale(navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en')
    }
  }, [applyLocale])

  if (!isSharePage) return null

  return (
    <label className="fixed bottom-3 left-3 z-[300] flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary/95 px-2 py-1.5 text-xs text-text-tertiary shadow-xl backdrop-blur">
      <span>{locale === 'ru' ? 'Язык' : 'Language'}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value === 'ru' ? 'ru' : 'en')}
        aria-label={locale === 'ru' ? 'Язык страницы' : 'Page language'}
        className="rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-xs text-text-primary outline-none"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  )
}
