'use client'

import { FormEvent, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function DeviceAuthorizationPage() {
  const [userCode, setUserCode] = useState(() =>
    typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('user_code') ?? '',
  )
  const [loading, setLoading] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')

  async function approve(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/device/approve', { user_code: userCode })
      setApproved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'This device code is invalid or has expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="w-full rounded-xl border border-border bg-bg-secondary p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-text-primary">Authorize Adobe Premiere</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Confirm access for the Premiere extension signed in to this browser.
        </p>

        {approved ? (
          <p className="mt-6 rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2.5 text-sm text-status-success">
            Premiere access approved. You can return to the extension.
          </p>
        ) : (
          <form onSubmit={approve} className="mt-6 flex flex-col gap-4">
            <Input
              label="Device code"
              value={userCode}
              onChange={(event) => setUserCode(event.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              autoComplete="off"
              maxLength={9}
              error={error}
            />
            <Button type="submit" loading={loading} disabled={!userCode} className="w-full">
              Approve Premiere access
            </Button>
          </form>
        )}
      </section>
    </main>
  )
}
