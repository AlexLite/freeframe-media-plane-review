'use client'

import * as React from 'react'
import { User } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/shared/avatar'
import { useI18n } from '@/hooks/use-i18n'

export default function ProfilePage() {
  const { user, fetchUser } = useAuthStore()
  const { t, localizeError } = useI18n()

  const [name, setName] = React.useState(user?.name ?? '')
  const [isSavingProfile, setIsSavingProfile] = React.useState(false)
  const [profileError, setProfileError] = React.useState('')
  const [profileSuccess, setProfileSuccess] = React.useState(false)

  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [isSavingPassword, setIsSavingPassword] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState('')
  const [passwordSuccess, setPasswordSuccess] = React.useState(false)

  React.useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name])

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess(false)
    if (!name.trim()) {
      setProfileError(t('profile.nameRequired'))
      return
    }
    setIsSavingProfile(true)
    try {
      await api.patch(`/users/${user?.id}`, { name: name.trim() })
      await fetchUser()
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (error: unknown) {
      setProfileError(localizeError(error, 'profile.saveFailed'))
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('profile.allFieldsRequired'))
      return
    }
    if (newPassword.length < 8) {
      setPasswordError(t('auth.passwordLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordMismatch'))
      return
    }

    setIsSavingPassword(true)
    try {
      await api.patch('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (error: unknown) {
      setPasswordError(localizeError(error, 'profile.passwordSaveFailed'))
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <div className="max-w-xl space-y-8 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted">
          <User className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">{t('profile.title')}</h1>
          <p className="text-sm text-text-secondary">{t('profile.description')}</p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="border-b border-border pb-2 text-sm font-semibold text-text-primary">
          {t('profile.title')}
        </h2>

        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={user?.avatar_url} name={user?.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {user?.name ?? t('common.loading')}
            </p>
            <p className="truncate text-xs text-text-tertiary">{user?.email ?? ''}</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-medium text-text-secondary">
              {t('profile.fullName')}
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('profile.namePlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-text-secondary">
              {t('profile.email')}
            </label>
            <Input
              id="email"
              value={user?.email ?? ''}
              disabled
              className="cursor-not-allowed opacity-60"
            />
            <p className="text-2xs text-text-tertiary">{t('profile.emailLocked')}</p>
          </div>

          {profileError && <p className="text-xs text-status-error">{profileError}</p>}
          {profileSuccess && (
            <p className="text-xs text-status-success">{t('profile.saved')}</p>
          )}

          <Button type="submit" variant="primary" size="sm" loading={isSavingProfile}>
            {t('profile.save')}
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-border pb-2 text-sm font-semibold text-text-primary">
          {t('profile.changePassword')}
        </h2>

        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="currentPassword" className="text-xs font-medium text-text-secondary">
              {t('profile.currentPassword')}
            </label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('profile.currentPasswordPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="text-xs font-medium text-text-secondary">
              {t('profile.newPassword')}
            </label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('profile.newPasswordPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-medium text-text-secondary">
              {t('profile.confirmNewPassword')}
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('profile.confirmPasswordPlaceholder')}
            />
          </div>

          {passwordError && <p className="text-xs text-status-error">{passwordError}</p>}
          {passwordSuccess && (
            <p className="text-xs text-status-success">{t('profile.passwordSaved')}</p>
          )}

          <Button type="submit" variant="secondary" size="sm" loading={isSavingPassword}>
            {t('profile.changePassword')}
          </Button>
        </form>
      </section>
    </div>
  )
}
