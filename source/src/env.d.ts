import type { NotificationAPI, SettingsAPI } from '../shared/types'
declare global { interface Window { weNotice: SettingsAPI; electronAPI: { notification: NotificationAPI } } }
