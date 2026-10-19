$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$frameworkRoot = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compilerPath = Join-Path $frameworkRoot 'csc.exe'
if (!(Test-Path -LiteralPath $compilerPath)) { throw 'Windows .NET Framework C# compiler is unavailable.' }
$outputRoot = Join-Path $projectRoot 'resources\launcher'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$arguments = @('/nologo', '/codepage:65001', '/target:exe', '/optimize+', ('/out:' + (Join-Path $outputRoot 'WeNotice.OpenWechat.exe')))
foreach ($assembly in @('System.Web.Extensions.dll')) {
  $arguments += '/reference:' + (Join-Path $frameworkRoot $assembly)
}
$arguments += Join-Path $projectRoot 'native\wechat\OpenWechat.cs'
& $compilerPath @arguments
if ($LASTEXITCODE -ne 0) { throw 'Failed to build the WeChat launcher.' }
