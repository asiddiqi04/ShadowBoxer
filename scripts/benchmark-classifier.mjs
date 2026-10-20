import { classifyPunch } from '../frontend/src/training/punchClassifier.js'
const frames = Array.from({ length: 40 }, (_, i) => ({
  time: 1000 + i * 25,
  keypoints: [
    { name: 'nose', x: 150, y: 80 },
    { name: 'left_shoulder', x: 100, y: 100 },
    { name: 'right_shoulder', x: 200, y: 100 },
    { name: 'left_elbow', x: 150, y: 100 },
    { name: 'right_elbow', x: 150, y: 100 },
    { name: 'left_wrist', x: 120 + i * 3, y: 100 },
    { name: 'right_wrist', x: 220 - i * 3, y: 100 },
    { name: 'left_hip', x: 100, y: 220 },
    { name: 'right_hip', x: 200, y: 220 },
  ],
}))
for (let i = 0; i < 1000; i++) classifyPunch(frames, {}, 'intense')
const samples = []
for (let i = 0; i < 10000; i++) {
  const start = performance.now()
  classifyPunch(frames, {}, 'intense')
  samples.push(performance.now() - start)
}
samples.sort((a, b) => a - b)
console.log(
  JSON.stringify(
    {
      environment: `Node ${process.version} ${process.platform}/${process.arch}`,
      frames: 40,
      syntheticCalls: samples.length,
      meanMs: samples.reduce((a, b) => a + b) / samples.length,
      medianMs: samples[5000],
      p95Ms: samples[9500],
    },
    null,
    2,
  ),
)
