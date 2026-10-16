#!/usr/bin/env bash
set -euo pipefail
app=studio.screenplay.writer.mobile
adb shell run-as "$app" rm -f files/process-ready.json
adb shell am instrument -w -r -e class "$app.MobileAcceptanceTest#seedBeforeProcessKill" "$app.test/androidx.test.runner.AndroidJUnitRunner" > android-evidence/process-seed.txt 2>&1 &
seed_driver=$!
trap 'kill "$seed_driver" 2>/dev/null || true' EXIT
for attempt in $(seq 1 90); do
  if adb shell run-as "$app" cat files/process-ready.json > android-evidence/process-ready.json 2>/dev/null; then break; fi
  sleep 1
done
python -c 'import json; p=json.load(open("android-evidence/process-ready.json")); assert p["text"] and p["pid"]'
test -n "$(adb shell pidof "$app")"
adb shell am force-stop "$app"
wait "$seed_driver" || true
trap - EXIT
test -z "$(adb shell pidof "$app")"
adb shell am instrument -w -r -e class "$app.MobileAcceptanceTest#verifiesRecoveryAfterProcessKill" "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee android-evidence/process-recovery.txt
grep -q 'OK (1 test)' android-evidence/process-recovery.txt
