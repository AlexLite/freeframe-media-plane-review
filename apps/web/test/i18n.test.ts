import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatCount,
  formatDate,
  formatNumber,
  localizeError,
  plural,
  translate,
  translateLegacyText,
} from '@/lib/i18n'
import { translateLegacyUiText } from '@/lib/legacy-ui-messages'

describe('i18n formatting', () => {
  it('translates semantic keys in both directions', () => {
    expect(translate('ru', 'projects.new')).toBe('Новый проект')
    expect(translate('en', 'projects.new')).toBe('New Project')
    expect(translate('ru', 'missing.key')).toBe('missing.key')
  })

  it('covers notifications, uploads, storage and command palette in Russian', () => {
    expect(translate('ru', 'notifications.empty')).toBe('Уведомлений пока нет')
    expect(translate('ru', 'uploads.noFailed')).toBe('Нет загрузок с ошибкой')
    expect(translate('ru', 'storage.limitGb')).toBe('Лимит хранилища (ГБ)')
    expect(translate('ru', 'command.search')).toContain('Найдите проект')
  })

  it('selects Russian plural forms', () => {
    const forms = ['проект', 'проекта', 'проектов'] as const
    expect(plural('ru', 1, forms)).toBe('проект')
    expect(plural('ru', 2, forms)).toBe('проекта')
    expect(plural('ru', 5, forms)).toBe('проектов')
    expect(plural('ru', 11, forms)).toBe('проектов')
    expect(plural('ru', 21, forms)).toBe('проект')
  })

  it('formats counts, numbers, bytes and dates with the selected locale', () => {
    expect(
      formatCount(
        'ru',
        22,
        ['project', 'projects', 'projects'],
        ['проект', 'проекта', 'проектов'],
      ),
    ).toBe('22 проекта')
    expect(formatNumber('ru', 12345.6)).toMatch(/12[\s\u00a0]345,6/)
    expect(formatBytes('ru', 1024)).toBe('1 КБ')
    expect(
      formatDate('ru', new Date('2026-06-01T00:00:00Z'), {
        timeZone: 'UTC',
        year: 'numeric',
      }),
    ).toContain('2026')
  })

  it('localizes legacy static strings, counts and English dates', () => {
    expect(translateLegacyText('ru', '  Approve  ')).toBe('  Согласовать  ')
    expect(translateLegacyText('ru', '2 projects')).toBe('2 проекта')
    expect(translateLegacyText('ru', '56 minutes ago')).toBe('56 минут назад')
    expect(translateLegacyText('ru', 'just now')).toBe('только что')
    expect(translateLegacyText('ru', 'Jun 1, 2026')).toMatch(/2026/)
    expect(translateLegacyText('en', 'Approve')).toBe('Approve')
  })

  it('localizes review, sharing, guest and admin legacy strings', () => {
    expect(translateLegacyUiText('ru', 'Leave your comment...')).toBe('Оставьте комментарий...')
    expect(translateLegacyUiText('ru', '22 replies')).toBe('22 ответа')
    expect(translateLegacyUiText('ru', 'Copy Invite Link')).toBe('Копировать ссылку')
    expect(translateLegacyUiText('ru', '6/1/2026')).toMatch(/2026/)
    expect(translateLegacyUiText('en', 'Leave your comment...')).toBe('Leave your comment...')
  })

  it('localizes project dialogs, sorting and appearance controls', () => {
    expect(translateLegacyUiText('ru', 'Create Share Link')).toBe('Создать ссылку общего доступа')
    expect(translateLegacyUiText('ru', 'Sorted by')).toBe('Сортировка:')
    expect(translateLegacyUiText('ru', 'Layout')).toBe('Макет')
    expect(translateLegacyUiText('ru', 'Upload asset')).toBe('Загрузить материал')
    expect(translateLegacyUiText('ru', 'Passphrase')).toBe('Кодовая фраза')
  })

  it('localizes share-link settings, public review and activity', () => {
    expect(translate('ru', 'shareActivity.commented')).toBe('Оставил(а) комментарий')
    expect(translate('ru', 'shareActivity.opened')).toBe('Открыл(а) публичную ссылку')
    expect(translateLegacyUiText('ru', 'Copy Asset URL')).toBe('Копировать URL материала')
    expect(translateLegacyUiText('ru', 'Allow viewers to leave comments')).toBe('Разрешить зрителям оставлять комментарии')
    expect(translateLegacyUiText('ru', 'Who are you?')).toBe('Как вас зовут?')
    expect(translateLegacyUiText('ru', 'Open Share Link')).toBe('Открыть публичную ссылку')
    expect(translateLegacyUiText('ru', 'Detailed comments')).toBe('Расширенные комментарии')
    expect(translateLegacyUiText('ru', 'Simple')).toBe('Упрощённые')
    expect(translateLegacyUiText('ru', 'Search for Shares')).toBe('Поиск ссылок общего доступа')
    expect(translateLegacyUiText('ru', 'No share links yet. Create one by sharing an asset or folder.')).toBe('Ссылок пока нет. Создайте ссылку для материала или папки.')
    expect(translateLegacyUiText('ru', '0 Shares')).toBe('0 ссылок')
    expect(translateLegacyUiText('ru', 'Project Settings')).toBe('Настройки проекта')
    expect(translateLegacyUiText('ru', 'Private Project')).toBe('Закрытый проект')
    expect(translateLegacyUiText('ru', 'Filter by...')).toBe('Фильтровать по...')
    expect(translateLegacyUiText('ru', 'Oldest (Default)')).toBe('Сначала старые (по умолчанию)')
    expect(translateLegacyUiText('ru', 'Full Access')).toBe('Полный доступ')
    expect(translateLegacyUiText('ru', 'Members of Песочница Тузика')).toBe('Участники проекта «Песочница Тузика»')
    expect(translateLegacyUiText('ru', 'New Version')).toBe('Новая версия')
    expect(translateLegacyUiText('ru', 'Draw annotation')).toBe('Нарисовать аннотацию')
    expect(translateLegacyUiText('ru', 'Send (Enter)')).toBe('Отправить (Enter)')
    expect(translateLegacyUiText('ru', 'All Share Links')).toBe('Все ссылки общего доступа')
    expect(translateLegacyUiText('ru', 'Add a description...')).toBe('Добавьте описание...')
    expect(translateLegacyUiText('ru', 'Asset')).toBe('Материал')
    expect(translateLegacyUiText('ru', 'Reply')).toBe('Ответить')
    expect(translateLegacyUiText('ru', 'Password required')).toBe('Требуется пароль')
    expect(translateLegacyUiText('ru', 'Enter your name and email to comment on this shared asset.')).toBe('Введите имя и email, чтобы комментировать этот материал.')
    expect(translateLegacyUiText('ru', 'Name and email required')).toBe('Укажите имя и email')
    expect(translateLegacyUiText('ru', 'Copied!')).toBe('Скопировано!')
    expect(translateLegacyUiText('ru', 'Configure watermark')).toBe('Настроить водяной знак')
    expect(translateLegacyUiText('ru', 'Advanced settings')).toBe('Расширенные настройки')
    expect(translateLegacyUiText('ru', 'Choose file')).toBe('Выбрать файл')
    expect(translateLegacyUiText('ru', 'Primary color')).toBe('Основной цвет')
    expect(translateLegacyUiText('ru', 'Define custom fields for assets in this project.')).toBe('Добавьте собственные поля для материалов этого проекта.')
    expect(translateLegacyUiText('ru', 'No custom fields yet.')).toBe('Собственных полей пока нет.')
    expect(translateLegacyUiText('ru', 'PNG image')).toBe('Изображение PNG')
    expect(translateLegacyUiText('ru', 'Enable watermark')).toBe('Включить водяной знак')
    expect(translateLegacyUiText('ru', 'Save watermark')).toBe('Сохранить водяной знак')
    expect(translateLegacyUiText('ru', 'Opacity: 30%')).toBe('Прозрачность: 30%')
  })

  it('maps technical errors to localized user-facing messages', () => {
    expect(localizeError('ru', new Error('Network request failed'))).toContain('подключ')
    expect(localizeError('ru', new Error('403 forbidden'))).toContain('прав')
  })
})
