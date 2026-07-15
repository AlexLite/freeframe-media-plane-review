'use client'

import Hls from 'hls.js'
import { AlertCircle, FileWarning, Loader2, RefreshCw, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PlaneReviewComments } from './plane-review-comments'
import { PlaneReviewVersionUpload } from './plane-review-version-upload'
import { Button } from '@/components/ui/button'
import {
  exchangePlaneReviewToken,
  getPlaneReviewBootstrap,
  getPlaneReviewSession,
  getPlaneReviewStream,
} from '@/lib/plane-review-client'
import type {
  PlaneReviewBootstrapResponse,
  PlaneReviewStreamResponse,
} from '@/lib/plane-review-types'

interface PlaneReviewPanelProps {
  assetId: string
  integrationToken: string
}

interface SeekRequest {
  time: number
  nonce: number
}

const PROCESSING_POLL_INTERVAL_MS = 5_000

function formatBytes(value: number | null): string {
  if (value === null) return 'Size unavailable'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function isPendingStatus(status: string): boolean {
  return status === 'uploading' || status === 'processing'
}

function isUnauthorized(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: unknown }).status === 401,
  )
}

function MediaPreview({
  stream,
  mimeType,
  seekRequest,
  onTimeChange,
}: {
  stream: PlaneReviewStreamResponse
  mimeType: string | null
  seekRequest: SeekRequest
  onTimeChange: (time: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

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

  useEffect(() => {
    const media = stream.asset_type === 'video' ? videoRef.current : audioRef.current
    if (!media || seekRequest.nonce === 0) return
    media.currentTime = seekRequest.time
  }, [seekRequest, stream.asset_type])

  if (stream.asset_type === 'video') {
    return (
      <video
        ref={videoRef}
        controls
        onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
        className="h-full w-full bg-black object-contain"
      />
    )
  }
  if (stream.asset_type === 'audio') {
    return (
      <audio
        ref={audioRef}
        controls
        src={stream.url}
        onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
        className="w-full"
      />
    )
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
  const [showVersionUpload, setShowVersionUpload] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<SeekRequest>({ time: 0, nonce: 0 })
  const [error, setError] = useState<string | null>(null)

  const selectedVersion = useMemo(
    () => bootstrap?.versions.find((version) => version.id === selectedVersionId) ?? null,
    [bootstrap, selectedVersionId],
  )
  const pendingVersionSignature = useMemo(
    () =>
      bootstrap?.versions
        .filter((version) => isPendingStatus(version.processing_status))
        .map((version) => `${version.id}:${version.processing_status}`)
        .join('|') ?? '',
    [bootstrap],
  )

  const applyBootstrap = useCallback(
    (data: PlaneReviewBootstrapResponse, selectNewest: boolean) => {
      setBootstrap(data)
      setSelectedVersionId((currentVersionId) => {
        if (!selectNewest && currentVersionId) {
          const currentStillExists = data.versions.some((version) => version.id === currentVersionId)
          if (currentStillExists) return currentVersionId
        }
        return data.versions[0]?.id ?? null
      })
    },
    [],
  )

  const refreshBootstrap = useCallback(
    async (selectNewest = false) => {
      let data: PlaneReviewBootstrapResponse
      try {
        data = await getPlaneReviewBootstrap(assetId)
      } catch (caught) {
        if (!isUnauthorized(caught)) throw caught
        await exchangePlaneReviewToken(integrationToken)
        data = await getPlaneReviewBootstrap(assetId)
      }
      applyBootstrap(data, selectNewest)
      setError(null)
    },
    [applyBootstrap, assetId, integrationToken],
  )

  const loadBootstrap = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStream(null)
    try {
      await exchangePlaneReviewToken(integrationToken)
      const data = await getPlaneReviewBootstrap(assetId)
      applyBootstrap(data, true)
    } catch (caught) {
      setBootstrap(null)
      setSelectedVersionId(null)
      setError(caught instanceof Error ? caught.message : 'Unable to load Plane review')
    } finally {
      setLoading(false)
    }
  }, [applyBootstrap, assetId, integrationToken])

  useEffect(() => {
    setShowVersionUpload(false)
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    setPlaybackTime(0)
    setSeekRequest({ time: 0, nonce: 0 })
  }, [selectedVersionId])

  useEffect(() => {
    if (!pendingVersionSignature) return

    let cancelled = false
    let timeoutId: number | undefined

    const schedule = () => {
      timeoutId = window.setTimeout(() => void poll(), PROCESSING_POLL_INTERVAL_MS)
    }
    const poll = async () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') {
        schedule()
        return
      }
      try {
        await refreshBootstrap()
      } catch {
        // Keep the last known review state and retry while the version remains pending.
      }
      if (!cancelled) schedule()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || cancelled) return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      void poll()
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pendingVersionSignature, refreshBootstrap])

  useEffect(() => {
    let cancelled = false
    setStream(null)
    if (!selectedVersionId || selectedVersion?.processing_status !== 'ready') return

    setStreamLoading(true)
    getPlaneReviewStream(assetId, selectedVersionId)
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
  }, [assetId, selectedVersion?.processing_status, selectedVersionId])

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

  const session = getPlaneReviewSession()
  const canUseTimecode =
    selectedVersion?.processing_status === 'ready' &&
    (stream?.asset_type === 'video' || stream?.asset_type === 'audio')

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium text-text-primary">{bootstrap.asset.name}</h2>
          <p className="text-xs text-text-tertiary">Plane media review</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bootstrap.permissions.upload && bootstrap.versions.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowVersionUpload((current) => !current)}
            >
              <UploadCloud className="h-4 w-4" /> New version
            </Button>
          )}
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
        </div>
      </header>

      {showVersionUpload && bootstrap.permissions.upload && bootstrap.versions.length > 0 && (
        <div className="flex justify-center border-b border-border bg-bg-primary p-4">
          <PlaneReviewVersionUpload
            asset={bootstrap.asset}
            context={bootstrap.context}
            mode="next"
            onUploaded={() => refreshBootstrap(true)}
            onDismiss={() => setShowVersionUpload(false)}
          />
        </div>
      )}

      <div className={selectedVersion ? 'grid lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}>
        <div className="flex min-h-80 items-center justify-center bg-bg-primary p-4">
          {bootstrap.versions.length === 0 ? (
            bootstrap.permissions.upload ? (
              <PlaneReviewVersionUpload
                asset={bootstrap.asset}
                context={bootstrap.context}
                mode="first"
                onUploaded={() => refreshBootstrap(true)}
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
              <p className="text-xs text-text-tertiary">Status refreshes automatically.</p>
            </div>
          ) : streamLoading || !stream ? (
            <Loader2 className="h-7 w-7 animate-spin text-accent" aria-label="Loading media" />
          ) : (
            <div className="flex h-[28rem] w-full items-center justify-center">
              <MediaPreview
                stream={stream}
                mimeType={selectedVersion.mime_type}
                seekRequest={seekRequest}
                onTimeChange={setPlaybackTime}
              />
            </div>
          )}
        </div>

        {selectedVersion && (
          <PlaneReviewComments
            assetId={assetId}
            versionId={selectedVersion.id}
            canComment={bootstrap.permissions.comment}
            canManage={bootstrap.permissions.manage}
            currentUserId={session?.user.id ?? null}
            currentTime={playbackTime}
            canUseTimecode={canUseTimecode}
            onSeek={(time) => setSeekRequest((current) => ({ time, nonce: current.nonce + 1 }))}
          />
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
