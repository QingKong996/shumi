import { useState } from 'react'
import { FolderOpen, Loader2, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, folderPath: string) => void
}

type CreateWorkspaceDialogProps = {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}

const inputClassName =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/70 focus:ring-1 focus:ring-ring'

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate
}: CreateProjectDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [pickingFolder, setPickingFolder] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickFolder = async (): Promise<void> => {
    setPickingFolder(true)
    setError(null)

    try {
      const selected = await window.api.project.selectFolder()

      if (selected) {
        setFolderPath(selected)
      }
    } catch {
      setError(t('project.folderError'))
    } finally {
      setPickingFolder(false)
    }
  }

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!name.trim() || !folderPath) {
      setError(t('project.required'))
      return
    }

    onCreate(name.trim(), folderPath)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface text-foreground outline-none"
        >
          <header className="flex h-12 items-center justify-between border-b border-border px-5">
            <Dialog.Title className="text-15 font-medium">{t('project.create')}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('common.close')}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </header>

          <form className="space-y-4 p-5" onSubmit={submit}>
            <label className="block space-y-1.5">
              <span className="text-13 text-muted-foreground">{t('project.name')}</span>
              <input
                autoFocus
                className={inputClassName}
                value={name}
                placeholder={t('project.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-13 text-muted-foreground">{t('project.folder')}</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  className={cn(inputClassName, 'min-w-0 flex-1 text-13')}
                  value={folderPath}
                  placeholder={t('project.folderPlaceholder')}
                />
                <button
                  type="button"
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-13 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  disabled={pickingFolder}
                  onClick={() => void pickFolder()}
                >
                  {pickingFolder ? (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <FolderOpen className="size-3.5" strokeWidth={1.75} />
                  )}
                  <span>{t('project.browse')}</span>
                </button>
              </div>
            </label>

            {error && <p className="text-13 text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-8 rounded-lg px-3 text-13 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {t('common.cancel')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="h-8 rounded-lg bg-primary px-3 text-13 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40"
                disabled={!name.trim() || !folderPath}
              >
                {t('project.create')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CreateWorkspaceDialog({
  open,
  title,
  onOpenChange,
  onCreate
}: CreateWorkspaceDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!name.trim()) {
      return
    }

    onCreate(name.trim())
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface text-foreground outline-none"
        >
          <header className="flex h-12 items-center justify-between border-b border-border px-5">
            <Dialog.Title className="text-15 font-medium">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('common.close')}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </header>

          <form className="space-y-4 p-5" onSubmit={submit}>
            <label className="block space-y-1.5">
              <span className="text-13 text-muted-foreground">{t('workspace.name')}</span>
              <input
                autoFocus
                className={inputClassName}
                value={name}
                placeholder={t('workspace.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-8 rounded-lg px-3 text-13 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {t('common.cancel')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="h-8 rounded-lg bg-primary px-3 text-13 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40"
                disabled={!name.trim()}
              >
                {t('workspace.create')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { CreateProjectDialog, CreateWorkspaceDialog }
