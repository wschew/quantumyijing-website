# Windows PowerShell 5.1. Synthetic-only loopback demonstration; no credential files.
param([ValidateRange(1024,65535)][int]$Port=8789)
$ErrorActionPreference='Stop'
$first=$null; $second=$null; $payload=$null; $bytes=$null
$firstPointer=[IntPtr]::Zero; $secondPointer=[IntPtr]::Zero; $process=$null
try {
 if((Read-Host 'Type SYNTHETIC to confirm no real customer data or Production credentials will be used') -cne 'SYNTHETIC'){throw 'Synthetic mode not confirmed.'}
 $first=Read-Host 'Temporary local-only password (20+ characters; never use ADMIN_TOKEN or a Production password)' -AsSecureString
 $second=Read-Host 'Confirm temporary password' -AsSecureString
 $firstPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
 $secondPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
 $payload=@{syntheticOnly=$true;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer);confirmation=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node -ErrorAction Stop).Source
 $start.Arguments='scripts/run-consultation-workflow-local.mjs --synthetic-local --port '+$Port
 $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true
 $process=New-Object Diagnostics.Process
 $process.StartInfo=$start
 if(-not $process.Start()){throw 'Local process start failed.'}
 $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
 $process.StandardInput.Close()
} finally {
 if($firstPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)}
 if($secondPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)}
 if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($null -ne $payload){$payload.password=$null;$payload.confirmation=$null;$payload.Clear()}
 if($null -ne $first){$first.Dispose()}; if($null -ne $second){$second.Dispose()}
}
try {$process.WaitForExit();if($process.ExitCode -ne 0){throw 'Synthetic local runner stopped with an error.'}} finally {if($null -ne $process){$process.Dispose()}}
