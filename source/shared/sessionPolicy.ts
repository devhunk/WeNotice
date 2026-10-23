import type { SessionKind } from './types'

// These are containers, not individual conversations. Do not broadly filter
// usernames containing "service": that would also hide ordinary contacts.
export function isAggregateSession(id: string): boolean {
  const value = id.toLowerCase()
  return value === 'brandsessionholder' || value === 'brandservicesessionholder'
    || value === 'placeholder_foldgroup' || value.endsWith('@placeholder')
    || value.startsWith('placeholder_foldgroup@')
}
export function sessionKind(id: string): SessionKind {
  if (isAggregateSession(id)) return 'aggregate'
  if (id.toLowerCase().startsWith('gh_')) return 'official'
  return id.endsWith('@chatroom') ? 'group' : 'private'
}
