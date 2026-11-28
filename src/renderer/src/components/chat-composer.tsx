import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { WorkerAgentOptions } from '@/hooks/use-agent-chat'
import type { HarnessId } from '../../../shared/harness'
import ComposerModelMenu from './composer-model-menu'

type ChatComposerProps = {
  harness: HarnessId
  model: string | null
  effort: string | null
  disabled: boolean
  running: boolean
  placeholder: string
  onOptionsChange: (options: WorkerAgentOptions) => Promise<boolean>
  onSend: (text: string) => void
  onStop: () => void
}

function ChatComposer({
  harness,
  model,
  effort,
  disabled,
  running,
  placeholder,
  onOptionsChange,
  onSend,
  onStop
}: ChatComposerProps): React.JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const showStop = running && value.trim().length === 0

  useEffect(() => {
    const element = textareaRef.current

    if (!element) {
      return
    }

    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`
  }, [value])

  const submit = (): void => {
    const text = value.trim()

    if (!text || disabled) {
      return
    }

    setValue('')
    onSend(text)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-[660px] flex-col gap-2 rounded-2xl border border-border-strong bg-composer px-3.5 pt-3 pb-2.5 shadow-[0_2px_8px_rgb(0_0_0/0.03)] transition-colors focus-within:border-foreground/35 dark:shadow-none"
      onSubmit={handleSubmit}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        className="max-h-48 min-h-10 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0.5 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="flex min-w-0 items-center gap-1">
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
          <ComposerModelMenu
            harness={harness}
            model={model}
            effort={effort}
            disabled={disabled || running}
            onChange={onOptionsChange}
          />

          {showStop ? (
            <button
              type="button"
              aria-label={t('chat.stop')}
              title={t('chat.stop')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary p-0 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-composer"
              onClick={onStop}
            >
              <Square aria-hidden="true" className="size-3 fill-current" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="submit"
              aria-label={t('chat.send')}
              title={t('chat.send')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary p-0 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-composer disabled:pointer-events-none disabled:opacity-45"
              disabled={disabled || value.trim().length === 0}
            >
              <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

export default ChatComposer
