import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readCodexModels } from '../configuration/codex'
import { readPiModels } from '../configuration/pi'
import { createTemporaryDirectory, writeJson, writeText } from './helpers'

const temporaryDirectories: Array<() => void> = []
const originalPiAgentDir = process.env.PI_CODING_AGENT_DIR
const originalCodexHome = process.env.CODEX_HOME

afterEach(() => {
  for (const cleanup of temporaryDirectories.splice(0)) {
    cleanup()
  }

  if (originalPiAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR
  } else {
    process.env.PI_CODING_AGENT_DIR = originalPiAgentDir
  }

  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME
  } else {
    process.env.CODEX_HOME = originalCodexHome
  }
})

describe('Pi model configuration', () => {
  it('merges providers, defaults, and reasoning levels', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    process.env.PI_CODING_AGENT_DIR = temporaryDirectory.path

    writeText(
      join(temporaryDirectory.path, 'settings.json'),
      `\uFEFF${JSON.stringify({
        defaultProvider: 'openai',
        defaultModel: 'gpt-5',
        defaultThinkingLevel: 'medium',
        modelThinkingLevels: {
          'acme/reasoner': 'high'
        }
      })}`
    )
    writeJson(join(temporaryDirectory.path, 'models-store.json'), {
      openai: {
        models: [
          {
            id: 'gpt-5',
            name: 'GPT-5',
            reasoning: true,
            thinkingLevelMap: { low: 'low', high: 'high', max: null }
          },
          { id: 'image-gen', name: 'Image Gen', type: 'image' }
        ]
      },
      acme: {
        models: [{ id: 'reasoner', name: 'Reasoner', type: 'chat' }]
      }
    })
    writeJson(join(temporaryDirectory.path, 'models.json'), {
      providers: {
        local: {
          models: [{ id: 'local-chat', name: 'Local Chat' }]
        }
      }
    })

    const models = readPiModels()
    const modelsByValue = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]))

    expect(modelsByValue.get('openai/gpt-5')).toMatchObject({
      name: 'GPT-5',
      reasoningEffort: 'medium',
      reasoningLevels: ['low', 'high'],
      isDefault: true
    })
    expect(modelsByValue.get('acme/reasoner')).toMatchObject({
      name: 'Reasoner',
      reasoningEffort: 'high',
      isDefault: false
    })
    expect(modelsByValue.get('local/local-chat')).toMatchObject({
      name: 'Local Chat',
      reasoningEffort: 'medium',
      isDefault: false
    })
    expect(modelsByValue.has('openai/image-gen')).toBe(false)
    expect(models[0]?.isDefault).toBe(true)
  })

  it('returns no models when configuration files are absent', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    process.env.PI_CODING_AGENT_DIR = temporaryDirectory.path

    expect(readPiModels()).toEqual([])
  })
})

describe('Codex model configuration', () => {
  it('reads a configured catalog and applies configured reasoning effort', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    process.env.CODEX_HOME = temporaryDirectory.path

    writeText(
      join(temporaryDirectory.path, 'config.toml'),
      [
        'model = "openai/gpt-5"',
        'model_reasoning_effort = "high"',
        'model_catalog_json = "catalog.json"'
      ].join('\n')
    )
    writeJson(join(temporaryDirectory.path, 'catalog.json'), {
      models: [
        {
          slug: 'openai/gpt-5',
          display_name: 'GPT-5',
          default_reasoning_level: 'medium',
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }]
        },
        {
          id: 'openai/gpt-mini',
          name: 'GPT Mini',
          default_reasoning_level: 'low'
        }
      ]
    })

    const models = readCodexModels()
    const modelsByValue = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]))

    expect(modelsByValue.get('openai/gpt-5')).toMatchObject({
      name: 'GPT-5',
      reasoningEffort: 'high',
      reasoningLevels: ['low', 'medium', 'high'],
      isDefault: true
    })
    expect(modelsByValue.get('openai/gpt-mini')).toMatchObject({
      name: 'GPT Mini',
      reasoningEffort: 'low',
      isDefault: false
    })
  })

  it('falls back to the model cache and includes the configured model', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    process.env.CODEX_HOME = temporaryDirectory.path

    writeText(join(temporaryDirectory.path, 'config.toml'), 'model = "solo-model"')
    writeJson(join(temporaryDirectory.path, 'models_cache.json'), {
      models: [
        {
          slug: 'catalog-model',
          display_name: 'Catalog Model',
          default_reasoning_level: 'low'
        }
      ]
    })

    const models = readCodexModels()

    expect(models.find((model) => model.id === 'solo-model')).toMatchObject({
      provider: '',
      name: 'solo-model',
      reasoningEffort: null,
      isDefault: true
    })
    expect(models.find((model) => model.id === 'catalog-model')).toMatchObject({
      provider: '',
      name: 'Catalog Model',
      reasoningEffort: 'low',
      isDefault: false
    })
  })
})
