import { useEffect, useState } from 'react'
import { Monitor, Moon, Palette, RefreshCw, Sun, Terminal, X, type LucideIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'

import type { Theme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { getHarnessModelValue, type HarnessId, type HarnessInfo } from '../../../shared/harness'
import HarnessCard from './harness-card'

type SettingsDialogProps = {
  open: boolean
  theme: Theme
  onOpenChange: (open: boolean) => void
  onThemeChange: (theme: Theme) => void
}

type SettingsCategory = 'appearance' | 'harness'

const categories: Array<{
  id: SettingsCategory
  label: string
  icon: LucideIcon
}> = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'harness', label: 'Harness', icon: Terminal }
]

const themeOptions: Array<{
  value: Theme
  label: string
  icon: LucideIcon
}> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
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
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState(false)
  const [enabledHarnesses, setEnabledHarnesses] = useState<Partial<Record<HarnessId, boolean>>>({})
  const [expandedHarness, setExpandedHarness] = useState<HarnessId | null>(null)
  const [selectedHarnessModels, setSelectedHarnessModels] = useState<
    Partial<Record<HarnessId, string[]>>
  >({})

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
      setActiveCategory('appearance')
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
            <Dialog.Title className="text-[15px] font-medium tracking-tight">设置</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="关闭设置"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-44 shrink-0 border-r border-border p-2.5">
              <nav className="space-y-1" aria-label="设置分类">
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
                      <span>{category.label}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              {activeCategory === 'appearance' && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">外观</p>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                    <span className="text-sm text-muted-foreground">主题</span>
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
                              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              selected
                                ? 'bg-accent font-medium text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => onThemeChange(option.value)}
                          >
                            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                            <span>{option.label}</span>
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
                    <p className="text-sm font-medium text-foreground">Harness</p>

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
                      <span>重新检测</span>
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
