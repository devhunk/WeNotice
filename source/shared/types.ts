export type Position = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' | 'top-center'
export type NotificationStyle = 'wechat' | 'glass'
export interface Settings {
  accountDir: string; accountId: string; libraryPath: string; keyLibraryPath: string;
  enabled: boolean; launchAtLogin: boolean; respectMuted: boolean;
  filterMode: 'all' | 'whitelist' | 'blacklist'; filterIds: string[];
  position: Position; durationMs: number; glass: boolean; notificationStyle: NotificationStyle; pollSeconds: number;
}
export const defaults: Settings = { accountDir: '', accountId: '', libraryPath: '', keyLibraryPath: '', enabled: true, launchAtLogin: false, respectMuted: true, filterMode: 'all', filterIds: [], position: 'top-right', durationMs: 5000, glass: true, notificationStyle: 'wechat', pollSeconds: 5 }
export interface AccountCandidate { accountDir: string; accountId: string; modifiedAt: number }
export interface AutoProgress { phase: 'detecting' | 'scanning' | 'verifying' | 'saving'; detail: string }
export interface Session { id: string; timestamp: number; unread: number; summary: string }
export interface Message { id: string; sessionId: string; timestamp: number; sortSeq: number; localId: string; sender: string; outgoing: boolean | null; content: string }
export interface Contact { name: string; alias?: string; remark?: string; nickName?: string; avatarUrl?: string; muted: boolean; folded: boolean; statusKnown: boolean }
export interface Notice { id: string; sessionId: string; title: string; content: string; avatarUrl?: string; timestamp: number; count: number; test?: boolean }
export interface Status { phase: 'idle' | 'connecting' | 'listening' | 'paused' | 'error'; detail: string; checkedAt?: number; mode?: 'pipe' | 'poll'; capabilities?: string[] }
export interface PublicState { settings: Settings; hasKey: boolean; status: Status; history: Notice[]; autoProgress?: AutoProgress | null }
export interface DbConfig { accountDir: string; accountId: string; libraryPath: string; key: string }
export interface Backdrop { native: boolean; sourceId?: string; width: number; height: number; winX: number; winY: number }
export interface Delivery { notice: Notice; durationMs: number; position: Position; notificationStyle: NotificationStyle; backdrop: Backdrop; layout?: { width: number; maxWidth: number; maxBodyLines: number; maxHeight: number } }
export interface SettingsAPI {
  state(): Promise<PublicState>; save(settings: Settings, key?: string): Promise<PublicState>;
  choose(kind: 'directory' | 'library'): Promise<string | null>; start(): Promise<void>; pause(): Promise<void>; test(): Promise<void>;
  detectAccounts(directory?: string): Promise<AccountCandidate[]>;
  autoConnect(settings: Settings): Promise<PublicState>; cancelAutoConnect(): Promise<void>;
  onAutoProgress(cb: (progress: AutoProgress | null) => void): () => void;
  onState(cb: (state: PublicState) => void): () => void;
}
export interface NotificationAPI {
  ready(): void; received(id: string): void; close(id: string): void; click(id: string): void;
  resize(id: string, width: number, height: number): void; glassRect(payload: any): void; glassHide(id: string): void;
  onShow(cb: (delivery: Delivery) => void): () => void; onLuma(cb: (bands: any) => void): () => void;
}
