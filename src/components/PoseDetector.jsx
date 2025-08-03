import { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';

function PoseDetector() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const [poseLog, setPoseLog] = useState([]);
  const [jabState, setJabState] = useState('idle'); // idle, setup, extension, retraction
  const [lastJabTime, setLastJabTime] = useState(0);
  const [jabCount, setJabCount] = useState(0);
  
  const lastJabTimeRef = useRef(0);
  const jabCountRef = useRef(0);


  // Add a ref to store pose log synchronously
  const poseLogRef = useRef([]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };

  // Enhanced jab detection with multiple phases
  // const detectJab = (keypoints) => {
  //   const now = Date.now();
  //   const cooldown = 1000; // 1 second cooldown between jabs
    
  //   if (now - lastJabTime < cooldown) return;

  //   const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
  //   const leftElbow = keypoints.find(p => p.name === 'left_elbow');
  //   const leftWrist = keypoints.find(p => p.name === 'left_wrist');
  //   const rightShoulder = keypoints.find(p => p.name === 'right_shoulder');

  //   // Check if all required keypoints are detected with good confidence
  //   if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder ||
  //       leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
  //       leftWrist.score < 0.6 || rightShoulder.score < 0.6) {
  //     return;
  //   }

  //   // Calculate arm extension
  //   const armExtension = calculateArmExtension(leftShoulder, leftElbow, leftWrist);
    
  //   // Calculate shoulder alignment (for proper stance)
  //   const shoulderAlignment = Math.abs(leftShoulder.y - rightShoulder.y);
    
  //   // SIMPLIFIED APPROACH: Check for upward movement using position relative to shoulder
  //   const isWristAboveShoulder = leftWrist.y < leftShoulder.y; // Wrist is above shoulder (Y is inverted)
  //   const isElbowAboveShoulder = leftElbow.y < leftShoulder.y; // Elbow is above shoulder
    
  //   // Check if wrist is extended forward
  //   const isWristInFront = leftWrist.x > leftShoulder.x;
    
  //   // Check arm extension
  //   const isArmExtended = armExtension > 0.8;
    
  //   // Check proper stance
  //   const isProperStance = shoulderAlignment < 30;
    
  //   // Check if arm is moving upward (simplified - just check if both points are above shoulder)
  //   const isArmMovingUp = isWristAboveShoulder && isElbowAboveShoulder;
    
  //   // Jab confidence scoring - SIMPLIFIED
  //   let jabConfidence = 0;
  //   if (isProperStance) jabConfidence += 15;
  //   if (isArmExtended) jabConfidence += 20;
  //   if (isWristAboveShoulder) jabConfidence += 25; // Primary check - wrist above shoulder
  //   if (isElbowAboveShoulder) jabConfidence += 15; // Secondary check - elbow above shoulder
  //   if (isWristInFront) jabConfidence += 15; // Wrist extended forward
  //   if (isArmMovingUp) jabConfidence += 10; // Bonus for both points above shoulder
    
  //   // DEBUG: Log detection criteria
  //   console.log('DEBUG - Jab Detection Criteria:', {
  //     isWristAboveShoulder,
  //     isElbowAboveShoulder,
  //     isWristInFront,
  //     isArmExtended,
  //     isProperStance,
  //     isArmMovingUp,
  //     jabConfidence,
  //     wristY: leftWrist.y.toFixed(1),
  //     shoulderY: leftShoulder.y.toFixed(1),
  //     elbowY: leftElbow.y.toFixed(1)
  //   });
    
  //   // High confidence jab detection
  //   if (jabConfidence >= 70) {
  //     setLastJabTime(now);
  //     setJabCount(prev => prev + 1);
      
  //     const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  //     console.log(`✅ Jab #${jabCount + 1} detected at ${timestamp}!`);
  //     console.log(`   Confidence: ${jabConfidence}%`);
  //     console.log(`   Wrist above shoulder: ${isWristAboveShoulder}, Elbow above shoulder: ${isElbowAboveShoulder}`);
  //     console.log(`   Position: x=${leftWrist.x.toFixed(1)}, y=${leftWrist.y.toFixed(1)}`);
      
  //     return true;
  //   }
    
  //   return false;
  // };

  const detectJab = (keypoints) => {
    const now = Date.now();
    const cooldown = 300; // Slightly shorter cooldown
    //if (now - lastJabTime < cooldown) return;
    if (now - lastJabTimeRef.current < cooldown) return;
  
    const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
    const leftElbow = keypoints.find(p => p.name === 'left_elbow');
    const leftWrist = keypoints.find(p => p.name === 'left_wrist');
    const rightShoulder = keypoints.find(p => p.name === 'right_shoulder');

    const rightWrist = keypoints.find(p => p.name === 'right_wrist');
    const leftHip = keypoints.find(p => p.name === 'left_hip');
    const rightHip = keypoints.find(p => p.name === 'right_hip');

    if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder ||
        !rightWrist || !leftHip || !rightHip ||
        leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
        leftWrist.score < 0.6 || rightShoulder.score < 0.6 ||
        rightWrist.score < 0.6 || leftHip.score < 0.6 || rightHip.score < 0.6) {
      return;
    }

    // ✅ NEW checks
    //const isWristOnCorrectSide = leftWrist.x > rightWrist.x;
    const isWristAboveElbows = leftWrist.y < leftElbow.y;

    if (!isWristAboveElbows) {
      return;
    }


  
    if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder ||
      leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
      leftWrist.score < 0.6 || rightShoulder.score < 0.6) {
      return;
    }
  
    const lastEntry = poseLogRef.current[poseLogRef.current.length - 2]; // previous frame
    if (!lastEntry) return;
  
    const prevWrist = lastEntry.keypoints.find(p => p.name === 'left_wrist');
    if (!prevWrist || prevWrist.score < 0.5) return;
  
    const dx = leftWrist.x - prevWrist.x;
    const dy = leftWrist.y - prevWrist.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
  
    const shoulderToWristNow = Math.sqrt(
      Math.pow(leftWrist.x - leftShoulder.x, 2) +
      Math.pow(leftWrist.y - leftShoulder.y, 2)
    );
  
    const shoulderToWristPrev = Math.sqrt(
      Math.pow(prevWrist.x - leftShoulder.x, 2) +
      Math.pow(prevWrist.y - leftShoulder.y, 2)
    );
  
    const isMovingFast = speed > 18;
    const isMovingForward = dx > 10;
    const isExtending = (shoulderToWristNow - shoulderToWristPrev) > 5;
    const isProperStance = Math.abs(leftShoulder.y - rightShoulder.y) < 30;

    // New: Calculate elbow angle and arm extension
    const elbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist); // in degrees
    const extensionRatio = calculateArmExtension(leftShoulder, leftElbow, leftWrist);

    // You can tune these thresholds
    const isArmStraight = elbowAngle > 150;
    const isArmFullyExtended = extensionRatio < 1.2;

  
    let jabConfidence = 0;
    if (isMovingFast) jabConfidence += 30;
    if (isMovingForward) jabConfidence += 25;
    if (isExtending) jabConfidence += 25;
    if (isProperStance) jabConfidence += 20;
    if (isArmStraight && isArmFullyExtended) jabConfidence += 25;

  
    // console.log("DEBUG Jab Check", {
    //   dx: dx.toFixed(1),
    //   dy: dy.toFixed(1),
    //   speed: speed.toFixed(1),
    //   extending: shoulderToWristNow > shoulderToWristPrev,
    //   jabConfidence
    // });
  
    if (jabConfidence >= 70) {
      // setLastJabTime(now);
      // setJabCount(prev => prev + 1);
      lastJabTimeRef.current = now;
      jabCountRef.current += 1;

  
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      // console.log(`✅ Jab #${jabCount + 1} detected at ${timestamp}!`);
      console.log(`✅ Jab #${jabCountRef.current} detected at ${timestamp}!`);

      console.log(`   Pos: x=${leftWrist.x.toFixed(1)}, y=${leftWrist.y.toFixed(1)}`);
      return true;
    }
  
    return false;
  };
  

  // Helper functions for jab detection
  const calculateArmExtension = (shoulder, elbow, wrist) => {
    const shoulderToElbow = Math.sqrt(
      Math.pow(elbow.x - shoulder.x, 2) + Math.pow(elbow.y - shoulder.y, 2)
    );
    const elbowToWrist = Math.sqrt(
      Math.pow(wrist.x - elbow.x, 2) + Math.pow(wrist.y - elbow.y, 2)
    );
    const shoulderToWrist = Math.sqrt(
      Math.pow(wrist.x - shoulder.x, 2) + Math.pow(wrist.y - shoulder.y, 2)
    );
    
    // Extension ratio: actual distance vs straight line distance
    return (shoulderToElbow + elbowToWrist) / shoulderToWrist;
  };

  const calculateElbowAngle = (shoulder, elbow, wrist) => {
    const a = Math.sqrt(Math.pow(elbow.x - shoulder.x, 2) + Math.pow(elbow.y - shoulder.y, 2));
    const b = Math.sqrt(Math.pow(wrist.x - elbow.x, 2) + Math.pow(wrist.y - elbow.y, 2));
    const c = Math.sqrt(Math.pow(wrist.x - shoulder.x, 2) + Math.pow(wrist.y - shoulder.y, 2));
    
    const angle = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    return (angle * 180) / Math.PI;
  };

  const drawKeypoints = (keypoints, ctx, canvasWidth) => {
    // Draw all keypoints
    keypoints.forEach((keypoint) => {
      if (keypoint.score > 0.5) {
        const x = canvasWidth - keypoint.x; // flip horizontally
        const y = keypoint.y;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
        
        // Draw keypoint name for debugging
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(keypoint.name, x + 8, y - 8);
      }
    });
    
    // Draw connections for left arm (jab arm)
    const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
    const leftElbow = keypoints.find(p => p.name === 'left_elbow');
    const leftWrist = keypoints.find(p => p.name === 'left_wrist');
    
    if (leftShoulder && leftElbow && leftShoulder.score > 0.5 && leftElbow.score > 0.5) {
      ctx.beginPath();
      ctx.moveTo(canvasWidth - leftShoulder.x, leftShoulder.y);
      ctx.lineTo(canvasWidth - leftElbow.x, leftElbow.y);
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    if (leftElbow && leftWrist && leftElbow.score > 0.5 && leftWrist.score > 0.5) {
      ctx.beginPath();
      ctx.moveTo(canvasWidth - leftElbow.x, leftElbow.y);
      ctx.lineTo(canvasWidth - leftWrist.x, leftWrist.y);
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  useEffect(() => {
    const runPoseDetection = async () => {
      await tf.setBackend('webgl');
      await tf.ready();

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
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
            const keypoints = poses[0].keypoints;
            
            // Update pose log REF synchronously
            const newEntry = { 
              keypoints: keypoints,
              timestamp: Date.now() 
            };
            poseLogRef.current = [...poseLogRef.current, newEntry];
            if (poseLogRef.current.length > 10) {
              poseLogRef.current.shift(); // keep last 10 frames
            }
            
            // Also update state for display purposes
            //setPoseLog(poseLogRef.current);

            // Detect jab
            detectJab(keypoints);

            // Draw keypoints
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            //drawKeypoints(keypoints, ctx, canvas.width);
          }
        }

        //requestAnimationFrame(detect);
        setTimeout(detect, 66); // ~15 FPS

      };

      detect();
    };

    runPoseDetection();
  }, [lastJabTimeRef.current, jabCountRef.current]);

  useEffect(() => {
  const interval = setInterval(() => {
    setJabCount(jabCountRef.current); // sync ref to state every 200ms
  }, 200);

  return () => clearInterval(interval); // cleanup
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
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded">
        <div>Jabs: {jabCountRef.current}</div>
        <div>State: {jabState}</div>
      </div>
    </div>
  );
}

export default PoseDetector;