import { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';
import '@mediapipe/pose';

function PoseDetectorBlaze() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const [jabCount, setJabCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState({});
  const [testMode, setTestMode] = useState(false);

  const lastJabTimeRef = useRef(0);
  const jabCountRef = useRef(0);
  const poseLogRef = useRef([]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };

  const calculateElbowAngle = (shoulder, elbow, wrist) => {
    const a = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
    const b = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
    const c = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
    const angle = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    return (angle * 180) / Math.PI;
  };

  const calculate3DDistance = (point1, point2) => {
    if (!point1.z || !point2.z) return null;
    return Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + 
      Math.pow(point2.y - point1.y, 2) + 
      Math.pow(point2.z - point1.z, 2)
    );
  };

  const detectJab = (keypoints) => {
    const now = Date.now();
    const cooldown = 400; // Reduced cooldown for more responsive detection
    if (now - lastJabTimeRef.current < cooldown) return;

    const get = name => keypoints.find(p => p.name === name && p.score > 0.5);

    const leftWrist = get('left_wrist');
    const leftElbow = get('left_elbow');
    const leftShoulder = get('left_shoulder');
    const rightShoulder = get('right_shoulder');
    const nose = get('nose');
    const leftEye = get('left_eye');
    const rightEye = get('right_eye');

    if (!leftWrist || !leftElbow || !leftShoulder || !nose || !leftEye || !rightEye) return;

    const lastEntry = poseLogRef.current[poseLogRef.current.length - 2];
    if (!lastEntry) return;

    const prevWrist = lastEntry.keypoints.find(p => p.name === 'left_wrist');
    if (!prevWrist || prevWrist.score < 0.4) return;

    // 2D movement analysis - focus on essential jab patterns
    const dy = prevWrist.y - leftWrist.y; // Positive means moving up
    const dx = leftWrist.x - leftShoulder.x; // Positive means crossed body
    const speedY = Math.abs(dy);
    const speedTotal = Math.hypot(leftWrist.x - prevWrist.x, dy);

    // 3D movement analysis (simplified for front-facing)
    let depthMovement = 0;
    if (leftWrist.z && prevWrist.z) {
      depthMovement = prevWrist.z - leftWrist.z; // Positive means moving forward
    }

    const elbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist);
    const isArmStraight = elbowAngle > 120; // More lenient for front-facing

    // Simplified jab detection for front-facing user
    const movedUpFast = speedY > 5 && dy > 0; // Reduced threshold
    const crossedBody = dx > 0.2; // Reduced threshold for front-facing
    const movedForward = depthMovement > 0.05; // Any forward movement

    const avgEyeY = (leftEye.y + rightEye.y) / 2;
    const aboveEyes = leftWrist.y < avgEyeY + 20; // More lenient

    const eyeDistance = Math.abs(leftEye.x - rightEye.x);
    const closeToNose = Math.abs(leftWrist.x - nose.x) < eyeDistance * 2.0; // More lenient

    // Simplified confidence calculation
    let jabConfidence = 0;
    let confidenceDetails = {};

    // Core jab movement (upward + forward)
    if (movedUpFast) {
      jabConfidence += 35;
      confidenceDetails.movedUpFast = true;
    }
    if (movedForward) {
      jabConfidence += 25;
      confidenceDetails.movedForward = true;
    }

    // Supporting criteria
    if (crossedBody) {
      jabConfidence += 20;
      confidenceDetails.crossedBody = true;
    }
    if (isArmStraight) {
      jabConfidence += 15;
      confidenceDetails.isArmStraight = true;
    }
    if (closeToNose) {
      jabConfidence += 10;
      confidenceDetails.closeToNose = true;
    }
    if (aboveEyes) {
      jabConfidence += 10;
      confidenceDetails.aboveEyes = true;
    }

    // Additional 3D-based confidence (simplified)
    if (leftWrist.z && leftShoulder.z) {
      const wristDepth = leftWrist.z;
      const shoulderDepth = leftShoulder.z;
      if (wristDepth < shoulderDepth - 0.05) { // Wrist is closer to camera than shoulder
        jabConfidence += 10;
        confidenceDetails.wristForward = true;
      }
    }

    confidenceDetails.totalConfidence = jabConfidence;
    confidenceDetails.depthMovement = depthMovement;
    confidenceDetails.speedY = speedY;
    confidenceDetails.elbowAngle = elbowAngle;

    // Lower threshold for front-facing detection
    if (jabConfidence >= 40) { // Reduced threshold
      lastJabTimeRef.current = now;
      jabCountRef.current += 1;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      console.log(`✅ BlazePose Jab #${jabCountRef.current} at ${timestamp}`, confidenceDetails);
      setDebugInfo(confidenceDetails);
    } else {
      setDebugInfo(confidenceDetails);
    }

    // Test mode: log all metrics for debugging
    if (testMode && jabConfidence > 20) {
      console.log('🔍 Test Mode - Jab Metrics:', {
        speedY,
        dy,
        dx,
        depthMovement,
        elbowAngle,
        jabConfidence,
        confidenceDetails
      });
    }
  };

  const drawKeypoints = (keypoints, ctx, canvasWidth) => {
    keypoints.forEach((kp) => {
      if (kp.score > 0.5) {
        const x = canvasWidth - kp.x;
        const y = kp.y;
        
        // Color based on depth (if available)
        let color = 'lime';
        if (kp.z !== undefined) {
          // Normalize depth to color (closer = redder, farther = bluer)
          const depth = Math.max(0, Math.min(1, (kp.z + 1) / 2));
          const r = Math.floor(255 * (1 - depth));
          const b = Math.floor(255 * depth);
          color = `rgb(${r}, 255, ${b})`;
        }

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Draw keypoint name
        ctx.fillStyle = 'white';
        ctx.font = '8px Arial';
        ctx.fillText(kp.name, x + 6, y - 6);
        
        // Show depth if available
        if (kp.z !== undefined) {
          ctx.fillStyle = 'yellow';
          ctx.font = '6px Arial';
          ctx.fillText(`z:${kp.z.toFixed(2)}`, x + 6, y + 4);
        }
      }
    });

    // Draw connections for better visualization
    const connections = [
      ['left_shoulder', 'left_elbow'],
      ['left_elbow', 'left_wrist'],
      ['right_shoulder', 'right_elbow'],
      ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'right_shoulder'],
    ];

    connections.forEach(([start, end]) => {
      const startKp = keypoints.find(kp => kp.name === start && kp.score > 0.5);
      const endKp = keypoints.find(kp => kp.name === end && kp.score > 0.5);
      
      if (startKp && endKp) {
        ctx.beginPath();
        ctx.moveTo(canvasWidth - startKp.x, startKp.y);
        ctx.lineTo(canvasWidth - endKp.x, endKp.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  };

  useEffect(() => {
    const runBlazePose = async () => {
      await tf.setBackend('webgl');
      await tf.ready();

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        {
          runtime: 'tfjs',
          modelType: 'full' // Use full model for better 3D accuracy
        }
      );
      detectorRef.current = detector;

      const detect = async () => {
        if (
          webcamRef.current &&
          webcamRef.current.video.readyState === 4 &&
          detectorRef.current
        ) {
          const video = webcamRef.current.video;
          const poses = await detectorRef.current.estimatePoses(video);

          if (poses.length > 0) {
            // Prefer 3D keypoints if available, fallback to 2D
            const keypoints = poses[0].keypoints3D || poses[0].keypoints;
            poseLogRef.current.push({ keypoints, timestamp: Date.now() });
            if (poseLogRef.current.length > 15) poseLogRef.current.shift(); // Keep more history
            detectJab(keypoints);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawKeypoints(keypoints, ctx, canvas.width);
          }
        }

        setTimeout(detect, 50); // Increased to ~20fps for better performance
      };

      detect();
    };

    runBlazePose();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setJabCount(jabCountRef.current);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mt-6 w-[640px] h-[640px]">
      <Webcam
        ref={webcamRef}
        mirrored={true}
        audio={false}
        width={640}
        height={480}
        videoConstraints={videoConstraints}
        className="rounded-lg border border-gray-400 absolute top-0 left-0"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0"
        style={{ width: 640, height: 480 }}
      />
      <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm">
        <div>Jabs (Blaze): {jabCount}</div>
        <div className="text-xs mt-1">
          {debugInfo.totalConfidence && (
            <>
              <div>Confidence: {debugInfo.totalConfidence}</div>
              {debugInfo.depthMovement && (
                <div>Depth: {debugInfo.depthMovement.toFixed(3)}</div>
              )}
              {debugInfo.speedY && (
                <div>Speed Y: {debugInfo.speedY.toFixed(1)}</div>
              )}
              {debugInfo.elbowAngle && (
                <div>Elbow: {debugInfo.elbowAngle.toFixed(0)}°</div>
              )}
            </>
          )}
        </div>
        <button 
          onClick={() => setTestMode(!testMode)}
          className="mt-2 px-2 py-1 bg-blue-600 text-xs rounded hover:bg-blue-700"
        >
          {testMode ? 'Test Mode: ON' : 'Test Mode: OFF'}
        </button>
      </div>
    </div>
  );
}

export default PoseDetectorBlaze;
