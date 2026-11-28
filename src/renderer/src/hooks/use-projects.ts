import { useEffect, useMemo, useState } from 'react'

import type { HarnessId } from '../../../shared/harness'
import {
  firstWorkerId,
  firstWorkspaceId,
  loadProjectsState,
  saveProjectsState,
  workerName,
  type ProjectItem,
  type ProjectsState,
  type WorkerItem,
  type WorkspaceItem
} from '@/lib/projects'

type UseProjectsResult = {
  projects: ProjectItem[]
  activeWorkspaceId: string | null
  activeWorkerId: string | null
  activeProject: ProjectItem | null
  activeWorkspace: WorkspaceItem | null
  activeWorker: WorkerItem | null
  setActiveWorkspaceId: (workspaceId: string) => void
  setActiveWorker: (workspaceId: string, workerId: string) => void
  createProject: (name: string, folderPath: string) => ProjectItem
  createWorkspace: (projectId: string, name: string) => WorkspaceItem | null
  deleteProject: (projectId: string) => void
  deleteWorkspace: (workspaceId: string) => void
  addWorker: (workspaceId: string, harness: HarnessId) => WorkerItem | null
  updateWorkerOptions: (
    workspaceId: string,
    workerId: string,
    options: { model: string; effort: string | null }
  ) => void
  deleteWorker: (workspaceId: string, workerId: string) => void
}

export function useProjects(): UseProjectsResult {
  const [state, setState] = useState<ProjectsState>(loadProjectsState)

  useEffect(() => {
    saveProjectsState(state)
  }, [state])

  const activeProject = useMemo(
    () =>
      state.projects.find((project) =>
        project.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ) ?? null,
    [state.activeWorkspaceId, state.projects]
  )

  const activeWorkspace = useMemo(() => {
    if (!activeProject) {
      return null
    }

    return (
      activeProject.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null
    )
  }, [activeProject, state.activeWorkspaceId])

  const activeWorker = useMemo(
    () => activeWorkspace?.workers.find((worker) => worker.id === state.activeWorkerId) ?? null,
    [activeWorkspace, state.activeWorkerId]
  )

  const createProject = (name: string, folderPath: string): ProjectItem => {
    const project: ProjectItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      folderPath: folderPath.trim(),
      workspaces: []
    }

    setState((current) => ({
      ...current,
      projects: [...current.projects, project]
    }))

    return project
  }

  const createWorkspace = (projectId: string, name: string): WorkspaceItem | null => {
    const project = state.projects.find((entry) => entry.id === projectId)

    if (!project) {
      return null
    }

    const workspace: WorkspaceItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      workers: []
    }

    setState((current) => ({
      ...current,
      projects: current.projects.map((entry) =>
        entry.id === projectId ? { ...entry, workspaces: [...entry.workspaces, workspace] } : entry
      ),
      activeWorkspaceId: workspace.id,
      activeWorkerId: null
    }))

    return workspace
  }

  const deleteProject = (projectId: string): void => {
    setState((current) => {
      const projects = current.projects.filter((project) => project.id !== projectId)

      return {
        projects,
        ...resolveSelection(projects, current.activeWorkspaceId, current.activeWorkerId)
      }
    })
  }

  const deleteWorkspace = (workspaceId: string): void => {
    setState((current) => {
      const projects = current.projects.map((project) => ({
        ...project,
        workspaces: project.workspaces.filter((workspace) => workspace.id !== workspaceId)
      }))

      return {
        projects,
        ...resolveSelection(projects, current.activeWorkspaceId, current.activeWorkerId)
      }
    })
  }

  const addWorker = (workspaceId: string, harness: HarnessId): WorkerItem | null => {
    const workspace = findWorkspace(state.projects, workspaceId)

    if (!workspace) {
      return null
    }

    const worker: WorkerItem = {
      id: crypto.randomUUID(),
      name: workerName(workspace),
      harness,
      model: null,
      effort: null
    }

    setState((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        workspaces: project.workspaces.map((entry) =>
          entry.id === workspaceId ? { ...entry, workers: [...entry.workers, worker] } : entry
        )
      })),
      activeWorkspaceId: workspaceId,
      activeWorkerId: worker.id
    }))

    return worker
  }

  const deleteWorker = (workspaceId: string, workerId: string): void => {
    setState((current) => {
      const projects = current.projects.map((project) => ({
        ...project,
        workspaces: project.workspaces.map((workspace) =>
          workspace.id === workspaceId
            ? {
                ...workspace,
                workers: workspace.workers.filter((worker) => worker.id !== workerId)
              }
            : workspace
        )
      }))

      return {
        projects,
        ...resolveSelection(projects, current.activeWorkspaceId, current.activeWorkerId)
      }
    })
  }

  const updateWorkerOptions = (
    workspaceId: string,
    workerId: string,
    options: { model: string; effort: string | null }
  ): void => {
    setState((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        workspaces: project.workspaces.map((workspace) =>
          workspace.id === workspaceId
            ? {
                ...workspace,
                workers: workspace.workers.map((worker) =>
                  worker.id === workerId ? { ...worker, ...options } : worker
                )
              }
            : workspace
        )
      }))
    }))
  }

  return {
    projects: state.projects,
    activeWorkspaceId: state.activeWorkspaceId,
    activeWorkerId: state.activeWorkerId,
    activeProject,
    activeWorkspace,
    activeWorker,
    setActiveWorkspaceId: (workspaceId) =>
      setState((current) => {
        const workspace = findWorkspace(current.projects, workspaceId)

        if (!workspace) {
          return current
        }

        return {
          ...current,
          activeWorkspaceId: workspaceId,
          activeWorkerId: workspace.workers.some((worker) => worker.id === current.activeWorkerId)
            ? current.activeWorkerId
            : firstWorkerId(workspace)
        }
      }),
    setActiveWorker: (workspaceId, workerId) =>
      setState((current) => {
        const workspace = findWorkspace(current.projects, workspaceId)

        if (!workspace?.workers.some((worker) => worker.id === workerId)) {
          return current
        }

        return { ...current, activeWorkspaceId: workspaceId, activeWorkerId: workerId }
      }),
    createProject,
    createWorkspace,
    deleteProject,
    deleteWorkspace,
    addWorker,
    updateWorkerOptions,
    deleteWorker
  }
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

function resolveSelection(
  projects: ProjectItem[],
  preferredWorkspaceId: string | null,
  preferredWorkerId: string | null
): Pick<ProjectsState, 'activeWorkspaceId' | 'activeWorkerId'> {
  const workspace =
    findWorkspace(projects, preferredWorkspaceId) ??
    findWorkspace(projects, firstWorkspaceId(projects))

  return {
    activeWorkspaceId: workspace?.id ?? null,
    activeWorkerId:
      workspace?.workers.find((worker) => worker.id === preferredWorkerId)?.id ??
      firstWorkerId(workspace)
  }
}
