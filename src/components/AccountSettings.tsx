import { useState } from 'react'
import SettingsSection from './settings/SettingsSection'
import SettingToggle from './settings/SettingToggle'

interface AccountSettingsProps {
  email: string
  displayName: string
}

export default function AccountSettings({ email, displayName }: AccountSettingsProps) {
  const [dailyDigest, setDailyDigest] = useState(true)
  const [breakingAlerts, setBreakingAlerts] = useState(false)
  const [privateHistory, setPrivateHistory] = useState(true)
  const [exportFormat, setExportFormat] = useState<'markdown' | 'plain'>('markdown')

  return (
    <div className="settings-page">
      <div className="settings-header">
        <span className="settings-kicker">Account</span>
        <h2>Account Settings</h2>
        <p>Manage your profile preferences and news delivery behavior.</p>
      </div>

      <SettingsSection title="Profile" subtitle="Basic account identity used across Open News.">
        <div className="settings-static-grid">
          <div className="settings-static-field">
            <span>Name</span>
            <strong>{displayName}</strong>
          </div>
          <div className="settings-static-field">
            <span>Email</span>
            <strong>{email}</strong>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Notifications" subtitle="Control how updates reach you.">
        <SettingToggle
          label="Daily Digest"
          description="Receive a consolidated summary of your tracked stories."
          checked={dailyDigest}
          onChange={setDailyDigest}
        />
        <SettingToggle
          label="Breaking Alerts"
          description="Surface urgent high-impact stories in your feed view."
          checked={breakingAlerts}
          onChange={setBreakingAlerts}
        />
      </SettingsSection>

      <SettingsSection title="Privacy & Export" subtitle="Set your data and report defaults.">
        <SettingToggle
          label="Private History"
          description="Keep your local search history visible only to this profile."
          checked={privateHistory}
          onChange={setPrivateHistory}
        />
        <div className="settings-select-row">
          <span>Default Export Format</span>
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'markdown' | 'plain')}>
            <option value="markdown">Markdown Brief</option>
            <option value="plain">Plain Text Brief</option>
          </select>
        </div>
      </SettingsSection>
    </div>
  )
}
