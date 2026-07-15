import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploadPlaneReviewFirstVersion = vi.fn()
const validatePlaneReviewFile = vi.fn()

vi.mock('@/lib/plane-review-upload', () => ({
  planeReviewFileAccept: () => 'video/*',
  uploadPlaneReviewFirstVersion: (...args: unknown[]) => uploadPlaneReviewFirstVersion(...args),
  validatePlaneReviewFile: (...args: unknown[]) => validatePlaneReviewFile(...args),
}))

import { PlaneReviewFirstUpload } from './plane-review-first-upload'

const asset = { id: 'asset-1', name: 'Campaign cut', asset_type: 'video' }
const context = { workspace_id: 'workspace-1', project_id: 'project-1', issue_id: 'issue-1' }

describe('PlaneReviewFirstUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validatePlaneReviewFile.mockReturnValue(undefined)
  })

  it('selects a compatible file, uploads it and refreshes the review', async () => {
    const user = userEvent.setup()
    const onUploaded = vi.fn().mockResolvedValue(undefined)
    uploadPlaneReviewFirstVersion.mockImplementation(async ({ onProgress }) => {
      onProgress(95)
      onProgress(100)
      return { status: 'processing', asset_id: asset.id, version_id: 'version-1' }
    })
    render(<PlaneReviewFirstUpload asset={asset} context={context} onUploaded={onUploaded} />)

    const file = new File(['video'], 'campaign.mp4', { type: 'video/mp4' })
    await user.upload(screen.getByLabelText('Choose first review file'), file)
    expect(screen.getByText('campaign.mp4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadPlaneReviewFirstVersion).toHaveBeenCalledWith(
      expect.objectContaining({ asset, context, file, signal: expect.any(AbortSignal) }),
    )
  })

  it('shows client validation errors before upload', async () => {
    const user = userEvent.setup()
    validatePlaneReviewFile.mockImplementation(() => {
      throw new Error('Choose a video file for this asset.')
    })
    render(
      <PlaneReviewFirstUpload
        asset={asset}
        context={context}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.upload(
      screen.getByLabelText('Choose first review file'),
      new File(['video'], 'campaign.mp4', { type: 'video/mp4' }),
    )

    expect(screen.getByText('Choose a video file for this asset.')).toBeInTheDocument()
    expect(uploadPlaneReviewFirstVersion).not.toHaveBeenCalled()
  })

  it('cancels an active upload through its abort signal', async () => {
    const user = userEvent.setup()
    uploadPlaneReviewFirstVersion.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        }),
    )
    render(
      <PlaneReviewFirstUpload
        asset={asset}
        context={context}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.upload(
      screen.getByLabelText('Choose first review file'),
      new File(['video'], 'campaign.mp4', { type: 'video/mp4' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Upload cancelled.')).toBeInTheDocument()
  })
})
