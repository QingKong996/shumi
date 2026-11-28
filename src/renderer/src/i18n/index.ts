import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

export type SupportedLanguage = 'zh-CN' | 'en-US'

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['zh-CN', 'en-US']

const LANGUAGE_STORAGE_KEY = 'shumi:language'

export function normalizeLanguage(language: string | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function syncDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalizeLanguage(language)
  }
}

i18n.on('languageChanged', syncDocumentLanguage)

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS }
    },
    fallbackLng: 'zh-CN',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      convertDetectedLanguage: normalizeLanguage
    }
  })
  .then(() => {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)
  })

export default i18n
