// #419 point 3: with core.symlinks=false (a Windows clone) git writes a symlink as a small text file holding its target.
// resolveLink gives the folder such a file points at; anything else comes back unchanged, so the caller still reports it.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function resolveLink(p) {
  try {
    if (!statSync(p).isFile() || statSync(p).size > 512) return p
    const target = readFileSync(p, 'utf8').trim()
    if (!target || /[\r\n\0]/.test(target)) return p
    const abs = resolve(dirname(p), target)
    return existsSync(abs) ? abs : p
  } catch { return p }
}
