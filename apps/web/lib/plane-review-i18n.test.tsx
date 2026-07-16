import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  PlaneReviewLocaleProvider,
  normalizePlaneReviewLocale,
  usePlaneReviewI18n,
} from './plane-review-i18n'

function TranslationProbe() {
  const { locale, t } = usePlaneReviewI18n()
  return <span>{locale}:{t('panel.new_version')}</span>
}

describe('Plane review localization', () => {
  it('normalizes Plane locales to the supported dictionaries', () => {
    expect(normalizePlaneReviewLocale('ru-RU')).toBe('ru')
    expect(normalizePlaneReviewLocale('en-US')).toBe('en')
    expect(normalizePlaneReviewLocale('de-DE')).toBe('en')
  })

  it('renders the Russian dictionary selected by Plane', () => {
    render(
      <PlaneReviewLocaleProvider locale="ru-RU">
        <TranslationProbe />
      </PlaneReviewLocaleProvider>,
    )

    expect(screen.getByText('ru:Новая версия')).toBeInTheDocument()
  })
})
