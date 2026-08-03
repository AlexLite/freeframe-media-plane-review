'use client'

import * as React from 'react'
import { Monitor, Moon, Sun, Check, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, type Theme } from '@/stores/theme-store'
import { useLocaleStore, type Locale } from '@/stores/locale-store'
import { useI18n } from '@/hooks/use-i18n'

const themes: { value: Theme; labelKey: string; descriptionKey: string; icon: React.ElementType }[] = [
  {
    value: 'dark',
    labelKey: 'appearance.dark',
    descriptionKey: 'appearance.darkDescription',
    icon: Moon,
  },
  {
    value: 'light',
    labelKey: 'appearance.light',
    descriptionKey: 'appearance.lightDescription',
    icon: Sun,
  },
  {
    value: 'system',
    labelKey: 'appearance.system',
    descriptionKey: 'appearance.systemDescription',
    icon: Monitor,
  },
]

export default function AppearancePage() {
  const { theme, setTheme } = useThemeStore()
  const { locale, setLocale } = useLocaleStore()
  const { t } = useI18n()

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary">{t('appearance.title')}</h1>
        <p className="text-sm text-text-tertiary mt-1">
          {t('appearance.description')}
        </p>
      </div>

      {/* Theme selector */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">{t('appearance.theme')}</h2>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((themeOption) => {
            const Icon = themeOption.icon
            const isActive = theme === themeOption.value
            return (
              <button
                key={themeOption.value}
                onClick={() => setTheme(themeOption.value)}
                className={cn(
                  'relative flex flex-col items-center gap-3 rounded-xl border p-4 transition-all text-center',
                  isActive
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                    : 'border-border bg-bg-secondary hover:bg-bg-tertiary hover:border-border-focus',
                )}
              >
                {/* Preview */}
                <div
                  className={cn(
                    'w-full aspect-[4/3] rounded-lg border overflow-hidden flex flex-col',
                    themeOption.value === 'dark' && 'bg-[#0d0d10] border-[#2e2e3a]',
                    themeOption.value === 'light' && 'bg-white border-[#e0e0e6]',
                    themeOption.value === 'system' && 'border-[#2e2e3a]',
                  )}
                >
                  {themeOption.value === 'system' ? (
                    <div className="flex-1 flex">
                      <div className="flex-1 bg-[#0d0d10]" />
                      <div className="flex-1 bg-white" />
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          'h-2.5 flex items-center gap-1 px-2',
                          themeOption.value === 'dark' ? 'bg-[#16161a]' : 'bg-[#f0f0f4]',
                        )}
                      >
                        <div className={cn('h-1 w-1 rounded-full', themeOption.value === 'dark' ? 'bg-[#5e5e6e]' : 'bg-[#c0c0c8]')} />
                        <div className={cn('h-1 w-1 rounded-full', themeOption.value === 'dark' ? 'bg-[#5e5e6e]' : 'bg-[#c0c0c8]')} />
                        <div className={cn('h-1 w-1 rounded-full', themeOption.value === 'dark' ? 'bg-[#5e5e6e]' : 'bg-[#c0c0c8]')} />
                      </div>
                      <div className="flex-1 flex gap-px p-1">
                        <div className={cn('w-1/4 rounded-sm', themeOption.value === 'dark' ? 'bg-[#16161a]' : 'bg-[#f0f0f4]')} />
                        <div className="flex-1 flex flex-col gap-px p-0.5">
                          <div className={cn('h-1/2 rounded-sm', themeOption.value === 'dark' ? 'bg-[#1e1e24]' : 'bg-[#e8e8ee]')} />
                          <div className={cn('h-1/2 rounded-sm', themeOption.value === 'dark' ? 'bg-[#1e1e24]' : 'bg-[#e8e8ee]')} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Label */}
                <div>
                  <div className="flex items-center justify-center gap-1.5">
                    <Icon className="h-4 w-4 text-text-secondary" />
                    <span className="text-sm font-medium text-text-primary">{t(themeOption.labelKey)}</span>
                  </div>
                  <p className="text-2xs text-text-tertiary mt-0.5">{t(themeOption.descriptionKey)}</p>
                </div>

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8 space-y-3 border-t border-border pt-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Languages className="h-4 w-4" />
            {t('appearance.language')}
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">{t('appearance.languageDescription')}</p>
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          {([
            { value: 'en', label: t('appearance.english'), short: 'EN' },
            { value: 'ru', label: t('appearance.russian'), short: 'RU' },
          ] as { value: Locale; label: string; short: string }[]).map((item) => {
            const isActive = locale === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setLocale(item.value)}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                  isActive
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                    : 'border-border bg-bg-secondary hover:bg-bg-tertiary hover:border-border-focus',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-tertiary text-xs font-semibold text-text-secondary">
                  {item.short}
                </span>
                <span className="text-sm font-medium text-text-primary">{item.label}</span>
                {isActive && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
