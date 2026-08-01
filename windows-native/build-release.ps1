$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "..").Path
$Dotnet = Join-Path $Root ".dotnet\dotnet.exe"

$env:DOTNET_CLI_HOME = $Root
$env:APPDATA = $Root
$env:NUGET_PACKAGES = Join-Path $Root ".nuget\packages"
$env:DOTNET_NOLOGO = "1"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"

function Assert-LastCommand([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

& $Dotnet restore ".\GameVault.Windows\GameVault.Windows.csproj" -r win-x64 --configfile "..\NuGet\NuGet.Config"
Assert-LastCommand "Windows restore"
& $Dotnet build ".\GameVault.Windows\GameVault.Windows.csproj" -c Release --no-restore
Assert-LastCommand "Windows build"
& $Dotnet restore ".\GameVault.Windows.Smoke\GameVault.Windows.Smoke.csproj" --configfile "..\NuGet\NuGet.Config"
Assert-LastCommand "Smoke restore"
& $Dotnet run --project ".\GameVault.Windows.Smoke\GameVault.Windows.Smoke.csproj" -c Release --no-restore
Assert-LastCommand "Smoke checks"
& $Dotnet restore ".\GameVault.Windows\GameVault.Windows.csproj" -r win-x64 --configfile "..\NuGet\NuGet.Config"
Assert-LastCommand "Publish restore"
& $Dotnet publish ".\GameVault.Windows\GameVault.Windows.csproj" -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ".\publish" --no-restore
Assert-LastCommand "Windows publish"

$Version = "2.0.4"
Compress-Archive -Path ".\publish\*" -DestinationPath ".\SinuGameVault-Windows-v$Version.zip" -Force
$Iscc = Join-Path $Root ".tools\InnoSetup\ISCC.exe"
if (Test-Path $Iscc) {
    & $Iscc ".\installer.iss"
    Assert-LastCommand "Installer compilation"
}
Write-Host "Portable release ready: $PWD\SinuGameVault-Windows-v$Version.zip"
if (Test-Path ".\installer-output\SinuGameVault-Setup-v$Version.exe") {
    Write-Host "Installer ready: $PWD\installer-output\SinuGameVault-Setup-v$Version.exe"
}
