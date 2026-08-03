import type { Locale } from '@/stores/locale-store'
import { extraMessages, type MessagePair } from '@/lib/i18n-extra'

type Values = Record<string, string | number>
type PluralForms = readonly [one: string, few: string, many: string]

const baseMessages = {
  'common.cancel': ['Cancel', 'Отмена'],
  'common.save': ['Save', 'Сохранить'],
  'common.loading': ['Loading...', 'Загрузка...'],
  'nav.projects': ['Projects', 'Проекты'],
  'nav.notifications': ['Notifications', 'Уведомления'],
  'nav.uploads': ['Uploads', 'Загрузки'],
  'nav.profile': ['Profile', 'Профиль'],
  'nav.settings': ['Settings', 'Настройки'],
  'nav.logout': ['Log out', 'Выйти'],
  'nav.search': ['Search', 'Поиск'],
  'nav.hidePanel': ['Hide panel', 'Скрыть панель'],
  'nav.showPanel': ['Show panel', 'Показать панель'],
  'nav.collapse': ['Collapse', 'Свернуть'],
  'nav.expand': ['Expand sidebar', 'Развернуть боковую панель'],
  'settings.title': ['Settings', 'Настройки'],
  'settings.profile': ['Profile', 'Профиль'],
  'settings.appearance': ['Appearance', 'Оформление'],
  'settings.notifications': ['Notifications', 'Уведомления'],
  'settings.branding': ['Branding', 'Брендинг'],
  'settings.admin': ['Admin', 'Администрирование'],
  'appearance.title': ['Appearance', 'Оформление'],
  'appearance.description': ['Customize how FreeFrame looks and speaks on your device.', 'Настройте внешний вид и язык FreeFrame на этом устройстве.'],
  'appearance.theme': ['Theme', 'Тема'],
  'appearance.dark': ['Dark', 'Тёмная'],
  'appearance.darkDescription': ['Dark background with light text', 'Тёмный фон и светлый текст'],
  'appearance.light': ['Light', 'Светлая'],
  'appearance.lightDescription': ['Light background with dark text', 'Светлый фон и тёмный текст'],
  'appearance.system': ['System', 'Системная'],
  'appearance.systemDescription': ['Follows your operating system preference', 'Следует настройкам операционной системы'],
  'appearance.language': ['Language', 'Язык'],
  'appearance.languageDescription': ['Choose the interface language.', 'Выберите язык интерфейса.'],
  'appearance.english': ['English', 'Английский'],
  'appearance.russian': ['Russian', 'Русский'],
  'auth.signIn': ['Sign in to FreeFrame', 'Вход в FreeFrame'],
  'auth.emailHint': ["Enter your email and we'll send you a sign-in code.", 'Введите email — мы отправим код для входа.'],
  'auth.email': ['Email address', 'Адрес электронной почты'],
  'auth.emailRequired': ['Email is required', 'Укажите email'],
  'auth.emailInvalid': ['Enter a valid email address', 'Введите корректный адрес электронной почты'],
  'auth.sendCode': ['Send magic code', 'Отправить код'],
  'auth.passwordInstead': ['Sign in with password instead', 'Войти с паролем'],
  'auth.checkEmail': ['Check your email', 'Проверьте почту'],
  'auth.codeSent': ['We sent a 6-digit code to', 'Шестизначный код отправлен на'],
  'auth.verifyCode': ['Verify code', 'Подтвердить код'],
  'auth.enterCode': ['Enter the 6-digit code', 'Введите шестизначный код'],
  'auth.codeInvalid': ['Invalid or expired code. Please try again.', 'Неверный или просроченный код. Попробуйте ещё раз.'],
  'auth.differentEmail': ['Use a different email', 'Использовать другой email'],
  'auth.createPassword': ['Create your password', 'Создайте пароль'],
  'auth.passwordDescription': ['Set a password to secure your account going forward.', 'Задайте пароль для защиты учётной записи.'],
  'auth.password': ['Password', 'Пароль'],
  'auth.confirmPassword': ['Confirm password', 'Повторите пароль'],
  'auth.passwordRequired': ['Password is required', 'Введите пароль'],
  'auth.passwordLength': ['Password must be at least 8 characters', 'Пароль должен содержать не менее 8 символов'],
  'auth.passwordMismatch': ['Passwords do not match', 'Пароли не совпадают'],
  'auth.setPassword': ['Set password & continue', 'Сохранить пароль и продолжить'],
  'auth.classicTitle': ['Sign in with password', 'Вход с паролем'],
  'auth.classicDescription': ['Enter your email and password to continue.', 'Введите email и пароль.'],
  'auth.credentialsRequired': ['Email and password are required', 'Введите email и пароль'],
  'auth.invalidCredentials': ['Invalid email or password', 'Неверный email или пароль'],
  'auth.signInButton': ['Sign in', 'Войти'],
  'auth.backToCode': ['Back to magic code', 'Вернуться ко входу по коду'],
  'projects.title': ['Projects', 'Проекты'],
  'projects.new': ['New Project', 'Новый проект'],
  'projects.my': ['My Projects', 'Мои проекты'],
  'projects.shared': ['Shared with Me', 'Доступные мне'],
  'projects.public': ['Public Projects', 'Публичные проекты'],
  'projects.none': ['No projects yet', 'Проектов пока нет'],
  'projects.noneDescription': ['Create your first project to start organizing assets.', 'Создайте первый проект, чтобы начать работу с материалами.'],
  'projects.createFirst': ['Create your first project', 'Создайте первый проект'],
  'projects.createFirstDescription': ['Organize and review your media assets', 'Организуйте материалы и согласование'],
  'projects.createDescription': ['Create a new project to organize your assets.', 'Создайте проект для организации материалов.'],
  'projects.name': ['Project name', 'Название проекта'],
  'projects.nameRequired': ['Project name is required.', 'Укажите название проекта.'],
  'projects.description': ['Description', 'Описание'],
  'projects.optionalDescription': ['Optional description...', 'Необязательное описание...'],
  'projects.create': ['Create project', 'Создать проект'],
  'projects.noAssets': ['No assets yet', 'Материалов пока нет'],
  'projects.gridView': ['Grid view', 'Плитка'],
  'projects.listView': ['List view', 'Список'],
  'roles.owner': ['Owner', 'Владелец'],
  'roles.editor': ['Editor', 'Редактор'],
  'roles.reviewer': ['Reviewer', 'Проверяющий'],
  'roles.viewer': ['Viewer', 'Наблюдатель'],
  'roles.member': ['Member', 'Участник'],
} as const satisfies Record<string, MessagePair>

const messages: Record<string, MessagePair> = { ...baseMessages, ...extraMessages }
const legacyRussian: Record<string, string> = Object.fromEntries(
  Object.values(messages)
    .filter(([english, russian]) => english !== russian)
    .map(([english, russian]) => [english, russian]),
)

Object.assign(legacyRussian, {
  'My projects': 'Мои проекты',
  'Shared with me': 'Доступные мне',
  'Public projects': 'Публичные проекты',
  'Recent uploads': 'Последние загрузки',
  'Upload queue': 'Очередь загрузки',
  'Clear completed': 'Убрать завершённые',
  'Mark as read': 'Отметить как прочитанное',
  'Mark as unread': 'Отметить как непрочитанное',
  'Account settings': 'Настройки учётной записи',
  'Danger zone': 'Опасная зона',
  'Delete account': 'Удалить учётную запись',
  'Member since': 'Дата регистрации',
  'System information': 'Сведения о системе',
  'Storage usage': 'Использование хранилища',
  'Total users': 'Всего пользователей',
  'Total projects': 'Всего проектов',
  'Total assets': 'Всего материалов',
  'Open asset': 'Открыть материал',
  'Open project': 'Открыть проект',
  'Back to projects': 'Назад к проектам',
  'Back to project': 'Назад к проекту',
  'Add people': 'Добавить участников',
  'Manage members': 'Управление участниками',
  'Remove member': 'Удалить участника',
  'Link settings': 'Настройки ссылки',
  'Guest reviewer': 'Гость-проверяющий',
  'Review complete': 'Проверка завершена',
  'Select version': 'Выбрать версию',
  'Sort by': 'Сортировка',
  'Newest first': 'Сначала новые',
  'Oldest first': 'Сначала старые',
  'Last modified': 'Последнее изменение',
  'Drag and drop files here': 'Перетащите файлы сюда',
  'Browse files': 'Выбрать файлы',
  'Choose a project': 'Выберите проект',
  'No results found': 'Ничего не найдено',
  'Clear search': 'Очистить поиск',
  'Something went wrong': 'Произошла ошибка',
  'Page not found': 'Страница не найдена',
  'Go to dashboard': 'Перейти к проектам',
  'Session expired': 'Сеанс завершён',
  'Permission denied': 'Доступ запрещён',
  'Invalid link': 'Недействительная ссылка',
})

export function getIntlLocale(locale: Locale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}

export function translate(locale: Locale, key: string, values?: Values): string {
  const pair = messages[key]
  let result = pair?.[locale === 'ru' ? 1 : 0] ?? key
  for (const [name, value] of Object.entries(values ?? {})) {
    result = result.split(`{${name}}`).join(String(value))
  }
  return result
}

export function plural(locale: Locale, count: number, forms: PluralForms): string {
  if (locale === 'en') return count === 1 ? forms[0] : forms[2]
  const mod10 = Math.abs(count) % 10
  const mod100 = Math.abs(count) % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export function formatCount(
  locale: Locale,
  count: number,
  english: PluralForms,
  russian: PluralForms,
): string {
  const forms = locale === 'ru' ? russian : english
  return `${formatNumber(locale, count)} ${plural(locale, count, forms)}`
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value)
}

export function formatDate(
  locale: Locale,
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date)
}

export function formatDateTime(locale: Locale, value: Date | string | number): string {
  return formatDate(locale, value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBytes(locale: Locale, bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${locale === 'ru' ? 'Б' : 'B'}`
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${formatNumber(locale, bytes / 1024 ** index, { maximumFractionDigits: decimals })} ${units[index]}`
}

export function formatRelativeTime(
  locale: Locale,
  value: Date | string | number,
  now = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(getIntlLocale(locale), { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return formatter.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return formatter.format(months, 'month')
  return formatter.format(Math.round(months / 12), 'year')
}

const countPatterns: Array<[RegExp, PluralForms, PluralForms]> = [
  [/^(\d+) projects?$/i, ['project', 'projects', 'projects'], ['проект', 'проекта', 'проектов']],
  [/^(\d+) (?:items?|assets?)$/i, ['item', 'items', 'items'], ['материал', 'материала', 'материалов']],
  [/^(\d+) members?$/i, ['member', 'members', 'members'], ['участник', 'участника', 'участников']],
  [/^(\d+) comments?$/i, ['comment', 'comments', 'comments'], ['комментарий', 'комментария', 'комментариев']],
  [/^(\d+) versions?$/i, ['version', 'versions', 'versions'], ['версия', 'версии', 'версий']],
  [/^(\d+) files?$/i, ['file', 'files', 'files'], ['файл', 'файла', 'файлов']],
  [/^(\d+) shares?$/i, ['share', 'shares', 'shares'], ['ссылка', 'ссылки', 'ссылок']],
]

function preserveWhitespace(source: string, translated: string): string {
  return `${source.match(/^\s*/)?.[0] ?? ''}${translated}${source.match(/\s*$/)?.[0] ?? ''}`
}

export function translateLegacyText(locale: Locale, source: string): string {
  if (locale === 'en' || !source.trim()) return source
  const trimmed = source.trim()
  const exact = legacyRussian[trimmed]
  if (exact) return preserveWhitespace(source, exact)

  for (const [pattern, english, russian] of countPatterns) {
    const match = trimmed.match(pattern)
    if (match) return preserveWhitespace(source, formatCount(locale, Number(match[1]), english, russian))
  }

  const metadata = trimmed.match(/^(\d+) items? · (.+)$/i)
  if (metadata) {
    return preserveWhitespace(
      source,
      `${formatCount(locale, Number(metadata[1]), ['item', 'items', 'items'], ['материал', 'материала', 'материалов'])} · ${metadata[2]}`,
    )
  }

  const englishDate = trimmed.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/)
  if (englishDate) {
    const date = new Date(`${englishDate[1]} ${englishDate[2]}, ${englishDate[3]} 00:00:00 UTC`)
    if (!Number.isNaN(date.getTime())) return preserveWhitespace(source, formatDate(locale, date))
  }

  return source
}

export function localizeError(locale: Locale, error: unknown, fallbackKey = 'errors.generic'): string {
  const fallback = translate(locale, fallbackKey)
  if (!(error instanceof Error) || !error.message) return fallback
  if (locale === 'en') return error.message
  const exact = translateLegacyText(locale, error.message)
  if (exact !== error.message) return exact
  if (/network|fetch|connect/i.test(error.message)) return translate(locale, 'errors.network')
  if (/unauthorized|401|session/i.test(error.message)) return translate(locale, 'errors.unauthorized')
  if (/forbidden|403|permission/i.test(error.message)) return translate(locale, 'errors.forbidden')
  if (/not found|404/i.test(error.message)) return translate(locale, 'errors.notFound')
  return fallback
}
