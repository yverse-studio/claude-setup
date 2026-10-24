# Stylised VFX from about five Blender nodes (technical-artist reference)

From a TikTok (@goodgood3d, 420k views; caption and transcript only, recipe not rebuilt yet). Build it once through the Blender connector, save it as a .blend node group in the asset library, and link it here.

- Easing: Scene Time, then Map Range, then Float Curve.
- Hard mask: Noise or Voronoi, then Math "greater than". Linear-Light mix of noise gives rough edges.
- An `age` attribute from Geometry Nodes drives the mask (dissolve/spawn over lifetime).
- Swirl: centred mapping plus a gradient-scaled rotation.
- Look: emission, alpha, a different back-face colour.
- Animate the Mapping node's location rather than the 4D noise W input: cheaper, and it carries over to game engines.
