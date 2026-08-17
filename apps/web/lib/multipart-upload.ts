export const MULTIPART_UPLOAD_CONCURRENCY = 4
const MULTIPART_UPLOAD_MAX_ATTEMPTS = 3

export interface MultipartUploadPart {
  PartNumber: number
  ETag: string
}

interface UploadMultipartPartsOptions {
  file: File
  chunkSize: number
  signal?: AbortSignal
  concurrency?: number
  getPresignedUrl: (partNumber: number, signal?: AbortSignal) => Promise<string>
  onProgress?: (completedParts: number, totalParts: number) => void
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Upload cancelled', 'AbortError'))
    }, { once: true })
  })
}

async function uploadPartWithRetry(
  file: File,
  partNumber: number,
  chunkSize: number,
  getPresignedUrl: UploadMultipartPartsOptions['getPresignedUrl'],
  signal?: AbortSignal,
): Promise<MultipartUploadPart> {
  const start = (partNumber - 1) * chunkSize
  const chunk = file.slice(start, Math.min(start + chunkSize, file.size))
  let lastError: unknown

  for (let attempt = 1; attempt <= MULTIPART_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      assertNotAborted(signal)
      const presignedUrl = await getPresignedUrl(partNumber, signal)
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: chunk,
        signal,
      })
      if (!response.ok) throw new Error(`Part ${partNumber} failed: ${response.statusText || response.status}`)
      return { PartNumber: partNumber, ETag: response.headers.get('ETag') ?? '' }
    } catch (error) {
      lastError = error
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (attempt < MULTIPART_UPLOAD_MAX_ATTEMPTS) await waitForRetry(250 * attempt, signal)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed`)
}

/** Upload S3 multipart parts concurrently while returning parts in S3 order. */
export async function uploadMultipartParts({
  file,
  chunkSize,
  signal,
  concurrency = MULTIPART_UPLOAD_CONCURRENCY,
  getPresignedUrl,
  onProgress,
}: UploadMultipartPartsOptions): Promise<MultipartUploadPart[]> {
  const totalParts = Math.ceil(file.size / chunkSize)
  const parts = new Array<MultipartUploadPart>(totalParts)
  let nextPart = 1
  let completedParts = 0
  const workerCount = Math.min(Math.max(1, concurrency), totalParts)

  const worker = async () => {
    while (true) {
      assertNotAborted(signal)
      const partNumber = nextPart++
      if (partNumber > totalParts) return
      parts[partNumber - 1] = await uploadPartWithRetry(
        file,
        partNumber,
        chunkSize,
        getPresignedUrl,
        signal,
      )
      completedParts += 1
      onProgress?.(completedParts, totalParts)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  return parts
}
