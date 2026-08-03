import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const SUPPORTED_LOCALES = ['en', 'ru'] as const
export const LOCALE_STORAGE_KEY = 'ff-locale'
export type Locale = (typeof SUPPORTED_LOCALES)[number]

interface LocaleState {
  locale: Locale
  applyLocale: (locale: Locale) => void
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

async function saveToServer(locale: Locale) {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ff_access_token') : null
    if (!token) return
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    await fetch(`${API_URL}/auth/me/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locale }),
    })
  } catch {
    // Keep the local preference even when profile synchronization is unavailable.
  }
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',

      applyLocale: (locale) => {
        applyToDOM(locale)
        set({ locale })
      },

      setLocale: (locale) => {
        applyToDOM(locale)
        set({ locale })
        void saveToServer(locale)
      },

      syncFromServer: (preferences) => {
        const serverLocale = preferences?.locale
        if (!isLocale(serverLocale)) return
        applyToDOM(serverLocale)
        set({ locale: serverLocale })
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        if (state) applyToDOM(state.locale)
      },
    },
  ),
)
