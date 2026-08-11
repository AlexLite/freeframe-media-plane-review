import { describe, expect, it } from 'vitest'

import {
  isAllowedPlaneOrigin,
  isPlaneReviewEmbedInitMessage,
  parseAllowedOrigins,
} from './plane-review-embed'

describe('Plane review embed contract', () => {
  it('normalizes, deduplicates and ignores invalid origins', () => {
    expect(
      parseAllowedOrigins('https://plane.example/path, https://plane.example, nope, http://localhost:3000'),
    ).toEqual(['https://plane.example', 'http://localhost:3000'])
  })

  it('uses exact origin matching and never accepts wildcards', () => {
    expect(isAllowedPlaneOrigin('https://plane.example', ['https://plane.example'])).toBe(true)
    expect(isAllowedPlaneOrigin('https://sub.plane.example', ['https://plane.example'])).toBe(false)
    expect(isAllowedPlaneOrigin('https://plane.example', ['*'])).toBe(false)
  })

  it('accepts only bounded non-empty init payloads', () => {
    expect(
      isPlaneReviewEmbedInitMessage({
        type: 'freeframe:plane-review:init',
        assetId: 'asset-1',
        integrationToken: 'token-1',
      }),
    ).toBe(true)
    expect(
      isPlaneReviewEmbedInitMessage({
        type: 'freeframe:plane-review:init',
        assetId: '',
        integrationToken: 'token-1',
      }),
    ).toBe(false)
  })
})
