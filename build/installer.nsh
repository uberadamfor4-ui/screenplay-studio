; Keep upgrades on the installation scope and directory selected by the user.
; If both per-user and per-machine copies exist, keep the choice page visible so
; the installer never guesses which copy should be replaced.
!macro customInstallMode
  ${if} $hasPerUserInstallation == "1"
  ${andif} $hasPerMachineInstallation == "0"
    StrCpy $isForceCurrentInstall "1"
  ${elseIf} $hasPerMachineInstallation == "1"
  ${andIf} $hasPerUserInstallation == "0"
    StrCpy $isForceMachineInstall "1"
  ${endIf}
!macroend
