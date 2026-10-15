param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
# Private console input only. Never invoke under Start-Transcript or shell tracing.
$targetPath=(Resolve-Path -LiteralPath $Target).Path
$settings=Get-Content -LiteralPath $targetPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($settings.action -notin @('initialize','administrator','verify')) { throw 'Invalid action' }
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
 $start=New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node -CommandType Application).Source
 $start.Arguments='"'+$scriptPath+'" --execute-approved-preview "'+$targetPath+'"'
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true
 $start.RedirectStandardOutput=$true
 $start.RedirectStandardError=$true
 $start.StandardInputEncoding=New-Object System.Text.UTF8Encoding($false)
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$start
 if(-not $process.Start()) { throw 'Cannot start private initializer' }
 $payload=@{token=(Read-PrivateString $secureToken);username=$username;password=(Read-PrivateString $password);confirmation=(Read-PrivateString $confirmation)} | ConvertTo-Json -Compress
 $process.StandardInput.Write($payload)
 $process.StandardInput.Close()
 $payload=$null
 # The Node entry deliberately emits only a fixed error or sanitized counts.
 $outputTask=$process.StandardOutput.ReadToEndAsync()
 $errorTask=$process.StandardError.ReadToEndAsync()
 $process.WaitForExit()
 if($process.ExitCode -ne 0) { throw 'Initialization stopped; inspect target/state before any rerun' }
 Write-Output $outputTask.Result.Trim()
} finally {
 $payload=$null
 $secureToken.Dispose();$password.Dispose();$confirmation.Dispose()
 if($process) { $process.Dispose() }
}
