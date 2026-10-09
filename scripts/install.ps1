param(
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }),
  [string]$Profile = 'web',
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
if ($Profile -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Profile name must not contain path separators.' }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskProfile = [IO.Path]::GetFullPath((Join-Path (Join-Path $DshHome 'profiles') $Profile))
$taskManifest = Join-Path $taskProfile 'package.json'
if (-not (Test-Path -LiteralPath $taskManifest)) { throw "DSH profile not found: $taskManifest. Start DSH Web once first." }
$taskData = Get-Content -LiteralPath $taskManifest -Raw | ConvertFrom-Json
if (-not $taskData.dsh.profile -or $null -eq $taskData.dsh.profile.bundles) { throw 'This DSH profile has no bundle list. No files changed.' }
$taskInstallDir = [IO.Path]::GetFullPath((Join-Path $taskProfile 'node_modules\dsh-thought-window'))
$taskExpected = [IO.Path]::GetFullPath((Join-Path $taskProfile 'node_modules')) + [IO.Path]::DirectorySeparatorChar
if (-not $taskInstallDir.StartsWith($taskExpected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid install target.' }
$taskBundles = @($taskData.dsh.profile.bundles)
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskBackup = "$taskManifest.thought-window-backup-$taskStamp"
Copy-Item -LiteralPath $taskManifest -Destination $taskBackup
if ($Uninstall) {
  $taskData.dsh.profile.bundles = @($taskBundles | Where-Object { $_ -ne 'dsh-thought-window' })
  if ($taskData.dependencies) { $taskData.dependencies.PSObject.Properties.Remove('dsh-thought-window') }
  # Leave the package on disk for recovery. Removing the bundle disables it.
} else {
  if (Test-Path -LiteralPath $taskInstallDir) {
    $taskInstalled = Get-Content -LiteralPath (Join-Path $taskInstallDir 'package.json') -Raw | ConvertFrom-Json
    if ($taskInstalled.name -ne 'dsh-thought-window') { throw 'Unexpected existing package; stopping.' }
    $taskBackupDir = Join-Path $taskProfile "thought-window-package-backup-$taskStamp"
    Copy-Item -LiteralPath $taskInstallDir -Destination $taskBackupDir -Recurse
  }
  New-Item -ItemType Directory -Path $taskInstallDir -Force | Out-Null
  foreach ($taskName in @('lib','src','scripts','test','package.json','cordis.patch.yml','README.md','NOTICE.md','LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $taskRoot $taskName) -Destination $taskInstallDir -Recurse -Force
  }
  if ($taskBundles -notcontains 'dsh-thought-window') { $taskData.dsh.profile.bundles = @($taskBundles) + 'dsh-thought-window' }
  if (-not $taskData.dependencies) { $taskData | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) }
  # Keep a resolvable local dependency for subsequent DSH plugin installs.
  $taskDependency = 'file:' + $taskRoot.Replace('\','/')
  $taskData.dependencies | Add-Member -NotePropertyName 'dsh-thought-window' -NotePropertyValue $taskDependency -Force
}
$taskJson = $taskData | ConvertTo-Json -Depth 64
$taskTemp = "$taskManifest.thought-window-tmp"
[IO.File]::WriteAllText($taskTemp, $taskJson + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $taskTemp -Destination $taskManifest -Force
if ($Uninstall) { Write-Output 'Thought Window disabled. Restart DSH Web and refresh the browser.' }
else { Write-Output 'Thought Window installed. Restart DSH Web and refresh the browser. The toggle appears beside the message input.' }
Write-Output "Profile backup: $taskBackup"
