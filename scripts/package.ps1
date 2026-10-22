$ErrorActionPreference='Stop'
$pureRoot=Split-Path -Parent $PSScriptRoot
$pureDist=Join-Path $pureRoot 'dist'
$purePackage=Join-Path $pureDist 'PURE-Server-Windows'
function Clear-PureCodeDirectory($base, $names) {
 $resolvedBase=[IO.Path]::GetFullPath($base)
 foreach($name in $names) {
  $target=[IO.Path]::GetFullPath((Join-Path $resolvedBase $name))
  if (!( $target.StartsWith($resolvedBase+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))) {throw 'Unsafe staging path'}
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
 }
}
Clear-PureCodeDirectory $purePackage @('server','public','scripts','docs')
New-Item -ItemType Directory -Force $purePackage,(Join-Path $purePackage 'runtime') | Out-Null
foreach($name in @('server','public','scripts','docs','package.json','package-lock.json','.env.example','START-SERVER.cmd','START-ONLINE.cmd','START-ADMIN.cmd','README.md','Dockerfile','compose.yaml','Caddyfile','.dockerignore')) {
 Copy-Item -LiteralPath (Join-Path $pureRoot $name) -Destination $purePackage -Recurse -Force
}
New-Item -ItemType Directory -Force (Join-Path $purePackage 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $pureRoot 'tools/cloudflared.exe') -Destination (Join-Path $purePackage 'tools/cloudflared.exe') -Force
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $purePackage 'runtime/node.exe') -Force
Copy-Item -LiteralPath (Join-Path $pureRoot 'tools/NODE-LICENSE.txt') -Destination (Join-Path $purePackage 'runtime/LICENSE.txt') -Force
Push-Location $purePackage
try { & npm.cmd ci --omit=dev; if($LASTEXITCODE -ne 0){throw 'Dependency install failed'} } finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $pureDist 'PURE-0.8.0-debug.apk') -Force
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $pureDist 'PURE-latest-debug.apk') -Force
$pureArchiveItems=Get-ChildItem -LiteralPath $purePackage -Force | Where-Object { $_.Name -notin @('.env','data') }
Compress-Archive -LiteralPath $pureArchiveItems.FullName -DestinationPath (Join-Path $pureDist 'PURE-Server-Windows.zip') -Force
# Explicit allowlist excludes API keys, user data, toolchains and generated build folders.
$pureSource=Join-Path $pureDist 'PURE-Source'
Clear-PureCodeDirectory $pureSource @('server','public','tests','docs','scripts','android')
New-Item -ItemType Directory -Force $pureSource | Out-Null
foreach($name in @('server','public','tests','docs','scripts','package.json','package-lock.json','.env.example','.gitignore','START-SERVER.cmd','START-ONLINE.cmd','START-ADMIN.cmd','README.md','Dockerfile','compose.yaml','Caddyfile','.dockerignore')) {
 Copy-Item -LiteralPath (Join-Path $pureRoot $name) -Destination $pureSource -Recurse -Force
}
New-Item -ItemType Directory -Force (Join-Path $pureSource 'android/app') | Out-Null
foreach($name in @('settings.gradle','build.gradle','gradle.properties','gradlew','gradlew.bat','gradle')) {Copy-Item -LiteralPath (Join-Path $pureRoot "android/$name") -Destination (Join-Path $pureSource 'android') -Recurse -Force}
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/build.gradle') -Destination (Join-Path $pureSource 'android/app') -Force
Copy-Item -LiteralPath (Join-Path $pureRoot 'android/app/src') -Destination (Join-Path $pureSource 'android/app') -Recurse -Force
Compress-Archive -LiteralPath $pureSource -DestinationPath (Join-Path $pureDist 'PURE-Source.zip') -Force
Get-FileHash -Algorithm SHA256 (Join-Path $pureDist '*.apk'),(Join-Path $pureDist '*.zip') | ForEach-Object { "$($_.Hash)  $(Split-Path -Leaf $_.Path)" } | Set-Content -LiteralPath (Join-Path $pureDist 'SHA256SUMS.txt')
Write-Output 'PURE delivery packages ready in dist/'
