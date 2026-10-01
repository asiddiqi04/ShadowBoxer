// Serve the same BlazePose versions used by pose-detection 2.1.3 locally.
// The package's default TF Hub URLs now redirect through Kaggle web endpoints.
export const poseModelConfig = {
  runtime: 'tfjs',
  modelType: 'full',
  detectorModelUrl: '/models/blazepose/detector/model.json',
  landmarkModelUrl: '/models/blazepose/landmark-full/model.json',
}
