'use client'

import * as React from 'react'
import { translateLegacyUiText } from '@/lib/legacy-ui-messages'
import { useLocaleStore, type Locale } from '@/stores/locale-store'

const LOCALIZED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const
const IGNORE_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
  '[contenteditable="true"]',
  '[data-i18n-ignore="true"]',
  '[data-user-content="true"]',
  '[data-comment-id]',
  '[data-thread-id]',
  '.prose',
  'p.leading-relaxed.break-words',
].join(', ')

const ATTRIBUTE_IGNORE_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  '[contenteditable="true"]',
  '[data-i18n-ignore="true"]',
  '[data-user-content="true"]',
  '[data-comment-id]',
  '[data-thread-id]',
  '.prose',
  'p.leading-relaxed.break-words',
].join(', ')

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()

function isIgnored(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest(IGNORE_SELECTOR))
}

function localizeTextNode(node: Text, locale: Locale) {
  if (isIgnored(node)) return
  const current = node.nodeValue ?? ''
  const remembered = originalText.get(node)

  if (remembered) {
    const expectedRussian = translateLegacyUiText('ru', remembered)
    if (current !== remembered && current !== expectedRussian) originalText.set(node, current)
  } else if (translateLegacyUiText('ru', current) !== current) {
    originalText.set(node, current)
  }

  const source = originalText.get(node) ?? current
  const next = translateLegacyUiText(locale, source)
  if (next !== current) node.nodeValue = next
}

function localizeElementAttributes(element: Element, locale: Locale) {
  if (element.closest(ATTRIBUTE_IGNORE_SELECTOR)) return
  let remembered = originalAttributes.get(element)

  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(attribute)
    if (!current) continue
    const stored = remembered?.get(attribute)

    if (stored) {
      const expectedRussian = translateLegacyUiText('ru', stored)
      if (current !== stored && current !== expectedRussian) remembered?.set(attribute, current)
    } else if (translateLegacyUiText('ru', current) !== current) {
      remembered ??= new Map<string, string>()
      remembered.set(attribute, current)
      originalAttributes.set(element, remembered)
    }

    const source = remembered?.get(attribute) ?? current
    const next = translateLegacyUiText(locale, source)
    if (next !== current) element.setAttribute(attribute, next)
  }
}

function localizeTree(root: Node, locale: Locale) {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text, locale)
    return
  }
  if (root.nodeType === Node.ELEMENT_NODE) localizeElementAttributes(root as Element, locale)

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, locale)
    else localizeElementAttributes(node as Element, locale)
    node = walker.nextNode()
  }
}

export function LegacyLocaleBridge() {
  const locale = useLocaleStore((state) => state.locale)

  React.useEffect(() => {
    const root = document.body
    localizeTree(root, locale)

    const observer = new MutationObserver((records) => {
      observer.disconnect()
      for (const record of records) {
        if (record.type === 'characterData') localizeTextNode(record.target as Text, locale)
        else if (record.type === 'attributes') localizeElementAttributes(record.target as Element, locale)
        else Array.from(record.addedNodes).forEach((node) => localizeTree(node, locale))
      }
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...LOCALIZED_ATTRIBUTES],
      })
    })

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
    })

    return () => observer.disconnect()
  }, [locale])

  return null
}
