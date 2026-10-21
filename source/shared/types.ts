export type Position = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' | 'top-center' | 'bottom-center'
export type Theme = 'system' | 'light' | 'dark'
export type NotificationStyle = 'wechat' | 'glass'
export interface Appearance {
  theme: 'auto' | 'light' | 'dark' | 'custom'; background: string; textColor: string; opacity: number;
  avatarSize: number; avatarRadius: number; titleSize: number; bodySize: number; radius: number; padding: number;
  widthMode: 'adaptive' | 'fixed'; width: number; maxLines: number; margin: number; displayId: string;
  showAvatar: boolean; showTime: boolean; showCount: boolean; showBody: boolean;
}
export interface Behavior { hideWhenWechatForeground: boolean; pauseOnHover: boolean; clickAction: 'open' | 'close'; mergePending: boolean; queueLimit: number; historyLimit: number }
export interface QuietPeriod { id: string; days: number[]; start: string; end: string }
export interface NotificationRule {
  id: string; name: string; enabled: boolean;
  condition: { kind: 'all' | 'private' | 'group'; sessionIds: string[]; includes: string[]; excludes: string[] };
  action: { notify: boolean; bypassQuiet: boolean; bypassMuted: boolean; appearance: Partial<Appearance>; position?: Position; durationMs?: number };
}
export const defaultAppearance: Appearance = { theme: 'auto', background: '#fcfdfb', textColor: '#192027', opacity: .96, avatarSize: 40, avatarRadius: 11, titleSize: 13.5, bodySize: 13, radius: 14, padding: 14, widthMode: 'adaptive', width: 380, maxLines: 6, margin: 20, displayId: '', showAvatar: true, showTime: true, showCount: true, showBody: true }
export const defaultBehavior: Behavior = { hideWhenWechatForeground: true, pauseOnHover: false, clickAction: 'open', mergePending: true, queueLimit: 100, historyLimit: 100 }
export interface Settings {
  accountDir: string; accountId: string; libraryPath: string; keyLibraryPath: string;
  enabled: boolean; launchAtLogin: boolean; respectMuted: boolean;
  filterMode: 'all' | 'whitelist' | 'blacklist'; filterIds: string[];
  position: Position; durationMs: number; glass: boolean; notificationStyle: NotificationStyle; pollSeconds: number;
  schemaVersion: 2; ui: { theme: Theme; sidebarCollapsed: boolean }; appearance: Appearance; behavior: Behavior;
  rules: NotificationRule[]; quietHours: { enabled: boolean; periods: QuietPeriod[] };
}
export const defaults: Settings = { accountDir: '', accountId: '', libraryPath: '', keyLibraryPath: '', enabled: true, launchAtLogin: false, respectMuted: true, filterMode: 'all', filterIds: [], position: 'top-right', durationMs: 5000, glass: true, notificationStyle: 'wechat', pollSeconds: 5, schemaVersion: 2, ui: { theme: 'system', sidebarCollapsed: false }, appearance: defaultAppearance, behavior: defaultBehavior, rules: [], quietHours: { enabled: false, periods: [] } }
export interface AccountCandidate { accountDir: string; accountId: string; modifiedAt: number }
export interface AutoProgress { phase: 'detecting' | 'scanning' | 'verifying' | 'saving'; detail: string }
export interface Session { id: string; timestamp: number; unread: number; summary: string }
export interface Message { id: string; sessionId: string; timestamp: number; sortSeq: number; localId: string; sender: string; outgoing: boolean | null; content: string }
export interface Contact { name: string; alias?: string; remark?: string; nickName?: string; avatarUrl?: string; muted: boolean; folded: boolean; statusKnown: boolean }
export interface Notice { id: string; sessionId: string; title: string; content: string; avatarUrl?: string; timestamp: number; count: number; test?: boolean; context?: { rawContent: string; muted: boolean; folded: boolean; statusKnown: boolean; outgoing: boolean | null } }
export interface Status { phase: 'idle' | 'connecting' | 'listening' | 'paused' | 'error'; detail: string; checkedAt?: number; mode?: 'pipe' | 'poll'; capabilities?: string[] }
export interface PublicState { settings: Settings; hasKey: boolean; status: Status; history: Notice[]; autoProgress?: AutoProgress | null; settingsWarning?: string }
export interface DbConfig { accountDir: string; accountId: string; libraryPath: string; key: string }
export interface Backdrop { native: boolean; sourceId?: string; width: number; height: number; winX: number; winY: number }
export interface Presentation { appearance: Appearance; behavior: Behavior; position: Position; durationMs: number; glass: boolean; notificationStyle: NotificationStyle }
export interface DisplayInfo { id: string; label: string; workArea?: { width: number; height: number } }
export interface Delivery extends Presentation { notice: Notice; backdrop: Backdrop; layout?: { width: number; maxWidth: number; maxHeight: number; maxBodyLines: number } }
export interface SettingsAPI {
  state(): Promise<PublicState>; save(settings: Settings, key?: string): Promise<PublicState>;
  choose(kind: 'directory' | 'library'): Promise<string | null>; start(): Promise<void>; pause(): Promise<void>; test(): Promise<void>;
  detectAccounts(directory?: string): Promise<AccountCandidate[]>;
  displays(): Promise<DisplayInfo[]>;
  autoConnect(settings: Settings): Promise<PublicState>; cancelAutoConnect(): Promise<void>;
  onAutoProgress(cb: (progress: AutoProgress | null) => void): () => void;
  onState(cb: (state: PublicState) => void): () => void;
}
export interface NotificationAPI {
  ready(): void; received(id: string): void; close(id: string): void; click(id: string): void;
  resize(id: string, width: number, height: number): void; glassRect(payload: any): void; glassHide(id: string): void;
  hover(id: string, paused: boolean): void;
  onShow(cb: (delivery: Delivery) => void): () => void; onLuma(cb: (bands: any) => void): () => void;
}
