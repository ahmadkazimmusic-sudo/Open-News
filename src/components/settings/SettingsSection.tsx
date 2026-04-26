import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function SettingsSection({ title, subtitle, children }: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
  )
}
