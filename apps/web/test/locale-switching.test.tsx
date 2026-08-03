import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useI18n } from '@/hooks/use-i18n'
import { useLocaleStore } from '@/stores/locale-store'

function LocaleHarness() {
  const { t } = useI18n()
  const setLocale = useLocaleStore((state) => state.setLocale)

  return (
    <div>
      <span>{t('projects.new')}</span>
      <button type="button" onClick={() => setLocale('ru')}>RU</button>
      <button type="button" onClick={() => setLocale('en')}>EN</button>
    </div>
  )
}

describe('locale switching', () => {
  beforeEach(() => {
    localStorage.clear()
    useLocaleStore.getState().applyLocale('en')
  })

  afterEach(cleanup)

  it('updates rendered labels without reloading the page', () => {
    render(<LocaleHarness />)
    expect(screen.getByText('New Project')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'RU' }))
    expect(screen.getByText('Новый проект')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('New Project')).toBeInTheDocument()
  })
})
