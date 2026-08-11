'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/hooks/use-i18n'

export default function DeviceAuthorizationPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [userCode, setUserCode] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [loading, setLoading] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('user_code') ?? ''
    setUserCode(code)

    if (!getAccessToken()) {
      const target = `/device${code ? `?user_code=${encodeURIComponent(code)}` : ''}`
      router.replace(`/login?from=${encodeURIComponent(target)}`)
      return
    }

    setCheckingSession(false)
  }, [router])

  async function approve(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/device/approve', { user_code: userCode })
      setApproved(true)
    } catch (err) {
      setError(err instanceof ApiError ? t('device.invalid') : t('device.invalid'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <section className="w-full rounded-xl border border-border bg-bg-secondary p-6 shadow-xl">
          <p className="text-sm text-text-secondary">{t('device.checkingSession')}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="w-full rounded-xl border border-border bg-bg-secondary p-6 shadow-xl">
        {checkingSession ? <p className="text-sm text-text-secondary">{t('device.checkingSession')}</p> : null}
        <h1 className="text-xl font-semibold text-text-primary">{t('device.authorizeTitle')}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t('device.description')}
        </p>

        {approved ? (
          <p className="mt-6 rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2.5 text-sm text-status-success">
            {t('device.approved')}
          </p>
        ) : (
          <form onSubmit={approve} className="mt-6 flex flex-col gap-4">
            <Input
              label={t('device.code')}
              value={userCode}
              onChange={(event) => setUserCode(event.target.value.toUpperCase())}
              placeholder={t('device.codePlaceholder')}
              autoComplete="off"
              maxLength={9}
              error={error}
            />
            <Button type="submit" loading={loading} disabled={!userCode} className="w-full">
              {t('device.approve')}
            </Button>
          </form>
        )}
      </section>
    </main>
  )
}
