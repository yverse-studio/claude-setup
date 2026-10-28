// Flags bpy calls that were removed or renamed in Blender 4.x/5.x, the usual LLM script errors.
// Every rule was checked against bpy 5.2.3 (2026-10-28), see .claude/skills/studio/blender-recipes.md.
// Run: node scripts/blender/bpy-lint.mjs <script.py>...   exit 1 when a rule hits.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RULES = [
  { re: /\buse_auto_smooth\b/, msg: 'use_auto_smooth is gone (4.1): bpy.ops.object.shade_auto_smooth() or shade_smooth()' },
  { re: /BLENDER_EEVEE_NEXT/, msg: "engine id is 'BLENDER_EEVEE' again (5.x); EEVEE_NEXT raises a TypeError" },
  { re: /\bcalc_normals\b/, msg: 'Mesh.calc_normals is gone; normals update on their own' },
  { re: /\.fcurves\b/, skip: /channelbag/, msg: 'Action.fcurves is gone (5.0): action.fcurve_ensure_for_datablock(id, path, index=) or channelbag.fcurves' },
  { re: /inputs\[\s*['"](Specular|Emission|Subsurface)['"]\s*\]/, msg: "Principled BSDF inputs were renamed: 'Specular IOR Level', 'Emission Color', 'Subsurface Weight'" },
  { re: /\buse_nodes\s*=\s*True/, warn: true, msg: 'Material.use_nodes is deprecated (removed in 6.0); nodes are on by default' },
]

export function lint(name, text) {
  const hits = []
  if (['bisect.py', 'inspect.py'].includes(basename(name))) hits.push({ line: 0, msg: 'never name a script bisect.py or inspect.py (shadows the stdlib)' })
  text.split('\n').forEach((line, i) => {
    if (/^\s*#/.test(line)) return
    for (const r of RULES) if (r.re.test(line) && !(r.skip && r.skip.test(line))) hits.push({ line: i + 1, msg: r.msg, warn: !!r.warn })
  })
  return hits
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let bad = 0
  for (const f of process.argv.slice(2)) {
    for (const h of lint(f, readFileSync(f, 'utf8'))) {
      console.log(`${f}:${h.line}: ${h.warn ? 'warn' : 'error'}: ${h.msg}`)
      if (!h.warn) bad++
    }
  }
  process.exit(bad ? 1 : 0)
}
