#!/usr/bin/env bash
# Cloud setup for MPFB2 figures (about 3 minutes): Blender as a Python module, the MPFB extension, the CC0 asset packs.
# Usage: bash setup.sh [pack ...]   (default packs below). files2.makehumancommunity.org fails TLS in the cloud proxy: use files.
set -euo pipefail
apt-get install -y -qq libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 libtbb12 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 >/dev/null
python3.13 -m pip install -q bpy numpy pillow
W=${MPFB_DL:-/tmp/mpfb}; mkdir -p "$W"; cd "$W"
# MPFB 2.0.18 from extensions.blender.org (check the page for a newer build)
curl -sfL -o mpfb.zip "https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip?repository=%2Fapi%2Fv1%2Fextensions%2F&blender_version_min=4.2.0"
python3.13 -c "import bpy; bpy.ops.extensions.package_install_files(repo='user_default', filepath='$W/mpfb.zip', enable_on_install=True); bpy.ops.wm.save_userpref()"
D=$(python3.13 -c "import bpy; print(bpy.utils.extension_path_user('bl_ext.user_default.mpfb', create=True))")/data; mkdir -p "$D"
PACKS=${*:-makehuman_system_assets skins01 skins02 skins03 shirts01 pants01 shoes01 hair01 dress01 skirts01 suits01 hats01 hats02}
for p in $PACKS; do
  # system assets are 280 MB: ranged parallel download, the server is slow per connection
  T=$(curl -sI "https://files.makehumancommunity.org/asset_packs/$p/${p}_cc0.zip" | awk 'tolower($1)=="content-length:"{print $2+0}')
  N=8; P=$(( (T + N - 1) / N )); rm -f "$p".part*
  for i in $(seq 0 $((N - 1))); do s=$((i * P)); e=$((s + P - 1)); [ $e -ge $T ] && e=$((T - 1)); curl -sf -r $s-$e -o "$p.part$i" "https://files.makehumancommunity.org/asset_packs/$p/${p}_cc0.zip" & done; wait
  cat $(for i in $(seq 0 $((N - 1))); do echo "$p.part$i"; done) > "$p.zip"; rm -f "$p".part*; unzip -qo "$p.zip" -d "$D"; echo "pack $p ok"
done
