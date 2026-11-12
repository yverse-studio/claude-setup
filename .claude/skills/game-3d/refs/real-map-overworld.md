# Real-map overworld: a game map from any real country

From vacation-game (2026-11-12): the trip's home screen is a Mario-style diorama built on the real country.
The research is in vacation-game `docs/research/2026-11-12-real-map-overworld.md`, and the spec is in vacation-game
`design/OVERWORLD.md`. Use this file for any game whose map is a real place (trip games, city games, a country tour).

## Inputs (all free, no key)

| Input | Source | Licence |
|---|---|---|
| Country outline | Natural Earth 1:10m via npm `world-atlas@2.0.2` (`countries-10m.json`, ids are ISO numeric) + `topojson-client` | public domain |
| Elevation | AWS Terrain Tiles, Terrarium PNG: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, metres = `R*256 + G + B/256 - 32768` | attribution required (registry.opendata.aws/terrain-tiles) |
| Place features (later) | OpenStreetMap via Overpass (water, parks, karst, rice) | ODbL, attribution |
| Place photos | the traveller's own; Wikimedia Commons only as mockup placeholders | per file |

## Pipeline (build time, then three.js)

1. Cut the country and its neighbours out of `world-atlas`, then fit `d3.geoMercator().fitExtent` to the country.
2. Fetch the terrain tiles for the country's bounding box at zoom 8. That is 78 tiles for Vietnam; keep every 4th
   pixel, which gives a 384 x 832 grid. Cache the tiles and never fetch them at runtime.
3. Draw the outline onto a canvas of the same grid size to make a mask. That is faster than calling
   `d3.geoContains` per cell. Cells outside the country are -500.
4. Run `d3.contours().smooth(true).thresholds([0, 250, 700, 1200, 1800])` over the grid. Turn each level into
   `THREE.Shape` with holes and extrude it; each terrace gets one colour, green to rock, with brown sides. This is the
   Mapbox-Unity "height = blocks" idea, and it reads as a toy while staying the real relief.
5. Decor: draw seeded random samples, read the height from the grid, and use `InstancedMesh` for trees.
   Landmark props come from each station's `kind`.
6. Stations: a pad at each place's real lon/lat. When pads cluster, a `d3.forceSimulation` with `forceCollide` pushes
   them apart, and a thin pin points to the true spot. Never tune offsets by hand.
7. Travel: a spline through the stations, with dots or a vehicle prop, and a lagging camera (Relive/Mapbox style).

Working prototype (throwaway, copy from it): project files `vacation-game/design/overworld-2026-11-12/src/`
(`dem.mjs` for the tiles, `a2-terrain.html` for the terraces, stations, cards and figure). To render it headless,
use Playwright with `--use-angle=swiftshader`; a frame takes about 20 s on software GL.

## Traps

- `d3.geoContains` per grid cell on a 1:10m outline is far too slow; rasterise the outline to a mask instead.
- Rotate an `ExtrudeGeometry` with `rotateX(-PI/2)` and give shapes `(x, -y)`, so that Mercator y (south) maps to +z.
- Pick zoom 8 for a country and 10 to 11 for a city; at zoom 7 the valleys disappear.
