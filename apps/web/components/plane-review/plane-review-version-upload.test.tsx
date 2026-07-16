import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploadPlaneReviewVersion = vi.fn()
const validatePlaneReviewFile = vi.fn()

vi.mock('@/lib/plane-review-upload', () => ({
  planeReviewFileAccept: () => 'video/*',
  uploadPlaneReviewVersion: (...args: unknown[]) => uploadPlaneReviewVersion(...args),
  validatePlaneReviewFile: (...args: unknown[]) => validatePlaneReviewFile(...args),
}))

import { PlaneReviewVersionUpload } from './plane-review-version-upload'

const asset = { id: 'asset-1', name: 'Campaign cut', asset_type: 'video' }
const context = { workspace_id: 'workspace-1', project_id: 'project-1', issue_id: 'issue-1' }

describe('PlaneReviewVersionUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validatePlaneReviewFile.mockReturnValue(undefined)
  })

  it('uploads the first version and refreshes the review', async () => {
    const user = userEvent.setup()
    const onUploaded = vi.fn().mockResolvedValue(undefined)
    uploadPlaneReviewVersion.mockImplementation(async ({ onProgress }) => {
      onProgress(95)
      onProgress(100)
      return { status: 'processing', asset_id: asset.id, version_id: 'version-1' }
    })
    render(
      <PlaneReviewVersionUpload
        asset={asset}
        context={context}
        mode="first"
        onUploaded={onUploaded}
      />,
    )

    const file = new File(['video'], 'campaign.mp4', { type: 'video/mp4' })
    await user.upload(screen.getByLabelText('Choose first review file'), file)
    expect(screen.getByText('campaign.mp4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadPlaneReviewVersion).toHaveBeenCalledWith(
      expect.objectContaining({ asset, context, file, signal: expect.any(AbortSignal) }),
    )
  })

  it('uploads a subsequent version and closes after refresh', async () => {
    const user = userEvent.setup()
    const onUploaded = vi.fn().mockResolvedValue(undefined)
    const onDismiss = vi.fn()
    uploadPlaneReviewVersion.mockResolvedValue({
      status: 'processing',
      asset_id: asset.id,
      version_id: 'version-3',
    })
    render(
      <PlaneReviewVersionUpload
        asset={asset}
        context={context}
        mode="next"
        onUploaded={onUploaded}
        onDismiss={onDismiss}
      />,
    )

    const file = new File(['video'], 'campaign-v3.mp4', { type: 'video/mp4' })
    await user.upload(screen.getByLabelText('Choose new review version file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows client validation errors before upload', async () => {
    const user = userEvent.setup()
    validatePlaneReviewFile.mockImplementation(() => {
      throw new Error('Choose a video file for this asset.')
    })
    render(
      <PlaneReviewVersionUpload
        asset={asset}
        context={context}
        mode="first"
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.upload(
      screen.getByLabelText('Choose first review file'),
      new File(['video'], 'campaign.mp4', { type: 'video/mp4' }),
    )

    expect(screen.getByText('Unable to use this file.')).toBeInTheDocument()
    expect(uploadPlaneReviewVersion).not.toHaveBeenCalled()
  })

  it('cancels an active upload through its abort signal', async () => {
    const user = userEvent.setup()
    uploadPlaneReviewVersion.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        }),
    )
    render(
      <PlaneReviewVersionUpload
        asset={asset}
        context={context}
        mode="next"
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.upload(
      screen.getByLabelText('Choose new review version file'),
      new File(['video'], 'campaign.mp4', { type: 'video/mp4' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Upload cancelled.')).toBeInTheDocument()
  })
})
