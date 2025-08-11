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

  // Jab FSM + tracking
  const jabPhaseRef   = useRef('idle');                  // 'idle' | 'extending' | 'retracting'
  const baseDistRef   = useRef(null);                    // baseline shoulder↔wrist distance in guard
  const distEmaRef    = useRef(null);                    // smoothed (EMA) shoulder↔wrist
  const prevDistRef   = useRef(null);                    // previous smoothed distance
  const peakRef       = useRef({ dist: 0, time: 0 });    // peak extension tracker




  // Add a ref to store pose log synchronously
  const poseLogRef = useRef([]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };


  // const detectJab = (keypoints) => {
  //   const now = Date.now();
  //   const cooldown = 400; // Slightly shorter cooldown
  //   //if (now - lastJabTime < cooldown) return;
  //   if (now - lastJabTimeRef.current < cooldown) return;
  
  //   const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
  //   const leftElbow = keypoints.find(p => p.name === 'left_elbow');
  //   const leftWrist = keypoints.find(p => p.name === 'left_wrist');
  //   const rightShoulder = keypoints.find(p => p.name === 'right_shoulder');

  //   const rightWrist = keypoints.find(p => p.name === 'right_wrist');
  //   const leftHip = keypoints.find(p => p.name === 'left_hip');
  //   const rightHip = keypoints.find(p => p.name === 'right_hip');

  //   if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder ||
  //       !rightWrist || !leftHip || !rightHip ||
  //       leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
  //       leftWrist.score < 0.6 || rightShoulder.score < 0.6 ||
  //       rightWrist.score < 0.6 || leftHip.score < 0.6 || rightHip.score < 0.6) {
  //     return;
  //   }

  //   // ✅ NEW checks
  //   //const isWristOnCorrectSide = leftWrist.x > rightWrist.x;
  //   const isWristAboveElbows = leftWrist.y < leftElbow.y;

  //   if (!isWristAboveElbows) {
  //     return;
  //   }


  
  //   if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder ||
  //     leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
  //     leftWrist.score < 0.6 || rightShoulder.score < 0.6) {
  //     return;
  //   }
  
  //   const lastEntry = poseLogRef.current[poseLogRef.current.length - 2]; // previous frame
  //   if (!lastEntry) return;
  
  //   const prevWrist = lastEntry.keypoints.find(p => p.name === 'left_wrist');
  //   if (!prevWrist || prevWrist.score < 0.5) return;
  
  //   const dx = leftWrist.x - prevWrist.x;
  //   const dy = leftWrist.y - prevWrist.y;
  //   const speed = Math.sqrt(dx * dx + dy * dy);
  
  //   const shoulderToWristNow = Math.sqrt(
  //     Math.pow(leftWrist.x - leftShoulder.x, 2) +
  //     Math.pow(leftWrist.y - leftShoulder.y, 2)
  //   );
  
  //   const shoulderToWristPrev = Math.sqrt(
  //     Math.pow(prevWrist.x - leftShoulder.x, 2) +
  //     Math.pow(prevWrist.y - leftShoulder.y, 2)
  //   );
  
  //   const isMovingFast = speed > 18;
  //   const isMovingForward = dx > 10;
  //   const isExtending = (shoulderToWristNow - shoulderToWristPrev) > 5;
  //   //const isProperStance = Math.abs(leftShoulder.y - rightShoulder.y) < 30;

  //   // New: Calculate elbow angle and arm extension
  //   const elbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist); // in degrees
  //   const extensionRatio = calculateArmExtension(leftShoulder, leftElbow, leftWrist);

  //   // You can tune these thresholds
  //   const isArmStraight = elbowAngle > 150;
  //   const isArmFullyExtended = extensionRatio < 1.2;

  
  //   let jabConfidence = 0;
  //   if (isMovingFast) jabConfidence += 30;
  //   if (isMovingForward) jabConfidence += 25;
  //   if (isExtending) jabConfidence += 25;
  //   //if (isProperStance) jabConfidence += 20;
  //   if (isArmStraight && isArmFullyExtended) jabConfidence += 25;

  
  //   // console.log("DEBUG Jab Check", {
  //   //   dx: dx.toFixed(1),
  //   //   dy: dy.toFixed(1),
  //   //   speed: speed.toFixed(1),
  //   //   extending: shoulderToWristNow > shoulderToWristPrev,
  //   //   jabConfidence
  //   // });
  
  //   if (jabConfidence >= 70) {
  //     // setLastJabTime(now);
  //     // setJabCount(prev => prev + 1);
  //     lastJabTimeRef.current = now;
  //     jabCountRef.current += 1;

  
  //     const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  //     // console.log(`✅ Jab #${jabCount + 1} detected at ${timestamp}!`);
  //     console.log(`✅ Jab #${jabCountRef.current} detected at ${timestamp}!`);

  //     console.log(`   Pos: x=${leftWrist.x.toFixed(1)}, y=${leftWrist.y.toFixed(1)}`);
  //     return true;
  //   }
  
  //   return false;
  // };
  
  // const detectJab = (keypoints) => {
  //   const now = Date.now();
  //   const cooldown = 300;
  //   if (now - lastJabTimeRef.current < cooldown) return;
  
  //   const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
  //   const leftElbow = keypoints.find(p => p.name === 'left_elbow');
  //   const leftWrist = keypoints.find(p => p.name === 'left_wrist');
  //   const leftHip = keypoints.find(p => p.name === 'left_hip');
  
  //   if (!leftShoulder || !leftElbow || !leftWrist || !leftHip ||
  //       leftShoulder.score < 0.6 || leftElbow.score < 0.6 || 
  //       leftWrist.score < 0.6 || leftHip.score < 0.6) {
  //     return;
  //   }
  
  //   // Make sure wrist is above hips
  //   if (leftWrist.y > leftHip.y) return;
  
  //   const lastEntry = poseLogRef.current[poseLogRef.current.length - 2];
  //   if (!lastEntry) return;
  
  //   const prevWrist = lastEntry.keypoints.find(p => p.name === 'left_wrist');
  //   if (!prevWrist || prevWrist.score < 0.5) return;
  
  //   const dx = leftWrist.x - prevWrist.x;
  //   const dy = leftWrist.y - prevWrist.y;
  //   const speed = Math.sqrt(dx * dx + dy * dy);
  
  //   const shoulderToWristNow = Math.sqrt(
  //     Math.pow(leftWrist.x - leftShoulder.x, 2) +
  //     Math.pow(leftWrist.y - leftShoulder.y, 2)
  //   );
  //   const shoulderToWristPrev = Math.sqrt(
  //     Math.pow(prevWrist.x - leftShoulder.x, 2) +
  //     Math.pow(prevWrist.y - leftShoulder.y, 2)
  //   );
  //   const isMovingFast = speed > 15;
  //   const isMovingAwayFromShoulder = (shoulderToWristNow - shoulderToWristPrev) > 5;
  
  //   // Arm geometry checks
  //   const elbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist); // degrees
  //   const extensionRatio = calculateArmExtension(leftShoulder, leftElbow, leftWrist);
  //   const isArmStraight = elbowAngle > 150;
  //   const isArmFullyExtended = extensionRatio < 1.2;
  
  //   // Scoring system
  //   let jabConfidence = 0;
  //   if (isMovingFast) jabConfidence += 25;
  //   if (isMovingAwayFromShoulder) jabConfidence += 25;
  //   if (isArmStraight) jabConfidence += 25;
  //   if (isArmFullyExtended) jabConfidence += 25;
  
  //   if (jabConfidence >= 70) {
  //     lastJabTimeRef.current = now;
  //     jabCountRef.current += 1;
  
  //     const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  //     console.log(`✅ Jab #${jabCountRef.current} detected at ${timestamp}!`);
  //     return true;
  //   }
  
  //   return false;
  // };

  const detectJab = (keypoints) => {
    const now = Date.now();
    const cooldown = 400;
    if (now - lastJabTimeRef.current < cooldown) return;
  
    const leftWrist = keypoints.find(p => p.name === 'left_wrist');
    const leftElbow = keypoints.find(p => p.name === 'left_elbow');
    const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
    const nose = keypoints.find(p => p.name === 'nose');
    const leftEye = keypoints.find(p => p.name === 'left_eye');
    const rightEye = keypoints.find(p => p.name === 'right_eye');
  
    if (
      !leftWrist || !leftElbow || !leftShoulder || !nose || !leftEye || !rightEye ||
      leftWrist.score < 0.6 || leftElbow.score < 0.6 || leftShoulder.score < 0.6 || nose.score < 0.5
    ) return;
  
    const lastEntry = poseLogRef.current[poseLogRef.current.length - 2];
    if (!lastEntry) return;
    const prevWrist = lastEntry.keypoints.find(p => p.name === 'left_wrist');
    if (!prevWrist || prevWrist.score < 0.5) return;
  
    const dy = prevWrist.y - leftWrist.y;
    const dx = leftWrist.x - leftShoulder.x;
    const speedY = Math.abs(dy);
    const speedTotal = Math.hypot(leftWrist.x - prevWrist.x, dy);
  
    const elbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist);
    const isArmStraight = elbowAngle > 120;
  
    const movedUpFast = speedY > 6 && dy > 0;
    const crossedBody = dx > 0.5;
  
    const avgEyeY = (leftEye.y + rightEye.y) / 2;
    const aboveEyes = leftWrist.y < avgEyeY + 10;
  
    const eyeDistance = Math.abs(leftEye.x - rightEye.x);
    const closeToNose = Math.abs(leftWrist.x - nose.x) < eyeDistance * 1.5;
  
    // Scoring
    let jabConfidence = 0;
    if (movedUpFast) jabConfidence += 25;
    if (crossedBody) jabConfidence += 20;
    if (closeToNose) jabConfidence += 10;
    if (isArmStraight) jabConfidence += 20;
  
    if (jabConfidence >= 45) {
      lastJabTimeRef.current = now;
      jabCountRef.current += 1;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      console.log(`✅ Front jab #${jabCountRef.current} detected at ${timestamp}!`);
      return true;
    }
  
    return false;
  };
  
  
  
  

  // Detect JAB O3 V1
  // const detectJab = (keypoints) => {
  //   const now = Date.now();
  //   const cooldownMs = 350; // minimum time between completed jabs
  //   if (now - lastJabTimeRef.current < cooldownMs) return;
  
  //   // ---- keypoints we need
  //   const leftShoulder = keypoints.find(p => p.name === 'left_shoulder');
  //   const leftElbow    = keypoints.find(p => p.name === 'left_elbow');
  //   const leftWrist    = keypoints.find(p => p.name === 'left_wrist');
  //   const leftHip      = keypoints.find(p => p.name === 'left_hip');
  
  //   if (!leftShoulder || !leftElbow || !leftWrist || !leftHip ||
  //       leftShoulder.score < 0.6 || leftElbow.score < 0.6 ||
  //       leftWrist.score < 0.6   || leftHip.score < 0.6) {
  //     return;
  //   }
  
  //   // Hard filter: wrist must be above hips (front-stance guard height)
  //   if (leftWrist.y > leftHip.y) {
  //     // reset to idle if we dropped the hand
  //     jabPhaseRef.current = 'idle';
  //     baseDistRef.current = null; // relearn baseline next time
  //     return;
  //   }
  
  //   // ---- distances (shoulder↔wrist) as forward proxy
  //   const dist = Math.hypot(leftWrist.x - leftShoulder.x, leftWrist.y - leftShoulder.y);
  
  //   // EMA smoothing to reduce jitter
  //   const alpha = 0.3;
  //   if (distEmaRef.current == null) distEmaRef.current = dist;
  //   else distEmaRef.current = (1 - alpha) * distEmaRef.current + alpha * dist;
  
  //   const distNow = distEmaRef.current;
  //   const distPrev = prevDistRef.current ?? distNow;
  //   const dDist = distNow - distPrev; // "velocity" in px per sampled frame (~15 fps)
  
  //   // Learn/update baseline only when idle (hand near guard)
  //   if (jabPhaseRef.current === 'idle') {
  //     if (baseDistRef.current == null) {
  //       baseDistRef.current = distNow;
  //     } else {
  //       // slow update toward resting distance while idle
  //       baseDistRef.current = 0.98 * baseDistRef.current + 0.02 * distNow;
  //     }
  //   }
  
  //   const base = baseDistRef.current ?? distNow;
  
  //   // ---- thresholds (tune as needed for your camera/room)
  //   const START_EXT_VEL      = 6;    // px/frame to consider "extension starting"
  //   const MIN_PEAK_DELTA     = 40;   // peak must be at least this far beyond baseline
  //   const RETURN_DELTA       = 15;   // must retract back within base + RETURN_DELTA
  //   const MAX_RETRACT_TIME   = 650;  // ms allowed to retract after peak
  //   const MIN_PEAK_ANGLE     = 145;  // elbow angle at/near peak (straight-ish)
  //   const MAX_EXT_RATIO      = 1.18; // (shoulder–elbow + elbow–wrist)/shoulder–wrist
  
  //   // At/near peak: check geometry (straight jab vs. other extension)
  //   const elbowAngleDeg   = calculateElbowAngle(leftShoulder, leftElbow, leftWrist);
  //   const extensionRatio  = calculateArmExtension(leftShoulder, leftElbow, leftWrist);
  
  //   // ---- FSM
  //   switch (jabPhaseRef.current) {
  //     case 'idle': {
  //       // Start extension when distance grows quickly from baseline
  //       if ((distNow - base) > 10 && dDist > START_EXT_VEL) {
  //         jabPhaseRef.current = 'extending';
  //         peakRef.current = { dist: distNow, time: now };
  //       }
  //       break;
  //     }
  
  //     case 'extending': {
  //       // Update peak while extending
  //       if (distNow > peakRef.current.dist) {
  //         peakRef.current = { dist: distNow, time: now };
  //       }
  
  //       // If velocity flips negative, we've hit the peak → evaluate it
  //       if (dDist <= 0) {
  //         const peakDelta = peakRef.current.dist - base;
  
  //         const looksLikeStraightJab =
  //           peakDelta >= MIN_PEAK_DELTA &&
  //           elbowAngleDeg >= MIN_PEAK_ANGLE &&
  //           extensionRatio <= MAX_EXT_RATIO;
  
  //         if (looksLikeStraightJab) {
  //           // move to retracting and wait for a quick return near baseline
  //           jabPhaseRef.current = 'retracting';
  //         } else {
  //           // Not a good peak → reset
  //           jabPhaseRef.current = 'idle';
  //           baseDistRef.current = null;
  //         }
  //       }
  //       break;
  //     }
  
  //     case 'retracting': {
  //       const sincePeak = now - peakRef.current.time;
  
  //       // Success when we come back near baseline quickly (a "snap")
  //       if (distNow <= base + RETURN_DELTA && sincePeak <= MAX_RETRACT_TIME) {
  //         lastJabTimeRef.current = now;
  //         jabCountRef.current += 1;
  //         jabPhaseRef.current = 'idle';
  //         baseDistRef.current = null;
  
  //         const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  //         console.log(`✅ Jab #${jabCountRef.current} at ${timestamp}`);
  //       }
  
  //       // If we took too long or moved away again → reset and try again
  //       if (sincePeak > MAX_RETRACT_TIME && dDist >= 0) {
  //         jabPhaseRef.current = 'idle';
  //         baseDistRef.current = null;
  //       }
  //       break;
  //     }
  
  //     default:
  //       jabPhaseRef.current = 'idle';
  //       baseDistRef.current = null;
  //   }
  
  //   prevDistRef.current = distNow;
  // };
  
  // O3 V2

  // const detectJab = (keypoints) => {
  //   const now = Date.now();
  //   const COOLDOWN_MS = 350;
  //   if (now - lastJabTimeRef.current < COOLDOWN_MS) return;
  
  //   // ---- pull points
  //   const LS   = keypoints.find(p => p.name === 'left_shoulder');
  //   const RS   = keypoints.find(p => p.name === 'right_shoulder');
  //   const LE   = keypoints.find(p => p.name === 'left_elbow');
  //   const LW   = keypoints.find(p => p.name === 'left_wrist');
  //   const LH   = keypoints.find(p => p.name === 'left_hip');
  //   const Nose = keypoints.find(p => p.name === 'nose');
  
  //   if (!LS || !RS || !LE || !LW || !LH || !Nose) return;
  //   if (LS.score < 0.6 || RS.score < 0.6 || LE.score < 0.6 || LW.score < 0.6 || LH.score < 0.6 || Nose.score < 0.6) return;
  
  //   // Hard gate: wrist must be above hips (not a low reach)
  //   if (LW.y > LH.y) {
  //     jabPhaseRef.current = 'idle';
  //     baseDistRef.current = null;
  //     distEmaRef.current  = null;
  //     prevDistRef.current = null;
  //     return;
  //   }
  
  //   // ---- helpers
  //   const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  
  //   // Shoulder width to normalize thresholds (works at different camera distances)
  //   const SW = Math.max(1, dist(LS, RS));
  
  //   // Shoulder↔wrist distance as a proxy for "forward" extension
  //   const D  = dist(LW, LS);
  
  //   // Smooth with an EMA to reduce jitter
  //   const ALPHA = 0.3;
  //   if (distEmaRef.current == null) distEmaRef.current = D;
  //   else distEmaRef.current = (1 - ALPHA) * distEmaRef.current + ALPHA * D;
  
  //   const Dsm     = distEmaRef.current;
  //   const DsmPrev = prevDistRef.current ?? Dsm;
  //   const dD      = Dsm - DsmPrev; // pseudo-velocity per sample (~66ms)
  
  //   // Learn guard baseline only when idle
  //   if (jabPhaseRef.current === 'idle') {
  //     if (baseDistRef.current == null) baseDistRef.current = Dsm;
  //     else baseDistRef.current = 0.98 * baseDistRef.current + 0.02 * Dsm;
  //   }
  //   const Dbase = baseDistRef.current ?? Dsm;
  
  //   // ---- guard box (keeps starts near a realistic guard)
  //   const shoulderY  = Math.min(LS.y, RS.y);
  //   const guardXmin  = LS.x   - 0.20 * SW;
  //   const guardXmax  = Nose.x + 0.40 * SW;
  //   const guardYmin  = shoulderY - 0.30 * SW;
  //   const guardYmax  = shoulderY + 0.60 * SW;
  //   const inGuardBox = (LW.x >= guardXmin && LW.x <= guardXmax && LW.y >= guardYmin && LW.y <= guardYmax);
  
  //   // ---- thresholds (normalized by SW)
  //   const START_EXT_GROWTH = 0.15 * SW;  // how far beyond baseline to consider extending
  //   const START_EXT_VEL    = 0.10 * SW;  // extension speed to start
  //   const MIN_PEAK_DELTA   = 0.55 * SW;  // min extension at peak
  //   const RETURN_DELTA     = 0.25 * SW;  // must retract back within baseline + this
  //   const MAX_RETRACT_TIME = 650;        // ms to retract after peak
  //   const MIN_ELBOW_ANGLE  = 150;        // degrees at/near peak (straight-ish)
  //   const MAX_EXT_RATIO    = 1.18;       // (SE + EW)/SW (straight-line) ratio near peak
  
  //   // Geometry at current frame (used at peak validation)
  //   const elbowAngleDeg  = calculateElbowAngle(LS, LE, LW);
  //   const extensionRatio = calculateArmExtension(LS, LE, LW);
  
  //   // ---- FSM
  //   switch (jabPhaseRef.current) {
  //     case 'idle': {
  //       // only allow starts from a reasonable guard
  //       if (inGuardBox && (Dsm - Dbase) > START_EXT_GROWTH && dD > START_EXT_VEL) {
  //         jabPhaseRef.current = 'extending';
  //         peakRef.current = { dist: Dsm, time: now };
  //       }
  //       break;
  //     }
  
  //     case 'extending': {
  //       // update peak while growing
  //       if (Dsm > peakRef.current.dist) {
  //         peakRef.current = { dist: Dsm, time: now };
  //       }
  //       // velocity flipped (no longer increasing) → reached peak: validate it
  //       if (dD <= 0) {
  //         const peakDelta = peakRef.current.dist - Dbase;
  
  //         const nearCenterline = Math.abs(LW.x - Nose.x) <= 0.45 * SW;
  //         const straightJab    = (elbowAngleDeg >= MIN_ELBOW_ANGLE) && (extensionRatio <= MAX_EXT_RATIO);
  
  //         if (peakDelta >= MIN_PEAK_DELTA && nearCenterline && straightJab && LW.y < LH.y) {
  //           jabPhaseRef.current = 'retracting';
  //         } else {
  //           // not a valid jab → reset and relearn base
  //           jabPhaseRef.current = 'idle';
  //           baseDistRef.current = null;
  //         }
  //       }
  //       break;
  //     }
  
  //     case 'retracting': {
  //       const sincePeak = now - peakRef.current.time;
  //       // success when we snap back near baseline quickly
  //       if (Dsm <= Dbase + RETURN_DELTA && sincePeak <= MAX_RETRACT_TIME) {
  //         lastJabTimeRef.current = now;
  //         jabCountRef.current += 1;
  //         jabPhaseRef.current = 'idle';
  //         baseDistRef.current = null;
  
  //         const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  //         console.log(`✅ Jab #${jabCountRef.current} at ${timestamp}`);
  //       }
  //       // took too long or started moving away again → reset
  //       if (sincePeak > MAX_RETRACT_TIME && dD >= 0) {
  //         jabPhaseRef.current = 'idle';
  //         baseDistRef.current = null;
  //       }
  //       break;
  //     }
  
  //     default:
  //       jabPhaseRef.current = 'idle';
  //       baseDistRef.current = null;
  //   }
  
  //   prevDistRef.current = Dsm;
  // };
  

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
            drawKeypoints(keypoints, ctx, canvas.width);
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