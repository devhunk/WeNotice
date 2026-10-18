import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Check, ChevronDown, ChevronRight, Copy, FolderOpen, Info, LoaderCircle, MessageCircle, Monitor, Pause, Play, Radio, Search, Settings2, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { defaults, type AccountCandidate, type AutoProgress, type Notice, type PublicState, type Settings } from '../../shared/types'
import NotificationContent, { NoticeAvatar } from '../components/NotificationContent'
import '../components/NotificationToast.scss'
import { notificationLayout } from '../../shared/notificationLayout'
import './SettingsPage.scss'

type Tab = 'overview' | 'connection' | 'notification'
const labels = { idle: '尚未连接', connecting: '正在连接', listening: '正在监听', paused: '已暂停', error: '连接异常' }
const navigation = [{ id: 'overview', title: '概览', icon: Radio }, { id: 'connection', title: '微信连接', icon: MessageCircle }, { id: 'notification', title: '通知设置', icon: SlidersHorizontal }] as const
const pageText = { overview: ['概览', '查看运行状态和最近收到的消息。'], connection: ['微信连接', '配置本机账号，连接后即可在后台接收通知。'], notification: ['通知设置', '调整提醒方式，右侧即时查看效果。'] }
const positions = [{ id: 'top-left', title: '左上角' }, { id: 'top-center', title: '顶部居中' }, { id: 'top-right', title: '右上角' }, { id: 'bottom-left', title: '左下角' }, { id: 'bottom-right', title: '右下角' }] as const
const previewNotice: Notice = { id: 'preview', sessionId: '__test__', title: '文件传输助手', content: '文件已收到，记得查看最新的项目资料。', timestamp: 1781682600, count: 1 }

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="setting-row"><div className="setting-copy"><strong>{title}</strong>{description && <p>{description}</p>}</div>{children}</div>
}

export default function SettingsPage() {
  const [state, setState] = useState<PublicState>({ settings: defaults, hasKey: false, status: { phase: 'idle', detail: '配置账号后开始监听' }, history: [] })
  const [form, setForm] = useState<Settings>(defaults)
  const [key, setKey] = useState(''), [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<AccountCandidate[]>([]), [autoProgress, setAutoProgress] = useState<AutoProgress | null>(null)
  const [autoPending, setAutoPending] = useState(false)
  const api = window.weNotice
  const dirty = JSON.stringify(form) !== JSON.stringify(state.settings) || key.length > 0
  const connected = state.status.phase === 'listening'
  const account = state.settings.accountId || state.settings.accountDir.split(/[\\/]/).filter(Boolean).at(-1) || '未配置账号'
  const previewLayout = notificationLayout(previewNotice.content, form.position)
  const history = state.history.filter(notice => `${notice.title} ${notice.content} ${notice.sessionId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    if (!api) { setLoading(false); return }
    let active = true
    api.state().then(value => { if (active) { setState(value); setForm(value.settings); setAutoProgress(value.autoProgress || null) } }).catch(e => { if (active) setError(String(e)) }).finally(() => { if (active) setLoading(false) })
    const unsubscribe = api.onState(value => { if (active) setState(value) })
    const unsubscribeProgress = api.onAutoProgress(value => { if (active) setAutoProgress(value) })
    return () => { active = false; unsubscribe(); unsubscribeProgress() }
  }, [api])

  const update = <K extends keyof Settings>(name: K, value: Settings[K]) => { setForm(previous => ({ ...previous, [name]: value })); setFeedback('') }
  const run = async (action: () => Promise<unknown>) => {
    setError(''); setFeedback(''); setBusy(true)
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请重试') }
    finally { setBusy(false) }
  }
  const persist = async () => {
    const value = await api.save({ ...form, filterIds: form.filterIds.map(id => id.trim()).filter(Boolean) }, key || undefined)
    setState(value); setForm(value.settings); setKey('')
  }
  const save = () => run(async () => { await persist(); setFeedback('设置已保存') })
  const choose = (kind: 'directory' | 'library', field: 'accountDir' | 'libraryPath' | 'keyLibraryPath') => run(async () => { const path = await api.choose(kind); if (path) update(field, path) })
  const toggleListening = () => {
    if (!state.hasKey) { setTab('connection'); return }
    void run(() => connected ? api.pause() : api.start())
  }
  const copyId = (id: string) => run(async () => { await navigator.clipboard.writeText(id); setFeedback('会话 ID 已复制') })
  const saveAndConnect = () => run(async () => {
    await persist(); await api.start()
    const next = await api.state(); setState(next)
    if (next.status.phase !== 'listening') throw new Error(next.status.detail)
    setFeedback('连接成功，正在监听新消息')
  })
  const detect = async () => {
    const values = await api.detectAccounts(form.accountDir || undefined)
    setAccounts(values)
    if (!values.length) throw new Error('未检测到微信数据库，请先登录微信；自定义目录可通过“浏览”指定后重试。')
    const selected = values.length === 1 ? values[0] : values.find(value => value.accountDir.toLowerCase() === form.accountDir.toLowerCase())
    if (selected) setForm(previous => ({ ...previous, accountDir: selected.accountDir, accountId: selected.accountId }))
    else setFeedback(`检测到 ${values.length} 个账号，请先选择要连接的账号`)
    return selected
  }
  const automatic = () => run(async () => {
    let settings = form
    if (!settings.accountDir || !settings.accountId) {
      const selected = await detect()
      if (!selected) return
      settings = { ...settings, accountDir: selected.accountDir, accountId: selected.accountId }
    }
    setAutoPending(true)
    try {
      const next = await api.autoConnect(settings)
      setState(next); setForm(next.settings); setKey(''); setFeedback('连接成功，正在监听新消息')
    } finally { setAutoPending(false); setAutoProgress(null) }
  })
  const disabled = busy || loading || !api || !!autoProgress

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <div className="brand"><span className="brand-mark"><Bell size={22} strokeWidth={2.1} /></span><div>WeNotice<small>微信桌面通知</small></div></div>
      <nav>{navigation.map(({ id, title, icon: Icon }) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setFeedback('') }}><Icon size={18} strokeWidth={1.8} />{title}</button>)}</nav>
      <div className="sidebar-foot"><div><span className={`status-dot ${state.status.phase}`} />{labels[state.status.phase]}</div><span>WeNotice <span className="version">0.1.5</span></span></div>
    </aside>

    <main className="main-content">
      <header className="page-header"><div><h1>{pageText[tab][0]}</h1><p>{pageText[tab][1]}</p></div><button className="button secondary" disabled={disabled} onClick={() => run(async () => { await api.test(); setFeedback('测试通知已发送') })}><Bell size={16} />测试通知</button></header>
      {!api && <div className="alert info"><Info size={17} /><span>浏览器预览 · 账号连接与桌面通知需在 WeNotice 应用中使用。</span></div>}
      {error && <div role="alert" className="alert error"><Info size={17} /><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
      {feedback && <div role="status" className="alert success"><Check size={17} /><span>{feedback}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setFeedback('')}><X size={16} /></button></div>}

      {tab === 'overview' && <>
        <section className={`connection-status ${state.status.phase}`} aria-label="运行状态">
          <div className="status-symbol">{state.status.phase === 'connecting' ? <LoaderCircle size={23} className="spin" /> : connected ? <Radio size={23} /> : state.status.phase === 'error' ? <Info size={23} /> : <Monitor size={23} />}</div>
          <div className="status-copy"><div className="status-title"><h2>{loading ? '正在读取状态…' : labels[state.status.phase]}</h2><span className="account-chip" title={account}>{account}</span></div><p>{state.status.detail}</p></div>
          <button className={`button ${connected ? 'secondary' : 'primary'}`} disabled={disabled || state.status.phase === 'connecting'} onClick={toggleListening}>{connected ? <Pause size={15} /> : <Play size={15} />}{!state.hasKey ? '配置连接' : connected ? '暂停监听' : '开始监听'}</button>
        </section>
        <div className="status-meta"><span><span className={`status-dot ${state.status.phase}`} />{connected ? '关闭设置窗口后，仍在托盘持续运行' : '连接微信后，新消息将在桌面提醒'}</span>{state.status.checkedAt && <span>上次检查 {new Date(state.status.checkedAt).toLocaleTimeString('zh-CN')}</span>}</div>
        <section className="history-section" aria-labelledby="history-title">
          <div className="section-toolbar"><div className="section-title"><h2 id="history-title">最近通知</h2><span className="count-badge">{state.history.length}</span></div><label className="search-field"><Search size={16} /><input aria-label="搜索通知" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索联系人或消息" /></label></div>
          <div className="history-list">
            {history.length ? history.map(notice => <details className="history-item" key={notice.id}>
              <summary><NoticeAvatar src={notice.avatarUrl} name={notice.title} /><div className="history-copy"><div className="history-title"><strong>{notice.title}</strong>{notice.test && <span className="tag">测试</span>}{notice.count > 1 && <span className="tag">{notice.count} 条</span>}</div><p>{notice.content}</p></div><time dateTime={new Date(notice.timestamp * 1000).toISOString()}>{new Date(notice.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><ChevronRight className="history-chevron" size={16} /></summary>
              <div className="history-detail"><p>{notice.content}</p>{notice.test ? <span className="muted">这是一条用于检查显示效果的测试通知。</span> : <div className="session-detail"><code>{notice.sessionId}</code><button className="button text-button" onClick={() => copyId(notice.sessionId)} disabled={busy}><Copy size={14} />复制会话 ID</button></div>}</div>
            </details>) : <div className="empty-state"><span className="empty-icon">{query ? <Search size={26} strokeWidth={1.5} /> : <Bell size={28} strokeWidth={1.5} />}</span><h3>{query ? '没有找到相关通知' : '等待下一条消息'}</h3><p>{query ? '试试其他联系人名称或消息内容。' : '连接微信后，最近收到的消息会显示在这里。'}</p>{query ? <button className="button secondary" onClick={() => setQuery('')}>清除搜索</button> : <button className="button secondary" disabled={disabled} onClick={() => run(async () => { await api.test(); setFeedback('测试通知已发送') })}><Bell size={15} />发送测试通知</button>}</div>}
          </div>
          <p className="section-note">仅保留本次运行的最近 100 条通知。</p>
        </section>
      </>}

      {tab === 'connection' && <div className="connection-page">
        <section className="panel auto-connect-panel"><div className="panel-heading"><span className="panel-icon"><Radio size={19} /></span><div><h2>自动连接微信</h2><p>先登录微信，自动查找数据库并获取密钥。</p></div></div>
          <div className="auto-connect-body">
            {accounts.length > 0 && <label className="account-select">检测到的账号<select aria-label="检测到的账号" disabled={disabled} value={accounts.some(item => item.accountDir === form.accountDir) ? form.accountDir : ''} onChange={event => { const selected = accounts.find(item => item.accountDir === event.target.value); if (selected) setForm(previous => ({ ...previous, accountDir: selected.accountDir, accountId: selected.accountId })) }}><option value="" disabled>请选择账号</option>{accounts.map(item => <option key={item.accountDir} value={item.accountDir}>{item.accountId} · {item.accountDir}</option>)}</select></label>}
            {(autoProgress || autoPending) && <p className="auto-progress" role="status"><LoaderCircle size={15} className="spin" />{autoProgress?.detail || '正在准备自动连接…'}</p>}
            <div className="auto-connect-actions"><button className="button secondary" disabled={disabled} onClick={() => run(detect)}><Search size={15} />检测账号</button>{autoProgress || autoPending ? <button className="button secondary" onClick={() => { void api.cancelAutoConnect().catch(() => setError('取消失败，请重试')) }}><X size={15} />取消连接</button> : <button className="button primary" disabled={disabled} onClick={automatic}><Play size={15} />一键连接微信</button>}</div>
            <p className="field-help">密钥验证成功后在本机加密保存；下次启动自动连接。</p>
          </div>
        </section>
        <section className="panel"><div className="panel-heading"><span className="panel-icon"><MessageCircle size={19} /></span><div><h2>本机账号</h2><p>也可以手动指定账号和密钥。</p></div><span className={`status-badge ${state.hasKey ? 'ready' : ''}`}>{state.hasKey ? <><ShieldCheck size={13} />密钥已保存</> : '待配置'}</span></div>
          <fieldset className="form-fields" disabled={disabled}>
            <label htmlFor="account-dir">账号目录</label><div className="input-row"><input id="account-dir" value={form.accountDir} onChange={event => update('accountDir', event.target.value)} placeholder="选择包含 db_storage 的账号文件夹" spellCheck={false} /><button className="button secondary" disabled={!api} onClick={() => choose('directory', 'accountDir')}><FolderOpen size={16} />浏览</button></div><p className="field-help">请选择具体账号文件夹，而非微信数据的根目录。</p>
            <label htmlFor="account-id">账号 ID</label><input id="account-id" value={form.accountId} onChange={event => update('accountId', event.target.value)} placeholder="填写账号 ID" spellCheck={false} /><p className="field-help">用于识别并排除自己发送的消息。</p>
            <div className="label-line"><label htmlFor="database-key">数据库密钥</label><span>{state.hasKey ? '留空保留已保存的密钥' : '64 位十六进制字符串'}</span></div><input id="database-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={event => { setKey(event.target.value); setFeedback('') }} placeholder={state.hasKey ? '已安全保存，输入新密钥可替换' : '填写本机账号的数据库密钥'} />
          </fieldset>
          <div className="panel-footer"><span><ShieldCheck size={15} />密钥在本机加密保存</span><button className="button primary" disabled={disabled || state.status.phase === 'connecting'} onClick={saveAndConnect}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={15} />}保存并连接</button></div>
        </section>
        <details className="panel advanced-panel"><summary><Settings2 size={18} /><div><h2>高级设置</h2><p>读取组件、密钥组件与补查间隔</p></div><ChevronDown size={17} className="disclosure-chevron" /></summary><fieldset className="form-fields" disabled={disabled}><label htmlFor="library-path">数据读取组件</label><div className="input-row"><input id="library-path" value={form.libraryPath} onChange={event => update('libraryPath', event.target.value)} placeholder="默认使用随包附带的读取组件" spellCheck={false} /><button className="button secondary" disabled={!api} onClick={() => choose('library', 'libraryPath')}><FolderOpen size={16} />浏览</button></div><p className="field-help">已附带读取组件，无需启动 WeFlow。手动替换时请选择兼容的 Windows x64 wcdb_api.dll。</p><label htmlFor="key-library-path">密钥获取组件</label><div className="input-row"><input id="key-library-path" value={form.keyLibraryPath} onChange={event => update('keyLibraryPath', event.target.value)} placeholder="默认使用随包附带的 wx_key.dll" spellCheck={false} /><button className="button secondary" disabled={!api} onClick={() => choose('library', 'keyLibraryPath')}><FolderOpen size={16} />浏览</button></div><p className="field-help">用于首次连接或密钥失效时重新获取。</p><label htmlFor="poll-seconds">补查间隔</label><select id="poll-seconds" value={form.pollSeconds} onChange={event => update('pollSeconds', Number(event.target.value))}>{[2, 5, 10, 30, 60].map(value => <option key={value} value={value}>{value} 秒</option>)}</select><p className="field-help">用于补查可能遗漏的新消息，通常无需调整。</p></fieldset></details>
        <div className={`connection-result ${state.status.phase}`} role="status"><span className={`status-dot ${state.status.phase}`} /><div><strong>{labels[state.status.phase]}</strong><p>{state.status.detail}</p></div></div>
      </div>}

      {tab === 'notification' && <div className="notification-layout"><div className="settings-column">
        <section className="panel"><div className="panel-heading"><h2>通知与运行</h2></div><fieldset disabled={busy || loading} className="settings-fields">
          {([['enabled', '新消息通知', '接收符合规则的微信消息提醒。'], ['launchAtLogin', '开机启动', '登录 Windows 后在托盘运行。'], ['respectMuted', '遵循微信免打扰', '已设为免打扰的会话不弹出通知。']] as const).map(([field, title, description]) => <SettingRow key={field} title={title} description={description}><input type="checkbox" className="switch" role="switch" aria-label={title} checked={form[field]} onChange={event => update(field, event.target.checked)} /></SettingRow>)}
        </fieldset></section>
        <section className="panel"><div className="panel-heading"><h2>显示方式</h2></div><fieldset disabled={busy || loading} className="settings-fields"><SettingRow title="液态玻璃" description="根据桌面背景调整，不可用时使用普通材质。"><input type="checkbox" className="switch" role="switch" aria-label="液态玻璃" checked={form.glass} onChange={event => update('glass', event.target.checked)} /></SettingRow><SettingRow title="显示时长"><select aria-label="显示时长" value={form.durationMs} onChange={event => update('durationMs', Number(event.target.value))}>{[3000, 5000, 8000, 10000, 15000].map(value => <option key={value} value={value}>{value / 1000} 秒</option>)}</select></SettingRow><div className="position-setting"><div className="setting-copy"><strong>通知位置</strong><p>{positions.find(position => position.id === form.position)?.title}</p></div><div className="position-screen" role="group" aria-label="选择通知位置">{positions.map(position => <button type="button" key={position.id} className={`position-dot ${position.id} ${form.position === position.id ? 'active' : ''}`} aria-label={position.title} aria-pressed={form.position === position.id} title={position.title} onClick={() => update('position', position.id)}><span /></button>)}<Monitor size={22} strokeWidth={1} aria-hidden="true" /></div></div></fieldset></section>
        <section className="panel"><div className="panel-heading"><h2>会话过滤</h2></div><fieldset disabled={busy || loading} className="form-fields"><label htmlFor="filter-mode">接收范围</label><select id="filter-mode" value={form.filterMode} onChange={event => update('filterMode', event.target.value as Settings['filterMode'])}><option value="all">所有符合规则的会话</option><option value="whitelist">仅接收名单内的会话</option><option value="blacklist">排除名单内的会话</option></select>{form.filterMode !== 'all' && <><label htmlFor="filter-ids">会话名单</label><textarea id="filter-ids" rows={4} value={form.filterIds.join('\n')} onChange={event => update('filterIds', event.target.value.split('\n'))} placeholder="每行一个会话 ID" spellCheck={false} /><p className="field-help">在概览中展开通知，可复制会话 ID。</p></>}</fieldset></section>
      </div><section className="preview-panel" aria-label="通知效果预览"><div className="preview-heading"><span className="preview-label"><Monitor size={15} />效果预览</span><span className="live-indicator">实时</span></div><div className={`preview-desktop ${form.position}`}><span className="desktop-label">桌面</span><div className={`preview-toast notification-toast-container visible ${form.glass ? 'glass-preview' : 'solid-preview'}`} style={{ width: previewLayout.width, transform: `${form.position === 'top-center' ? 'translateX(50%) ' : ''}scale(${Math.min(.71, 210 / previewLayout.width)})` }}><div className="preview-toast-surface"><NotificationContent notice={previewNotice} /></div></div><div className="desktop-taskbar"><span /><span /><span /><i /></div></div><div className="preview-description"><strong>{form.glass ? '液态玻璃' : '普通材质'}<span> · {form.durationMs / 1000} 秒</span></strong><p>布局与桌面通知一致，玻璃效果以实际桌面为准。</p></div><button className="button secondary preview-test" disabled={disabled} onClick={() => run(async () => { await persist(); await api.test(); setFeedback('设置已保存，测试通知已发送') })}><Bell size={15} />保存并测试</button></section></div>}
    </main>
    {dirty && <div className="save-bar"><span><span className="unsaved-dot" />有未保存的更改</span><div><button className="button secondary" disabled={busy || loading} onClick={() => { setForm(state.settings); setKey(''); setError(''); setFeedback('') }}>撤销更改</button><button className="button primary" disabled={disabled} onClick={save}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存设置</button></div></div>}
  </div>
}
