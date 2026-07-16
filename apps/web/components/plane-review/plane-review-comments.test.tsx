import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPlaneReviewComments = vi.fn()
const createPlaneReviewComment = vi.fn()
const resolvePlaneReviewComment = vi.fn()
const deletePlaneReviewComment = vi.fn()

vi.mock('@/lib/plane-review-client', () => ({
  getPlaneReviewComments: (...args: unknown[]) => getPlaneReviewComments(...args),
  createPlaneReviewComment: (...args: unknown[]) => createPlaneReviewComment(...args),
  resolvePlaneReviewComment: (...args: unknown[]) => resolvePlaneReviewComment(...args),
  deletePlaneReviewComment: (...args: unknown[]) => deletePlaneReviewComment(...args),
}))

import { PlaneReviewComments } from './plane-review-comments'
import { useReviewStore } from '@/stores/review-store'

const comment = {
  id: 'comment-1',
  asset_id: 'asset-1',
  version_id: 'version-1',
  parent_id: null,
  author_id: 'user-1',
  timecode_start: 65.4,
  timecode_end: null,
  body: 'Tighten this transition',
  resolved: false,
  visibility: 'public',
  created_at: '2026-07-15T10:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
  author: { id: 'user-1', name: 'Alex', avatar_url: null },
  annotation: null,
  replies: [],
}

function renderComments(
  overrides: Partial<ComponentProps<typeof PlaneReviewComments>> = {},
) {
  const props: ComponentProps<typeof PlaneReviewComments> = {
    assetId: 'asset-1',
    versionId: 'version-1',
    canComment: true,
    canManage: false,
    currentUserId: 'user-1',
    currentTime: 12.345,
    canUseTimecode: true,
    canAnnotate: true,
    onSeek: vi.fn(),
    ...overrides,
  }
  render(<PlaneReviewComments {...props} />)
  return props
}

describe('PlaneReviewComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().reset()
    getPlaneReviewComments.mockResolvedValue([comment])
    createPlaneReviewComment.mockResolvedValue({
      ...comment,
      id: 'comment-2',
      body: 'New note',
      timecode_start: 12.345,
    })
    resolvePlaneReviewComment.mockResolvedValue({ ...comment, resolved: true })
    deletePlaneReviewComment.mockResolvedValue(undefined)
  })

  it('loads comments and seeks to a timecoded note', async () => {
    const props = renderComments()

    expect(await screen.findByText('Tighten this transition')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '1:05' }))

    expect(getPlaneReviewComments).toHaveBeenCalledWith('asset-1', 'version-1')
    expect(props.onSeek).toHaveBeenCalledWith(65.4)
  })

  it('creates a comment with the current playback time', async () => {
    const user = userEvent.setup()
    renderComments()
    await screen.findByText('Tighten this transition')

    await user.type(screen.getByLabelText('Review comment'), 'New note')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() =>
      expect(createPlaneReviewComment).toHaveBeenCalledWith('asset-1', 'version-1', {
        body: 'New note',
        timecode_start: 12.345,
      }),
    )
    expect(await screen.findByText('New note')).toBeInTheDocument()
  })

  it('does not attach playback time when the media type has no timeline', async () => {
    const user = userEvent.setup()
    renderComments({ canUseTimecode: false })
    await screen.findByText('Tighten this transition')

    expect(screen.getByRole('checkbox')).toBeDisabled()
    await user.type(screen.getByLabelText('Review comment'), 'Image note')
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() =>
      expect(createPlaneReviewComment).toHaveBeenCalledWith('asset-1', 'version-1', {
        body: 'Image note',
      }),
    )
  })

  it('submits a drawing annotation with the current media time', async () => {
    const user = userEvent.setup()
    useReviewStore.getState().setPendingAnnotation({
      objects: [{ type: 'Path' }],
      _canvasWidth: 1280,
      _canvasHeight: 720,
    })
    renderComments()
    await screen.findByText('Tighten this transition')

    await user.type(screen.getByLabelText('Review comment'), 'Mark this frame')
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() =>
      expect(createPlaneReviewComment).toHaveBeenCalledWith('asset-1', 'version-1', {
        body: 'Mark this frame',
        timecode_start: 12.345,
        annotation: {
          drawing_data: {
            objects: [{ type: 'Path' }],
            _canvasWidth: 1280,
            _canvasHeight: 720,
          },
        },
      }),
    )
  })

  it('resolves and deletes an owned comment', async () => {
    const user = userEvent.setup()
    renderComments()
    await screen.findByText('Tighten this transition')

    await user.click(screen.getByRole('button', { name: 'Resolve comment' }))
    await waitFor(() => expect(resolvePlaneReviewComment).toHaveBeenCalledWith('asset-1', 'comment-1'))

    await user.click(screen.getByRole('button', { name: 'Delete comment' }))
    await waitFor(() => expect(deletePlaneReviewComment).toHaveBeenCalledWith('asset-1', 'comment-1'))
    expect(screen.queryByText('Tighten this transition')).not.toBeInTheDocument()
  })

  it('keeps the panel read-only without comment permission', async () => {
    renderComments({ canComment: false, currentUserId: 'other-user' })

    expect(await screen.findByText('Tighten this transition')).toBeInTheDocument()
    expect(screen.queryByLabelText('Review comment')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolve comment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument()
  })
})
