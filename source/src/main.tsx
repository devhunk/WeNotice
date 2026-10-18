import React from 'react'
import { createRoot } from 'react-dom/client'
import SettingsPage from './pages/SettingsPage'
import NotificationWindow from './pages/NotificationWindow'
const notification = location.hash.startsWith('#/notification')
document.documentElement.dataset.surface = notification ? 'notification' : 'settings'
createRoot(document.getElementById('root')!).render(<React.StrictMode>{notification ? <NotificationWindow /> : <SettingsPage />}</React.StrictMode>)
