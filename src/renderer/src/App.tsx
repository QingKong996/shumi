import { useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useTranslation } from 'react-i18next'

import AppSidebar from '@/components/app-sidebar'
import SettingsDialog from '@/components/settings-dialog'
import WorkspacePage from '@/components/workspace-page'
import { useAgentChat } from '@/hooks/use-agent-chat'
import { useProjects } from '@/hooks/use-projects'
import { useTheme } from '@/hooks/use-theme'

const SIDEBAR_DEFAULT_WIDTH = 180
const SIDEBAR_MIN_WIDTH = 168
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_WIDTH_STORAGE_KEY = 'shumi:sidebar-width:v2'

function getInitialSidebarWidth(): number {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))

  if (!Number.isFinite(storedWidth) || storedWidth <= 0) {
    return SIDEBAR_DEFAULT_WIDTH
  }

  return Math.min(Math.max(storedWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
}

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const projects = useProjects()
  const agentChat = useAgentChat()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [initialSidebarWidth] = useState(getInitialSidebarWidth)

  const deleteProject = (projectId: string): void => {
    const project = projects.projects.find((entry) => entry.id === projectId)

    if (project) {
      agentChat.removeWorkers(
        project.workspaces.flatMap((workspace) => workspace.workers.map((worker) => worker.id))
      )
    }

    projects.deleteProject(projectId)
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <Group
        id="shumi-shell"
        orientation="horizontal"
        className="h-full w-full"
        resizeTargetMinimumSize={{ coarse: 18, fine: 10 }}
      >
        <Panel
          id="sidebar"
          defaultSize={initialSidebarWidth}
          minSize={SIDEBAR_MIN_WIDTH}
          maxSize={SIDEBAR_MAX_WIDTH}
          groupResizeBehavior="preserve-pixel-size"
          className="min-h-0"
          onResize={(size) => {
            window.localStorage.setItem(
              SIDEBAR_WIDTH_STORAGE_KEY,
              String(Math.round(size.inPixels))
            )
          }}
        >
          <AppSidebar
            projects={projects.projects}
            activeWorkspaceId={projects.activeWorkspaceId}
            activeWorkerId={projects.activeWorkerId}
            onSelectWorkspace={projects.setActiveWorkspaceId}
            onSelectWorker={projects.setActiveWorker}
            onCreateProject={projects.createProject}
            onCreateWorkspace={projects.createWorkspace}
            onAddWorker={projects.addWorker}
            onDeleteProject={deleteProject}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </Panel>

        <Separator
          id="sidebar-resizer"
          aria-label={t('app.resizeSidebar')}
          className="relative z-10 w-px shrink-0 cursor-col-resize bg-transparent outline-none transition-colors hover:bg-foreground/20 focus-visible:bg-foreground/35 data-[separator=active]:bg-foreground/30"
        />

        <Panel id="workspace" minSize={360} className="min-h-0 min-w-0">
          <WorkspacePage
            project={projects.activeProject}
            workspace={projects.activeWorkspace}
            activeWorker={projects.activeWorker}
            agentChat={agentChat}
            onOptionsChange={async (options) => {
              const worker = projects.activeWorker

              if (!projects.activeWorkspace || !worker) {
                return false
              }

              const workspaceId = projects.activeWorkspace.id
              const applied = await agentChat.setOptions(worker.id, options)

              if (applied) {
                projects.updateWorkerOptions(workspaceId, worker.id, options)
              }

              return applied
            }}
          />
        </Panel>
      </Group>

      <SettingsDialog
        open={settingsOpen}
        theme={theme}
        onOpenChange={setSettingsOpen}
        onThemeChange={setTheme}
      />
    </main>
  )
}

export default App
