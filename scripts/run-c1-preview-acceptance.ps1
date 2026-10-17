param([switch]$SelfTest)
$ErrorActionPreference='Stop'
# Run in a private console without transcription, tracing, or credential recording.
$secret=$null;$process=$null;$payload=$null;$pointer=[IntPtr]::Zero
try {
 if($SelfTest){$secret=ConvertTo-SecureString -String ('a'*64) -AsPlainText -Force}
 else {$secret=Read-Host 'Existing C1 administrator secret (qyadmin)' -AsSecureString}
 $scriptPath=Join-Path $PSScriptRoot 'run-c1-preview-acceptance.mjs'
 $mode=if($SelfTest){'--local-self-test'}else{'--execute-approved-preview'}
 $start=New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node -CommandType Application).Source
 $start.Arguments='"'+$scriptPath+'" '+$mode
 $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 # Remove inherited credential values/debuggers; only the private pipe supplies the C1 secret.
 foreach($name in @('CONSULTATION_ADMIN_SECRET','C1_ADMIN_COOKIE','C1_ADMIN_CSRF','NODE_OPTIONS','NODE_DEBUG')){$start.EnvironmentVariables.Remove($name)}
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$start
 if(-not $process.Start()){throw 'Unable to start private test process'}
 $outputTask=$process.StandardOutput.ReadToEndAsync();$errorTask=$process.StandardError.ReadToEndAsync()
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try {$payload=@{secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)} | ConvertTo-Json -Compress}
 finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$pointer=[IntPtr]::Zero}
 $writer=New-Object System.IO.StreamWriter -ArgumentList $process.StandardInput.BaseStream,(New-Object System.Text.UTF8Encoding($false))
 try {$writer.Write($payload)}finally {$writer.Dispose();$payload=$null;$secret.Dispose();$secret=$null}
 $process.WaitForExit()
 # Never forward raw stdout/stderr. Reconstruct only the fixed, nonsensitive result fields.
 try {$result=$outputTask.Result.Trim() | ConvertFrom-Json}catch{throw 'Test process returned no sanitized result; inspect target before any retry'}
 if($result.result -notin @('PASS','BLOCKED','LOCAL_SELF_TEST_PASS')){throw 'Unexpected test result; raw output suppressed'}
 $safe=[ordered]@{result=$result.result}
 foreach($key in @('stoppedStage','cleanup','logout')){if($result.PSObject.Properties.Name -contains $key){$value=[string]$result.$key;if($value -match '^[A-Za-z0-9 ;_-]{1,100}$'){$safe[$key]=$value}}}
 foreach($key in @('checks','assertions')){if($result.PSObject.Properties.Name -contains $key){$value=0;if([int]::TryParse([string]$result.$key,[ref]$value)){$safe[$key]=$value}}}
 foreach($key in @('historicalUnchanged','sessionDisposed','underReview','automaticAvailability','paymentPending','singleReservation')){if($result.PSObject.Properties.Name -contains $key -and $result.$key -is [bool]){$safe[$key]=$result.$key}}
 foreach($key in @('runId','bookingReference')){if($result.PSObject.Properties.Name -contains $key -and [string]$result.$key -match '^(BAZI-)?[a-f0-9-]{36}$'){$safe[$key]=$result.$key}}
 Write-Output ($safe | ConvertTo-Json -Compress)
 if($process.ExitCode -ne 0 -or $result.result -eq 'BLOCKED'){throw 'Test stopped. No automatic retry; inspect the reported stage and exact test records.'}
} finally {
 $payload=$null
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($secret){$secret.Dispose()}
 if($process){$process.Dispose()}
}
