type WorkspacePageProps = {
  activeWorkspaceId: string
}

function WorkspacePage({ activeWorkspaceId }: WorkspacePageProps): React.JSX.Element {
  return (
    <section className="h-full w-full min-w-0 bg-background" data-workspace={activeWorkspaceId} />
  )
}

export default WorkspacePage
