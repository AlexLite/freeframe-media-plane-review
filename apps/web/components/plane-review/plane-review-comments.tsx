'use client'

import {
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Loader2,
  MessageSquare,
  Minus,
  MousePointer2,
  Pencil,
  RotateCcw,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  createPlaneReviewComment,
  deletePlaneReviewComment,
  getPlaneReviewComments,
  resolvePlaneReviewComment,
} from '@/lib/plane-review-client'
import type { PlaneReviewComment } from '@/lib/plane-review-types'
import { useDrawing, type DrawingTool } from '@/hooks/use-drawing'
import { usePlaneReviewI18n } from '@/lib/plane-review-i18n'
import { useReviewStore } from '@/stores/review-store'

interface PlaneReviewCommentsProps {
  assetId: string
  versionId: string
  canComment: boolean
  canManage: boolean
  currentUserId: string | null
  currentTime: number
  canUseTimecode: boolean
  canAnnotate: boolean
  onSeek: (time: number) => void
}

function formatTimecode(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const DRAWING_TOOLS: { id: DrawingTool; icon: typeof Pencil }[] = [
  { id: 'pen', icon: Pencil },
  { id: 'arrow', icon: MousePointer2 },
  { id: 'line', icon: Minus },
  { id: 'rectangle', icon: Square },
]
const DRAWING_COLORS = ['#AF52DE', '#FF9500', '#34C759', '#FF3B30']

export function PlaneReviewComments({
  assetId,
  versionId,
  canComment,
  canManage,
  currentUserId,
  currentTime,
  canUseTimecode,
  canAnnotate,
  onSeek,
}: PlaneReviewCommentsProps) {
  const { t } = usePlaneReviewI18n()
  const {
    isDrawingMode,
    drawingTool,
    drawingColor,
    pendingAnnotation,
    setActiveAnnotation,
    setDrawingColor,
    setDrawingTool,
    setIsDrawingMode,
    setPendingAnnotation,
  } = useReviewStore()
  const { clear, getJSON, undo } = useDrawing()
  const [comments, setComments] = useState<PlaneReviewComment[]>([])
  const [body, setBody] = useState('')
  const [attachTimecode, setAttachTimecode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const displayedTimecode = useMemo(() => formatTimecode(currentTime), [currentTime])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setComments(await getPlaneReviewComments(assetId, versionId))
      setError(null)
    } catch (caught) {
      setError(t('comment.load_error'))
    } finally {
      setLoading(false)
    }
  }, [assetId, t, versionId])

  useEffect(() => {
    setComments([])
    setBody('')
    setAttachTimecode(false)
    void refresh()
  }, [refresh])

  async function submitComment() {
    const normalized = body.trim()
    if (!normalized || submitting || !canComment) return

    const drawing = getJSON()
    const drawingObjects = Array.isArray(drawing.objects) ? drawing.objects : []
    const pendingObjects = Array.isArray(pendingAnnotation?.objects) ? pendingAnnotation.objects : []
    const annotation = drawingObjects.length > 0 ? drawing : pendingObjects.length > 0 ? pendingAnnotation : null

    setSubmitting(true)
    setError(null)
    try {
      const created = await createPlaneReviewComment(assetId, versionId, {
        body: normalized,
        ...((attachTimecode || annotation) && canUseTimecode
          ? { timecode_start: Math.round(currentTime * 1000) / 1000 }
          : {}),
        ...(annotation ? { annotation: { drawing_data: annotation } } : {}),
      })
      setComments((current) => [...current, created])
      setBody('')
      setAttachTimecode(false)
      clear()
      setPendingAnnotation(null)
      setIsDrawingMode(false)
    } catch (caught) {
      setError(t('comment.create_error'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleResolved(comment: PlaneReviewComment) {
    if (!canComment || busyCommentId) return
    setBusyCommentId(comment.id)
    try {
      const updated = await resolvePlaneReviewComment(assetId, comment.id)
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setError(null)
    } catch (caught) {
      setError(t('comment.update_error'))
    } finally {
      setBusyCommentId(null)
    }
  }

  async function removeComment(comment: PlaneReviewComment) {
    if (busyCommentId) return
    setBusyCommentId(comment.id)
    try {
      await deletePlaneReviewComment(assetId, comment.id)
      setComments((current) => current.filter((item) => item.id !== comment.id))
      setError(null)
    } catch (caught) {
      setError(t('comment.delete_error'))
    } finally {
      setBusyCommentId(null)
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-border bg-bg-secondary lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <MessageSquare className="h-4 w-4" /> {t('comment.title')}
        </div>
        <span className="text-xs text-text-tertiary">{comments.length}</span>
      </div>

      <div className="min-h-40 flex-1 space-y-3 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-accent" aria-label={t('comment.loading')} />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-center text-xs text-text-tertiary">
            {t('comment.empty')}
          </div>
        ) : (
          comments.map((comment) => {
            const canDelete = canManage || comment.author_id === currentUserId
            return (
              <article
                key={comment.id}
                onMouseEnter={() => setActiveAnnotation(comment.annotation?.drawing_data ?? null)}
                onMouseLeave={() => setActiveAnnotation(null)}
                className={`rounded-lg border p-3 ${
                  comment.resolved
                    ? 'border-border bg-bg-tertiary/40 opacity-70'
                    : 'border-border bg-bg-primary'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-text-primary">
                      {comment.author?.name ?? t('comment.reviewer')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-secondary">
                      {comment.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canComment && (
                      <button
                        type="button"
                        aria-label={comment.resolved ? t('comment.reopen') : t('comment.resolve')}
                        disabled={busyCommentId !== null}
                        onClick={() => void toggleResolved(comment)}
                        className="rounded p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={t('comment.delete')}
                        disabled={busyCommentId !== null}
                        onClick={() => void removeComment(comment)}
                        className="rounded p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-status-error disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
                  {comment.timecode_start !== null ? (
                    <button
                      type="button"
                      onClick={() => onSeek(comment.timecode_start ?? 0)}
                      className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-2 py-1 font-medium text-accent hover:bg-bg-hover"
                    >
                      <Clock3 className="h-3 w-3" /> {formatTimecode(comment.timecode_start)}
                    </button>
                  ) : (
                    <span>{t('comment.general_note')}</span>
                  )}
                  <div className="flex items-center gap-2">
                    {comment.annotation && (
                      <button
                        type="button"
                        aria-label={t('drawing.show')}
                        onFocus={() => setActiveAnnotation(comment.annotation?.drawing_data ?? null)}
                        onBlur={() => setActiveAnnotation(null)}
                        className="rounded p-1 text-accent hover:bg-bg-tertiary"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {comment.resolved && <span>{t('comment.resolved')}</span>}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {canComment && (
        <div className="border-t border-border p-3">
          <textarea
            aria-label={t('comment.input_label')}
            value={body}
            maxLength={5000}
            rows={3}
            placeholder={t('comment.placeholder')}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                void submitComment()
              }
            }}
            className="w-full resize-none rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-focus"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {isDrawingMode ? (
                <>
                  <button
                    type="button"
                    title={t('drawing.stop')}
                    aria-label={t('drawing.stop')}
                    onClick={() => setIsDrawingMode(false)}
                    className="grid size-7 place-items-center rounded text-text-tertiary hover:bg-bg-tertiary"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {DRAWING_TOOLS.map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      title={t(`drawing.${id}`)}
                      aria-label={t(`drawing.${id}`)}
                      onClick={() => setDrawingTool(id)}
                      className={`grid size-7 place-items-center rounded ${
                        drawingTool === id
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-tertiary hover:bg-bg-tertiary'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                  {DRAWING_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={t('drawing.color', { color })}
                      aria-label={t('drawing.color', { color })}
                      onClick={() => setDrawingColor(color)}
                      className={`size-5 rounded-full ${
                        drawingColor === color
                          ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg-secondary'
                          : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <button
                    type="button"
                    title={t('drawing.undo')}
                    aria-label={t('drawing.undo')}
                    onClick={undo}
                    className="grid size-7 place-items-center rounded text-text-tertiary hover:bg-bg-tertiary"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title={t('drawing.clear')}
                    aria-label={t('drawing.clear')}
                    onClick={() => {
                      clear()
                      setPendingAnnotation(null)
                    }}
                    className="grid size-7 place-items-center rounded text-text-tertiary hover:bg-bg-tertiary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={attachTimecode}
                      disabled={!canUseTimecode}
                      onChange={(event) => setAttachTimecode(event.target.checked)}
                    />
                    {t('comment.attach_timecode', { timecode: displayedTimecode })}
                  </label>
                  {canAnnotate && (
                    <button
                      type="button"
                      title={t('drawing.start')}
                      aria-label={t('drawing.start')}
                      onClick={() => setIsDrawingMode(true)}
                      className="grid size-7 place-items-center rounded text-text-tertiary hover:bg-bg-tertiary hover:text-accent"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
            <Button
              size="sm"
              disabled={!body.trim() || submitting}
              onClick={() => void submitComment()}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('comment.submit')}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-status-error">{error}</p>}
        </div>
      )}

      {!canComment && error && <p className="border-t border-border p-3 text-xs text-status-error">{error}</p>}
    </aside>
  )
}
