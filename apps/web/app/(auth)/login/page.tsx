'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import { LoginForm } from '@/components/auth/login-form'
import type { SetupStatus } from '@/types'
import { useI18n } from '@/hooks/use-i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const { locale, t } = useI18n()
  const setLocale = useLocaleStore((state) => state.setLocale)

  useEffect(() => {
    // Redirect to setup if first-time setup is needed
    async function checkSetup() {
      try {
        const status = await api.get<SetupStatus>('/setup/status')
        if (status.needs_setup) {
          router.replace('/setup')
        }
      } catch {
        // ignore — proceed to show login
      }
    }

    // If already authenticated, set cookie and redirect to dashboard
    const token = getAccessToken()
    if (token) {
      document.cookie = `ff_access_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
      // Check the 'from' param for redirect target
      const params = new URLSearchParams(window.location.search)
      const from = params.get('from')
      router.replace(from?.startsWith('/') && !from.startsWith('//') ? from : '/projects')
      return
    }

    checkSetup()
  }, [router])

  return (
    <>
      <div className="mb-5 flex items-center justify-end gap-1" aria-label={t('auth.language')}>
        {(['ru', 'en'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLocale(item)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              locale === item
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-tertiary hover:text-text-primary',
            )}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      <LoginForm />
    </>
  )
}
