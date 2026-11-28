import { useEffect, useState } from 'react'
import { Codex, Pi } from '@lobehub/icons'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { HarnessId, HarnessInfo } from '../../../shared/harness'

type AddWorkerPopoverProps = {
  workspaceName: string
  onOpen: () => void
  onCreate: (harness: HarnessId) => void
}

function AddWorkerPopover({
  workspaceName,
  onOpen,
  onCreate
}: AddWorkerPopoverProps): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedHarness, setSelectedHarness] = useState<HarnessId | null>(null)
  const [isDetecting, setIsDetecting] = useState(true)
  const [detectionError, setDetectionError] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    window.api.harness
      .detect()
      .then((detectedHarnesses) => {
        if (cancelled) {
          return
        }

        setHarnesses(detectedHarnesses)
        const harness = detectedHarnesses.find((entry) => entry.installed)

        if (harness) {
          setSelectedHarness(harness.id)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetectionError(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDetecting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const selectHarness = (harness: HarnessInfo): void => {
    setSelectedHarness(harness.id)
  }

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!selectedHarness) {
      return
    }

    onCreate(selectedHarness)
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (nextOpen) {
          setHarnesses([])
          setSelectedHarness(null)
          setIsDetecting(true)
          setDetectionError(false)
          onOpen()
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('worker.create')}
          title={t('worker.create')}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="right"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-h-[calc(100vh-1.5rem)] w-[340px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-surface text-foreground shadow-xl outline-none data-[state=closed]:animate-select-out data-[state=open]:animate-select-in motion-reduce:animate-none"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-13 font-medium">
                {t('worker.createIn', { workspace: workspaceName })}
              </p>
            </div>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={t('common.close')}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </Popover.Close>
          </header>

          <form className="space-y-3 p-3" onSubmit={submit}>
            <div className="space-y-2">
              {isDetecting && (
                <div className="flex h-16 items-center justify-center gap-2 rounded-lg border border-border text-12 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
                  <span>{t('worker.detecting')}</span>
                </div>
              )}

              {!isDetecting && detectionError && (
                <div className="flex h-16 items-center justify-center rounded-lg border border-border text-12 text-danger">
                  {t('worker.detectionError')}
                </div>
              )}

              {!isDetecting &&
                !detectionError &&
                harnesses.map((harness) => {
                  const HarnessIcon = harness.id === 'pi' ? Pi : Codex
                  const selected = selectedHarness === harness.id

                  return (
                    <button
                      key={harness.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={!harness.installed}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
                        selected
                          ? 'border-ring/70 bg-accent/60'
                          : 'border-border hover:bg-accent/40'
                      )}
                      onClick={() => selectHarness(harness)}
                    >
                      <HarnessIcon.Avatar size={24} shape="square" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-13 font-medium">{harness.name}</span>
                          {!harness.installed && (
                            <span className="text-10 text-muted-foreground">
                              {t('harness.status.notInstalled')}
                            </span>
                          )}
                        </span>
                        {harness.installed && harness.version && (
                          <span className="mt-0.5 block text-10 text-muted-foreground">
                            {t('harness.version', { version: harness.version })}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-full border',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border'
                        )}
                      >
                        {selected && <Check className="size-3" strokeWidth={2.25} />}
                      </span>
                    </button>
                  )
                })}

              {!isDetecting &&
                !detectionError &&
                !harnesses.some((harness) => harness.installed) && (
                  <p className="rounded-lg border border-border px-3 py-2 text-12 text-muted-foreground">
                    {t('worker.noHarness')}
                  </p>
                )}
            </div>

            <div className="flex justify-end gap-2">
              <Popover.Close asChild>
                <button
                  type="button"
                  className="h-8 rounded-lg px-3 text-13 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {t('common.cancel')}
                </button>
              </Popover.Close>
              <button
                type="submit"
                className="h-8 rounded-lg bg-primary px-3 text-13 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40"
                disabled={!selectedHarness}
              >
                {t('worker.create')}
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export default AddWorkerPopover
