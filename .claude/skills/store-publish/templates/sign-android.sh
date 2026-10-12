#!/usr/bin/env bash
# Signs the output of build-android.sh: APK for the website, AAB for Google Play. The only step that
# sees the keystore. Needs the Android SDK build-tools and a JDK (keytool/jarsigner).
#   KEYSTORE=/path/upload.jks KS_PASS=... KEY_ALIAS=... KEY_PASS=... bash scripts/sign-android.sh
# Output: $OUT/<name>.apk, $OUT/<name>.apk.sha256, $OUT/<name>.aab.
set -euo pipefail
: "${KEYSTORE:?}" "${KS_PASS:?}" "${KEY_ALIAS:?}" "${KEY_PASS:?}"
OUT=${OUT:-dist-android}
NAME=$(node -p "require('./package.json').name")
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
"$BT/zipalign" -p -f 4 "$OUT/$NAME-unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:KS_PASS --key-pass env:KEY_PASS --out "$OUT/$NAME.apk" "$OUT/aligned.apk"
rm -f "$OUT/aligned.apk" "$OUT/$NAME.apk.idsig" "$OUT/$NAME-unsigned.apk"
"$BT/apksigner" verify --print-certs "$OUT/$NAME.apk"
mv "$OUT/$NAME-unsigned.aab" "$OUT/$NAME.aab"
jarsigner -keystore "$KEYSTORE" -storepass:env KS_PASS -keypass:env KEY_PASS \
  -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/$NAME.aab" "$KEY_ALIAS"
(cd "$OUT" && sha256sum "$NAME.apk" > "$NAME.apk.sha256")
echo "signed $NAME in $OUT"
