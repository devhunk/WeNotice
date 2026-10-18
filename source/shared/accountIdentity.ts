// A data-directory suffix is not part of the WeChat account ID. Only repair
// the known mistake where the configured ID is exactly that directory name.
export function configuredAccountId(directory: string, accountId: string): string {
  const leaf = directory.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || ''
  const id = accountId.trim()
  return id === leaf && /^wxid_.+_[a-z\d]{4}$/i.test(leaf) ? id.slice(0, -5) : id
}
export const accountIdentity = (id: string) => id.replace(/^accountId_/, '')
