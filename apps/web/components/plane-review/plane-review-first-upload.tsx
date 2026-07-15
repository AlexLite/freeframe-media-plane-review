'use client'

import { Loader2, UploadCloud, X } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  planeReviewFileAccept,
  uploadPlaneReviewFirstVersion,
  validatePlaneReviewFile,
} from '@/lib/plane-review-upload'
import type { PlaneReviewAssetSummary, PlaneReviewContext } from '@/lib/plane-review-types'

interface PlaneReviewFirstUploadProps {
  asset: PlaneReviewAssetSummary
  context: PlaneReviewContext
  onUploaded: () => Promise<void>
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

export function PlaneReviewFirstUpload({
  asset,
  context,
  onUploaded,
}: PlaneReviewFirstUploadProps) {
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
    } catch (caught) {
      setFile(null)
      event.currentTarget.value = ''
      setError(caught instanceof Error ? caught.message : 'Unable to use this file.')
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
      await uploadPlaneReviewFirstVersion({
        asset,
        context,
        file,
        signal: controller.signal,
        onProgress: setProgress,
      })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await onUploaded()
    } catch (caught) {
      const cancelled = caught instanceof DOMException && caught.name === 'AbortError'
      setError(cancelled ? 'Upload cancelled.' : caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setUploading(false)
    }
  }

  function handleCancel() {
    controllerRef.current?.abort()
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-bg-secondary p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-bg-tertiary p-2 text-accent">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">Upload the first version</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Choose a {asset.asset_type === 'image_carousel' ? 'image' : asset.asset_type} file for this Plane review asset.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={planeReviewFileAccept(asset.asset_type)}
        disabled={uploading}
        onChange={handleFileChange}
        aria-label="Choose first review file"
        className="block w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-sm file:text-text-primary disabled:opacity-60"
      />

      {file && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="shrink-0">{formatBytes(file.size)}</span>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>Uploading</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
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
        {uploading && (
          <Button size="sm" variant="secondary" onClick={handleCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        )}
        <Button size="sm" disabled={!file || uploading} onClick={() => void handleUpload()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </Button>
      </div>
    </div>
  )
}
