import { useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import AppSidebar from '@/components/app-sidebar'
import SettingsDialog from '@/components/settings-dialog'
import WorkspacePage from '@/components/workspace-page'
import { useTheme } from '@/hooks/use-theme'
import { defaultProjects } from '@/lib/projects'

const SIDEBAR_DEFAULT_WIDTH = 224
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_WIDTH_STORAGE_KEY = 'shumi:sidebar-width'

function getInitialSidebarWidth(): number {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))

  if (!Number.isFinite(storedWidth) || storedWidth <= 0) {
    return SIDEBAR_DEFAULT_WIDTH
  }

  return Math.min(Math.max(storedWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
}

function App(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    defaultProjects[0]?.workspaces[0]?.id ?? ''
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [initialSidebarWidth] = useState(getInitialSidebarWidth)

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
            projects={defaultProjects}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={setActiveWorkspaceId}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </Panel>

        <Separator
          id="sidebar-resizer"
          aria-label="调整侧栏宽度"
          className="relative z-10 w-px shrink-0 cursor-col-resize bg-sidebar-border outline-none transition-colors hover:bg-foreground/30 focus-visible:bg-foreground/50 data-[separator=active]:bg-foreground/45"
        />

        <Panel id="workspace" minSize={360} className="min-h-0 min-w-0">
          <WorkspacePage activeWorkspaceId={activeWorkspaceId} />
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
