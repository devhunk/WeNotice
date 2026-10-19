// Notification-only XML reader: no entity expansion or external resources.
interface XmlNode { name: string; text: string; children: XmlNode[] }
function entities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, key: string) => {
    if (key[0] !== '#') return named[key.toLowerCase()] ?? match
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
  })
}
function readable(text: string): string {
  return entities(text.replace(/<[^>]*>/g, '')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim()
}
function xml(content: string): XmlNode {
  const root: XmlNode = { name: '', text: '', children: [] }, stack = [root]
  const tokens = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/g
  for (const token of content.matchAll(tokens)) {
    const value = token[0], current = stack[stack.length - 1]
    if (token[1] !== undefined) { current.text += token[1]; continue }
    if (!value.startsWith('<')) { current.text += value; continue }
    if (/^<\//.test(value)) {
      const name = /^<\/([\w:.-]+)/.exec(value)?.[1].toLowerCase()
      if (stack.length > 1 && current.name === name) stack.pop()
    } else {
      const name = /^<([\w:.-]+)(?=[\s/>])/.exec(value)?.[1].toLowerCase()
      if (!name) continue
      const node: XmlNode = { name, text: '', children: [] }; current.children.push(node)
      if (!/\/\s*>$/.test(value)) stack.push(node)
    }
  }
  return root
}
function find(node: XmlNode, name: string): XmlNode | undefined {
  const pending = [node]
  while (pending.length) {
    const next = pending.pop()!
    if (next.name === name) return next
    for (let i = next.children.length - 1; i >= 0; i--) pending.push(next.children[i])
  }
}
const field = (node: XmlNode, name: string): string => readable(node.children.find(child => child.name === name)?.text || '')
const nested = (node: XmlNode, name: string): string => readable(find(node, name)?.text || '')
const labelled = (label: string, text = ''): string => text ? `[${label}] ${text.slice(0, 300)}` : `[${label}]`

export function messageSummary(content: string, type: number, sessionId: string): string {
  const text = content.replace(/^[^\s:<>]+:\r?\n/, '')
  if (type === 1) return text
  const baseType = type % 0x100000000
  const subtype = Math.floor(type / 0x100000000)
  const labels: Record<number, string> = { 3: '图片', 34: '语音', 42: '名片', 43: '视频', 47: '表情', 48: '位置', 50: '通话' }
  if (labels[baseType]) return labelled(labels[baseType])

  // Some readers return an escaped XML envelope. Decode only that envelope;
  // ordinary text messages and literal angle brackets in titles stay intact.
  const source = /^\s*&lt;(?:\?xml|msg\b|appmsg\b|sysmsg\b)/i.test(text) ? entities(text) : text
  const root = xml(source), app = find(root, 'appmsg')
  const appType = Number(app && field(app, 'type')) || subtype
  const pat = appType === 62 || (app ? app.children.some(child => child.name === 'patmsg') : !!find(root, 'patmsg') || !!find(root, 'pat'))
  if (pat || baseType === 10000 || baseType === 10002) {
    const fallback = pat ? '拍一拍' : find(root, 'revokemsg') ? '撤回消息' : '系统消息'
    let template = nested(root, 'template')
    if (template) {
      let unresolved = false
      template = template.replace(/\$\{([\w:.-]+)\}/g, (_, name: string) => {
        const value = nested(root, name.toLowerCase()); if (!value) unresolved = true
        return value
      })
      if (unresolved) template = ''
    }
    const body = nested(root, 'replacemsg') || template || nested(root, 'plain') || nested(root, 'title') || nested(root, 'text')
      || (!/<[\w!?/]/.test(source) ? readable(source) : '')
    return body || labelled(fallback)
  }
  if (baseType === 49 || app) {
    const node = app || root
    // Read direct children so quoted messages and forwarded records cannot
    // override the enclosing card's type or title.
    const title = field(node, 'title')
    const reader = [0, 5, 49].includes(appType) ? find(node, 'mmreader') : undefined
    if (reader) return labelled('公众号文章', nested(reader, 'title') || title)
    if (appType === 57) return labelled('引用', title)
    if (appType === 87) return labelled('群公告', nested(node, 'textannouncement') || title)
    if (appType === 5 || appType === 49) {
      const url = field(node, 'url')
      const official = sessionId.startsWith('gh_') || field(node, 'sourceusername').startsWith('gh_')
        || /^https?:\/\/mp\.weixin\.qq\.com(?:[/:?#]|$)/i.test(url)
      return labelled(official ? '公众号文章' : '链接', title)
    }
    const appLabels: Record<number, string> = {
      3: '音乐', 4: '视频', 6: '文件', 8: '文件', 19: '聊天记录', 24: '笔记',
      33: '小程序', 36: '小程序', 51: '视频号', 53: '接龙', 2000: '转账', 2001: '红包'
    }
    return labelled(appLabels[appType] || '消息', title || (appType === 6 ? field(node, 'filename') : ''))
  }
  return '[新消息]'
}
