import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function createTemporaryDirectory(prefix = 'shumi-test-'): {
  path: string
  cleanup: () => void
} {
  const path = mkdtempSync(join(tmpdir(), prefix))

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true })
  }
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value))
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

export function writeExecutable(path: string, value = ''): void {
  writeText(path, value)

  if (process.platform !== 'win32') {
    chmodSync(path, 0o755)
  }
}
