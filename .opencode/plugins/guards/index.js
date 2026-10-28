import { Plugin } from '@opencode/plugin'
import { readFileSync } from 'node:fs'
import { modelIds, permissionBlock, subagentBlock } from './decide.mjs'

const teams = () => { try { return readFileSync(new URL('../../../docs/TEAMS.md', import.meta.url), 'utf8') } catch { return '' } }
const off = () => process.env.CLAUDE_SETUP_TEAM_GUARD === 'off'

export default Plugin.define({
  id: 'claude-setup.guards',
  async setup(ctx) {
    // The tier agents (.opencode/agents/) get their model here, so no model id lives outside docs/TEAMS.md.
    await ctx.agent.transform((editor) => {
      for (const [tier, ref] of Object.entries(modelIds(teams()))) {
        const [providerID, id] = ref.split('/')
        editor.update(tier, (agent) => { agent.model = { providerID, id } })
      }
    })
    await ctx.permission.hook('evaluate', (event) => {
      const why = permissionBlock(event.action, event.resources)
      if (why) { event.effect = 'deny'; event.message = why }
    })
    await ctx.tool.hook('execute.before', async (event) => {
      if (event.tool !== 'subagent' || off()) return
      const info = await ctx.agent.get({ agentID: event.input.agent }).catch(() => null)
      if (!info) return
      const why = subagentBlock(event.input, info.data?.model, teams())
      if (why) throw new Error(why)
    })
  },
})
