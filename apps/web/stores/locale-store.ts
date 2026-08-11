import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import type { User } from '@/types'

export const SUPPORTED_LOCALES = ['en', 'ru'] as const
export const LOCALE_STORAGE_KEY = 'ff-locale'
export const PUBLIC_LOCALE_STORAGE_KEY = 'ff-public-locale'
export type Locale = (typeof SUPPORTED_LOCALES)[number]

interface LocaleState {
  locale: Locale
  profileLocale: Locale
  isSaving: boolean
  saveError: string | null
  applyLocale: (locale: Locale) => void
  setPublicLocale: (locale: Locale) => void
  setLocale: (locale: Locale) => void
  syncFromServer: (preferences: Record<string, unknown>) => void
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
}

function applyToDOM(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = 'ltr'
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveSequence = 0

function queueServerSave(locale: Locale) {
  if (!getAccessToken()) return
  if (saveTimer) clearTimeout(saveTimer)
  const sequence = ++saveSequence
  useLocaleStore.setState({ isSaving: true, saveError: null })

  saveTimer = setTimeout(async () => {
    try {
      const user = await api.patch<User>('/auth/me/preferences', { locale })
      if (sequence !== saveSequence) return
      useAuthStore.getState().setUser(user)
      useLocaleStore.setState({ isSaving: false, saveError: null })
    } catch {
      if (sequence !== saveSequence) return
      useLocaleStore.setState({
        isSaving: false,
        saveError: locale === 'ru'
          ? 'Не удалось сохранить язык в профиле'
          : 'Could not save the profile language',
      })
    }
  }, 250)
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      profileLocale: 'en',
      isSaving: false,
      saveError: null,

      applyLocale: (locale) => {
        applyToDOM(locale)
        set({ locale })
      },

      setPublicLocale: (locale) => {
        applyToDOM(locale)
        if (typeof window !== 'undefined') localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, locale)
        set({ locale })
      },

      setLocale: (locale) => {
        applyToDOM(locale)
        set({ locale, profileLocale: locale, saveError: null })
        queueServerSave(locale)
      },

      syncFromServer: (preferences) => {
        const serverLocale = preferences?.locale
        if (!isLocale(serverLocale)) return
        applyToDOM(serverLocale)
        set({ locale: serverLocale, profileLocale: serverLocale })
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 2,
      partialize: (state) => ({ profileLocale: state.profileLocale }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<LocaleState>
        if (version < 2 && isLocale(state.locale)) return { profileLocale: state.locale }
        return { profileLocale: isLocale(state.profileLocale) ? state.profileLocale : 'en' }
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.applyLocale(state.profileLocale)
      },
    },
  ),
)
