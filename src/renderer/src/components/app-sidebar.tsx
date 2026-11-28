import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, Layers, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ProjectItem } from '@/lib/projects'
import { cn } from '@/lib/utils'

type SidebarProps = {
  projects: ProjectItem[]
  activeWorkspaceId: string
  onSelectWorkspace: (workspaceId: string) => void
  onOpenSettings: () => void
}

function AppSidebar({
  projects,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(projects[0] ? [projects[0].id] : [])
  )

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

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex shrink-0 items-center px-4 pt-4 pb-3">
        <span className="text-[15px] font-semibold tracking-tight">Shumi</span>
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-2.5 py-1"
        aria-label={t('sidebar.navigation')}
      >
        {projects.map((project) => {
          const isExpanded = expandedProjectIds.has(project.id)
          const hasActiveWorkspace = project.workspaces.some(
            (workspace) => workspace.id === activeWorkspaceId
          )

          return (
            <div key={project.id} className="space-y-0.5">
              <button
                type="button"
                aria-expanded={isExpanded}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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

              {isExpanded && (
                <div className="space-y-0.5 pl-5">
                  {project.workspaces.map((workspace) => {
                    const isActive = workspace.id === activeWorkspaceId

                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          isActive
                            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                            : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                        )}
                        onClick={() => onSelectWorkspace(workspace.id)}
                      >
                        <Layers className="size-3.5 shrink-0" strokeWidth={1.75} />
                        <span className="truncate">{workspace.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto p-2.5">
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onOpenSettings}
        >
          <Settings className="size-4 shrink-0" strokeWidth={1.75} />
          <span>{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  )
}

export default AppSidebar
