// Slim glowing bar. percent = null shows an indeterminate sweep.
function LoadingBar({ label, percent = null, className = '' }) {
  const determinate = typeof percent === 'number'
  return (
    <div className={`w-full ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-300">
        <span>{label}</span>
        {determinate && (
          <span className="tabular-nums text-orange-200">{percent}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? percent : undefined}
        className="loading-track"
      >
        <div
          className={
            determinate ? 'loading-fill' : 'loading-fill loading-sweep'
          }
          style={
            determinate ? { width: `${Math.max(percent, 3)}%` } : undefined
          }
        />
      </div>
    </div>
  )
}

export default LoadingBar
