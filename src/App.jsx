import Timer from './components/Timer';
import ComboDisplay from './components/ComboDisplay';
import PoseDetector from './components/PoseDetector';
import PoseDetectorBlaze from './components/PoseDetectorBlaze';
import { useState } from 'react';

function App() {
  const [isRunning, setIsRunning] = useState(false);

  const handleRoundEnd = () => {
    setIsRunning(false);
    alert("Round over!");
  };

  return (
    

      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        
        <h1 className="text-3xl font-semibold mb-4">Boxing Practice</h1>
        
        <Timer
          onRoundEnd={handleRoundEnd}
          isRunning={isRunning}
          setIsRunning={setIsRunning}
        />
        <ComboDisplay isRunning={isRunning} />
        {/* <PoseDetector isRunning={isRunning} /> */}
        <PoseDetectorBlaze isRunning={isRunning} />

        
      </div>
    
  );
}

export default App;
