import { useEffect, useRef } from 'react'
import AccountPanel from './AccountPanel'

function Toggle({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-white">
          {label}
        </label>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-orange-500"
      />
    </div>
  )
}

function Volume({ id, label, value, disabled, onChange }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <label htmlFor={id} className="w-16 text-xs text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="flex-1 accent-cyan-400 disabled:opacity-40"
      />
      <span className="w-10 text-right text-xs tabular-nums text-slate-300">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

function SettingsDialog({ settings, onChange, onClose, hasMusic, auth }) {
  const closeRef = useRef(null)
  const update = (patch) => onChange({ ...settings, ...patch })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/75 px-4 py-10 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="panel-card w-full max-w-lg p-6 sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="settings-title"
            className="display-title text-4xl text-orange-50"
          >
            Settings
          </h2>
          <button
            ref={closeRef}
            className="action-btn action-btn-ghost"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <h3 className="mt-6 text-xs uppercase tracking-[0.2em] text-cyan-100/85">
          Audio
        </h3>
        <div className="mt-3 space-y-5 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div>
            <Toggle
              id="setting-sfx"
              label="Sound effects"
              description="Punch hits and the incorrect-combo buzzer."
              checked={settings.soundEffects}
              onChange={(soundEffects) => update({ soundEffects })}
            />
            <Volume
              id="setting-sfx-volume"
              label="Volume"
              value={settings.soundEffectsVolume}
              disabled={!settings.soundEffects}
              onChange={(soundEffectsVolume) => update({ soundEffectsVolume })}
            />
          </div>
          {hasMusic && (
            <div>
              <Toggle
                id="setting-music"
                label="Round music"
                description="Background track while a round is running."
                checked={settings.music}
                onChange={(music) => update({ music })}
              />
              <Volume
                id="setting-music-volume"
                label="Volume"
                value={settings.musicVolume}
                disabled={!settings.music}
                onChange={(musicVolume) => update({ musicVolume })}
              />
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Settings are remembered on this device.
        </p>

        <h3 className="mt-6 text-xs uppercase tracking-[0.2em] text-cyan-100/85">
          Account
        </h3>
        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <AccountPanel auth={auth} />
        </div>
      </section>
    </div>
  )
}

export default SettingsDialog
