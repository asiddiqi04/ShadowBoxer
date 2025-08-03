import { useEffect, useState } from 'react';

const combos = [
  ['Jab', 'Cross'],
  ['Jab', 'Cross', 'Hook'],
  ['Uppercut', 'Hook'],
  ['Jab', 'Jab', 'Cross'],
  ['Cross', 'Hook', 'Uppercut'],
];

function ComboDisplay({ isRunning }) {
  const [currentCombo, setCurrentCombo] = useState([]);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!isRunning) return;

    const setNewCombo = () => {
      const randomCombo = combos[Math.floor(Math.random() * combos.length)];
      setCurrentCombo(randomCombo);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 300); // reset animation flag
    };

    setNewCombo(); // show one right away

    const interval = setInterval(() => {
      setNewCombo();
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <div className="text-center mt-6">
      <h3 className="text-xl mb-2">Current Combo:</h3>
      <div
        className={`transition-all duration-300 text-2xl font-bold space-x-3 ${
          animate ? 'scale-110 text-yellow-400' : 'text-white'
        }`}
      >
        {currentCombo.length > 0 ? (
          currentCombo.map((move, index) => (
            <span key={index}>{move}</span>
          ))
        ) : (
          <span className="text-gray-400">Waiting to start...</span>
        )}
      </div>
    </div>
  );
}

export default ComboDisplay;
