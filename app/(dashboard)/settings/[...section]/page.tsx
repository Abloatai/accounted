import { notFound } from 'next/navigation'

// Canonical page for the URLs @settingsModal/(.)settings/[[...section]]
// intercepts. Next 16.4 strict route matching requires every intercepted URL
// to have an ordinary page for direct loads; real sections are static siblings
// and win over this catch-all, so only unknown sections land here and 404 as
// they did before.
export default function UnknownSettingsSection() {
  notFound()
}
