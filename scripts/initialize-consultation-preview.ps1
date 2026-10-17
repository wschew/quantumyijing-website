param([Parameter(Mandatory=$true)][string]$Target,[switch]$AlignOrigin)
$ErrorActionPreference='Stop'
# Private console input only. Never invoke under Start-Transcript or shell tracing.
$targetPath=(Resolve-Path -LiteralPath $Target).Path
$settings=Get-Content -LiteralPath $targetPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($settings.action -notin @('initialize','administrator','verify')) { throw 'Invalid action' }
if($AlignOrigin -and $settings.action -ne 'verify') { throw 'Origin alignment requires a verify-only target' }
$secureToken=Read-Host 'Dedicated Cloudflare API token' -AsSecureString
$username=''
$password=New-Object System.Security.SecureString
$confirmation=New-Object System.Security.SecureString
if($settings.action -eq 'administrator') {
 $username=Read-Host 'Dedicated Preview administrator username'
 $password=Read-Host 'Administrator password' -AsSecureString
 $confirmation=Read-Host 'Confirm administrator password' -AsSecureString
}
function Read-PrivateString($value) {
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
 try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$process=$null
try {
 if($targetPath.Contains('"')) { throw 'Invalid target path' }
 $scriptPath=Join-Path $PSScriptRoot 'initialize-consultation-preview.mjs'
 if($AlignOrigin) { $scriptPath=Join-Path $PSScriptRoot 'align-consultation-preview-origin.mjs' }
 $start=New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node -CommandType Application).Source
 $start.Arguments='"'+$scriptPath+'" --execute-approved-preview "'+$targetPath+'"'
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true
 $start.RedirectStandardOutput=$true
 $start.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$start
 if(-not $process.Start()) { throw 'Cannot start private initializer' }
 $payload=@{token=(Read-PrivateString $secureToken);username=$username;password=(Read-PrivateString $password);confirmation=(Read-PrivateString $confirmation)} | ConvertTo-Json -Compress
 $inputWriter=New-Object System.IO.StreamWriter -ArgumentList $process.StandardInput.BaseStream, (New-Object System.Text.UTF8Encoding($false))
 try { $inputWriter.Write($payload) } finally { $inputWriter.Dispose() }
 $payload=$null
 # Accept only the Node entry's sanitized diagnostic frame, never raw stderr.
 $outputTask=$process.StandardOutput.ReadToEndAsync()
 $errorTask=$process.StandardError.ReadToEndAsync()
 $process.WaitForExit()
 if($process.ExitCode -ne 0) {
  $diagnostic=[regex]::Match($errorTask.Result,'(?m)^C1_INIT_FAILURE stage=([a-z][a-z0-9-]{0,63}) request=(none|unknown|account-read|database-read|pages-project-read|d1-query) http=(none|[1-5][0-9]{2})\r?$')
  if($diagnostic.Success) { throw ('Initialization stopped: stage='+$diagnostic.Groups[1].Value+'; request='+$diagnostic.Groups[2].Value+'; HTTP='+$diagnostic.Groups[3].Value+'. Inspect target/state before any rerun.') }
  throw 'Initialization stopped: subprocess failure without sanitized diagnostics; inspect target/state before any rerun'
 }
 Write-Output $outputTask.Result.Trim()
} finally {
 $payload=$null
 $secureToken.Dispose();$password.Dispose();$confirmation.Dispose()
 if($process) { $process.Dispose() }
}
