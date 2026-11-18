// Shown over the live camera before a round so the boxer can get into frame and stance.
function Countdown({ secondsLeft }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/25">
      <p
        key={secondsLeft}
        aria-live="assertive"
        className="countdown-pop display-title text-[9rem] leading-none text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)] sm:text-[12rem]"
      >
        {secondsLeft}
      </p>
      <p className="mt-2 rounded-full bg-slate-950/70 px-5 py-2 text-base font-semibold text-white backdrop-blur-md sm:text-lg">
        Get in your stance
      </p>
      <p className="mt-2 rounded-full bg-slate-950/60 px-4 py-1 text-xs text-slate-200 backdrop-blur-md sm:text-sm">
        Step back until your upper body is in frame
      </p>
    </div>
  )
}

export default Countdown
