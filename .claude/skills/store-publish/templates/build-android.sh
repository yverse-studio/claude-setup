#!/usr/bin/env bash
# Builds a signed APK (for the website) and a signed AAB (for Google Play) from a Capacitor web app.
# Run from the app repo root. Needs Node, Java 21 and the Android SDK (GitHub's ubuntu-latest has them).
#   VERSION=1.2.3 KEYSTORE=/path/upload.jks KS_PASS=... KEY_ALIAS=... KEY_PASS=... bash scripts/build-android.sh
# Output: $OUT/<name>.apk, $OUT/<name>.apk.sha256, $OUT/<name>.aab (name = package.json "name").
set -euo pipefail
: "${VERSION:?x.y.z}" "${KEYSTORE:?}" "${KS_PASS:?}" "${KEY_ALIAS:?}" "${KEY_PASS:?}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "VERSION must be x.y.z, got $VERSION" >&2; exit 1; }
OUT=${OUT:-dist-android}
NAME=$(node -p "require('./package.json').name")
IFS=. read -r MA MI PA <<<"$VERSION"
CODE=$((MA * 10000 + MI * 100 + PA)) # Play needs a versionCode that only ever grows

if [ -f package-lock.json ]; then npm ci; else npm install; fi
${WEB_BUILD_CMD:-npm run build --if-present}
[ -d android ] || npx cap add android
npx cap sync android

GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" "$GRADLE"
grep -q "versionCode $CODE" "$GRADLE" || { echo "could not set versionCode in $GRADLE (template changed?)" >&2; exit 1; }
(cd android && ./gradlew --no-daemon assembleRelease bundleRelease)

BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
mkdir -p "$OUT"
# Signing happens here, not in Gradle: the keystore never touches the project files.
"$BT/zipalign" -p -f 4 android/app/build/outputs/apk/release/app-release-unsigned.apk "$OUT/aligned.apk"
KS_PASS="$KS_PASS" KEY_PASS="$KEY_PASS" "$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:KS_PASS --key-pass env:KEY_PASS --out "$OUT/$NAME.apk" "$OUT/aligned.apk"
rm -f "$OUT/aligned.apk" "$OUT/$NAME.apk.idsig"
"$BT/apksigner" verify --print-certs "$OUT/$NAME.apk"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT/$NAME.aab"
KS_PASS="$KS_PASS" KEY_PASS="$KEY_PASS" jarsigner -keystore "$KEYSTORE" -storepass:env KS_PASS -keypass:env KEY_PASS \
  -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/$NAME.aab" "$KEY_ALIAS"
(cd "$OUT" && sha256sum "$NAME.apk" > "$NAME.apk.sha256")
echo "built $NAME $VERSION (versionCode $CODE) in $OUT"
