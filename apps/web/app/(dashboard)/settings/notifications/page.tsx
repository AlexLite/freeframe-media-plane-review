'use client'

import * as React from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useI18n } from '@/hooks/use-i18n'

const commentNotifications = [
  {
    id: 'general_comments',
    titleKey: 'notifications.generalComments',
    descriptionKey: 'notifications.generalCommentsDescription',
  },
  {
    id: 'comment_replies',
    titleKey: 'notifications.commentReplies',
    descriptionKey: 'notifications.commentRepliesDescription',
  },
  {
    id: 'mentions',
    titleKey: 'notifications.mentions',
    descriptionKey: 'notifications.mentionsDescription',
  },
] as const

const assetNotifications = [
  {
    id: 'other_uploads',
    titleKey: 'notifications.otherUploads',
    descriptionKey: 'notifications.otherUploadsDescription',
  },
  {
    id: 'status_updates',
    titleKey: 'notifications.statusUpdates',
    descriptionKey: 'notifications.statusUpdatesDescription',
  },
  {
    id: 'assigned_to_you',
    titleKey: 'notifications.assignedToYou',
    descriptionKey: 'notifications.assignedToYouDescription',
  },
] as const

interface NotifPrefs {
  email_frequency: string
  general_comments: string
  comment_replies: string
  mentions: string
  other_uploads: string
  status_updates: string
  assigned_to_you: string
  [key: string]: string
}

const defaults: NotifPrefs = {
  email_frequency: 'instant',
  general_comments: 'all_on',
  comment_replies: 'all_on',
  mentions: 'all_on',
  other_uploads: 'all_on',
  status_updates: 'all_on',
  assigned_to_you: 'all_on',
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const { t } = useI18n()
  const [prefs, setPrefs] = React.useState<NotifPrefs>(defaults)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!user?.preferences) return
    const notificationPreferences = (user.preferences.notifications ?? {}) as Record<string, unknown>
    const merged: NotifPrefs = { ...defaults }
    Object.entries(notificationPreferences).forEach(([key, value]) => {
      if (typeof value === 'string') merged[key] = value
    })
    setPrefs(merged)
  }, [user?.preferences])

  async function updatePref(key: string, value: string) {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    setSaving(true)
    try {
      await api.patch('/auth/me/preferences', { notifications: updated })
    } finally {
      setSaving(false)
    }
  }

  const preferenceOptions = [
    ['all_on', 'notifications.allOn'],
    ['in_app', 'notifications.inAppOnly'],
    ['all_off', 'notifications.allOff'],
  ] as const

  function renderPreferenceRows(
    items: readonly {
      id: string
      titleKey: string
      descriptionKey: string
    }[],
  ) {
    return items.map((item) => (
      <div
        key={item.id}
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-secondary p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-text-primary">{t(item.titleKey)}</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">{t(item.descriptionKey)}</p>
        </div>
        <select
          value={prefs[item.id] || 'all_on'}
          onChange={(event) => updatePref(item.id, event.target.value)}
          className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto sm:min-w-40"
        >
          {preferenceOptions.map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </div>
    ))
  }

  return (
    <div className="max-w-3xl space-y-8 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted">
          <Bell className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-text-primary">{t('notifications.title')}</h1>
          <p className="text-sm text-text-secondary">{t('notifications.description')}</p>
        </div>
        {saving && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-text-tertiary"
            aria-label={t('notifications.saving')}
          />
        )}
      </div>

      <section className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary p-4">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-text-primary">
              {t('notifications.emailFrequency')}
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              {t('notifications.emailFrequencyDescription')}
            </p>
            <select
              value={prefs.email_frequency}
              onChange={(event) => updatePref('email_frequency', event.target.value)}
              className="mt-3 w-full rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent sm:w-52"
            >
              <option value="instant">{t('notifications.instant')}</option>
              <option value="15min">{t('notifications.fifteenMinutes')}</option>
              <option value="hourly">{t('notifications.hourly')}</option>
              <option value="daily">{t('notifications.daily')}</option>
              <option value="never">{t('notifications.never')}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">{t('notifications.comments')}</h2>
        <div className="space-y-3">{renderPreferenceRows(commentNotifications)}</div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">{t('notifications.assets')}</h2>
        <div className="space-y-3">{renderPreferenceRows(assetNotifications)}</div>
      </section>

      <div className="rounded-lg border border-border bg-bg-tertiary p-4">
        <p className="text-xs text-text-secondary">{t('notifications.adminEmailNotice')}</p>
      </div>
    </div>
  )
}
