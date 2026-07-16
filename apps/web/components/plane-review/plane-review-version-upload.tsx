'use client'

import { Loader2, UploadCloud, X } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  planeReviewFileAccept,
  uploadPlaneReviewVersion,
  validatePlaneReviewFile,
} from '@/lib/plane-review-upload'
import type { PlaneReviewAssetSummary, PlaneReviewContext } from '@/lib/plane-review-types'
import { usePlaneReviewI18n, type PlaneReviewMessageKey } from '@/lib/plane-review-i18n'

interface PlaneReviewVersionUploadProps {
  asset: PlaneReviewAssetSummary
  context: PlaneReviewContext
  mode: 'first' | 'next'
  onUploaded: () => Promise<void>
  onDismiss?: () => void
}

function formatBytes(value: number, locale: string): string {
  const format = (size: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(size)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${format(value / 1024)} KB`
  if (value < 1024 ** 3) return `${format(value / 1024 ** 2)} MB`
  return `${format(value / 1024 ** 3)} GB`
}

export function PlaneReviewVersionUpload({
  asset,
  context,
  mode,
  onUploaded,
  onDismiss,
}: PlaneReviewVersionUploadProps) {
  const { locale, t } = usePlaneReviewI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0] ?? null
    setError(null)
    setProgress(0)
    if (!nextFile) {
      setFile(null)
      return
    }

    try {
      validatePlaneReviewFile(asset.asset_type, nextFile)
      setFile(nextFile)
    } catch {
      setFile(null)
      event.currentTarget.value = ''
      setError(t('upload.invalid_file'))
    }
  }

  async function handleUpload() {
    if (!file || uploading) return

    const controller = new AbortController()
    controllerRef.current = controller
    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      await uploadPlaneReviewVersion({
        asset,
        context,
        file,
        signal: controller.signal,
        onProgress: setProgress,
      })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await onUploaded()
      onDismiss?.()
    } catch (caught) {
      const cancelled = caught instanceof DOMException && caught.name === 'AbortError'
      setError(cancelled ? t('upload.cancelled') : t('upload.failed'))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setUploading(false)
    }
  }

  function handleCancel() {
    controllerRef.current?.abort()
  }

  const mediaKey = `media.${asset.asset_type}` as PlaneReviewMessageKey
  const mediaType = t(mediaKey)
  const title = mode === 'first' ? t('upload.first_title') : t('upload.next_title')
  const description =
    mode === 'first'
      ? t('upload.first_description', { mediaType })
      : t('upload.next_description', { mediaType })

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-bg-secondary p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-bg-tertiary p-2 text-accent">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{description}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={planeReviewFileAccept(asset.asset_type)}
        disabled={uploading}
        onChange={handleFileChange}
        aria-label={mode === 'first' ? t('upload.first_file_label') : t('upload.next_file_label')}
        className="block w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-sm file:text-text-primary disabled:opacity-60"
      />

      {file && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="shrink-0">{formatBytes(file.size, locale)}</span>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>{t('upload.progress')}</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={t('upload.progress_label')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-bg-tertiary"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-status-error">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        {uploading ? (
          <Button size="sm" variant="secondary" onClick={handleCancel}>
            <X className="h-4 w-4" /> {t('upload.cancel')}
          </Button>
        ) : (
          onDismiss && (
            <Button size="sm" variant="secondary" onClick={onDismiss}>
              {t('upload.close')}
            </Button>
          )
        )}
        <Button size="sm" disabled={!file || uploading} onClick={() => void handleUpload()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {t('upload.submit')}
        </Button>
      </div>
    </div>
  )
}
