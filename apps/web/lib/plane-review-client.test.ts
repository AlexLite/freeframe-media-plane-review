import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPlaneReviewSession,
  createPlaneReviewComment,
  deletePlaneReviewComment,
  exchangePlaneReviewToken,
  getPlaneReviewBootstrap,
  getPlaneReviewComments,
  getPlaneReviewSession,
  getPlaneReviewStream,
  planeReviewRequest,
  resolvePlaneReviewComment,
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

  it('uses context-scoped comment routes and JSON payloads', async () => {
    const comment = {
      id: 'comment-1',
      asset_id: 'asset/id',
      version_id: 'version id',
      body: 'Fix this cut',
    }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(comment), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...comment, resolved: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await exchangePlaneReviewToken('plane-token')
    await getPlaneReviewComments('asset/id', 'version id')
    await createPlaneReviewComment('asset/id', 'version id', {
      body: 'Fix this cut',
      timecode_start: 12.5,
    })
    await resolvePlaneReviewComment('asset/id', 'comment/1')
    await deletePlaneReviewComment('asset/id', 'comment/1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/versions/version%20id/comments',
      { cache: 'no-store', headers: { Authorization: 'Bearer plane-access' } },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/versions/version%20id/comments',
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer plane-access' },
        body: JSON.stringify({ body: 'Fix this cut', timecode_start: 12.5 }),
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/comments/comment%2F1/resolve',
      { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer plane-access' } },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:8000/integrations/plane/assets/asset%2Fid/comments/comment%2F1',
      { method: 'DELETE', cache: 'no-store', headers: { Authorization: 'Bearer plane-access' } },
    )
  })

  it('supports authenticated JSON mutations and empty success responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await exchangePlaneReviewToken('plane-token')
    await planeReviewRequest<void>('/integrations/plane/assets/a/versions/v/upload/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: 'upload-1' }),
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/integrations/plane/assets/a/versions/v/upload/abort',
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer plane-access',
        },
        body: JSON.stringify({ upload_id: 'upload-1' }),
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
