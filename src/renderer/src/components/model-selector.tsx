import { ModelIcon, modelMappings } from '@lobehub/icons'
import { Bot, Check, ChevronDown } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export type ModelSelectorOption = {
  value: string
  name: string
  icon?: string
}

type ModelSelectorProps = {
  models: ModelSelectorOption[]
  value: string[]
  onChange: (value: string[]) => void
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

const MODEL_ICON_PATTERNS = modelMappings.flatMap(({ keywords }) =>
  keywords.map((keyword) => new RegExp(keyword, 'i'))
)

function hasModelIcon(model: string): boolean {
  return MODEL_ICON_PATTERNS.some((pattern) => pattern.test(model))
}

function ModelIconWithFallback({
  model,
  name
}: {
  model?: string
  name: string
}): React.JSX.Element {
  const iconModel = model ?? name

  if (!hasModelIcon(iconModel)) {
    return <Bot className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
  }

  return <ModelIcon model={iconModel} size={16} />
}

function ModelSelector({
  models,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  placeholder,
  className
}: ModelSelectorProps): React.JSX.Element {
  const { t } = useTranslation()
  const selectedModels = value
    .map((selectedValue) => models.find((model) => model.value === selectedValue))
    .filter((model): model is ModelSelectorOption => model !== undefined)
  const primaryModel = selectedModels[0]
  const isDisabled = disabled || models.length === 0

  const handleToggle = (modelValue: string): void => {
    onChange(
      value.includes(modelValue)
        ? value.filter((selectedValue) => selectedValue !== modelValue)
        : [...value, modelValue]
    )
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild disabled={isDisabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'flex h-8 w-56 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-background px-3 text-[13px] font-normal text-foreground outline-none transition-colors hover:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:border-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          {primaryModel ? (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <ModelIconWithFallback model={primaryModel.icon} name={primaryModel.name} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{primaryModel.name}</span>
              {selectedModels.length > 1 && (
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  +{selectedModels.length - 1}
                </span>
              )}
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
              {placeholder ?? t('model.placeholder')}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] w-[var(--radix-popover-trigger-width)] origin-[var(--radix-popover-content-transform-origin)] overflow-hidden rounded-lg border border-border bg-surface text-[13px] font-normal shadow-lg outline-none data-[state=closed]:animate-[select-out_100ms_ease-in] data-[state=open]:animate-[select-in_140ms_ease-out] motion-reduce:animate-none"
        >
          <div className="max-h-56 overflow-y-auto p-1">
            {models.map((model) => {
              const selected = value.includes(model.value)

              return (
                <button
                  key={model.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[13px] font-normal text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent',
                    selected && 'bg-accent/50'
                  )}
                  onClick={() => handleToggle(model.value)}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    <ModelIconWithFallback model={model.icon} name={model.name} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{model.name}</span>
                  <Check
                    className={cn(
                      'size-3.5 shrink-0 transition-opacity',
                      selected ? 'opacity-100' : 'opacity-0'
                    )}
                    strokeWidth={2}
                  />
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export default ModelSelector
