export type WorkspaceItem = {
  id: string
  name: string
}

export type ProjectItem = {
  id: string
  name: string
  workspaces: WorkspaceItem[]
}

export const defaultProjects: ProjectItem[] = [
  {
    id: 'shumi',
    name: 'shumi',
    workspaces: [
      { id: 'shumi-main', name: 'main' },
      { id: 'shumi-ui', name: 'ui' }
    ]
  },
  {
    id: 'playground',
    name: 'playground',
    workspaces: [{ id: 'playground-default', name: 'default' }]
  }
]
