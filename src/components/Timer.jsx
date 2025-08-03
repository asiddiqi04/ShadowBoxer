import { useEffect, useRef, useState } from 'react';

function Timer({ onRoundEnd, isRunning, setIsRunning }) {
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes in seconds
  const timerRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsRunning(false);
            onRoundEnd?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerRef.current);
  }, [isRunning, setIsRunning, onRoundEnd]);

  const formatTime = (seconds) => {
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleStart = () => {
    setTimeLeft(180); // reset
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
  };

  return (
    <div className="text-center my-4">
      <h2 className="text-4xl font-bold">{formatTime(timeLeft)}</h2>
      <div className="mt-2 space-x-2">
        {!isRunning && timeLeft === 180 && (
          <button onClick={handleStart} className="px-4 py-2 bg-green-600 text-white rounded">Start Round</button>
        )}
        {!isRunning && timeLeft < 180 && timeLeft > 0 && (
          <button onClick={() => setIsRunning(true)} className="px-4 py-2 bg-blue-600 text-white rounded">Resume</button>
        )}
        {isRunning && (
          <button onClick={handlePause} className="px-4 py-2 bg-yellow-500 text-white rounded">Pause</button>
        )}
      </div>
    </div>
  );
}

export default Timer;
