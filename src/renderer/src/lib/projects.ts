import type { HarnessId } from '../../../shared/harness'

export type WorkerItem = {
  id: string
  name: string
  harness: HarnessId
  model: string | null
  effort: string | null
}

export type WorkspaceItem = {
  id: string
  name: string
  workers: WorkerItem[]
}

export type ProjectItem = {
  id: string
  name: string
  folderPath: string
  workspaces: WorkspaceItem[]
}

export type ProjectsState = {
  projects: ProjectItem[]
  activeWorkspaceId: string | null
  activeWorkerId: string | null
}

const PROJECTS_STORAGE_KEY = 'shumi:projects:v1'

export function loadProjectsState(): ProjectsState {
  try {
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY)

    if (!stored) {
      return { projects: [], activeWorkspaceId: null, activeWorkerId: null }
    }

    const parsed: unknown = JSON.parse(stored)

    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) {
      return { projects: [], activeWorkspaceId: null, activeWorkerId: null }
    }

    const projects = parsed.projects.flatMap(parseProject)
    const storedActiveWorkspaceId =
      typeof parsed.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : null
    const storedActiveWorkerId =
      typeof parsed.activeWorkerId === 'string' ? parsed.activeWorkerId : null
    const activeWorkspace =
      findWorkspace(projects, storedActiveWorkspaceId) ?? firstWorkspace(projects)
    const activeWorkspaceId = activeWorkspace?.id ?? null
    const activeWorkerId =
      activeWorkspace?.workers.find((worker) => worker.id === storedActiveWorkerId)?.id ??
      firstWorkerId(activeWorkspace)

    return { projects, activeWorkspaceId, activeWorkerId }
  } catch {
    return { projects: [], activeWorkspaceId: null, activeWorkerId: null }
  }
}

export function saveProjectsState(state: ProjectsState): void {
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state))
}

export function firstWorkspaceId(projects: ProjectItem[]): string | null {
  return firstWorkspace(projects)?.id ?? null
}

export function firstWorkerId(workspace: WorkspaceItem | null | undefined): string | null {
  return workspace?.workers[0]?.id ?? null
}

function firstWorkspace(projects: ProjectItem[]): WorkspaceItem | null {
  for (const project of projects) {
    const workspace = project.workspaces[0]

    if (workspace) {
      return workspace
    }
  }

  return null
}

function findWorkspace(projects: ProjectItem[], workspaceId: string | null): WorkspaceItem | null {
  if (!workspaceId) {
    return null
  }

  for (const project of projects) {
    const workspace = project.workspaces.find((entry) => entry.id === workspaceId)

    if (workspace) {
      return workspace
    }
  }

  return null
}

export function workerName(workspace: WorkspaceItem): string {
  const names = new Set(workspace.workers.map((worker) => worker.name))
  let index = 1

  while (names.has(`Worker ${index}`)) {
    index += 1
  }

  return `Worker ${index}`
}

function parseProject(value: unknown): ProjectItem[] {
  if (!isRecord(value)) {
    return []
  }

  const id = readString(value.id)
  const name = readString(value.name)
  const folderPath = readString(value.folderPath)

  if (!id || !name || !folderPath) {
    return []
  }

  return [
    {
      id,
      name,
      folderPath,
      workspaces: Array.isArray(value.workspaces) ? value.workspaces.flatMap(parseWorkspace) : []
    }
  ]
}

function parseWorkspace(value: unknown): WorkspaceItem[] {
  if (!isRecord(value)) {
    return []
  }

  const id = readString(value.id)
  const name = readString(value.name)

  if (!id || !name) {
    return []
  }

  return [
    {
      id,
      name,
      workers: Array.isArray(value.workers) ? value.workers.flatMap(parseWorker) : []
    }
  ]
}

function parseWorker(value: unknown): WorkerItem[] {
  if (!isRecord(value)) {
    return []
  }

  const id = readString(value.id)
  const name = readString(value.name)
  const harness = value.harness
  const model = readOptionalString(value.model)
  const effort = readOptionalString(value.effort)

  if (!id || !name || (harness !== 'pi' && harness !== 'codex')) {
    return []
  }

  return [{ id, name, harness, model, effort }]
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readOptionalString(value: unknown): string | null {
  return readString(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
