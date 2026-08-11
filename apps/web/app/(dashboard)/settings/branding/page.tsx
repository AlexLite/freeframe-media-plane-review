'use client'

import * as React from 'react'
import { Palette, Upload, X, Check, RotateCcw, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useBrandingStore } from '@/stores/branding-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/hooks/use-i18n'

function LogoUploadSlot({
  label,
  description,
  logoUrl,
  onUpload,
  onRemove,
  previewBg,
}: {
  label: string
  description: string
  logoUrl: string | null
  onUpload: (url: string) => void
  onRemove: () => void
  previewBg: string
}) {
  const { t } = useI18n()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result
      if (typeof result === 'string') onUpload(result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg-secondary p-4 sm:flex-row sm:items-start">
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border ${previewBg}`}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="px-1 text-center text-xs leading-tight text-text-tertiary">
            {t('branding.noLogo')}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="mb-3 mt-0.5 text-xs text-text-tertiary">{description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFile}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {logoUrl ? t('branding.replace') : t('common.upload')}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-status-error hover:bg-status-error/10 hover:text-status-error"
            >
              <X className="h-3.5 w-3.5" />
              {t('common.remove')}
            </Button>
          )}
        </div>
        <p className="mt-2 text-2xs text-text-tertiary">{t('branding.fileHint')}</p>
      </div>
    </div>
  )
}

export default function BrandingPage() {
  const { user } = useAuthStore()
  const {
    orgName,
    orgLogoDark,
    orgLogoLight,
    setOrgName,
    setOrgLogoDark,
    setOrgLogoLight,
    resetAll,
  } = useBrandingStore()
  const { theme } = useThemeStore()
  const { t } = useI18n()

  const [nameValue, setNameValue] = React.useState(orgName)
  const [nameSaved, setNameSaved] = React.useState(false)

  React.useEffect(() => {
    setNameValue(orgName)
  }, [orgName])

  function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed) return
    setOrgName(trimmed)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  const isAdmin = user?.is_superadmin
  const hasCustomBranding = orgName !== 'FreeFrame' || orgLogoDark !== null || orgLogoLight !== null
  const activeLogo = theme === 'light' ? (orgLogoLight ?? orgLogoDark) : (orgLogoDark ?? orgLogoLight)

  return (
    <div className="max-w-2xl space-y-8 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted">
          <Palette className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">{t('branding.title')}</h1>
          <p className="text-sm text-text-secondary">{t('branding.description')}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">{t('branding.workspaceName')}</h2>
        <div className="space-y-3 rounded-lg border border-border bg-bg-secondary p-4">
          {isAdmin ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                placeholder={t('branding.workspacePlaceholder')}
                onKeyDown={(event) => event.key === 'Enter' && handleSaveName()}
                className="w-full sm:max-w-xs"
              />
              <Button
                size="sm"
                onClick={handleSaveName}
                disabled={!nameValue.trim() || nameValue.trim() === orgName}
              >
                {nameSaved ? <Check className="h-3.5 w-3.5" /> : t('common.save')}
              </Button>
            </div>
          ) : (
            <p className="break-words text-sm text-text-secondary">{orgName}</p>
          )}
          <p className="text-xs text-text-tertiary">{t('branding.workspaceHint')}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">{t('branding.logo')}</h2>
        <p className="-mt-1 text-xs text-text-tertiary">{t('branding.logoDescription')}</p>

        <div className="space-y-3">
          <div className="mb-1 flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              {t('branding.darkTheme')}
            </span>
          </div>
          <LogoUploadSlot
            label={t('branding.darkLogo')}
            description={t('branding.darkLogoDescription')}
            logoUrl={orgLogoDark}
            onUpload={isAdmin ? setOrgLogoDark : () => {}}
            onRemove={isAdmin ? () => setOrgLogoDark(null) : () => {}}
            previewBg="bg-zinc-900"
          />

          <div className="mb-1 mt-4 flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              {t('branding.lightTheme')}
            </span>
          </div>
          <LogoUploadSlot
            label={t('branding.lightLogo')}
            description={t('branding.lightLogoDescription')}
            logoUrl={orgLogoLight}
            onUpload={isAdmin ? setOrgLogoLight : () => {}}
            onRemove={isAdmin ? () => setOrgLogoLight(null) : () => {}}
            previewBg="bg-white"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">{t('branding.preview')}</h2>
        <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-tertiary">
            {activeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeLogo} alt={orgName} className="h-full w-full object-contain" />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="FreeFrame" className="logo-dark h-6 w-6 object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon-dark.png" alt="FreeFrame" className="logo-light h-6 w-6 object-contain" />
              </>
            )}
          </div>
          <span className="min-w-0 break-words text-sm font-semibold tracking-tight text-text-primary">
            {orgName}
          </span>
        </div>
      </section>

      {isAdmin && hasCustomBranding && (
        <section className="border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 whitespace-normal text-left text-status-error hover:bg-status-error/10 hover:text-status-error"
            onClick={() => {
              resetAll()
              setNameValue('FreeFrame')
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            {t('branding.reset')}
          </Button>
        </section>
      )}

      {!isAdmin && <p className="text-xs text-text-tertiary">{t('branding.adminOnly')}</p>}
    </div>
  )
}
