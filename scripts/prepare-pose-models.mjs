import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  copyFileSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(
  new URL('../frontend/public/models/blazepose/', import.meta.url),
)
const cache = fileURLToPath(new URL('../.cache/pose-models/', import.meta.url))
const models = [
  {
    name: 'detector',
    variant: 'detector',
    version: 1,
    sha256: 'cfee06e1c5d4ffb7321ac30b81c906d998e0455c3d676e10bdd98f4a32495a42',
  },
  {
    name: 'landmark-full',
    variant: 'landmark-full',
    version: 2,
    sha256: '8a030c10045ce26583d470dc57f4f82df840033790611c82bb1e588bbb32f347',
  },
]

const isComplete = (directory) => {
  try {
    const model = JSON.parse(
      readFileSync(path.join(directory, 'model.json'), 'utf8'),
    )
    return (
      model.modelTopology &&
      model.weightsManifest?.length &&
      model.weightsManifest.every((group) =>
        group.paths.every(
          (file) =>
            !path.isAbsolute(file) &&
            !file.split('/').includes('..') &&
            existsSync(path.join(directory, file)) &&
            statSync(path.join(directory, file)).size > 0,
        ),
      )
    )
  } catch {
    return false
  }
}

try {
  mkdirSync(root, { recursive: true })
  mkdirSync(cache, { recursive: true })
  for (const model of models) {
    const destination = path.join(root, model.name)
    const temporary = mkdtempSync(path.join(root, '.staging-'))
    try {
      const cachedArchive = path.join(cache, `${model.sha256}.tar.gz`)
      const archive = path.join(temporary, 'model.tar.gz')
      const url = `https://www.kaggle.com/api/v1/models/mediapipe/blazepose-3d/tfJs/${model.variant}/${model.version}/download`
      if (existsSync(cachedArchive)) copyFileSync(cachedArchive, archive)
      else {
        console.log(`Downloading BlazePose ${model.name}…`)
        execFileSync(
          'curl',
          [
            '--fail',
            '--location',
            '--silent',
            '--show-error',
            '--retry',
            '2',
            '--connect-timeout',
            '15',
            '--max-time',
            '120',
            '--output',
            archive,
            url,
          ],
          { stdio: 'inherit' },
        )
      }
      const hash = createHash('sha256')
        .update(readFileSync(archive))
        .digest('hex')
      if (hash !== model.sha256)
        throw new Error(
          `Checksum mismatch for ${model.name}; refusing to use unexpected model files.`,
        )
      copyFileSync(archive, cachedArchive)
      // These exact, checksum-pinned archives contain only the manifest and two shards.
      const staged = path.join(temporary, 'extracted')
      mkdirSync(staged)
      execFileSync('tar', ['-xzf', archive, '-C', staged], { stdio: 'inherit' })
      if (!isComplete(staged))
        throw new Error(`Incomplete ${model.name} model download.`)
      rmSync(destination, { recursive: true, force: true })
      renameSync(staged, destination)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  }
  console.log('BlazePose models ready for local loading.')
} catch (error) {
  console.error(
    `Pose model setup failed: ${error.message}\nCheck your connection and run npm run models:prepare again.`,
  )
  process.exitCode = 1
}
