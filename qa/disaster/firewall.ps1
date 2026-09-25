param([ValidateSet('apply','clear')][string]$Mode,[string]$PolicyFile,[string]$Group)
$ErrorActionPreference = 'Stop'
if (-not $env:GITHUB_ACTIONS -or $env:RUNNER_OS -ne 'Windows') { throw 'Only run on the disposable Windows Actions runner.' }
if ($Group -notmatch '^ArNS-Mesh-Disaster-[0-9]+$') { throw 'Invalid isolated rule group.' }
$stateFile = Join-Path $env:RUNNER_TEMP "$Group-profiles.json"
Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Mode -eq 'clear') {
 if (Test-Path -LiteralPath $stateFile) {
  foreach ($row in (Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json)) { Set-NetFirewallProfile -Profile $row.name -Enabled ([bool]$row.enabled) }
  Remove-Item -LiteralPath $stateFile
 }
 Clear-DnsClientCache; Write-Output '{"cleared":true,"previousProfileSettingsRestored":true}'; exit 0
}
$policy = Get-Content -LiteralPath $PolicyFile -Raw | ConvertFrom-Json
$profiles = @(Get-NetFirewallProfile)
if (-not (Test-Path -LiteralPath $stateFile)) { @($profiles | ForEach-Object { @{ name="$($_.Name)";enabled=[bool]$_.Enabled } }) | ConvertTo-Json | Set-Content -LiteralPath $stateFile }
Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True
$profiles = @(Get-NetFirewallProfile)
$number = 0
foreach ($program in $policy.programs) {
 if (-not (Test-Path -LiteralPath $program)) { throw 'Test executable missing.' }
 foreach ($rule in $policy.rules) {
  $number++
  $args = @{ DisplayName="$Group-$number"; Group=$Group; Direction='Outbound'; Action='Block'; Enabled='True'; Profile='Any'; Program=$program; RemoteAddress=@($rule.addresses); Protocol=$rule.protocol }
  if ($rule.ports) { $args.RemotePort = @($rule.ports) }
  New-NetFirewallRule @args | Out-Null
 }
}
# Block OS resolver requests as well as direct DNS/DoH in the tested executable.
foreach ($protocol in @('TCP','UDP')) {
 New-NetFirewallRule -DisplayName "$Group-dns-$protocol" -Group $Group -Direction Outbound -Action Block -Profile Any -Protocol $protocol -RemotePort 53,853 | Out-Null
}
New-NetFirewallRule -DisplayName "$Group-dnscache" -Group $Group -Direction Outbound -Action Block -Profile Any -Service Dnscache | Out-Null
Clear-DnsClientCache
$rules = @(Get-NetFirewallRule -PolicyStore ActiveStore -Group $Group)
if ($rules.Count -ne ($number+3) -or @($rules | Where-Object { $_.Enabled -ne 'True' -or $_.Action -ne 'Block' }).Count) { throw 'Active firewall rules do not match requested block policy.' }
@{ activeBlockRules=$rules.Count; profiles=@($profiles | ForEach-Object { @{ name="$($_.Name)";enabled=[bool]$_.Enabled } }); globalDnsPortsBlocked=$true; dnsCacheServiceBlocked=$true; ipv6Blocked=$true; programCount=@($policy.programs).Count } | ConvertTo-Json -Depth 5 -Compress
