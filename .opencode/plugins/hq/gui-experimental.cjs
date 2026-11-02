// OpenCode Desktop: a strip at the bottom of every window with credit, spend and open items.
// Hand-written CommonJS (plain DOM, no JSX) so there is no build step; the data comes from the server part (index.js) over RPC.
const { Plugin, Slot } = require('@opencode/plugin/gui')
const { Rpc } = require('@opencode/plugin/rpc')
const { onCleanup } = require('solid-js')

// Keep this contract identical to the one in index.js (the bundle cannot import files).
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

const COLOR = { ok: 'inherit', low: '#e0a030', over: '#e05050', unknown: '#e0a030', unchecked: '#e0a030' }
const REFRESH_MS = 60_000

Object.defineProperty(exports, '__esModule', { value: true })
exports.default = Plugin.define({
  setup(ctx) {
    ctx.add(Slot, {
      at: 'window.bottom',
      render: () => {
        const bar = document.createElement('div')
        bar.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;padding:2px 12px;font-size:12px;opacity:.85;border-top:1px solid rgba(128,128,128,.25);cursor:default'
        const spans = [0, 1, 2].map(() => bar.appendChild(document.createElement('span')))
        spans[0].textContent = 'Luna HQ: lÃ¤dt ...'
        const load = async () => {
          try {
            const v = await ctx.client.rpc(Hq).snapshot({})
            v.lines.forEach((line, i) => { spans[i].textContent = line })
            spans[0].style.color = COLOR[v.state] ?? 'inherit'
            bar.title = v.tip
          } catch {
            spans[0].textContent = 'Luna HQ: nicht geprÃ¼ft (Server antwortet nicht)'
          }
        }
        void load()
        const timer = setInterval(load, REFRESH_MS)
        onCleanup(() => clearInterval(timer))
        return bar
      },
    })
  },
})


