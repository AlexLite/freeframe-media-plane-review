import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlaneReviewPanel } from './plane-review-panel'

const exchangePlaneReviewToken = vi.fn()
const getPlaneReviewBootstrap = vi.fn()
const getPlaneReviewStream = vi.fn()

vi.mock('@/lib/plane-review-client', () => ({
  exchangePlaneReviewToken: (...args: unknown[]) => exchangePlaneReviewToken(...args),
  getPlaneReviewBootstrap: (...args: unknown[]) => getPlaneReviewBootstrap(...args),
  getPlaneReviewStream: (...args: unknown[]) => getPlaneReviewStream(...args),
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
    getPlaneReviewBootstrap.mockResolvedValue(bootstrap)
    getPlaneReviewStream.mockResolvedValue({
      url: 'https://media.example/master.m3u8',
      asset_type: 'video',
      expires_in: 3600,
    })
  })

  it('exchanges the token, loads bootstrap and requests the newest ready version', async () => {
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('Campaign cut')).toBeInTheDocument()
    await waitFor(() => expect(getPlaneReviewStream).toHaveBeenCalledWith('asset-1', 'v2'))
    expect(exchangePlaneReviewToken).toHaveBeenCalledWith('integration-token')
    expect(screen.getByText('campaign-v2.mp4')).toBeInTheDocument()
    expect(screen.getByText('1.0 MB')).toBeInTheDocument()
  })

  it('does not request a stream for a processing version', async () => {
    const user = userEvent.setup()
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    const select = await screen.findByLabelText('Asset version')
    await waitFor(() => expect(getPlaneReviewStream).toHaveBeenCalledTimes(1))
    await user.selectOptions(select, 'v1')

    expect(await screen.findByText('Version is processing.')).toBeInTheDocument()
    expect(getPlaneReviewStream).toHaveBeenCalledTimes(1)
  })

  it('shows a retry action when bootstrap fails', async () => {
    getPlaneReviewBootstrap.mockRejectedValueOnce(new Error('Session denied'))
    const user = userEvent.setup()
    render(<PlaneReviewPanel assetId="asset-1" integrationToken="integration-token" />)

    expect(await screen.findByText('Session denied')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Campaign cut')).toBeInTheDocument()
    expect(getPlaneReviewBootstrap).toHaveBeenCalledTimes(2)
  })
})
