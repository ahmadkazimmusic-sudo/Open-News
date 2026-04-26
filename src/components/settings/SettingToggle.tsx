interface SettingToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export default function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
  return (
    <label className="settings-toggle-row">
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">{label}</span>
        <span className="settings-toggle-description">{description}</span>
      </span>
      <span className={`settings-switch${checked ? ' checked' : ''}`} aria-hidden="true">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-switch-track">
          <span className="settings-switch-thumb" />
        </span>
      </span>
    </label>
  )
}
