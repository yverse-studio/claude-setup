# How a pro game avatar is built (Booth study, SFW)

Study of five clothed Booth avatars in Blender 5.1 (2026-10-19): Yumeka v1.0.4 (.blend),
Ferris/Felis v0.8.1 (FBX), Hayakawa Aoi v1.11 (FBX), Amagi-chan v1.11 (FBX `XiaoTianCheng.fbx`),
Rurumu/Lulum 1.10 (VRM 0.x). Files: `C:\Users\Claude\Documents\GameAssetLibrary\characters\CH_*`.
Clothed, SFW-only study: no genital geometry was inspected and none is documented here. Licences
(VN3 and similar) make these **study only** for us, as in the licence note in [`SKILL.md`](SKILL.md).

## Rule 0: test every built-in shape key at 0 and 1 before building anything

A bought or downloaded base already has the slider you want more often than not. Yumeka's
`Breasts_Big_1` moved from 0.27 to 1.0 gave the round bust we spent two weeks hand-building
(it moves 53 mm at 1). So before any sculpt, script or new key:

1. List every key on every mesh with its current value, `slider_max` and how far it moves at 1.
   The script below prints that; a key that moves 0 mm is a divider (`-----Breasts-----`).
2. Set each body-shape key to 1 alone, look (front, side, posed), set it back. Values above 1
   also work when `slider_max` allows it (Yumeka's live file had 1.49).
3. Write the keys that already do the job into LIVE STATE before planning work.
4. A body key has **twins on every garment** with the same name (Yumeka: `Breasts_Big_1` on
   `Yumeka_Body`, `Yumeka_Cos_Bra`, `_Jacket`, `_Vest_Shirt`). Nothing links them: no drivers.
   Set the same value on every mesh that has the key, or the body pokes through the clothes.
   In Unity a tool syncs them (Modular Avatar "Blendshape Sync"); in Blender add drivers or a
   loop that copies the body value.

```python
import bpy
for o in bpy.data.objects:
    sk = o.type == 'MESH' and o.data.shape_keys
    if not sk: continue
    base = sk.key_blocks[0].data
    for k in sk.key_blocks[1:]:
        mm = max(((b.co - a.co).length for a, b in zip(base, k.data)), default=0) * 1000
        print(f"{o.name:28} {k.name:40} v={k.value:.2f} max={k.slider_max:.1f} moves={mm:.1f}mm")
```

## Mesh split

| Avatar | Meshes | Pattern |
|---|---|---|
| Yumeka | `Body` (the face, 446 keys), `Yumeka_Body`, 10 × `Yumeka_Cos_*`, 5 × `Yumeka_Hair_*`, `_Tail`, `_Wing` | one mesh per garment and per hair part; 4 materials shared by all |
| Ferris | `Body` (face, 53 keys), `Skin` (body), `Cloth`, `Cloth_MoeSleeveless`, `UnderCloth`, `UnderWear`, `Hair`, `Ear`, `Tail`, `Shoes`, `Hairpin` | outfit variants as whole duplicate meshes (same vertex count, toggle one) |
| Aoi | `Face_Mesh`, `Body_Mesh`, `Hair_Mesh`, `Cloth_Mesh`, `Jacket_Mesh`, `Skirt_Mesh`, `Tights_Mesh`, `Acc_Mesh`, `Other_Mesh`, each with a `*_Outline` twin | `_Mesh` suffix; outline twins are inverted-hull outlines with their own `*_Outline_M` material |
| Amagi | one `Body` mesh, 70k verts, 7 materials | everything merged (old MMD/PMX style); hardest to edit |
| Rurumu | `Face`, `Body`, `Hair`, `Cloth`, `Pants`, `Tail` | coarse split by material group (VRM export) |

Takeaways: **face is its own mesh** in four of five (keeps 100 to 450 face keys off the body, and
Unity only evaluates blendshapes on the mesh that has them). **Body under clothes stays whole**;
it is hidden where covered by `Shrink_*` (Yumeka), `Diet_*` (Ferris) or `*_OFF` (Aoi) keys that pull
those faces inside, not by deleting them. Hair is split front, side, back, tails so lengths can be
swapped.

## Naming

- Objects: `<Char>_<Part>` (Yumeka `Yumeka_Cos_Skirt`), `<Part>_Mesh` (Aoi), or plain `Hair`/`Cloth`.
  Garments carry a prefix (`Cos_`) so all clothes sort together.
- Materials: one per texture sheet, named after it (`Yumeka_Body`, `_Clothes`, `_Hair`, `_Face`),
  plus a `_Transparent` twin for alpha parts (eyelash, hair tips, wing film). Aoi: `*_M`.
- Bones, three dialects:
  - **Unity/VRChat style** (Yumeka, Ferris, Aoi): `Hips, Spine, Chest, Neck, Head`, sides as
    `.L/.R` (Ferris: `UpperArm.L`), `_L/_R` (Yumeka: `Eye_L`) or `L_/R_` prefix (Aoi: `L_UpperArm`).
    Finger names are Unity's: `IndexProximal`, `IndexIntermediate`, `IndexDistal`.
  - **Mixamo style** (Rurumu): `Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm,
    LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, LeftHandIndex1..3`.
  - **MMD/3ds Max style** (Amagi): `Right shoulder, Right arm, Right elbow, Right wrist`,
    `Thumb0_R`, `zArmTwist_R`, plus anonymous chains `Yxz_1..71`.
- Blender mirror tools need `.L/.R`, `_L/_R` or `Left/Right`; `L_`/`R_` prefixes work too.
- Chains: `<Part>_<index>` or `<Part>.001` (`Hair_twintale_1_L.003`, `PB_FL_Skirt_A_04`), with an
  `_end`/`_End` leaf bone so the last segment has a length. Aoi prefixes every physics bone `PB_`.
- Vertex groups = bone names, one per deforming bone (body 69, hair 128 to 152 on Yumeka).
- Shape keys: region first, then variant (`Hair_Twintale_Long`, `Breasts_Width_1`), suffix `_L/_R`
  for one-sided face keys, `_x` = hide an accessory, `_OFF` (Aoi) = hide a garment. Divider keys
  (`-----Eye morph-----`, `____ARKIT____`) group the list.

## Rig

- Core humanoid: `Hips > Spine > Chest (> UpperChest) > Neck > Head`, `Shoulder > UpperArm >
  LowerArm > Hand > 3 × 5 fingers`, `UpperLeg > LowerLeg > Foot > Toes`, `Eye_L/R`. Same on all five.
- Extra deform bones: twist bones (`L_UpperArm_Twist`, `L_LowerArm_Twist_A/B`, `zArmTwist_R`),
  elbow and knee helpers (Aoi `L_Elbow_Sub_*`, Rurumu `LeftKnee`, `LeftElbow`, `LeftUpLeg_PHY`).
- Physics bones sit under the bone they hang from, not under the root:

| Part | Yumeka | Aoi | Rurumu | Ferris |
|---|---|---|---|---|
| Hair | `Hair_root` > bang, side, back, twintail chains of 3 to 11 | `Hair` > `PB_*_Hair_*` chains of 2 to 5 | `Fhair_*`, `SHair_*`, `*_Bhair_*` chains up to 13 | `FrontHair_00x`, `Hair_0x_00x.L/R`, `Ahoge_*` |
| Bust | `Breast_1..3_L/R` (3 per side under `Chest`) | `PB_L/R_Bust_00..01` (2 per side) | `LeftBreast`, `RightBreast` (1 per side) | none |
| Butt | `Butt_L/R` + `_end` | none | `LeftBottom`, `RightBottom` under `Hips` | none |
| Skirt | `Skirt_root` > 6 to 10 radial chains of 4 | `PB_Skirt` > radial `PB_F/FL/L/BL..._Skirt_*` chains of 10 | `DressROOT` > 15 radial chains of 6 | none |
| Other | `Tail` 14, `Hair_ribbon_*` | `L_Cellphonee` (prop socket) | `Tail_*`, `*_Bow_*`, `BreastBow_*` | `Tail_00x`, `Sleeve_00x`, `Ear.L/R`, `String_*` |

- Rurumu's VRM stores the spring settings: hair stiffness 3 to 3.4, drag 0.8 to 0.86; tail 4/1;
  dress 0.45/0.25 (loose); bust 3/1; butt 4/1; 17 collider groups (on arms, legs, chest, head) so
  hair and skirt do not pass through the body. In Unity the same lives in PhysBone or
  DynamicBone components on the root of each chain.
- Weights: a skirt mesh is weighted to the skirt chains plus a little `UpperLeg` near the hem
  (Aoi skirt has 201 groups for 737 verts); hair only to hair chains plus `Head`.

## Clothes

- **Fitted on the base body in rest pose**, then weighted by copying weights from the body (Data
  Transfer, nearest face interpolated) and touched up around joints. Garments share the body's
  vertex group names, so one armature modifier drives everything.
- **Layering**: inner garments sit 1 to 3 mm off the skin; the body under them is pulled in with a
  shrink key per region so it never pokes out in motion.
- **Shape variants travel with the body**: every garment over the bust carries the same
  `Breasts_*` keys (see Rule 0, step 4).
- **Toggles**, three ways: a separate mesh switched on or off (Yumeka, Ferris), an `_OFF` key that
  collapses the garment to a point (Aoi; moves 5 to 34 m, so it is a hide switch, not a shape),
  or `_x` keys that hide one accessory inside a merged mesh (Yumeka `Hair_clip_x`).
- Alternatives are complete duplicates (Ferris `Cloth` and `Cloth_MoeSleeveless`, 4907 verts each).

## Face

- Visemes for VRChat, 15 keys: `vrc.v_sil, pp, ff, th, dd, kk, ch, ss, nn, rr, aa, e, ih, oh, ou`
  (Yumeka, Ferris; Aoi without the `vrc.` prefix). Plus `vrc.blink`, `vrc.looking_up/down`.
- MMD keys in Japanese for MMD/VRM tools: `あ い う え お` (mouth), `まばたき` (blink), `笑い`,
  `ウィンク`, `ウィンク右`, `じと目`, `なごみ`, `はぅ`, `瞳小`, `真面目`, `困る`, `怒り`, `上`, `下`.
- ARKit 52 (Rurumu): `eyeBlinkLeft`, `jawOpen`, `mouthSmileLeft`, ... for face tracking.
- Expressions split by region and side: brow (`Eyebrow_Angry`), eye (`eye_joy_L`), mouth
  (`Mouth_Omega`), lids (`eyelid_tail_up_R`), plus effect keys that show hidden geometry (tears,
  blush, sweat, star eyes: `Eff_Tear`, `Eff_Cheek`, `汗`, `星目`).
- Eyes: a bone per eye (`Eye_L/R`, Aoi also `L_Iris`) for look-at, plus look keys
  (`Eye_Left`, `eyeLookUpLeft`) as a fallback; iris, highlight and eye white are separate
  materials or separate faces (Aoi: `Face_Iris_Mask_M`, `Eye_Sp_M`; Rurumu: `Face_Eye`,
  `Face_EyeHi`, `Face_Eyewhite`).

## Toon materials

- In Unity they run lilToon or Poiyomi (Amagi ships a Poiyomi package). In Blender they show as
  plain texture to Emission (Yumeka, Rurumu: flat, unlit) or Principled + normal map (FBX imports).
- Outline: inverted hull, either duplicate `*_Outline` meshes (Aoi) or the shader's outline pass.
- Transparent parts are a separate material, never mixed into the opaque sheet.

## Unity humanoid and Mixamo

| Unity humanoid | Yumeka/Ferris/Aoi | Mixamo (`mixamorig:` prefix) | Amagi (MMD) |
|---|---|---|---|
| Hips | Hips | Hips | Hips |
| Spine | Spine | Spine | Spine |
| Chest | Chest | Spine1 | Chest |
| UpperChest | (none) | Spine2 | (none) |
| Neck / Head | Neck / Head | Neck / Head | Neck / Head |
| LeftShoulder | Shoulder.L / L_Shoulder | LeftShoulder | Left shoulder |
| LeftUpperArm | UpperArm.L | LeftArm | Left arm |
| LeftLowerArm | LowerArm.L | LeftForeArm | Left elbow |
| LeftHand | Hand.L | LeftHand | Left wrist |
| LeftUpperLeg | UpperLeg.L | LeftUpLeg | Left leg |
| LeftLowerLeg | LowerLeg.L | LeftLeg | Left knee |
| LeftFoot / Toes | Foot.L / Toes.L | LeftFoot / LeftToeBase | Left ankle / Left toe |
| Left Index 1-3 | IndexProximal..Distal.L | LeftHandIndex1..3 | IndexFinger1..3_L |

Unity needs 15 bones (hips, spine, head, both arms, hands, legs, feet); the rest is optional.
Physics bones stay unmapped. For a Mixamo clip on these avatars: retarget by this table (Unity
does it via the Humanoid avatar; in Blender rename or use a retarget add-on). Rurumu needs no
renaming. A T-pose or A-pose rest is fine; Unity's "Enforce T-Pose" fixes the difference.

## Import gotchas (Blender 5.1)

- `.unitypackage` is a tar.gz: each GUID folder holds `pathname` and `asset`; take the `.fbx`.
- FBX with in-between blendshapes fails to import ("in-between Shapes are not currently
  supported"); Amagi's `zhanli(3).fbx` did, `XiaoTianCheng.fbx` worked.
- VRM 0.x is a glb: copy to `.glb` and import with the glTF importer; morph targets come in as
  shape keys, the `extensions.VRM` JSON holds the humanoid map, expressions and spring settings.
- Use `automatic_bone_orientation=False` to keep the bone rolls the author set.
