# run-db-tests.ps1
# Financial-boundary + authorization DB security suites:
#   fresh postgres:16 container -> shim -> migrations 001..018 -> fixtures ->
#   sequential financial invariants -> 5 concurrent scenarios -> verification ->
#   phase-2 authorization suite (identity binding, RLS matrix, trigger rules).
#
# Usage:  powershell -ExecutionPolicy Bypass -File supabase\tests\run-db-tests.ps1 [-Keep]
# -Keep   leave the container running for manual inspection.
param([switch]$Keep)

$ErrorActionPreference = 'Stop'
$testsDir = $PSScriptRoot
$root = Split-Path -Parent $testsDir
$migrationsDir = Join-Path $root 'migrations'
$container = 'bumpone-db-test'
$image = 'postgres:16-alpine'

function Invoke-Step {
  param([string]$Name, [string[]]$DockerArgs)
  Write-Host "==> $Name" -ForegroundColor Cyan
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw "STEP FAILED: $Name (exit code $LASTEXITCODE)" }
}

# ------------------------------------------------------------------------------
# 0. Fresh container
# ------------------------------------------------------------------------------
& docker rm -f $container
Write-Host "==> starting $image" -ForegroundColor Cyan
& docker run -d --name $container `
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bumpone `
  -p 55432:5432 $image postgres -c max_connections=300 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'docker run failed' }

$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  # pg_isready alone passes against the entrypoint's temporary init server, which
  # then shuts down (the shim died with "database system is shutting down").
  # Require the final-server handoff marker AND a real query. Relax EAP while
  # capturing docker's native stderr so it merges as strings instead of
  # terminating ErrorRecords under EAP=Stop (cmd /c was Windows-only; this
  # formulation works in both Windows PowerShell 5.1 and pwsh 7 on Linux CI).
  $ErrorActionPreference = 'Continue'
  $handoff = (docker logs $container 2>&1 | Out-String)
  $probe = (docker exec $container psql -U postgres -d bumpone -Atc 'select 1' 2>&1 | Out-String)
  $probeExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($handoff -match 'ready for start up') {
    if (($probeExit -eq 0) -and ($probe -match '1')) { $ready = $true; break }
  }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'postgres did not become ready within 90s' }

$psql = @('exec', $container, 'psql', '-U', 'postgres', '-d', 'bumpone', '-v', 'ON_ERROR_STOP=1', '-q')

try {
  Invoke-Step 'copy test files' @('cp', $testsDir, "${container}:/tmp/tests")
  Invoke-Step 'copy migrations' @('cp', $migrationsDir, "${container}:/tmp/migrations")

  # 1. Supabase shim (roles + auth schema) then every migration in order
  Invoke-Step 'shim' ($psql + @('-f', '/tmp/tests/shim.sql'))
  $migrations = Get-ChildItem $migrationsDir -Filter *.sql | Sort-Object Name
  foreach ($m in $migrations) {
    Invoke-Step ('migration ' + $m.Name) ($psql + @('-f', ('/tmp/migrations/' + $m.Name)))
  }

  # 2. Fixtures + sequential financial invariants (adversarial single-actor suite)
  Invoke-Step 'seed fixtures' ($psql + @('-f', '/tmp/tests/seed.sql'))
  Invoke-Step 'financial invariants (sequential)' ($psql + @('-f', '/tmp/tests/10_invariants.sql'))

  # 3. Concurrency scenarios (shared barrier, parallel webhook workers)
  function Invoke-Workers {
    param([string]$Scenario, [string[]]$WorkerArgs)
    $start = [DateTime]::UtcNow.AddSeconds(10).ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-Host "==> concurrency scenario: $Scenario (barrier $start)" -ForegroundColor Cyan
    & docker exec $container sh /tmp/tests/run_workers.sh @WorkerArgs $start
    if ($LASTEXITCODE -ne 0) {
      Write-Host "==> worker logs for $Scenario" -ForegroundColor Yellow
      & docker exec $container sh -c "tail -n 30 /tmp/tests/logs/$Scenario*.log"
      throw "concurrency scenario failed: $Scenario"
    }
  }

  # A: 10 workers, ONE shared webhook event id (replay under race)
  Invoke-Workers 'dup_event'   @('dup_event', 'fixed', '10', '1000', '1', '1', '784', '261')
  # B: 10 workers, shared quote, distinct event ids (quote double-spend)
  Invoke-Workers 'same_quote'  @('same_quote', 'fixed', '10', '1000', '0', '1', '785', '262')
  # C: 10 distinct legitimate concurrent purchases
  Invoke-Workers 'distinct'    @('distinct', 'range', '10', '20000', '0', '0', '320', '300')
  # D: two purchases racing on the same project
  $start = [DateTime]::UtcNow.AddSeconds(10).ToString('yyyy-MM-ddTHH:mm:ssZ')
  Write-Host "==> concurrency scenario: double_tap (barrier $start)" -ForegroundColor Cyan
  & docker exec $container sh /tmp/tests/run_double_tap.sh $start
  if ($LASTEXITCODE -ne 0) {
    Write-Host '==> worker logs for double_tap' -ForegroundColor Yellow
    & docker exec $container sh -c 'tail -n 30 /tmp/tests/logs/double_tap*.log'
    throw 'concurrency scenario failed: double_tap'
  }
  # E: 100 distinct legitimate concurrent purchases
  Invoke-Workers 'bulk'        @('bulk', 'range', '100', '15000', '0', '0', '600', '500')

  # 4. Post-concurrency verification of every financial invariant
  Invoke-Step 'concurrency verification' ($psql + @('-f', '/tmp/tests/verify_concurrency.sql'))

  # 5. Phase 2 authorization suite (runs last; mutates fixture rows for trigger tests)
  Invoke-Step 'authorization suite' ($psql + @('-f', '/tmp/tests/11_authorization.sql'))

  # 6. Phase 5 killswitch RLS matrix (system_state; only service role may pause)
  Invoke-Step 'system_state killswitch suite' ($psql + @('-f', '/tmp/tests/12_system_state.sql'))

  # 7. SEC-018 moderation lifecycle (payment never approves; pending invisible)
  Invoke-Step 'moderation lifecycle suite' ($psql + @('-f', '/tmp/tests/13_moderation.sql'))

  Write-Host ''
  Write-Host 'ALL DB SECURITY TESTS PASSED' -ForegroundColor Green
}
finally {
  if ($Keep) {
    Write-Host "container '$container' kept running (remove with: docker rm -f $container)"
  } else {
    & docker rm -f $container
    Write-Host "container '$container' removed"
  }
}
