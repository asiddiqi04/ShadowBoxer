import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  readdir,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('a corrupt cached model fails the build preparation and cleans staging', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'shadowboxer-model-test-'))
  try {
    await mkdir(path.join(root, 'scripts'))
    await mkdir(path.join(root, '.cache/pose-models'), { recursive: true })
    await copyFile(
      new URL('../scripts/prepare-pose-models.mjs', import.meta.url),
      path.join(root, 'scripts/prepare-pose-models.mjs'),
    )
    const source = await readFile(
      new URL('../scripts/prepare-pose-models.mjs', import.meta.url),
      'utf8',
    )
    const hash = source.match(/sha256: '([a-f0-9]+)'/)[1]
    await writeFile(
      path.join(root, '.cache/pose-models', `${hash}.tar.gz`),
      'incomplete archive',
    )
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-pose-models.mjs'],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Checksum mismatch/)
    assert.deepEqual(
      await readdir(path.join(root, 'frontend/public/models/blazepose')),
      [],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
