$ErrorActionPreference = 'Stop'
$pureRoot = Split-Path -Parent $PSScriptRoot
$pureJdk = Get-ChildItem (Join-Path $pureRoot 'tools/jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pureJdk) { $env:JAVA_HOME = $pureJdk.FullName }
if (Test-Path (Join-Path $pureRoot 'tools/android-sdk')) { $env:ANDROID_HOME = Join-Path $pureRoot 'tools/android-sdk' }
if (!$env:JAVA_HOME -or !$env:ANDROID_HOME) { throw 'Set JAVA_HOME to JDK 17 and ANDROID_HOME to Android SDK first.' }
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$pureGradle = Join-Path $pureRoot 'tools/gradle-8.11.1/bin/gradle.bat'
if (!(Test-Path $pureGradle)) { $pureGradle = Join-Path $pureRoot 'android/gradlew.bat' }
& $pureGradle -p (Join-Path $pureRoot 'android') assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
New-Item -ItemType Directory -Force (Join-Path $pureRoot 'dist') | Out-Null
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $pureRoot 'dist/PURE-0.8.0-debug.apk') -Force
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $pureRoot 'dist/PURE-latest-debug.apk') -Force
Write-Output 'APK ready: dist/PURE-0.8.0-debug.apk & dist/PURE-latest-debug.apk'
