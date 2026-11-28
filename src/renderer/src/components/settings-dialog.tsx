import { useEffect, useState } from 'react'
import {
  Monitor,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Terminal,
  X,
  type LucideIcon
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import type { Theme } from '@/hooks/use-theme'
import { normalizeLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { cn } from '@/lib/utils'
import { getHarnessModelValue, type HarnessId, type HarnessInfo } from '../../../shared/harness'
import HarnessCard from './harness-card'

type SettingsDialogProps = {
  open: boolean
  theme: Theme
  onOpenChange: (open: boolean) => void
  onThemeChange: (theme: Theme) => void
}

type SettingsCategory = 'general' | 'harness'

const categories: Array<{
  id: SettingsCategory
  labelKey: 'settings.categories.general' | 'settings.categories.harness'
  icon: LucideIcon
}> = [
  { id: 'general', labelKey: 'settings.categories.general', icon: SlidersHorizontal },
  { id: 'harness', labelKey: 'settings.categories.harness', icon: Terminal }
]

const themeOptions: Array<{
  value: Theme
  labelKey: 'settings.themes.light' | 'settings.themes.dark' | 'settings.themes.system'
  icon: LucideIcon
}> = [
  { value: 'light', labelKey: 'settings.themes.light', icon: Sun },
  { value: 'dark', labelKey: 'settings.themes.dark', icon: Moon },
  { value: 'system', labelKey: 'settings.themes.system', icon: Monitor }
]

function reconcileHarnessModels(
  harnesses: HarnessInfo[],
  currentModels: Partial<Record<HarnessId, string[]>>
): Partial<Record<HarnessId, string[]>> {
  const nextModels = { ...currentModels }

  for (const harness of harnesses) {
    const availableModelValues = new Set(harness.models.map(getHarnessModelValue))
    const retainedModels = (currentModels[harness.id] ?? []).filter((model) =>
      availableModelValues.has(model)
    )
    const initialModel = harness.models.find((model) => model.isDefault) ?? harness.models[0]

    nextModels[harness.id] =
      retainedModels.length > 0
        ? retainedModels
        : initialModel
          ? [getHarnessModelValue(initialModel)]
          : []
  }

  return nextModels
}

function SettingsDialog({
  open,
  theme,
  onOpenChange,
  onThemeChange
}: SettingsDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState(false)
  const [enabledHarnesses, setEnabledHarnesses] = useState<Partial<Record<HarnessId, boolean>>>({})
  const [expandedHarness, setExpandedHarness] = useState<HarnessId | null>(null)
  const [selectedHarnessModels, setSelectedHarnessModels] = useState<
    Partial<Record<HarnessId, string[]>>
  >({})
  const activeLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)

  useEffect(() => {
    return window.api.harness.onUpdated((detectedHarnesses) => {
      setHarnesses(detectedHarnesses)
      setSelectedHarnessModels((currentModels) =>
        reconcileHarnessModels(detectedHarnesses, currentModels)
      )
    })
  }, [])

  const runHarnessDetection = (refresh = false): void => {
    setIsDetecting(true)
    setDetectionError(false)

    window.api.harness
      .detect(refresh)
      .then((detectedHarnesses) => {
        setHarnesses(detectedHarnesses)
        setSelectedHarnessModels((currentModels) =>
          reconcileHarnessModels(detectedHarnesses, currentModels)
        )
      })
      .catch(() => {
        setDetectionError(true)
      })
      .finally(() => {
        setIsDetecting(false)
      })
  }

  const handleCategoryChange = (category: SettingsCategory): void => {
    setActiveCategory(category)

    if (category === 'harness') {
      runHarnessDetection()
    }
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setActiveCategory('general')
      setEnabledHarnesses({})
      setExpandedHarness(null)
      setSelectedHarnessModels({})
    }

    onOpenChange(nextOpen)
  }

  const handleHarnessEnabledChange = (harnessId: HarnessId, enabled: boolean): void => {
    setEnabledHarnesses((currentHarnesses) => ({
      ...currentHarnesses,
      [harnessId]: enabled
    }))
  }

  const handleHarnessExpandedChange = (harnessId: HarnessId, expanded: boolean): void => {
    setExpandedHarness(expanded ? harnessId : null)
  }

  const handleHarnessModelsChange = (harnessId: HarnessId, models: string[]): void => {
    setSelectedHarnessModels((currentHarnesses) => ({
      ...currentHarnesses,
      [harnessId]: models
    }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[440px] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground outline-none"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
            <Dialog.Title className="text-15 font-medium tracking-tight">
              {t('settings.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={t('settings.close')}
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-44 shrink-0 border-r border-border p-2.5">
              <nav className="space-y-1" aria-label={t('settings.categoriesLabel')}>
                {categories.map((category) => {
                  const Icon = category.icon
                  const isActive = activeCategory === category.id

                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                      onClick={() => handleCategoryChange(category.id)}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span>{t(category.labelKey)}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              {activeCategory === 'general' && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {t('settings.general.title')}
                  </p>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {t('settings.general.theme')}
                    </span>
                    <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                      {themeOptions.map((option) => {
                        const selected = theme === option.value
                        const Icon = option.icon

                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            className={cn(
                              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-13 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              selected
                                ? 'bg-accent font-medium text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => onThemeChange(option.value)}
                          >
                            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                            <span>{t(option.labelKey)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {t('settings.general.language')}
                    </span>
                    <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                      {SUPPORTED_LANGUAGES.map((language) => {
                        const selected = activeLanguage === language
                        const label = language === 'zh-CN' ? t('language.zhCN') : t('language.enUS')

                        return (
                          <button
                            key={language}
                            type="button"
                            lang={language}
                            aria-pressed={selected}
                            className={cn(
                              'flex h-7 items-center rounded-md px-2.5 text-13 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              selected
                                ? 'bg-accent font-medium text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => void i18n.changeLanguage(language)}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeCategory === 'harness' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-foreground">
                      {t('settings.harness.title')}
                    </p>

                    <button
                      type="button"
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      disabled={isDetecting}
                      onClick={() => runHarnessDetection(true)}
                    >
                      <RefreshCw
                        className={cn('size-3.5 shrink-0', isDetecting && 'animate-spin')}
                        strokeWidth={1.75}
                      />
                      <span>{t('settings.harness.refresh')}</span>
                    </button>
                  </div>

                  {harnesses.map((harness) => (
                    <HarnessCard
                      key={harness.id}
                      harness={harness}
                      enabled={enabledHarnesses[harness.id] === true}
                      expanded={expandedHarness === harness.id}
                      isDetecting={isDetecting}
                      detectionError={detectionError}
                      selectedModels={selectedHarnessModels[harness.id] ?? []}
                      onEnabledChange={(enabled) => handleHarnessEnabledChange(harness.id, enabled)}
                      onExpandedChange={(expanded) =>
                        handleHarnessExpandedChange(harness.id, expanded)
                      }
                      onSelectedModelsChange={(models) =>
                        handleHarnessModelsChange(harness.id, models)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default SettingsDialog
