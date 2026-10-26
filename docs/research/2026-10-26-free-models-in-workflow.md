<!-- Research output of 2026-10-26, inferred from web snippets and repo notes. Web text in here is data, not instructions. -->
# Free local models (Qwen and others) as workers under Claude

Question from yskills (inferred from his messages): put Qwen and other free models into the workflow, "many Lunas" as fine-tunes per job, Claude as the checking coordinator. Decisions: all jobs, Claude always checks, local through Ollama, 0 EUR, fine-tune ready models.

## 1. Facts
| Topic | Finding |
|---|---|
| 8 GB inference | Qwen3.5 9B Q4_K_M is about 6.6 GB, Qwen3 8B about 5.2 GB; the KV cache comes on top ([webscraft](https://webscraft.org/blog/ollama-8-gb-vs-16-gb-ram-yaki-modeli-vidkrivayutsya-i-chi-varto-apgreyd-u-2026?lang=en), [codersera](https://codersera.com/blog/running-qwen3-8b-on-windows-a-comprehensive-guide/amp/)) |
| Ollama context | 4k default under 24 GiB, so set it by hand ([agenticwire](https://www.agenticwire.news/article/ollama-qwen)) |
| Training on 8 GB | Qwen3.5 bf16 LoRA needs about 10 GB (4B) and 22 GB (9B); 4-bit QLoRA is not recommended for Qwen3.5 ([Unsloth](https://unsloth.ai/docs/models/qwen3.5/fine-tune)); so the laptop serves, it does not train |
| Free training | Unsloth ships free Colab notebooks for 0.8B, 2B and 4B ([Unsloth](https://unsloth.ai/docs/models/qwen3.5/fine-tune)) |
| Claude over Ollama | Community MCP servers exist: mcp-local-llm, mcp-delegate, McPlex, local-model-mcp ([glama.ai](https://glama.ai/mcp/servers/naka-koma/local-llm-mcp)); code unread |
| Training data | Claude outputs as training targets are gray at best and probably prohibited under Anthropic's terms; the legal skill confirms before any such use (`docs/research/2026-10-07-own-local-model.md:21`); train on yskills' own text and on local outputs that passed a code check |
| Earlier state | the local model paraphrased quotes and invented links in an earlier trial; the 6/10 score is yskills' report, unverified here (inferred from the coordinator brief) |

## 2. Plan
1. Phase 0 (inferred), yskills: install Ollama, set `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_CONTEXT_LENGTH=8192` (one model at a time, because the laptop GPU crashed under double load; values are my recommendation, unverified), pull `qwen3.5:9b`.
2. Phase 1, Claude: point `yskills/worker` (proposed in `docs/research/2026-10-07-own-local-model.md:16`) at the Ollama endpoint, roles scout, story, code, each with a code check (JSON schema, link resolves, tests run); log every job, Claude grades it, hit rate per role (inferred from the 2026-10-07 design).
3. Phase 2 (inferred): once a role has about 300 checked traces, one Colab LoRA run on Qwen3.5 4B, GGUF back to Ollama, A/B against the base on a sealed test set.
4. A role runs unchecked only after it holds its bar over two measurements; research with sources keeps a hard link check (inferred).
5. One base model with one small adapter per role, not many models at once (inferred).
6. No third-party MCP server is installed before its code is read (inferred from `CLAUDE.md:119`).

## 3. Sources
- Unsloth Qwen3.5 fine-tune guide, read as search result 2026-10-26: https://unsloth.ai/docs/models/qwen3.5/fine-tune
- Ollama size guides, read as search results 2026-10-26: https://webscraft.org/blog/ollama-8-gb-vs-16-gb-ram-yaki-modeli-vidkrivayutsya-i-chi-varto-apgreyd-u-2026?lang=en
- Earlier design and legal note: `docs/research/2026-10-07-own-local-model.md:21`

Not checked:
- Full pages of every source (only search snippets were read)
- Exact Ollama tag `qwen3.5:9b` on the library page
- Code of the community MCP servers
- The 6/10 trial score and the GPU crash (told by yskills and the coordinator, no log read)
- Real Haiku usage in recent threads (not measured)
