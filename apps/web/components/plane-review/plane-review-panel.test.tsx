import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlaneReviewPanel } from './plane-review-panel'

const exchangePlaneReviewToken = vi.fn()
const getPlaneReviewBootstrap = vi.fn()
const getPlaneReviewStream = vi.fn()
const getPlaneReviewSession = vi.fn()

vi.mock('@/lib/plane-review-client', () => ({
  exchangePlaneReviewToken: (...args: unknown[]) => exchangePlaneReviewToken(...args),
  getPlaneReviewBootstrap: (...args: unknown[]) => getPlaneReviewBootstrap(...args),
  getPlaneReviewStream: (...args: unknown[]) => getPlaneReviewStream(...args),
  getPlaneReviewSession: () => getPlaneReviewSession(),
  planeReviewRequest: vi.fn(),
}))

vi.mock('./plane-review-comments', () => ({
  PlaneReviewComments: ({ versionId }: { versionId: string }) => (
    <div data-testid="plane-review-comments">Comments for {versionId}</div>
  ),
}))

vi.mock('hls.js', () => ({
  default: class MockHls {
    static isSupported() { return false }
    loadSource() {}
    attachMedia() {}
    destroy() {}
  },
}))

const bootstrap = {
  context: { workspace_id: 'w1', project_id: 'p1', issue_id: 'i1' },
  asset: { id: 'asset-1', name: 'Campaign cut', asset_type: 'video' },
  permissions: { read: true, comment: true, upload: false, manage: false },
  versions: [
    {
      id: 'v2',
      version_number: 2,
      processing_status: 'ready',
      created_by: 'u1',
      created_at: '2026-07-15T10:00:00Z',
      original_filename: 'campaign-v2.mp4',
      mime_type: 'video/mp4',
      file_size_bytes: 1048576,
    },
    {
      id: 'v1',
      version_number: 1,
      processing_status: 'processing',
      created_by: 'u1',
      created_at: '2026-07-14T10:00:00Z',
      original_filename: 'campaign-v1.mp4',
      mime_type: 'video/mp4',
      file_size_bytes: 512,
    },
  ],
}

describe('PlaneReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exchangePlaneReviewToken.mockResolvedValue({ access_token: 'token' })
    getPlaneReviewSession.mockReturnValue({ user: { id: 'u1' } })
    getPlaneReviewBootstrap.mockResolvedValue(bootstrap)
    getPlaneReviewStream.mockResolvedValue({
      url: 'https://media.example/master.m3u8',
      asset_type: 'video',
      expires_in: 3600,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exchanges the token, loads bootstrap and requests the newest ready version', async () => {
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('Campaign cut')).toBeInTheDocument()
    await waitFor(() => expect(getPlaneReviewStream).toHaveBeenCalledWith('asset-1', 'v2'))
    expect(exchangePlaneReviewToken).toHaveBeenCalledWith('integration-token')
    expect(screen.getByText('campaign-v2.mp4')).toBeInTheDocument()
    expect(screen.getByText('1.0 MB')).toBeInTheDocument()
    expect(screen.getByText('Comments for v2')).toBeInTheDocument()
  })

  it('does not request a stream for a processing version', async () => {
    const user = userEvent.setup()
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    const select = await screen.findByLabelText('Asset version')
    await waitFor(() => expect(getPlaneReviewStream).toHaveBeenCalledTimes(1))
    await user.selectOptions(select, 'v1')

    expect(await screen.findByText('Version is processing.')).toBeInTheDocument()
    expect(screen.getByText('Status refreshes automatically.')).toBeInTheDocument()
    expect(screen.getByText('Comments for v1')).toBeInTheDocument()
    expect(getPlaneReviewStream).toHaveBeenCalledTimes(1)
  })

  it('polls a processing version and loads its stream when it becomes ready', async () => {
    vi.useFakeTimers()
    const processingBootstrap = {
      ...bootstrap,
      versions: [{ ...bootstrap.versions[0], processing_status: 'processing' }],
    }
    const readyBootstrap = {
      ...bootstrap,
      versions: [{ ...bootstrap.versions[0], processing_status: 'ready' }],
    }
    getPlaneReviewBootstrap
      .mockResolvedValueOnce(processingBootstrap)
      .mockResolvedValueOnce(readyBootstrap)

    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Version is processing.')).toBeInTheDocument()
    expect(getPlaneReviewStream).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(getPlaneReviewBootstrap).toHaveBeenCalledTimes(2)
    await act(async () => {
      await Promise.resolve()
    })
    expect(getPlaneReviewStream).toHaveBeenCalledWith('asset-1', 'v2')
  })

  it('does not reload a ready stream while polling another pending version', async () => {
    vi.useFakeTimers()
    getPlaneReviewBootstrap.mockResolvedValue(bootstrap)

    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getPlaneReviewStream).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(getPlaneReviewBootstrap).toHaveBeenCalledTimes(2)
    expect(getPlaneReviewStream).toHaveBeenCalledTimes(1)
  })

  it('shows a subsequent-version uploader when upload permission is granted', async () => {
    const user = userEvent.setup()
    getPlaneReviewBootstrap.mockResolvedValueOnce({
      ...bootstrap,
      permissions: { ...bootstrap.permissions, upload: true },
    })
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    await user.click(await screen.findByRole('button', { name: 'New version' }))
    expect(screen.getByText('Upload a new version')).toBeInTheDocument()
    expect(screen.getByLabelText('Choose new review version file')).toBeInTheDocument()
  })

  it('shows first-version upload only when the Plane session grants upload', async () => {
    getPlaneReviewBootstrap.mockResolvedValueOnce({
      ...bootstrap,
      versions: [],
      permissions: { ...bootstrap.permissions, upload: true },
    })
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('Upload the first version')).toBeInTheDocument()
    expect(screen.getByLabelText('Choose first review file')).toBeInTheDocument()
    expect(screen.queryByTestId('plane-review-comments')).not.toBeInTheDocument()
    expect(getPlaneReviewStream).not.toHaveBeenCalled()
  })

  it('keeps an empty asset read-only without upload scope', async () => {
    getPlaneReviewBootstrap.mockResolvedValueOnce({ ...bootstrap, versions: [] })
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('No versions have been uploaded yet.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Choose first review file')).not.toBeInTheDocument()
  })

  it('shows a retry action when bootstrap fails', async () => {
    getPlaneReviewBootstrap.mockRejectedValueOnce(new Error('Session denied'))
    const user = userEvent.setup()
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('Unable to load Plane review.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Campaign cut')).toBeInTheDocument()
    expect(getPlaneReviewBootstrap).toHaveBeenCalledTimes(2)
  })
})
