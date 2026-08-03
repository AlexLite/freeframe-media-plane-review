import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'en' | 'ru'

interface LocaleState {
  locale: Locale
  applyLocale: (locale: Locale) => void
  setLocale: (locale: Locale) => void
  syncFromServer: (preferences: Record<string, unknown>) => void
}

function applyToDOM(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
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
  } catch {}
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
        saveToServer(locale)
      },

      syncFromServer: (preferences) => {
        const serverLocale = preferences?.locale as Locale | undefined
        if (serverLocale && ['en', 'ru'].includes(serverLocale)) {
          applyToDOM(serverLocale)
          set({ locale: serverLocale })
        }
      },
    }),
    {
      name: 'ff-locale',
      onRehydrateStorage: () => (state) => {
        if (state) applyToDOM(state.locale)
      },
    },
  ),
)
