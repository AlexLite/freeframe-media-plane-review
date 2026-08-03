'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLocaleStore } from '@/stores/locale-store'

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

  return null
}
