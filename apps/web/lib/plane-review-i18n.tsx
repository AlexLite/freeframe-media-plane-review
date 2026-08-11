'use client'

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

import enMessages from '@/locales/en/plane-review.json'
import ruMessages from '@/locales/ru/plane-review.json'

export type PlaneReviewLocale = 'en' | 'ru'
export type PlaneReviewMessageKey = keyof typeof enMessages

type MessageParams = Record<string, string | number>
type PlaneReviewI18n = {
  locale: PlaneReviewLocale
  t: (key: PlaneReviewMessageKey, params?: MessageParams) => string
}

const messages: Record<PlaneReviewLocale, Record<PlaneReviewMessageKey, string>> = {
  en: enMessages,
  ru: ruMessages,
}

export function normalizePlaneReviewLocale(locale: string | null | undefined): PlaneReviewLocale {
  return locale?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

function translate(locale: PlaneReviewLocale, key: PlaneReviewMessageKey, params?: MessageParams): string {
  const template = messages[locale][key] ?? messages.en[key]
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  )
}

const defaultLocale = normalizePlaneReviewLocale(
  typeof navigator === 'undefined' ? undefined : navigator.language,
)
const PlaneReviewI18nContext = createContext<PlaneReviewI18n>({
  locale: defaultLocale,
  t: (key, params) => translate(defaultLocale, key, params),
})

export function PlaneReviewLocaleProvider({
  locale: rawLocale,
  children,
}: {
  locale?: string | null
  children: ReactNode
}) {
  const locale = normalizePlaneReviewLocale(rawLocale)
  const value = useMemo<PlaneReviewI18n>(
    () => ({ locale, t: (key, params) => translate(locale, key, params) }),
    [locale],
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <PlaneReviewI18nContext.Provider value={value}>{children}</PlaneReviewI18nContext.Provider>
}

export function usePlaneReviewI18n(): PlaneReviewI18n {
  return useContext(PlaneReviewI18nContext)
}
