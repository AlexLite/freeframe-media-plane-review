'use client'

import * as React from 'react'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

export function useI18n() {
  const locale = useLocaleStore((state) => state.locale)
  const t = React.useCallback(
    (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  )

  return { locale, t }
}
