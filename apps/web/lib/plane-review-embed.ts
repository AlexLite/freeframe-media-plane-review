export const PLANE_REVIEW_INIT_MESSAGE = 'freeframe:plane-review:init' as const
export const PLANE_REVIEW_READY_MESSAGE = 'freeframe:plane-review:ready' as const
export const PLANE_REVIEW_RESIZE_MESSAGE = 'freeframe:plane-review:resize' as const

export interface PlaneReviewEmbedInitMessage {
  type: typeof PLANE_REVIEW_INIT_MESSAGE
  assetId: string
  integrationToken: string
}

export interface PlaneReviewEmbedResizeMessage {
  type: typeof PLANE_REVIEW_RESIZE_MESSAGE
  height: number
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return []

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin
      } catch {
        return null
      }
    })
    .filter((origin): origin is string => origin !== null)

  return [...new Set(origins)]
}

export function isAllowedPlaneOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.includes(origin)
}

export function isPlaneReviewEmbedInitMessage(value: unknown): value is PlaneReviewEmbedInitMessage {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<PlaneReviewEmbedInitMessage>
  return (
    candidate.type === PLANE_REVIEW_INIT_MESSAGE &&
    typeof candidate.assetId === 'string' &&
    candidate.assetId.trim().length > 0 &&
    candidate.assetId.length <= 256 &&
    typeof candidate.integrationToken === 'string' &&
    candidate.integrationToken.trim().length > 0 &&
    candidate.integrationToken.length <= 16_384
  )
}
