// Serve the same BlazePose versions used by pose-detection 2.1.3 locally.
// The package's default TF Hub URLs now redirect through Kaggle web endpoints.
// scripts/prepare-pose-models.mjs downloads these checksum-pinned archives.
export const poseModels = [
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

// The directory embeds the model version and archive hash, so its files never
// change at a given URL and can be cached as immutable (see vercel.json).
export const poseModelDirectory = (model) =>
  `${model.name}-v${model.version}-${model.sha256.slice(0, 12)}`

export const poseModelUrl = (name) =>
  `/models/blazepose/${poseModelDirectory(poseModels.find((model) => model.name === name))}/model.json`

export const poseModelConfig = {
  runtime: 'tfjs',
  modelType: 'full',
  detectorModelUrl: poseModelUrl('detector'),
  landmarkModelUrl: poseModelUrl('landmark-full'),
}
