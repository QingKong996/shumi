import { useState } from 'react'
import { CircleHelp, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ShumiPromptAnswer, ShumiPromptResponse } from '../../../shared/agent/events'
import type { ChatRequest } from '@/hooks/use-agent-chat'
import { cn } from '@/lib/utils'

type PromptRequestCardProps = {
  request: ChatRequest
  onSubmit: (response: ShumiPromptResponse) => void
  onCancel: () => void
}

function PromptRequestCard({
  request,
  onSubmit,
  onCancel
}: PromptRequestCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})

  const answers = request.questions.map((question) => {
    const text = textAnswers[question.id]?.trim()
    const optionId = selectedOptions[question.id]

    if (question.allowText && text) {
      return { questionId: question.id, text }
    }

    if (optionId) {
      return { questionId: question.id, optionId }
    }

    return null
  })
  const canSubmit = answers.every((answer) => answer !== null)
  const Icon = request.kind === 'approval' ? ShieldAlert : CircleHelp

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-13 font-medium text-foreground">{request.title}</p>
          {request.detail && (
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/70 px-2.5 py-2 font-mono text-11 leading-5 text-muted-foreground">
              {request.detail}
            </pre>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {request.questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <p className="text-13 text-foreground">{question.text}</p>

            {question.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const selected = selectedOptions[question.id] === option.id

                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-12 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : option.tone === 'danger'
                            ? 'border-border text-danger hover:bg-danger-solid/10'
                            : 'border-border hover:bg-accent'
                      )}
                      onClick={() => {
                        setSelectedOptions((current) => ({
                          ...current,
                          [question.id]: option.id
                        }))
                        setTextAnswers((current) => ({ ...current, [question.id]: '' }))
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            )}

            {question.allowText &&
              (question.multiline ? (
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-13 outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/70 focus:ring-1 focus:ring-ring"
                  value={textAnswers[question.id] ?? ''}
                  placeholder={question.placeholder ?? t('chat.answerPlaceholder')}
                  onChange={(event) => {
                    setTextAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                    setSelectedOptions((current) => ({ ...current, [question.id]: '' }))
                  }}
                />
              ) : (
                <input
                  className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-13 outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/70 focus:ring-1 focus:ring-ring"
                  value={textAnswers[question.id] ?? ''}
                  placeholder={question.placeholder ?? t('chat.answerPlaceholder')}
                  onChange={(event) => {
                    setTextAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                    setSelectedOptions((current) => ({ ...current, [question.id]: '' }))
                  }}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="h-8 rounded-lg px-3 text-12 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="h-8 rounded-lg bg-primary px-3 text-12 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40"
          disabled={!canSubmit}
          onClick={() => {
            const validAnswers: ShumiPromptAnswer[] = answers.flatMap((answer) =>
              answer ? [answer] : []
            )
            onSubmit({ answers: validAnswers })
          }}
        >
          {t('chat.submit')}
        </button>
      </div>
    </div>
  )
}

export default PromptRequestCard
