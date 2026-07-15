'use client'

import { ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { PlaneReviewPanel } from './plane-review-panel'
import {
  PLANE_REVIEW_READY_MESSAGE,
  PLANE_REVIEW_RESIZE_MESSAGE,
  isAllowedPlaneOrigin,
  isPlaneReviewEmbedInitMessage,
} from '@/lib/plane-review-embed'

interface PlaneReviewEmbedProps {
  allowedOrigins: string[]
}

interface EmbedConfig {
  assetId: string
  integrationToken: string
  parentOrigin: string
}

export function PlaneReviewEmbed({ allowedOrigins }: PlaneReviewEmbedProps) {
  const [config, setConfig] = useState<EmbedConfig | null>(null)
  const [rejected, setRejected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== window.parent) return
      if (!isAllowedPlaneOrigin(event.origin, allowedOrigins)) {
        setRejected(true)
        return
      }
      if (!isPlaneReviewEmbedInitMessage(event.data)) return

      setRejected(false)
      setConfig({
        assetId: event.data.assetId.trim(),
        integrationToken: event.data.integrationToken.trim(),
        parentOrigin: event.origin,
      })
    }

    window.addEventListener('message', handleMessage)

    try {
      const referrerOrigin = document.referrer ? new URL(document.referrer).origin : null
      if (referrerOrigin && isAllowedPlaneOrigin(referrerOrigin, allowedOrigins)) {
        window.parent.postMessage({ type: PLANE_REVIEW_READY_MESSAGE }, referrerOrigin)
      }
    } catch {
      // A malformed or opaque referrer is ignored; the parent can still send init after iframe load.
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [allowedOrigins])

  useEffect(() => {
    if (!config || !containerRef.current || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0]?.contentRect.height ?? 0)
      if (height <= 0) return
      window.parent.postMessage(
        { type: PLANE_REVIEW_RESIZE_MESSAGE, height },
        config.parentOrigin,
      )
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [config])

  if (allowedOrigins.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-primary p-6">
        <div className="max-w-md rounded-lg border border-status-error/30 bg-status-error/5 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-status-error" />
          <p className="text-sm text-text-secondary">
            Plane embed origins are not configured.
          </p>
        </div>
      </main>
    )
  }

  if (rejected) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-primary p-6">
        <div className="max-w-md rounded-lg border border-status-error/30 bg-status-error/5 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-status-error" />
          <p className="text-sm text-text-secondary">This Plane origin is not allowed.</p>
        </div>
      </main>
    )
  }

  return (
    <main ref={containerRef} className="min-h-screen bg-bg-primary p-3 sm:p-4">
      {config ? (
        <PlaneReviewPanel
          key={`${config.parentOrigin}:${config.assetId}`}
          assetId={config.assetId}
          integrationToken={config.integrationToken}
        />
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-bg-secondary p-6 text-center">
          <p className="text-sm text-text-secondary">Waiting for Plane review context…</p>
        </div>
      )}
    </main>
  )
}
