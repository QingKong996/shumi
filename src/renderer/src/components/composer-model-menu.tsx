import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import type { WorkerAgentOptions } from '@/hooks/use-agent-chat'
import {
  getHarnessModelValue,
  type HarnessId,
  type HarnessModelInfo
} from '../../../shared/harness'

type ComposerModelMenuProps = {
  harness: HarnessId
  model: string | null
  effort: string | null
  disabled: boolean
  onChange: (options: WorkerAgentOptions) => Promise<boolean>
}

type MenuView = 'root' | 'model' | 'reasoning'

const MENU_ITEM_CLASS =
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0'

function ComposerModelMenu({
  harness,
  model,
  effort,
  disabled,
  onChange
}: ComposerModelMenuProps): React.JSX.Element {
  const { t } = useTranslation()
  const [models, setModels] = useState<HarnessModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState<MenuView>('root')
  const [saving, setSaving] = useState(false)
  const firstMenuItemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    window.api.harness
      .detect()
      .then((harnesses) => {
        if (!cancelled) {
          setModels(harnesses.find((entry) => entry.id === harness)?.models ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModels([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [harness])

  useLayoutEffect(() => {
    if (menuOpen) {
      firstMenuItemRef.current?.focus()
    }
  }, [menuOpen, menuView])

  const selectedModel =
    models.find((entry) => getHarnessModelValue(entry) === model) ??
    models.find((entry) => entry.isDefault) ??
    models[0] ??
    null
  const selectedValue = selectedModel ? getHarnessModelValue(selectedModel) : null
  const reasoningLevels = selectedModel?.reasoningLevels ?? []
  const reasoningLevel = resolveReasoningLevel(
    reasoningLevels,
    effort,
    selectedModel?.reasoningEffort
  )
  const reasoningLabel = reasoningLevel ? reasoningLabelFor(t, reasoningLevel) : ''
  const triggerLabel = isLoading
    ? t('harness.status.detecting')
    : selectedModel
      ? [selectedModel.name, reasoningLabel].filter(Boolean).join(' ')
      : t('harness.noModels')
  const modelGroups = groupModels(models)

  const handleMenuOpenChange = (open: boolean): void => {
    setMenuOpen(open)

    if (open) {
      setMenuView('root')
    }
  }

  const showMenuView = (event: Event, view: MenuView): void => {
    event.preventDefault()
    setMenuView(view)
  }

  const saveOptions = async (options: WorkerAgentOptions): Promise<void> => {
    setSaving(true)

    try {
      if (await onChange(options)) {
        setMenuOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const selectModel = (next: HarnessModelInfo): void => {
    const nextEffort = resolveReasoningLevel(
      next.reasoningLevels,
      reasoningLevel,
      next.reasoningEffort
    )

    void saveOptions({ model: getHarnessModelValue(next), effort: nextEffort })
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenu.Trigger asChild disabled={disabled || isLoading || !selectedModel || saving}>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className="flex h-8 min-w-0 max-w-72 shrink items-center justify-start gap-1.5 rounded-lg px-2.5 text-13 font-normal whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="min-w-0 truncate text-foreground">
            {selectedModel?.name ?? triggerLabel}
          </span>
          {reasoningLabel && (
            <span className="shrink-0 text-muted-foreground">{reasoningLabel}</span>
          )}
          <ChevronUp className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="z-[60] max-h-80 min-w-56 origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-y-auto rounded-xl border border-border-strong bg-surface p-1.5 text-foreground shadow-popover outline-none data-[state=closed]:animate-select-out data-[state=open]:animate-select-in motion-reduce:animate-none"
        >
          {menuView === 'root' ? (
            <>
              <DropdownMenu.Item
                ref={firstMenuItemRef}
                className={MENU_ITEM_CLASS}
                onSelect={(event) => showMenuView(event, 'model')}
              >
                {t('chat.model')}
                <span className="ml-auto text-muted-foreground">{selectedModel?.name}</span>
                <ChevronRight className="size-3.5 opacity-60" />
              </DropdownMenu.Item>

              {reasoningLevels.length > 0 && (
                <DropdownMenu.Item
                  className={MENU_ITEM_CLASS}
                  onSelect={(event) => showMenuView(event, 'reasoning')}
                >
                  {t('chat.reasoning')}
                  <span className="ml-auto text-muted-foreground">{reasoningLabel}</span>
                  <ChevronRight className="size-3.5 opacity-60" />
                </DropdownMenu.Item>
              )}
            </>
          ) : (
            <>
              <DropdownMenu.Item
                ref={firstMenuItemRef}
                className={`${MENU_ITEM_CLASS} text-muted-foreground`}
                onSelect={(event) => showMenuView(event, 'root')}
              >
                <ChevronLeft className="size-3.5" />
                {menuView === 'model' ? t('chat.model') : t('chat.reasoning')}
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />

              {menuView === 'model'
                ? modelGroups.map((group, index) => (
                    <Fragment key={group.provider}>
                      {index > 0 && (
                        <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
                      )}
                      <DropdownMenu.Label className="px-2.5 py-1.5 text-11 font-medium tracking-wide text-muted-foreground">
                        {group.provider || t('chat.models')}
                      </DropdownMenu.Label>
                      {group.models.map((option) => {
                        const value = getHarnessModelValue(option)

                        return (
                          <DropdownMenu.Item
                            key={value}
                            className={MENU_ITEM_CLASS}
                            disabled={saving}
                            onSelect={(event) => {
                              event.preventDefault()
                              selectModel(option)
                            }}
                          >
                            {option.name}
                            {value === selectedValue && (
                              <Check className="ml-auto size-4 text-foreground" />
                            )}
                          </DropdownMenu.Item>
                        )
                      })}
                    </Fragment>
                  ))
                : reasoningLevels.map((level) => {
                    const labelKey = reasoningLevelKey(level)

                    return (
                      <DropdownMenu.Item
                        key={level}
                        className={MENU_ITEM_CLASS}
                        disabled={saving}
                        onSelect={(event) => {
                          event.preventDefault()

                          if (selectedValue) {
                            void saveOptions({ model: selectedValue, effort: level })
                          }
                        }}
                      >
                        {labelKey ? t(labelKey) : level}
                        {level === reasoningLevel && (
                          <Check className="ml-auto size-4 text-foreground" />
                        )}
                      </DropdownMenu.Item>
                    )
                  })}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function groupModels(models: HarnessModelInfo[]): Array<{
  provider: string
  models: HarnessModelInfo[]
}> {
  const groups = new Map<string, HarnessModelInfo[]>()

  for (const model of models) {
    const group = groups.get(model.provider) ?? []
    group.push(model)
    groups.set(model.provider, group)
  }

  return [...groups].map(([provider, entries]) => ({ provider, models: entries }))
}

type ReasoningLevelKey =
  | 'chat.reasoningLevels.off'
  | 'chat.reasoningLevels.none'
  | 'chat.reasoningLevels.minimal'
  | 'chat.reasoningLevels.low'
  | 'chat.reasoningLevels.medium'
  | 'chat.reasoningLevels.high'
  | 'chat.reasoningLevels.xhigh'
  | 'chat.reasoningLevels.max'
  | 'chat.reasoningLevels.ultra'

function reasoningLevelKey(level: string): ReasoningLevelKey | null {
  switch (level) {
    case 'off':
      return 'chat.reasoningLevels.off'
    case 'none':
      return 'chat.reasoningLevels.none'
    case 'minimal':
      return 'chat.reasoningLevels.minimal'
    case 'low':
      return 'chat.reasoningLevels.low'
    case 'medium':
      return 'chat.reasoningLevels.medium'
    case 'high':
      return 'chat.reasoningLevels.high'
    case 'xhigh':
      return 'chat.reasoningLevels.xhigh'
    case 'max':
      return 'chat.reasoningLevels.max'
    case 'ultra':
      return 'chat.reasoningLevels.ultra'
    default:
      return null
  }
}

function reasoningLabelFor(t: (key: ReasoningLevelKey) => string, level: string): string {
  const key = reasoningLevelKey(level)

  return key ? t(key) : level
}

function resolveReasoningLevel(
  levels: string[],
  requested: string | null,
  fallback: string | null
): string | null {
  if (levels.length === 0) {
    return null
  }

  if (requested && levels.includes(requested)) {
    return requested
  }

  if (fallback && levels.includes(fallback)) {
    return fallback
  }

  return levels.includes('max') ? 'max' : (levels.at(-1) ?? null)
}

export default ComposerModelMenu
