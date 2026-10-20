#!/usr/bin/env bash
set -euo pipefail
app=studio.screenplay.writer.mobile
minutes=${BURNIN_MINUTES:?Bounded test duration is required}
[[ "$minutes" =~ ^[0-9]+$ ]] && (( minutes >= 15 && minutes <= 150 ))
hardware=$(adb shell getprop ro.hardware | tr -d '\r')
[[ "$hardware" == ranchu || "$hardware" == goldfish ]]
mkdir -p android-evidence
adb install android-artifacts/app-debug.apk
adb install android-artifacts/app-debug-androidTest.apk
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell ime enable "$app/.AcceptanceInputMethod"
adb shell ime set "$app/.AcceptanceInputMethod"
started=$(date +%s)
deadline=$((started + minutes * 60))
round=0
trap 'adb logcat -d > android-evidence/final-logcat.txt || true; adb shell screencap -p /sdcard/burnin-final.png || true; adb pull /sdcard/burnin-final.png android-evidence/ || true' EXIT
while (( $(date +%s) < deadline )); do
  round=$((round + 1))
  dir="android-evidence/round-$round"
  mkdir -p "$dir"
  adb logcat -c
  # Remove only previous synthetic export destinations, never the project database.
  adb shell rm -f /sdcard/Download/Screenplay-Unicode-QA.pdf
  adb shell run-as "$app" rm -rf cache/png-acceptance
  adb shell am instrument -w -r -e class "$app.MobileAcceptanceTest#nativeWritingImportRecoveryAndPdf,$app.MobileAcceptanceTest#rejectsOversizedAndUnsafeFiles,$app.MobileAcceptanceTest#manualFeedbackAndSubmissionReturnToTyping" "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee "$dir/writing.txt"
  grep -q 'OK (3 tests)' "$dir/writing.txt"
  adb pull "/sdcard/Android/data/$app/files/native-output.pdf" "$dir/native-output.pdf"
  python mobile/scripts/verify-pdf-copy.py "$dir/native-output.pdf" mobile/android/app/src/androidTest/assets/unicode-copy-expected.json "$dir/pdf-validation.json"
  adb shell am instrument -w -r -e emulatorStorageProbe 1 -e class "$app.MobileAcceptanceTest#failedSaveEditingHistorySwitchAndConflict,$app.MobileAcceptanceTest#recoveryWriteFailuresNeverReplaceThePreviousDraft,$app.MobileAcceptanceTest#lockScreenCyclesPreserveFinalNativeInput,$app.MobileAcceptanceTest#legacyRecoveryClockRollbackPreservesBothDrafts" "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee "$dir/survival.txt"
  grep -q 'OK (4 tests)' "$dir/survival.txt"
  bash .github/release-tools/android-process-survival.sh
  cp android-evidence/process-ready.json android-evidence/process-seed.txt android-evidence/process-recovery.txt "$dir/"
  adb shell dumpsys meminfo "$app" > "$dir/memory.txt"
  printf '{"round":%s,"at":"%s","elapsedSeconds":%s,"writing":3,"survival":4,"externalProcessRecovery":true,"pdfUnicodeAndGeometry":true}\n' "$round" "$(date -u +%FT%TZ)" "$(( $(date +%s) - started ))" | tee -a android-evidence/rounds.jsonl
done
(( round >= 2 ))
printf '{"passed":true,"rounds":%s,"elapsedSeconds":%s,"physicalDevice":false,"sameProjectDatabaseRetainedBetweenRounds":true}\n' "$round" "$(( $(date +%s) - started ))" | tee android-evidence/burnin-result.json
