import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPlaneReviewSession,
  exchangePlaneReviewToken,
  getPlaneReviewBootstrap,
  getPlaneReviewSession,
  getPlaneReviewStream,
} from './plane-review-client'

const session = {
  access_token: 'plane-access',
  expires_in: 60,
  user: { id: 'u1', plane_user_id: 'p1', email: 'a@example.com', name: 'A' },
  context: { workspace_id: 'w1', project_id: 'p1', issue_id: 'i1' },
  scopes: ['review:read'],
}

describe('plane review client', () => {
  beforeEach(() => {
    clearPlaneReviewSession()
    vi.restoreAllMocks()
  })

  it('keeps the exchanged token in memory and sends it to bootstrap', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ context: session.context, asset: {}, versions: [], permissions: { read: true, comment: false, upload: false, manage: false } }), { status: 200 }),
      )

    await exchangePlaneReviewToken('plane-token')
    await getPlaneReviewBootstrap('asset/id')

    expect(getPlaneReviewSession()).toEqual(session)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/review',
      {
        cache: 'no-store',
        headers: { Authorization: 'Bearer plane-access' },
      },
    )
  })

  it('requests a specific version stream with the Plane bearer token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://media.example/master.m3u8', asset_type: 'video', expires_in: 3600 }), { status: 200 }),
      )

    await exchangePlaneReviewToken('plane-token')
    await getPlaneReviewStream('asset/id', 'version id')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/stream?version_id=version+id',
      {
        cache: 'no-store',
        headers: { Authorization: 'Bearer plane-access' },
      },
    )
  })

  it('clears the in-memory session after an unauthorized response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'expired' }), { status: 401 }))

    await exchangePlaneReviewToken('plane-token')
    await expect(getPlaneReviewBootstrap('asset')).rejects.toMatchObject({ status: 401 })
    expect(getPlaneReviewSession()).toBeNull()
  })

  it('never writes Plane credentials to browser storage', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem')
    const sessionSet = vi.spyOn(window.sessionStorage, 'setItem')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(session), { status: 200 }),
    )

    await exchangePlaneReviewToken('plane-token')

    expect(localSet).not.toHaveBeenCalled()
    expect(sessionSet).not.toHaveBeenCalled()
  })
})
