import { useId, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { ConversationOption } from '../../shared/types'
import './SessionPicker.scss'

const kindLabels = { private: '私聊', group: '群聊', official: '公众号 / 服务号', aggregate: '聚合会话' }
const pageSize = 40

export default function SessionPicker({ label, options, value, onChange, single = false, loading = false }: {
  label: string; options: ConversationOption[]; value: string[]; onChange: (ids: string[]) => void; single?: boolean; loading?: boolean
}) {
  const id = useId(), [query, setQuery] = useState(''), [open, setOpen] = useState(false), [limit, setLimit] = useState(pageSize)
  const byId = useMemo(() => new Map(options.map(option => [option.id, option])), [options])
  const matches = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return options.filter(option => `${option.name}\n${option.remark || ''}\n${option.id}`.toLocaleLowerCase().includes(text))
  }, [options, query])
  const selected = [...new Set(value.filter(Boolean))]
  const choose = (sessionId: string) => {
    onChange(single ? [sessionId] : selected.includes(sessionId) ? selected.filter(item => item !== sessionId) : [...selected, sessionId])
    if (single) setOpen(false)
  }
  return <div className="session-picker" data-picker={label}>
    <div className="session-picker-heading"><span id={`${id}-label`}>{label}</span><button type="button" className="button text-button" aria-expanded={open} aria-controls={`${id}-options`} onClick={() => setOpen(!open)}>{open ? '收起选择' : single ? '选择会话' : '选择会话（可多选）'}</button></div>
    <div className="session-picker-selected" aria-label={`${label}已选`}>
      {selected.map(sessionId => {
        const option = byId.get(sessionId)
        return <span className="session-chip" key={sessionId} title={sessionId}><span><strong>{option?.remark || option?.name || sessionId}</strong><small>{option ? sessionId : '暂未解析 · 已保留原 ID'}</small></span><button type="button" className="icon-button" aria-label={`移除 ${label} ${sessionId}`} onClick={() => onChange(selected.filter(item => item !== sessionId))}><X size={13} /></button></span>
      })}
      {!selected.length && <span className="session-picker-empty">{single ? '请选择测试会话' : '尚未选择会话'}</span>}
    </div>
    {open && <div id={`${id}-options`} className="session-picker-options" role="group" aria-labelledby={`${id}-label`}>
      <div className="session-picker-search"><Search size={15} /><input autoFocus aria-label={`搜索${label}`} placeholder="搜索名称、备注或 ID" value={query} onChange={event => { setQuery(event.target.value); setLimit(pageSize) }} onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key === 'ArrowDown') { event.preventDefault(); event.currentTarget.closest('.session-picker-options')?.querySelector<HTMLButtonElement>('.session-option')?.focus() }
      }} /></div>
      <div className="session-picker-results" onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.session-option')], current = items.indexOf(document.activeElement as HTMLButtonElement)
        if (current < 0) return
        event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
      }}>
        {matches.slice(0, limit).map(option => <button type="button" className={`session-option ${selected.includes(option.id) ? 'selected' : ''}`} key={option.id} aria-pressed={selected.includes(option.id)} onClick={() => choose(option.id)}>
          {option.avatarUrl ? <img src={option.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="session-avatar" aria-hidden="true">{(option.remark || option.name || option.id).slice(0, 1)}</span>}
          <span className="session-option-copy"><strong>{option.remark || option.name || option.id}</strong><small>{option.remark && option.remark !== option.name ? `${option.name} · ` : ''}{option.id}</small></span><span className="session-option-kind">{kindLabels[option.kind]}</span><span className="session-option-check" aria-hidden="true">{selected.includes(option.id) ? '✓' : '+'}</span>
        </button>)}
        {!matches.length && <p className="session-picker-empty">{loading ? '正在读取会话…' : options.length ? '没有匹配的会话' : '暂无会话，请连接微信后刷新列表。'}</p>}
      </div>
      {matches.length > limit && <button type="button" className="button text-button" onClick={() => setLimit(limit + pageSize)}>显示更多（已显示 {limit} / {matches.length}）</button>}
    </div>}
  </div>
}
