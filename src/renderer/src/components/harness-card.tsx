import { Codex, Pi } from '@lobehub/icons'
import { ChevronDown } from 'lucide-react'
import { Collapsible, Switch } from 'radix-ui'

import { cn } from '@/lib/utils'
import {
  getHarnessModelValue,
  type HarnessInfo,
  type HarnessModelInfo
} from '../../../shared/harness'
import ModelSelector, { type ModelSelectorOption } from './model-selector'

type HarnessCardProps = {
  harness: HarnessInfo
  enabled: boolean
  expanded: boolean
  isDetecting: boolean
  detectionError: boolean
  selectedModels: string[]
  onEnabledChange: (enabled: boolean) => void
  onExpandedChange: (expanded: boolean) => void
  onSelectedModelsChange: (models: string[]) => void
}

function getHarnessStatus(
  harness: HarnessInfo,
  isDetecting: boolean,
  detectionError: boolean
): string {
  if (isDetecting) {
    return '检测中'
  }

  if (detectionError) {
    return '检测失败'
  }

  return harness.installed ? '已安装' : '未安装'
}

function getHarnessVersionLabel(
  harness: HarnessInfo,
  isDetecting: boolean,
  detectionError: boolean
): string | null {
  if (isDetecting || detectionError || !harness.installed) {
    return null
  }

  if (harness.version) {
    return `版本 ${harness.version}`
  }

  return harness.versionPending ? null : '版本未知'
}

function HarnessCard({
  harness,
  enabled,
  expanded,
  isDetecting,
  detectionError,
  selectedModels,
  onEnabledChange,
  onExpandedChange,
  onSelectedModelsChange
}: HarnessCardProps): React.JSX.Element {
  const available = harness.installed
  const status = getHarnessStatus(harness, isDetecting, detectionError)
  const versionLabel = getHarnessVersionLabel(harness, isDetecting, detectionError)
  const HarnessIcon = harness.id === 'pi' ? Pi : Codex
  const models: ModelSelectorOption[] = harness.models.map((model: HarnessModelInfo) => ({
    value: getHarnessModelValue(model),
    name: model.name,
    icon: model.name
  }))

  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={onExpandedChange}>
      <div className="group relative overflow-hidden rounded-xl border border-border transition-[border-color,box-shadow] duration-200 hover:border-ring/50 hover:shadow-sm">
        <div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
          <Collapsible.Trigger
            aria-label={`切换 ${harness.name} 详情`}
            className="pointer-events-auto absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />

          <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-accent">
              <HarnessIcon.Avatar size={28} shape="square" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{harness.name}</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    detectionError
                      ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                      : available
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      detectionError ? 'bg-red-500' : available ? 'bg-emerald-500' : 'bg-current',
                      isDetecting && 'animate-pulse'
                    )}
                  />
                  {status}
                </span>
              </div>
              {versionLabel && <p className="mt-1 text-xs text-muted-foreground">{versionLabel}</p>}
            </div>

            <ChevronDown
              className={cn(
                'ml-auto size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground',
                expanded && 'rotate-180'
              )}
              strokeWidth={1.75}
            />
          </div>

          <Switch.Root
            aria-label={`启用 ${harness.name} Harness`}
            checked={available && enabled}
            className="pointer-events-auto relative z-10 h-5 w-9 shrink-0 rounded-full bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[state=checked]:bg-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!available || isDetecting}
            onCheckedChange={onEnabledChange}
          >
            <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>

        <Collapsible.Content className="relative z-10 overflow-hidden data-[state=closed]:animate-[collapsible-up_160ms_ease-in] data-[state=open]:animate-[collapsible-down_200ms_ease-out] motion-reduce:animate-none">
          <div className="px-4 pb-4 pt-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] font-normal text-muted-foreground">模型</span>

              <ModelSelector
                ariaLabel={`选择 ${harness.name} 模型`}
                models={models}
                value={selectedModels}
                placeholder="暂无已配置模型"
                onChange={onSelectedModelsChange}
              />
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

export default HarnessCard
