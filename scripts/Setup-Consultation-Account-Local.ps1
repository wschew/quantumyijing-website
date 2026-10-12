# Windows PowerShell 5.1: local administrative initialization or in-place recovery only.
param(
 [Parameter(Mandatory=$true)][string]$LocalDatabase,
 [ValidateSet('Initialize','Rotate')][string]$Mode='Initialize',
 [int]$ExpectedVersion=0,
 [switch]$AuthorizeLocalRecovery
)
$ErrorActionPreference='Stop'
$previousEncoding=$OutputEncoding
$first=$null; $second=$null; $payload=$null; $firstPointer=[IntPtr]::Zero; $secondPointer=[IntPtr]::Zero
try {
 if($Mode -eq 'Rotate') {
  if(-not $AuthorizeLocalRecovery -or $ExpectedVersion -lt 1){throw 'Explicit local recovery authorization and expected version required.'}
  if((Read-Host 'Type ROTATE to authorize in-place local credential recovery and revoke existing sessions') -cne 'ROTATE'){throw 'Recovery not authorized.'}
 }
 $username=Read-Host 'Dedicated consultation account name'
 $first=Read-Host 'New password (20+ characters; save privately in encrypted password manager)' -AsSecureString
 $second=Read-Host 'Confirm password' -AsSecureString
 $firstPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
 $secondPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
 $payload=@{username=$username;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer);confirmation=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)}
 $OutputEncoding=New-Object Text.UTF8Encoding($false)
 $tool=Join-Path $PSScriptRoot 'setup-consultation-account-local.mjs'
 if($Mode -eq 'Rotate') {
  $payload | ConvertTo-Json -Compress | & node $tool --local-db $LocalDatabase --rotate --expected-version $ExpectedVersion --authorized-local-recovery
 } else {
  $payload | ConvertTo-Json -Compress | & node $tool --local-db $LocalDatabase --initialize
 }
 if($LASTEXITCODE -ne 0){throw 'Local administrative action did not complete.'}
} finally {
 if($firstPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)}
 if($secondPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)}
 if($null -ne $payload){$payload.password=$null;$payload.confirmation=$null;$payload.Clear()}
 if($null -ne $first){$first.Dispose()}; if($null -ne $second){$second.Dispose()}
 $OutputEncoding=$previousEncoding
}