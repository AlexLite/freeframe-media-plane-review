import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentPanel } from '@/components/review/comment-panel'
import { useLocaleStore } from '@/stores/locale-store'

describe('public detailed comment panel', () => {
  beforeEach(() => useLocaleStore.getState().applyLocale('en'))
  afterEach(cleanup)

  it('keeps real replies and hides authenticated-only actions', () => {
    render(
      <CommentPanel
        publicMode
        comments={[{
          id: 'comment-1',
          asset_id: 'asset-1',
          version_id: 'version-1',
          parent_id: null,
          author_id: null,
          guest_author_id: 'guest-1',
          timecode_start: 2,
          timecode_end: null,
          body: 'Guest feedback',
          resolved: false,
          visibility: 'public',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          guest_author: { id: 'guest-1', name: 'Guest', email: 'guest@example.test' },
          author: null,
          annotation: null,
          attachments: [],
          reactions: [],
          replies: [],
        }] as any}
        onReply={vi.fn()}
        onSubmitReply={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument()
    expect(screen.queryByText('Internal comments')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add reaction')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Resolve')).not.toBeInTheDocument()
  })
})
