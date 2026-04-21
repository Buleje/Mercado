param(
  [int]$MaxHours = 12,
  [switch]$DryRun
)

$procs = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ne $null } | ForEach-Object {
  $ageHours = ((Get-Date) - $_.StartTime).TotalHours
  [PSCustomObject]@{
    ProcessId = $_.Id
    StartTime = $_.StartTime.ToString('yyyy-MM-ddTHH:mm:ss')
    AgeHours = [math]::Round($ageHours, 1)
    CPU = [math]::Round($_.CPU, 1)
  }
}

if (-not $procs) {
  Write-Output "dev-guardian: no node processes alive."
  exit 0
}

$zombies = $procs | Where-Object { $_.AgeHours -gt $MaxHours }

if (-not $zombies) {
  Write-Output "dev-guardian: $($procs.Count) node processes, 0 zombies (> $MaxHours h)."
  exit 0
}

Write-Output "dev-guardian: $($zombies.Count) zombie(s) > $MaxHours h"
foreach ($z in $zombies) {
  Write-Output ("  PID {0}  age {1}h  CPU {2}s  start {3}" -f $z.ProcessId, $z.AgeHours, $z.CPU, $z.StartTime)
}

if ($DryRun) {
  Write-Output "DryRun - nothing killed."
  exit 0
}

$killed = 0
foreach ($z in $zombies) {
  try {
    Stop-Process -Id $z.ProcessId -Force -ErrorAction Stop
    $killed = $killed + 1
  } catch {
    # ignore
  }
}
Write-Output ("OK killed {0} / {1} zombies." -f $killed, $zombies.Count)
