import { Plugin } from '@opencode/plugin'
import { Rpc } from '@opencode/plugin/rpc'
import { collect } from './collect.mjs'
import { view } from './status.mjs'

// Keep this contract identical to the one in gui-experimental.cjs (the GUI bundle cannot import files).
// The empty input schema is on purpose: a method without `input` fails inside OpenCode 2.2.0 ('"~standard" in undefined').
const Hq = Rpc.define({
  id: 'claude-setup.hq',
  methods: {
    snapshot: {
      input: { type: 'object', additionalProperties: false },
      output: {
        type: 'object',
        properties: { state: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } }, tip: { type: 'string' } },
        required: ['state', 'lines', 'tip'],
        additionalProperties: false,
      },
    },
  },
  events: {},
})

const TTL = 60_000
let cached = null

export default Plugin.define({
  id: 'claude-setup.hq',
  async setup(ctx) {
    await ctx.rpc.register(Hq, {
      snapshot: () => {
        if (!cached || Date.now() - cached.at > TTL) cached = { at: Date.now(), value: collect().then(view) }
        return cached.value
      },
    })
  },
})
