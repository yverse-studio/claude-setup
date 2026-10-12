#!/usr/bin/env bash
# Builds an UNSIGNED APK and AAB from a Capacitor web app. Runs npm, the web build and Gradle, so it
# must never see a secret: signing is the separate scripts/sign-android.sh.
# Run from the app repo root. Needs Node, Java 21 and the Android SDK (GitHub's ubuntu-latest has them).
#   VERSION=1.2.3 bash scripts/build-android.sh
# Output: $OUT/<name>-unsigned.apk and $OUT/<name>-unsigned.aab (name = package.json "name").
set -euo pipefail
: "${VERSION:?x.y.z}"
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

mkdir -p "$OUT"
cp android/app/build/outputs/apk/release/app-release-unsigned.apk "$OUT/$NAME-unsigned.apk"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT/$NAME-unsigned.aab"
echo "built $NAME $VERSION (versionCode $CODE) in $OUT, unsigned"
