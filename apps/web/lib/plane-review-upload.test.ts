import { beforeEach, describe, expect, it, vi } from 'vitest'

const planeReviewRequest = vi.fn()

vi.mock('./plane-review-client', () => ({
  planeReviewRequest: (...args: unknown[]) => planeReviewRequest(...args),
}))

import {
  PLANE_REVIEW_UPLOAD_CHUNK_SIZE,
  uploadPlaneReviewVersion,
  validatePlaneReviewFile,
} from './plane-review-upload'

const asset = { id: 'asset-1', name: 'Campaign cut', asset_type: 'video' }
const context = { workspace_id: 'workspace-1', project_id: 'project-1', issue_id: 'issue-1' }

describe('Plane review upload client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    planeReviewRequest.mockReset()
  })

  it('uploads ordered multipart chunks and completes the next version', async () => {
    const file = new File(
      [new Uint8Array(PLANE_REVIEW_UPLOAD_CHUNK_SIZE + 1)],
      'campaign-v3.mp4',
      { type: 'video/mp4' },
    )
    const onProgress = vi.fn()
    planeReviewRequest
      .mockResolvedValueOnce({
        upload_id: 'upload-1',
        s3_key: 'raw/project/asset/version/original.mp4',
        asset_id: asset.id,
        version_id: 'version-3',
      })
      .mockResolvedValueOnce({ presigned_url: 'https://storage.example/part-1', part_number: 1 })
      .mockResolvedValueOnce({ presigned_url: 'https://storage.example/part-2', part_number: 2 })
      .mockResolvedValueOnce({ status: 'processing', asset_id: asset.id, version_id: 'version-3' })

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { ETag: '"etag-1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { ETag: '"etag-2"' } }))

    const result = await uploadPlaneReviewVersion({ asset, context, file, onProgress })

    expect(result.status).toBe('processing')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://storage.example/part-1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('headers')

    const initiateBody = JSON.parse(planeReviewRequest.mock.calls[0]?.[1].body as string)
    expect(initiateBody).toEqual({
      project_id: context.project_id,
      asset_id: asset.id,
      asset_name: asset.name,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
    })

    const completionBody = JSON.parse(planeReviewRequest.mock.calls[3]?.[1].body as string)
    expect(completionBody.parts).toEqual([
      { PartNumber: 1, ETag: '"etag-1"' },
      { PartNumber: 2, ETag: '"etag-2"' },
    ])
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('best-effort aborts the initiated upload after a part failure', async () => {
    const file = new File(['video'], 'campaign.mp4', { type: 'video/mp4' })
    planeReviewRequest
      .mockResolvedValueOnce({
        upload_id: 'upload-1',
        s3_key: 'raw/project/asset/version/original.mp4',
        asset_id: asset.id,
        version_id: 'version-1',
      })
      .mockResolvedValueOnce({ presigned_url: 'https://storage.example/part-1', part_number: 1 })
      .mockResolvedValueOnce({ presigned_url: 'https://storage.example/part-1', part_number: 1 })
      .mockResolvedValueOnce({ presigned_url: 'https://storage.example/part-1', part_number: 1 })
      .mockResolvedValueOnce(undefined)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(uploadPlaneReviewVersion({ asset, context, file })).rejects.toThrow(
      'Part 1 failed',
    )

    expect(planeReviewRequest).toHaveBeenLastCalledWith(
      '/integrations/plane/assets/asset-1/versions/version-1/upload/abort',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejects incompatible or empty files before creating a version', () => {
    expect(() =>
      validatePlaneReviewFile('image', new File(['video'], 'campaign.mp4', { type: 'video/mp4' })),
    ).toThrow('Choose an image file')
    expect(() =>
      validatePlaneReviewFile('video', new File([], 'empty.mp4', { type: 'video/mp4' })),
    ).toThrow('empty')
    expect(planeReviewRequest).not.toHaveBeenCalled()
  })
})
