// Style library check: every styles/<name>/ carries a STYLE.md with the template sections, a refs/
// image, and a row in styles/README.md. Returns error lines; a missing or misplaced file is an
// error line, never a throw. Used by scripts/check.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SECTIONS = ['Tokens', 'Do', "Don't", 'How to use it']
const IMAGE = /\.(png|jpe?g|webp)$/i
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
const isFile = (p) => existsSync(p) && statSync(p).isFile()

export function styleErrors(stylesDir) {
  if (!isDir(stylesDir)) return ['styles/: missing']
  const errors = []
  const indexPath = join(stylesDir, 'README.md')
  if (!isFile(indexPath)) errors.push('styles/README.md: missing')
  const index = isFile(indexPath) ? readFileSync(indexPath, 'utf8') : ''
  for (const name of readdirSync(stylesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const stylePath = join(stylesDir, name, 'STYLE.md')
    if (!isFile(stylePath)) {
      errors.push(`styles/${name}: no STYLE.md`)
      continue
    }
    const style = readFileSync(stylePath, 'utf8')
    for (const h of SECTIONS) {
      if (!new RegExp(`^## ${h}\\s*$`, 'm').test(style)) errors.push(`styles/${name}/STYLE.md: lacks "## ${h}"`)
    }
    const refsDir = join(stylesDir, name, 'refs')
    if (!isDir(refsDir) || !readdirSync(refsDir).some((f) => IMAGE.test(f))) errors.push(`styles/${name}/refs: no image`)
    if (!index.includes(`](${name}/STYLE.md)`)) errors.push(`styles/README.md: no row for ${name}`)
  }
  return errors
}
