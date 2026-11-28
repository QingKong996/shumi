import { useState } from 'react'
import { Codex, Pi } from '@lobehub/icons'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Layers,
  Plus,
  Settings,
  Trash2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { HarnessId } from '../../../shared/harness'
import type { ProjectItem, WorkspaceItem } from '@/lib/projects'
import { cn } from '@/lib/utils'
import AddWorkerPopover from './add-worker-popover'
import { CreateProjectDialog, CreateWorkspaceDialog } from './project-dialogs'

type SidebarProps = {
  projects: ProjectItem[]
  activeWorkspaceId: string | null
  activeWorkerId: string | null
  onSelectWorkspace: (workspaceId: string) => void
  onSelectWorker: (workspaceId: string, workerId: string) => void
  onCreateProject: (name: string, folderPath: string) => ProjectItem
  onCreateWorkspace: (projectId: string, name: string) => WorkspaceItem | null
  onAddWorker: (workspaceId: string, harness: HarnessId) => void
  onDeleteProject: (projectId: string) => void
  onOpenSettings: () => void
}

function AppSidebar({
  projects,
  activeWorkspaceId,
  activeWorkerId,
  onSelectWorkspace,
  onSelectWorker,
  onCreateProject,
  onCreateWorkspace,
  onAddWorker,
  onDeleteProject,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null)

  const toggleProject = (projectId: string): void => {
    setExpandedProjectIds((current) => {
      const next = new Set(current)

      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }

      return next
    })
  }

  const handleCreateProject = (name: string, folderPath: string): void => {
    const project = onCreateProject(name, folderPath)

    setExpandedProjectIds((current) => new Set(current).add(project.id))
  }

  const handleCreateWorkspace = (projectId: string, name: string): void => {
    onCreateWorkspace(projectId, name)
    setExpandedProjectIds((current) => new Set(current).add(projectId))
  }

  const confirmDeleteProject = (project: ProjectItem): void => {
    if (window.confirm(t('project.deleteConfirm', { name: project.name }))) {
      onDeleteProject(project.id)
    }
  }

  const selectedWorkspaceProject = projects.find((project) => project.id === workspaceProjectId)

  return (
    <>
      <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-12 shrink-0 items-center px-3 pt-1">
          <span className="px-1 text-[14px] font-semibold tracking-tight">Shumi</span>
        </div>

        <div className="mt-8 flex h-6 shrink-0 items-center justify-between px-3">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t('sidebar.projects')}
          </span>
          <button
            type="button"
            aria-label={t('project.create')}
            title={t('project.create')}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => setCreateProjectOpen(true)}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-2 pt-1"
          aria-label={t('sidebar.navigation')}
        >
          {projects.map((project) => {
            const hasActiveWorkspace = project.workspaces.some(
              (workspace) => workspace.id === activeWorkspaceId
            )
            const isExpanded = expandedProjectIds.has(project.id) || hasActiveWorkspace

            return (
              <div key={project.id} className="space-y-0.5">
                <div
                  className={cn(
                    'group flex h-8 items-center rounded-md transition-colors hover:bg-sidebar-accent/50',
                    hasActiveWorkspace && 'text-sidebar-foreground'
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    className={cn(
                      'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      hasActiveWorkspace
                        ? 'font-medium text-sidebar-foreground'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => toggleProject(project.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <ChevronRight
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    )}
                    <Folder className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{project.name}</span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={t('workspace.create')}
                      title={t('workspace.create')}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => setWorkspaceProjectId(project.id)}
                    >
                      <FolderPlus className="size-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      aria-label={t('project.delete')}
                      title={t('project.delete')}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-red-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:hover:text-red-400"
                      onClick={() => confirmDeleteProject(project)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-0.5 pl-5">
                    {project.workspaces.map((workspace) => {
                      const isActive = workspace.id === activeWorkspaceId

                      return (
                        <div key={workspace.id} className="space-y-0.5">
                          <div
                            className={cn(
                              'group flex h-8 items-center rounded-md transition-colors hover:bg-sidebar-accent/50',
                              isActive && 'text-sidebar-foreground'
                            )}
                          >
                            <button
                              type="button"
                              aria-current={isActive ? 'true' : undefined}
                              className={cn(
                                'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                isActive
                                  ? 'font-medium text-sidebar-accent-foreground'
                                  : 'text-muted-foreground hover:text-sidebar-accent-foreground'
                              )}
                              onClick={() => onSelectWorkspace(workspace.id)}
                            >
                              <Layers className="size-3.5 shrink-0" strokeWidth={1.75} />
                              <span className="truncate">{workspace.name}</span>
                            </button>

                            <AddWorkerPopover
                              workspaceName={workspace.name}
                              onOpen={() => onSelectWorkspace(workspace.id)}
                              onCreate={(harness) => onAddWorker(workspace.id, harness)}
                            />
                          </div>

                          {workspace.workers.length > 0 && (
                            <div className="ml-3 space-y-0.5">
                              {workspace.workers.map((worker) => {
                                const isActiveWorker = isActive && worker.id === activeWorkerId

                                return (
                                  <button
                                    key={worker.id}
                                    type="button"
                                    aria-current={isActiveWorker ? 'page' : undefined}
                                    title={worker.model ?? undefined}
                                    className={cn(
                                      'flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                      isActiveWorker
                                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                        : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                                    )}
                                    onClick={() => onSelectWorker(workspace.id, worker.id)}
                                  >
                                    <WorkerGlyph harness={worker.harness} />
                                    <span className="truncate">{worker.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {project.workspaces.length === 0 && (
                      <button
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() => setWorkspaceProjectId(project.id)}
                      >
                        <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
                        <span className="truncate">{t('workspace.create')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="mt-auto p-2">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onOpenSettings}
          >
            <Settings className="size-4 shrink-0" strokeWidth={1.75} />
            <span>{t('sidebar.settings')}</span>
          </button>
        </div>
      </aside>

      {createProjectOpen && (
        <CreateProjectDialog
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          onCreate={handleCreateProject}
        />
      )}

      {workspaceProjectId !== null && (
        <CreateWorkspaceDialog
          open
          title={t('workspace.createIn', {
            project: selectedWorkspaceProject?.name ?? ''
          })}
          onOpenChange={(open) => {
            if (!open) {
              setWorkspaceProjectId(null)
            }
          }}
          onCreate={(name) => {
            handleCreateWorkspace(workspaceProjectId, name)
          }}
        />
      )}
    </>
  )
}

function WorkerGlyph({ harness }: { harness: HarnessId }): React.JSX.Element {
  const Icon = harness === 'pi' ? Pi : Codex

  return <Icon.Avatar size={14} shape="square" />
}

export default AppSidebar
