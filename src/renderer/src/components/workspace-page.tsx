import { useEffect, useRef } from 'react'
import { ChevronRight, Folder, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ShumiPromptResponse } from '../../../shared/agent/events'
import type {
  AgentChatController,
  ChatEntry,
  ChatMessageEntry,
  ChatToolEntry,
  WorkerChat
} from '@/hooks/use-agent-chat'
import type { ProjectItem, WorkerItem, WorkspaceItem } from '@/lib/projects'
import { cn } from '@/lib/utils'
import ChatComposer from './chat-composer'
import PromptRequestCard from './prompt-request-card'

type WorkspacePageProps = {
  project: ProjectItem | null
  workspace: WorkspaceItem | null
  activeWorker: WorkerItem | null
  agentChat: AgentChatController
  onOptionsChange: (options: { model: string; effort: string | null }) => Promise<boolean>
}

const EMPTY_CHAT: WorkerChat = {
  entries: [],
  status: 'idle',
  requests: [],
  usage: {},
  ended: false
}

function WorkspacePage({
  project,
  workspace,
  activeWorker,
  agentChat,
  onOptionsChange
}: WorkspacePageProps): React.JSX.Element {
  const { t } = useTranslation()
  const messagesRef = useRef<HTMLDivElement>(null)

  const chat = activeWorker ? (agentChat.chats[activeWorker.id] ?? EMPTY_CHAT) : EMPTY_CHAT
  const pendingRequest = chat.requests[0] ?? null
  const isBusy = chat.status === 'starting' || chat.status === 'stopping'
  const isEnded = chat.ended

  useEffect(() => {
    const container = messagesRef.current

    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [activeWorker?.id, chat.entries])

  const sendMessage = (text: string): void => {
    if (!activeWorker || !project || isBusy || isEnded) {
      return
    }

    void agentChat.send(
      activeWorker.id,
      activeWorker.harness,
      project.folderPath,
      text,
      activeWorker.model,
      activeWorker.effort
    )
  }

  const submitRequest = (response: ShumiPromptResponse): void => {
    if (!activeWorker || !pendingRequest) {
      return
    }

    void agentChat.respond(activeWorker.id, pendingRequest.requestId, response)
  }

  if (!workspace) {
    return (
      <section className="flex h-full min-w-0 items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Folder className="size-7" strokeWidth={1.5} />
          <p className="text-[13px]">{t('workspace.noneSelected')}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      {activeWorker ? (
        <>
          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[660px] flex-col gap-5 px-5 pb-6 pt-6">
              {chat.entries.length === 0 && (
                <div className="flex flex-col items-center py-24 text-center">
                  <p className="text-[13px] text-muted-foreground">{t('chat.empty')}</p>
                </div>
              )}

              {chat.entries.map((entry) => (
                <ChatEntryView key={`${entry.kind}:${entry.id}`} entry={entry} />
              ))}
            </div>
          </div>

          <div className="shrink-0 px-5 pb-4">
            <div className="mx-auto w-full max-w-[660px] space-y-2">
              {pendingRequest && (
                <PromptRequestCard
                  key={pendingRequest.requestId}
                  request={pendingRequest}
                  onSubmit={submitRequest}
                  onCancel={() => submitRequest({ answers: [], cancelled: true })}
                />
              )}

              <ChatComposer
                key={activeWorker.id}
                harness={activeWorker.harness}
                model={activeWorker.model}
                effort={activeWorker.effort}
                placeholder={t(isEnded ? 'chat.sessionEnded' : 'chat.placeholder')}
                disabled={isBusy || isEnded}
                running={chat.status === 'running'}
                onOptionsChange={onOptionsChange}
                onSend={sendMessage}
                onStop={() => void agentChat.cancel(activeWorker.id)}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Wrench className="size-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground">{t('worker.empty')}</p>
          </div>
        </div>
      )}
    </section>
  )
}

function ChatEntryView({ entry }: { entry: ChatEntry }): React.JSX.Element {
  if (entry.kind === 'notice') {
    return (
      <div className="flex justify-center">
        <p
          className={cn(
            'max-w-xl text-center text-[11px]',
            entry.level === 'error'
              ? 'text-red-600 dark:text-red-400'
              : entry.level === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
          )}
        >
          {entry.text}
        </p>
      </div>
    )
  }

  if (entry.kind === 'tool') {
    return <ToolEntry entry={entry} />
  }

  return <MessageEntry entry={entry} />
}

function MessageEntry({ entry }: { entry: ChatMessageEntry }): React.JSX.Element {
  const { t } = useTranslation()

  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[14px] bg-accent px-3.5 py-2 text-[14px] leading-6 text-foreground">
          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {entry.reasoning && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight
              className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
              strokeWidth={1.75}
            />
            <span>{t('chat.reasoningProcess')}</span>
          </summary>
          <p className="mb-2 ml-4 mt-1 whitespace-pre-wrap break-words text-[12px] leading-6 text-muted-foreground">
            {entry.reasoning}
          </p>
        </details>
      )}

      <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.8] text-foreground">
        {entry.text}
        {entry.streaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground/60 align-middle" />
        )}
      </div>
    </div>
  )
}

function ToolEntry({ entry }: { entry: ChatToolEntry }): React.JSX.Element {
  const { t } = useTranslation()
  const hasDetails = entry.input !== null || entry.output.length > 0

  return (
    <details className="group -mx-2">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground">
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <span
          className={cn(
            'text-[11px]',
            entry.status === 'failed'
              ? 'text-red-600 dark:text-red-400'
              : entry.status === 'running'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
          )}
        >
          {t(toolStatusLabelKey(entry.status))}
        </span>
      </summary>

      {hasDetails && (
        <div className="ml-4 space-y-2 border-l border-border py-1 pl-3">
          {entry.input !== null && (
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">{t('chat.toolInput')}</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                {formatValue(entry.input)}
              </pre>
            </div>
          )}

          {entry.output && (
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">{t('chat.toolOutput')}</p>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                {entry.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </details>
  )
}

type ToolStatusLabelKey =
  | 'chat.toolStatus.running'
  | 'chat.toolStatus.completed'
  | 'chat.toolStatus.failed'
  | 'chat.toolStatus.cancelled'

function toolStatusLabelKey(status: ChatToolEntry['status']): ToolStatusLabelKey {
  if (status === 'running') {
    return 'chat.toolStatus.running'
  }

  if (status === 'failed') {
    return 'chat.toolStatus.failed'
  }

  if (status === 'cancelled') {
    return 'chat.toolStatus.cancelled'
  }

  return 'chat.toolStatus.completed'
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export default WorkspacePage
