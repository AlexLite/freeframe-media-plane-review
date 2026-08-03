'use client'

import * as React from 'react'
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  localizeError,
  translate,
} from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

export function useI18n() {
  const locale = useLocaleStore((state) => state.locale)
  const t = React.useCallback(
    (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  )

  return React.useMemo(
    () => ({
      locale,
      t,
      formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
        formatDate(locale, value, options),
      formatDateTime: (value: Date | string | number) => formatDateTime(locale, value),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(locale, value, options),
      formatBytes: (value: number, decimals?: number) => formatBytes(locale, value, decimals),
      formatRelativeTime: (value: Date | string | number, now?: Date) =>
        formatRelativeTime(locale, value, now),
      formatCount: (
        count: number,
        english: readonly [string, string, string],
        russian: readonly [string, string, string],
      ) => formatCount(locale, count, english, russian),
      localizeError: (error: unknown, fallbackKey?: string) =>
        localizeError(locale, error, fallbackKey),
    }),
    [locale, t],
  )
}
