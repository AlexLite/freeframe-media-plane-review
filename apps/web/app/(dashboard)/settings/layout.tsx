'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Bell, Shield, Palette, Brush } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useI18n } from '@/hooks/use-i18n'

interface SettingsNavItem {
  href: string
  labelKey: string
  icon: React.ElementType
  adminOnly?: boolean
}

const settingsNavItems: SettingsNavItem[] = [
  { href: '/settings/profile', labelKey: 'settings.profile', icon: User },
  { href: '/settings/appearance', labelKey: 'settings.appearance', icon: Palette },
  { href: '/settings/notifications', labelKey: 'settings.notifications', icon: Bell },
  { href: '/settings/branding', labelKey: 'settings.branding', icon: Brush, adminOnly: true },
  { href: '/settings/admin', labelKey: 'settings.admin', icon: Shield, adminOnly: true },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isSuperAdmin } = useAuthStore()
  const { t } = useI18n()

  return (
    <div className="flex h-full min-w-0 flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-border bg-bg-secondary md:w-56 md:border-b-0 md:border-r">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">{t('settings.title')}</h2>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{user?.name ?? 'User'}</p>
        </div>

        <nav className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-0.5 md:overflow-visible">
          {settingsNavItems.map((item) => {
            if (item.adminOnly && !isSuperAdmin) return null
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-w-max items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors md:min-w-0',
                  isActive
                    ? 'bg-bg-hover font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover/70 hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="md:min-w-0 md:break-words md:leading-tight">{t(item.labelKey)}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
