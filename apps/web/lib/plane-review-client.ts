import { ApiError } from './api'
import type {
  PlaneReviewAssetSummary,
  PlaneReviewBootstrapResponse,
  PlaneReviewComment,
  PlaneReviewCommentCreate,
  PlaneReviewStreamResponse,
  PlaneSessionExchangeResponse,
} from './plane-review-types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const EXPIRY_SKEW_MS = 5_000

interface PlaneSessionState {
  accessToken: string
  expiresAt: number
  session: PlaneSessionExchangeResponse
}

let state: PlaneSessionState | null = null

function errorDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  if ('detail' in body) {
    const detail = (body as { detail?: unknown }).detail
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  if ('error' in body && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return fallback
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    if (!response.ok) throw new ApiError(response.status, response.statusText)
    return undefined as T
  }

  const text = await response.text()
  let body: unknown
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      if (response.ok) throw new ApiError(502, 'FreeFrame returned an invalid response')
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorDetail(body, response.statusText))
  }
  return body as T
}

function authorizedHeaders(headers: HeadersInit | undefined, accessToken: string): HeadersInit {
  if (!headers) return { Authorization: `Bearer ${accessToken}` }
  if (!Array.isArray(headers) && !(headers instanceof Headers)) {
    return { ...headers, Authorization: `Bearer ${accessToken}` }
  }

  const normalized: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    normalized[key] = value
  })
  normalized.Authorization = `Bearer ${accessToken}`
  return normalized
}

export function clearPlaneReviewSession(): void {
  state = null
}

export function getPlaneReviewSession(): PlaneSessionExchangeResponse | null {
  if (!state || Date.now() >= state.expiresAt - EXPIRY_SKEW_MS) {
    state = null
    return null
  }
  return state.session
}

export async function exchangePlaneReviewToken(
  token: string,
): Promise<PlaneSessionExchangeResponse> {
  const response = await fetch(`${API_URL}/integrations/plane/session`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const session = await parseResponse<PlaneSessionExchangeResponse>(response)
  state = {
    accessToken: session.access_token,
    expiresAt: Date.now() + session.expires_in * 1000,
    session,
  }
  return session
}

export async function planeReviewRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = getPlaneReviewSession()
  if (!session || !state) {
    throw new ApiError(401, 'Plane review session is missing or expired')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: authorizedHeaders(init.headers, state.accessToken),
  })
  if (response.status === 401) clearPlaneReviewSession()
  return parseResponse<T>(response)
}

export function getPlaneReviewBootstrap<TAsset = PlaneReviewAssetSummary>(
  assetId: string,
): Promise<PlaneReviewBootstrapResponse<TAsset>> {
  return planeReviewRequest(`/integrations/plane/assets/${encodeURIComponent(assetId)}/review`)
}

export async function getPlaneReviewStream(
  assetId: string,
  versionId: string,
): Promise<PlaneReviewStreamResponse> {
  const query = new URLSearchParams({ version_id: versionId })
  const stream = await planeReviewRequest<PlaneReviewStreamResponse>(
    `/integrations/plane/assets/${encodeURIComponent(assetId)}/stream?${query.toString()}`,
  )
  if (!stream.url.startsWith('/')) return stream

  return {
    ...stream,
    url: `${API_URL.replace(/\/$/, '')}${stream.url}`,
  }
}

function planeReviewCommentPath(assetId: string, versionId: string): string {
  return `/integrations/plane/assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/comments`
}

export function getPlaneReviewComments(
  assetId: string,
  versionId: string,
): Promise<PlaneReviewComment[]> {
  return planeReviewRequest(planeReviewCommentPath(assetId, versionId))
}

export function createPlaneReviewComment(
  assetId: string,
  versionId: string,
  body: PlaneReviewCommentCreate,
): Promise<PlaneReviewComment> {
  return planeReviewRequest(planeReviewCommentPath(assetId, versionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function resolvePlaneReviewComment(
  assetId: string,
  commentId: string,
): Promise<PlaneReviewComment> {
  return planeReviewRequest(
    `/integrations/plane/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}/resolve`,
    { method: 'POST' },
  )
}

export function deletePlaneReviewComment(assetId: string, commentId: string): Promise<void> {
  return planeReviewRequest(
    `/integrations/plane/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  )
}
