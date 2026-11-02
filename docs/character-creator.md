# Character creator: the data design that survives engines

How a character that players make (sliders, outfit, skin) is stored, rebuilt and placed in a
scene, in a way that works the same in Blender renders, a web engine and a native engine. The
home of the rule; the `blender-body` skill (the base body), `docs/clothing-pipeline.md`
(garments) and `docs/game-pipeline.md` (scenes) link here. Learned 2026-11-01 from studying a commercial
Unity character creator (proprietary, read only; its data, meshes and code never enter our
repos) and from our own base+delta pipeline. State: 2026-11-01.

## Three files, never one

| File | Holds | Owner |
|---|---|---|
| Catalogue (`<base>.catalog.json`) | every slider, garment, hair, skin the base offers, with its engine mapping | the asset library, generated from the base file |
| Look (`<name>.ychar.json`) | slider values, garments, colours, skin id; only what differs from default | the player or the author |
| Pose (`position.json`) and state (`<name>.ystate.json`) | IK targets and contacts; story and gameplay state | the scene; the game |

The studied creator stores likes, traits, voice, UI colours and a Base64 icon in the character
file. Every gameplay change then touches the save format, and old saves fail a plain string
version check and fall back to a default hero. Keep look, pose and state apart.

## Catalogue

- Every slider has its own id (`body.waist_width`), a `kind` (`morph`, `bone_scale`,
  `bone_offset`, `color`, `choice`), a group, `min`/`max`/`default`, and a `target` that names
  the shape key or bones. The target is the only engine-specific part.
- Never use a third-party morph name as the id. The studied game keys everything on
  `<MeshName>__<MorphName>` (a DAZ product name); renaming a mesh or dropping a morph pack breaks
  every saved character.
- Two-sided sliders: store the value normalised to −1..1 (or 0..1), the engine scales to its
  morph unit (Unity 0..100, Blender 0..1). The studied slider maps a 0..1 UI value to a tag range
  `min..max`, optional invert, times 100; the same slider can drive several targets with
  different multipliers.
- Bone proportions are a second channel next to morphs: per bone a uniform scale plus axis
  scale, and a local offset with a child-compensation factor. Both live in the catalogue as
  `bone_scale` / `bone_offset` sliders. After any morph or bone change the bind pose of the
  skinned mesh has to be rebuilt (the studied creator does it on a hidden duplicate at end of
  frame, then rebuilds the avatar); in Blender this is the base+delta rebuild.
- Garment fit: a body slider also drives the garment's shape key of the same name
  (`param_links: body.* → garment.*`, rule `inherit`). The studied game re-applies every body
  morph to every worn item by name and stores the copies in the save; we keep one value and
  resolve the link at build time (`clothing-pipeline.md`, fitted once per base).

## Look file

```json
{
  "schema": "ychar-look/1",
  "id": "example",
  "base": {"id": "base_female_v4", "rev": "v4.7"},
  "params": {"body.waist_width": -0.15, "face.eye_droop": -0.08},
  "bones": {"neck_lower": {"scale": [1, 1, 1.05]}},
  "garments": [{"id": "cl_dress_01", "colors": {"main": "#202030"}, "params": {"loosen_front": 0.4}}],
  "hair": {"id": "hair_01", "color": "#3a2a20"},
  "skin": {"id": "skin_a", "tint": "#ffffff"},
  "meta": {"name": "Example", "icon": "example.png", "created": "2026-11-01"}
}
```

- Sparse: write a value only when it differs from the catalogue default (the studied save keeps
  |weight| > 0.01 only; on load it fills the rest from the prefab defaults).
- `schema` plus `base.rev` give a migration path; one small function per version step.
  A bare string compare (`version == current`) throws away every older character.
- Textures by id, never by file name; a custom texture travels next to the look as a file with
  its hash, not Base64 inside the JSON.
- Icon as a file next to the look.

## Loading a look into a scene

Order, the same in every engine (the studied runtime does exactly this, in a coroutine):

1. Load the base (prefab, `.blend`, glTF) at the scene's spawn point.
2. Garments: load each by id, parent to the skeleton, remap bones, run cloth sim init.
3. Morphs: fill missing params with defaults, set every body shape key, propagate linked
   params to garments, then the garments' own fit params.
4. Rebuild bind pose / bone scale and offsets.
5. Skin: per region material (torso, arms, legs, face, lashes, eyes), then occlusion.
6. Voice, icon, props, then pose and state.

Undo in the creator: one command object per slider gesture (capture on pointer down, push on
pointer up, no commands during drag), undo and redo stacks capped at 200, cleared on preset load.

## Solid skin under clothes (occlusion)

Clothes clip through skin as soon as the body moves. The studied game ships one 256×256 mask
per garment and body region (`ClothOcclusion/<name>`), ANDs every worn mask per region into one
cut-out texture and feeds it to the skin shader (`_SeparateCutoutTex`), toggled off in the
creator so sliders show the whole body. Garments carry a comma-separated `maskName`; items
that share a mask replace each other (one shirt at a time), underwear flagged
`hideInCaseOfOverwear` is disabled while outerwear is worn, helmets hide hair or set a hair
shape key. The same idea for us: a per-garment skin mask in the garment folder, applied as a
material mask on render, never by deleting body faces (`clothing-pipeline.md`).

## Pose as IK targets, not bone rotations

A saved pose in the studied game is eleven IK targets (both hands, both feet, body, two
shoulder targets, two knee and two elbow bend goals) as position and rotation relative to the
furniture the character sits in, JSON, no version field; full-body IK fills in the rest and
loading interpolates over about two seconds. Props stick to the body by "closest vertex plus
local offset" recomputed after every morph change; toys snap to trigger sockets on the body with
a stored local offset. For us this is `position.json` (targets, contacts, distances) on top of
the rig's IK switches (`blender-body`), with furniture as the parent frame so a pose carries
over to another character of the same base.

## Checklist for a new creator

- [ ] Catalogue generated from the base, ids are ours, targets are the only engine part.
- [ ] Look file sparse, `schema` and `base.rev`, migration function per step.
- [ ] Look, pose and state are three files.
- [ ] Garment fit by link, not by copied values.
- [ ] Occlusion masks per garment; the skin is cut by material, not geometry.
- [ ] Poses stored as IK targets relative to the furniture.
- [ ] Undo as commands per gesture.

## Lessons

- 2026-11-01: a bought game is a study object. Extract, decompiled code and its character
  files stay in the laptop research folder, never in a repo, a build or a base file. Take the
  data design, write everything ourselves.
