import { describe, expect, it } from 'vitest'

import { isPublicRoute } from './middleware'

describe('FreeFrame web middleware public routes', () => {
  it('allows the Plane review embed without a FreeFrame login session', () => {
    expect(isPublicRoute('/integrations/plane/review')).toBe(true)
  })

  it('keeps ordinary FreeFrame pages behind authentication', () => {
    expect(isPublicRoute('/assets')).toBe(false)
  })
})
