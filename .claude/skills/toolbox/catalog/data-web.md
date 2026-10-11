# Data, web, browser, 3D

Checked 2026-10-03. Plugins are `@claude-plugins-official` unless noted.

| Need | Pick | Why / watch out | Add it |
|---|---|---|---|
| Web search inside the app | **Exa** or **Tavily** | Neural search, clean results for LLMs | `exa` / `tavily` plugins; ECC skill `exa-search` |
| Turn sites into clean markdown / structured data | **Firecrawl** | Keyless endpoint has 3 tools; key for the full set | `firecrawl` plugin |
| Big or protected scraping jobs | Bright Data, Zyte | Respect robots.txt and terms | `brightdata-plugin` / `zyte-web-data` plugins |
| Scheduled data collector | | | ECC skill `data-scraper-agent` |
| Browser automation, e2e tests, screenshots | **Playwright** | Already global | global `playwright` plugin, `ui-review` skill |
| Use yskills' logged-in Chrome | Claude in Chrome (`claude --chrome`) | Needs the extension and a Pro/Max login | built in |
| Analyse CSV / Parquet / JSON files | **DuckDB** | | `duckdb-skills` plugin |
| 3D on the web | **Three.js** (MyPage; TheStrongest adds MediaPipe tasks-vision and GLSL shaders) | Babylon.js when the project wants physics, GUI and an inspector built in | npm |
| 3D games, Steam | **three.js + Electron**, the `game-3d` skill (decided 2026-10-07): layout, VRM characters and VRMA moves, CC0 kits, splats from photos, cloud screenshot and perf recipe, Steam checklist (100 $ per game) | Unity and Unreal need the editor on yskills' PC for every look; Godot only as a console fallback | `game-3d` skill |
| 2D games | **Phaser** (biggest ecosystem), PixiJS (TiktokIsland) when it is more renderer than game | | npm |
| Earning from a web game | Portals: **Poki** (ads only; 100% on traffic you bring, 50/50 on theirs), **CrazyGames** (SDK at Full Launch; about 60% of ads, 70% of purchases), itch.io for direct sales [S, 2026-10-05] | Portal ads need no payment code; purchases on our own site follow the `sell` skill | the portal's SDK from its developer docs |
| Roblox games | **Rojo + Lune** in git, **Roblox Studio's built-in MCP server** on the PC; earn with game passes, developer products, Premium payouts (DevEx) | Studio runs only on yskills' PC: design and play checks run there, cloud threads write and test the Luau | the `roblox` skill; run and see: `catalog/roblox.md` |
| Games for app stores or desktop | **Godot** (MIT) | Also exports to the web | Godot editor on the PC |
| 3D models and game assets | **Blender** with its official MCP connector by the Blender developers ([Claude for Creative Work](https://www.anthropic.com/news/claude-for-creative-work)) | PC only: Blender must be open. Export `.glb` for Three.js. Skip the look-alike community servers | Blender connector |
| Maps, geocoding, routing | MapLibre + OpenStreetMap, or Amazon Location | | npm; `amazon-location-service` plugin |
| Design files | **Figma**, **Canva** | Pull frames, export assets. Figma's official remote server works on every plan; only worth adding if the design lives in Figma | `figma` / `canva` plugins |
| Hand-tweaking a design before code | **Paper** ([MCP docs](https://paper.design/docs/mcp)): a design canvas Claude can read and write | Optional and off by default. PC only: it runs through the Paper Desktop app, and the free tier is limited. Only when yskills wants to adjust a screen by hand; otherwise designs stay in code | Paper MCP (local) |
| Slides and pitch decks | | | ECC skills `frontend-slides`, `investor-materials` |
