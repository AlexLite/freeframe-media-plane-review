import { ApiError } from './api'
import type {
  PlaneReviewBootstrapResponse,
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
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback
  const detail = (body as { detail?: unknown }).detail
  return typeof detail === 'string' ? detail : JSON.stringify(detail)
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(response.status, errorDetail(body, response.statusText))
  }
  return (await response.json()) as T
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

export async function planeReviewRequest<T>(path: string): Promise<T> {
  const session = getPlaneReviewSession()
  if (!session || !state) {
    throw new ApiError(401, 'Plane review session is missing or expired')
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${state.accessToken}` },
  })
  if (response.status === 401) clearPlaneReviewSession()
  return parseResponse<T>(response)
}

export function getPlaneReviewBootstrap<TAsset = Record<string, unknown>>(
  assetId: string,
): Promise<PlaneReviewBootstrapResponse<TAsset>> {
  return planeReviewRequest(`/integrations/plane/assets/${encodeURIComponent(assetId)}/review`)
}
