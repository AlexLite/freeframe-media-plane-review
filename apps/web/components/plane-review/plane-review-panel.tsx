'use client'

import Hls from 'hls.js'
import { AlertCircle, FileWarning, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PlaneReviewFirstUpload } from './plane-review-first-upload'
import { Button } from '@/components/ui/button'
import {
  exchangePlaneReviewToken,
  getPlaneReviewBootstrap,
  getPlaneReviewStream,
} from '@/lib/plane-review-client'
import type {
  PlaneReviewBootstrapResponse,
  PlaneReviewStreamResponse,
  PlaneReviewVersionSummary,
} from '@/lib/plane-review-types'

interface PlaneReviewPanelProps {
  assetId: string
  integrationToken: string
}

function formatBytes(value: number | null): string {
  if (value === null) return 'Size unavailable'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function MediaPreview({ stream, mimeType }: { stream: PlaneReviewStreamResponse; mimeType: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (stream.asset_type !== 'video' || !videoRef.current) return
    const video = videoRef.current

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.url
      return
    }

    if (!Hls.isSupported()) return
    const hls = new Hls()
    hls.loadSource(stream.url)
    hls.attachMedia(video)
    return () => hls.destroy()
  }, [stream])

  if (stream.asset_type === 'video') {
    return <video ref={videoRef} controls className="h-full w-full bg-black object-contain" />
  }
  if (stream.asset_type === 'audio') {
    return <audio controls src={stream.url} className="w-full" />
  }
  if (stream.asset_type === 'image' || mimeType?.startsWith('image/')) {
    return <img src={stream.url} alt="Review asset" className="h-full w-full object-contain" />
  }
  return (
    <a href={stream.url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
      Open media file
    </a>
  )
}

export function PlaneReviewPanel({ assetId, integrationToken }: PlaneReviewPanelProps) {
  const [bootstrap, setBootstrap] = useState<PlaneReviewBootstrapResponse | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [stream, setStream] = useState<PlaneReviewStreamResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [streamLoading, setStreamLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedVersion = useMemo(
    () => bootstrap?.versions.find((version) => version.id === selectedVersionId) ?? null,
    [bootstrap, selectedVersionId],
  )

  async function loadBootstrap() {
    setLoading(true)
    setError(null)
    setStream(null)
    try {
      await exchangePlaneReviewToken(integrationToken)
      const data = await getPlaneReviewBootstrap(assetId)
      setBootstrap(data)
      setSelectedVersionId(data.versions[0]?.id ?? null)
    } catch (caught) {
      setBootstrap(null)
      setSelectedVersionId(null)
      setError(caught instanceof Error ? caught.message : 'Unable to load Plane review')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBootstrap()
  }, [assetId, integrationToken])

  useEffect(() => {
    let cancelled = false
    setStream(null)
    if (!selectedVersion || selectedVersion.processing_status !== 'ready') return

    setStreamLoading(true)
    getPlaneReviewStream(assetId, selectedVersion.id)
      .then((value) => {
        if (!cancelled) setStream(value)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load media stream')
      })
      .finally(() => {
        if (!cancelled) setStreamLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [assetId, selectedVersion])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-bg-secondary">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-label="Loading review" />
      </div>
    )
  }

  if (error && !bootstrap) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-status-error/30 bg-status-error/5 p-6 text-center">
        <AlertCircle className="h-7 w-7 text-status-error" />
        <p className="text-sm text-text-secondary">{error}</p>
        <Button size="sm" variant="secondary" onClick={() => void loadBootstrap()}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    )
  }

  if (!bootstrap) return null

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium text-text-primary">{bootstrap.asset.name}</h2>
          <p className="text-xs text-text-tertiary">Plane media review</p>
        </div>
        {bootstrap.versions.length > 0 && (
          <select
            aria-label="Asset version"
            value={selectedVersionId ?? ''}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            className="h-9 rounded-md border border-border bg-bg-tertiary px-3 text-sm text-text-primary outline-none focus:border-border-focus"
          >
            {bootstrap.versions.map((version) => (
              <option key={version.id} value={version.id}>
                Version {version.version_number} · {version.processing_status}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="flex min-h-80 items-center justify-center bg-bg-primary p-4">
        {bootstrap.versions.length === 0 ? (
          bootstrap.permissions.upload ? (
            <PlaneReviewFirstUpload
              asset={bootstrap.asset}
              context={bootstrap.context}
              onUploaded={loadBootstrap}
            />
          ) : (
            <div className="text-center text-sm text-text-secondary">No versions have been uploaded yet.</div>
          )
        ) : selectedVersion?.processing_status === 'failed' ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <FileWarning className="h-8 w-8 text-status-error" />
            <p className="text-sm text-text-secondary">This version failed to process.</p>
          </div>
        ) : selectedVersion?.processing_status !== 'ready' ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
            <p className="text-sm text-text-secondary">Version is {selectedVersion?.processing_status}.</p>
          </div>
        ) : streamLoading || !stream ? (
          <Loader2 className="h-7 w-7 animate-spin text-accent" aria-label="Loading media" />
        ) : (
          <div className="flex h-[28rem] w-full items-center justify-center">
            <MediaPreview stream={stream} mimeType={selectedVersion.mime_type} />
          </div>
        )}
      </div>

      {selectedVersion && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-text-tertiary">
          <span>{selectedVersion.original_filename ?? `Version ${selectedVersion.version_number}`}</span>
          <span>{formatBytes(selectedVersion.file_size_bytes)}</span>
        </footer>
      )}
    </section>
  )
}
