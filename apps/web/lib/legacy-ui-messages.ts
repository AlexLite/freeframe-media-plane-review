import { formatCount, formatDate, translateLegacyText } from '@/lib/i18n'
import type { Locale } from '@/stores/locale-store'

const russianUi: Record<string, string> = {
  'Pencil': 'Карандаш',
  'Arrow': 'Стрелка',
  'Line': 'Линия',
  'Rectangle': 'Прямоугольник',
  'No members found': 'Участники не найдены',
  'Replying to comment': 'Ответ на комментарий',
  'Write a reply...': 'Напишите ответ...',
  'Leave your reply here...': 'Оставьте ответ...',
  'Leave your comment...': 'Оставьте комментарий...',
  'Failed to post comment': 'Не удалось отправить комментарий',
  'Exit drawing': 'Выйти из режима рисования',
  'Undo drawing': 'Отменить последнее действие',
  'Clear drawing': 'Очистить рисунок',
  'Add emoji': 'Добавить эмодзи',
  'Add reaction': 'Добавить реакцию',
  'Add attachment': 'Прикрепить файл',
  'Send comment': 'Отправить комментарий',
  'Attach timecode': 'Прикрепить таймкод',
  'Remove timecode': 'Убрать таймкод',
  'Jump to timecode': 'Перейти к таймкоду',
  'Show annotation': 'Показать аннотацию',
  'Copy Link': 'Копировать ссылку',
  'Unresolve': 'Открыть обсуждение снова',
  'Public': 'Публичный',
  'Internal': 'Внутренний',
  'Visible to everyone': 'Видно всем',
  'Visible to team members only': 'Видно только участникам команды',
  'All comments': 'Все комментарии',
  'Public comments': 'Публичные комментарии',
  'Internal comments': 'Внутренние комментарии',
  'Search comments': 'Поиск комментариев',
  'Filter comments': 'Фильтр комментариев',
  'Sort comments': 'Сортировка комментариев',
  'Oldest': 'Сначала старые',
  'Newest': 'Сначала новые',
  'Commenter': 'По автору',
  'Completed': 'Завершённые',
  'Incomplete': 'Незавершённые',
  'Annotations': 'Аннотации',
  'Attachments': 'Вложения',
  'Unread': 'Непрочитанные',
  'Mentions & reactions': 'Упоминания и реакции',
  'No comments yet': 'Комментариев пока нет',
  'Start the conversation by leaving a comment.': 'Начните обсуждение, оставив комментарий.',
  'Share Review Link': 'Ссылка на просмотр',
  'Create Review Link': 'Создать ссылку на просмотр',
  'Create Link': 'Создать ссылку',
  'Share links': 'Ссылки общего доступа',
  'Anyone with the link': 'Все, у кого есть ссылка',
  'Require password': 'Требовать пароль',
  'Set expiration date': 'Задать срок действия',
  'Allow commenting': 'Разрешить комментарии',
  'Allow downloading': 'Разрешить скачивание',
  'Link created': 'Ссылка создана',
  'Copy share link': 'Копировать ссылку',
  'Delete link': 'Удалить ссылку',
  'Revoke access': 'Отозвать доступ',
  'Never expires': 'Без срока действия',
  'Expired': 'Срок действия истёк',
  'Active link': 'Активная ссылка',
  'Guest access': 'Гостевой доступ',
  'Enter password': 'Введите пароль',
  'View shared content': 'Открыть материалы',
  'Continue to review': 'Перейти к просмотру',
  'Your name': 'Ваше имя',
  'Guest name': 'Имя гостя',
  'Comment as guest': 'Комментировать как гость',
  'Submit comment': 'Отправить комментарий',
  'Download original': 'Скачать оригинал',
  'Download proxy': 'Скачать прокси',
  'Approve this version': 'Согласовать эту версию',
  'Request changes for this version': 'Запросить изменения этой версии',
  'Add approval note': 'Добавить примечание к согласованию',
  'Approval note': 'Примечание к согласованию',
  'Open review': 'Открыть просмотр',
  'Previous asset': 'Предыдущий материал',
  'Next asset': 'Следующий материал',
  'Fit to screen': 'Вписать в экран',
  'Actual size': 'Фактический размер',
  'Zoom in': 'Увеличить',
  'Zoom out': 'Уменьшить',
  'Play': 'Воспроизвести',
  'Pause': 'Пауза',
  'Mute': 'Выключить звук',
  'Unmute': 'Включить звук',
  'Playback speed': 'Скорость воспроизведения',
  'Loop playback': 'Повтор воспроизведения',
  'Upload New Version': 'Загрузить новую версию',
  'Upload a new version': 'Загрузить новую версию',
  'Replace file': 'Заменить файл',
  'Select project': 'Выбрать проект',
  'Select folder': 'Выбрать папку',
  'Upload complete': 'Загрузка завершена',
  'Processing failed': 'Ошибка обработки',
  'Retry processing': 'Повторить обработку',
  'Open uploads': 'Открыть загрузки',
  'Dismiss': 'Закрыть',
  'Bulk Invite Users': 'Массовое приглашение пользователей',
  'Enter email addresses separated by commas or newlines.': 'Введите адреса email через запятую или с новой строки.',
  'Email addresses': 'Адреса email',
  'Send Invites': 'Отправить приглашения',
  'Platform Users': 'Пользователи платформы',
  'Admin Dashboard': 'Панель администратора',
  'Manage platform users': 'Управляйте пользователями платформы',
  'Instance settings': 'Настройки инстанса',
  'Copy Invite Link': 'Копировать ссылку-приглашение',
  'Remove Admin': 'Снять права администратора',
  'Make Admin': 'Назначить администратором',
  'Deactivate': 'Деактивировать',
  'Reactivate': 'Активировать',
  'Active': 'Активен',
  'Deactivated': 'Деактивирован',
  'Pending': 'Ожидает',
  'Unverified': 'Не подтверждён',
  'Joined': 'Дата регистрации',
  'You': 'Вы',
}

function preserveWhitespace(source: string, translated: string): string {
  return `${source.match(/^\s*/)?.[0] ?? ''}${translated}${source.match(/\s*$/)?.[0] ?? ''}`
}

export function translateLegacyUiText(locale: Locale, source: string): string {
  if (locale === 'en' || !source.trim()) return source

  const coreTranslation = translateLegacyText(locale, source)
  if (coreTranslation !== source) return coreTranslation

  const trimmed = source.trim()
  const exact = russianUi[trimmed]
  if (exact) return preserveWhitespace(source, exact)

  const replies = trimmed.match(/^(\d+) (reply|replies)$/i)
  if (replies) {
    return preserveWhitespace(
      source,
      formatCount('ru', Number(replies[1]), ['reply', 'replies', 'replies'], ['ответ', 'ответа', 'ответов']),
    )
  }

  const invitations = trimmed.match(/^(\d+) invite\(s\) sent$/i)
  if (invitations) {
    const count = Number(invitations[1])
    return preserveWhitespace(
      source,
      `${formatCount('ru', count, ['invite', 'invites', 'invites'], ['приглашение', 'приглашения', 'приглашений'])} отправлено`,
    )
  }

  const registered = trimmed.match(/^(\d+) already registered$/i)
  if (registered) return preserveWhitespace(source, `${registered[1]} уже зарегистрировано`)

  const failed = trimmed.match(/^(\d+) failed$/i)
  if (failed) return preserveWhitespace(source, `${failed[1]} с ошибкой`)

  const numericDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (numericDate) {
    const date = new Date(Date.UTC(Number(numericDate[3]), Number(numericDate[1]) - 1, Number(numericDate[2])))
    return preserveWhitespace(source, formatDate('ru', date, { timeZone: 'UTC' }))
  }

  return source
}
