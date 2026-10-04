<#
  Closes what a single-purpose web server never needs to show the internet,
  without ever cutting off Remote Desktop.

  Run in an elevated PowerShell on the server, before or after install.ps1:

    irm https://raw.githubusercontent.com/Talkdedsec/tlk-save/main/server/deploy/windows/harden.ps1 | iex

  It allows Remote Desktop and the web ports first, then blocks Windows file
  sharing and RPC from outside, then makes sure Windows Firewall is on and
  drops anything not explicitly allowed. Running it again changes nothing.
#>

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this in PowerShell opened with 'Run as administrator'."
}

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Set-Rule($name, $protocol, $ports, $action) {
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol $protocol -LocalPort $ports `
        -Action $action -Profile Any | Out-Null
}

$rdpPort = (Get-ItemProperty "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp").PortNumber

Step "Allowing Remote Desktop (port $rdpPort) before anything else"
Set-Rule "tlk-save keep: Remote Desktop TCP" TCP $rdpPort Allow
Set-Rule "tlk-save keep: Remote Desktop UDP" UDP $rdpPort Allow

Step "Allowing the website (80, 443)"
Set-Rule "tlk-save (HTTP/HTTPS)" TCP @(80, 443) Allow
Set-Rule "tlk-save (HTTP/3)" UDP 443 Allow

Step "Blocking Windows file sharing and RPC from outside (135, 137-139, 445)"
Set-Rule "tlk-save block: SMB/RPC TCP" TCP @(135, 139, 445) Block
Set-Rule "tlk-save block: NetBIOS UDP" UDP @(137, 138) Block

Step "Turning Windows Firewall on"
# Windows protects the firewall service's settings even from administrators,
# so it is only started if needed, never reconfigured.
if ((Get-Service MpsSvc).Status -ne "Running") {
    try {
        Start-Service MpsSvc
    } catch {
        throw "The Windows Firewall service (MpsSvc) is stopped and could not be started: $_"
    }
}
Set-NetFirewallProfile -Profile Domain, Private, Public -Enabled True `
    -DefaultInboundAction Block -DefaultOutboundAction Allow

Write-Host ""
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction -AutoSize
Write-Host "Firewall is on. Remote Desktop, 80 and 443 are open; file sharing and RPC are closed." -ForegroundColor Green
