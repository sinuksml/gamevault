$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "..").Path
$Dotnet = Join-Path $Root ".dotnet\dotnet.exe"
if (-not (Test-Path $Dotnet)) { $Dotnet = "dotnet" }

$env:DOTNET_CLI_HOME = $Root
$env:APPDATA = $Root
$env:NUGET_PACKAGES = Join-Path $Root ".nuget\packages"
$env:DOTNET_NOLOGO = "1"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"

function Assert-LastCommand([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

$App = ".\GameVault.WinUI\GameVault.WinUI.csproj"
$Smoke = ".\GameVault.Windows.Smoke\GameVault.Windows.Smoke.csproj"

# The data engine is checked first: a release must never be built from a vault layer that fails its own tests.
& $Dotnet run --project $Smoke -c Release
Assert-LastCommand "Smoke checks"

& $Dotnet build $App -c Release
Assert-LastCommand "Windows build"

# WinUI 3 ships as a folder (application, .NET and the Windows App SDK together), not a single file.
if (Test-Path ".\publish") { Remove-Item ".\publish" -Recurse -Force }
& $Dotnet publish $App -c Release -r win-x64 --self-contained true -o ".\publish" -p:DebugType=none
Assert-LastCommand "Windows publish"
if (-not (Test-Path ".\publish\SinuGameVault.exe")) { throw "Publish did not produce SinuGameVault.exe." }

# One version for the app, the archive and the installer: Directory.Build.props.
[xml]$BuildProps = Get-Content ".\Directory.Build.props"
$Version = $BuildProps.Project.PropertyGroup.GameVaultVersion
if (-not $Version) { throw "GameVaultVersion was not found in Directory.Build.props." }
$Version = $Version.Trim()
Write-Host "Building version $Version"

Compress-Archive -Path ".\publish\*" -DestinationPath ".\SinuGameVault-Windows-v$Version.zip" -Force
$Iscc = Join-Path $Root ".tools\InnoSetup\ISCC.exe"
if (Test-Path $Iscc) {
    & $Iscc "/DMyAppVersion=$Version" ".\installer.iss"
    Assert-LastCommand "Installer compilation"
}
$Setup = ".\installer-output\SinuGameVault-Setup-v$Version.exe"
if ($env:GAMEVAULT_SIGN_CERT -and (Test-Path $env:GAMEVAULT_SIGN_CERT)) {
    $SignTool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
    if (-not $SignTool) { throw "GAMEVAULT_SIGN_CERT was provided, but signtool.exe was not found." }
    & $SignTool sign /fd SHA256 /f $env:GAMEVAULT_SIGN_CERT /tr http://timestamp.digicert.com /td SHA256 $Setup
    Assert-LastCommand "Installer signing"
}
Write-Host "Portable release ready: $PWD\SinuGameVault-Windows-v$Version.zip"
if (Test-Path $Setup) {
    Write-Host "Installer ready: $PWD\installer-output\SinuGameVault-Setup-v$Version.exe"
}
