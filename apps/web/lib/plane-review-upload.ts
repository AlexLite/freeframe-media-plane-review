import { planeReviewRequest } from './plane-review-client'
import { uploadMultipartParts } from './multipart-upload'
import type {
  PlaneReviewAssetSummary,
  PlaneReviewContext,
  PlaneReviewUploadCompletion,
  PlaneReviewUploadInitiation,
} from './plane-review-types'

export const PLANE_REVIEW_UPLOAD_CHUNK_SIZE = 10 * 1024 * 1024
export const PLANE_REVIEW_UPLOAD_MAX_PARTS = 10_000

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/tiff',
  'image/gif',
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
  'audio/aac',
  'audio/ogg',
  'audio/x-m4a',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
  'video/x-ms-wmv',
])

interface UploadPlaneReviewVersionOptions {
  asset: PlaneReviewAssetSummary
  context: PlaneReviewContext
  file: File
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

interface PresignPartResponse {
  presigned_url: string
  part_number: number
}

function jsonRequest<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return planeReviewRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

function abortError(): DOMException {
  return new DOMException('Upload cancelled', 'AbortError')
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function mimeCategory(mimeType: string): 'video' | 'image' | 'audio' | null {
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  return null
}

export function planeReviewFileAccept(assetType: string): string {
  if (assetType === 'video') return 'video/*'
  if (assetType === 'audio') return 'audio/*'
  if (assetType === 'image' || assetType === 'image_carousel') return 'image/*'
  return ''
}

export function validatePlaneReviewFile(assetType: string, file: File): void {
  const filename = file.name.trim()
  if (!filename) throw new Error('Choose a named media file.')
  if (filename.length > 500) throw new Error('The file name is too long.')
  if (file.size <= 0) throw new Error('The selected file is empty.')

  const mimeType = file.type.toLowerCase()
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error('This media format is not supported.')
  }

  const expectedCategory = assetType === 'image_carousel' ? 'image' : assetType
  if (!['video', 'image', 'audio'].includes(expectedCategory)) {
    throw new Error('This asset type does not support file upload.')
  }
  if (mimeCategory(mimeType) !== expectedCategory) {
    const article = expectedCategory === 'video' ? 'a' : 'an'
    throw new Error(`Choose ${article} ${expectedCategory} file for this asset.`)
  }

  const totalParts = Math.ceil(file.size / PLANE_REVIEW_UPLOAD_CHUNK_SIZE)
  if (totalParts > PLANE_REVIEW_UPLOAD_MAX_PARTS) {
    throw new Error('The selected file is too large for multipart upload.')
  }
}

export async function uploadPlaneReviewVersion({
  asset,
  context,
  file,
  signal,
  onProgress,
}: UploadPlaneReviewVersionOptions): Promise<PlaneReviewUploadCompletion> {
  validatePlaneReviewFile(asset.asset_type, file)
  assertNotAborted(signal)

  const assetPath = `/integrations/plane/assets/${encodeURIComponent(asset.id)}`
  let initiation: PlaneReviewUploadInitiation | null = null

  try {
    initiation = await jsonRequest<PlaneReviewUploadInitiation>(
      `${assetPath}/versions`,
      {
        project_id: context.project_id,
        asset_id: asset.id,
        asset_name: asset.name,
        original_filename: file.name.trim(),
        mime_type: file.type.toLowerCase(),
        file_size_bytes: file.size,
      },
      signal,
    )

    if (initiation.asset_id !== asset.id || !initiation.version_id) {
      throw new Error('FreeFrame returned an unexpected upload context.')
    }

    const parts = await uploadMultipartParts({
      file,
      chunkSize: PLANE_REVIEW_UPLOAD_CHUNK_SIZE,
      signal,
      getPresignedUrl: async (partNumber, partSignal) => {
        const presign = await jsonRequest<PresignPartResponse>(
          `${assetPath}/versions/${encodeURIComponent(initiation!.version_id)}/upload/presign-part`,
          {
            s3_key: initiation!.s3_key,
            upload_id: initiation!.upload_id,
            part_number: partNumber,
          },
          partSignal,
        )
        if (presign.part_number !== partNumber || !presign.presigned_url) {
          throw new Error(`FreeFrame returned an invalid URL for part ${partNumber}.`)
        }
        return presign.presigned_url
      },
      onProgress: (completedParts, totalParts) => onProgress?.(Math.round((completedParts / totalParts) * 95)),
    })

    const completion = await jsonRequest<PlaneReviewUploadCompletion>(
      `${assetPath}/versions/${encodeURIComponent(initiation.version_id)}/upload/complete`,
      {
        s3_key: initiation.s3_key,
        upload_id: initiation.upload_id,
        asset_id: asset.id,
        version_id: initiation.version_id,
        parts,
      },
      signal,
    )
    if (completion.asset_id !== asset.id || completion.version_id !== initiation.version_id) {
      throw new Error('FreeFrame returned an unexpected completed upload.')
    }
    onProgress?.(100)
    return completion
  } catch (error) {
    if (initiation) {
      await jsonRequest<void>(
        `${assetPath}/versions/${encodeURIComponent(initiation.version_id)}/upload/abort`,
        {
          s3_key: initiation.s3_key,
          upload_id: initiation.upload_id,
          version_id: initiation.version_id,
        },
      ).catch(() => undefined)
    }
    throw error
  }
}
