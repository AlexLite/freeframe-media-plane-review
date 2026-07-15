import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlaneReviewEmbed } from './plane-review-embed'

vi.mock('./plane-review-panel', () => ({
  PlaneReviewPanel: ({ assetId, integrationToken }: { assetId: string; integrationToken: string }) => (
    <div>{assetId}:{integrationToken}</div>
  ),
}))

describe('PlaneReviewEmbed', () => {
  it('accepts init only from an allowed parent origin', async () => {
    render(<PlaneReviewEmbed allowedOrigins={['https://plane.example']} />)

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://plane.example',
      source: window.parent,
      data: {
        type: 'freeframe:plane-review:init',
        assetId: 'asset-1',
        integrationToken: 'token-1',
      },
    }))

    expect(await screen.findByText('asset-1:token-1')).toBeInTheDocument()
  })

  it('rejects an untrusted origin', async () => {
    render(<PlaneReviewEmbed allowedOrigins={['https://plane.example']} />)

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://evil.example',
      source: window.parent,
      data: {
        type: 'freeframe:plane-review:init',
        assetId: 'asset-1',
        integrationToken: 'token-1',
      },
    }))

    expect(await screen.findByText('This Plane origin is not allowed.')).toBeInTheDocument()
  })

  it('fails closed when origins are not configured', () => {
    render(<PlaneReviewEmbed allowedOrigins={[]} />)
    expect(screen.getByText('Plane embed origins are not configured.')).toBeInTheDocument()
  })
})
