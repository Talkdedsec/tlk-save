#Requires -RunAsAdministrator
<#
  tlk-save server for Windows Server, with automatic HTTPS.

  Run in an elevated PowerShell on the server:

    irm https://raw.githubusercontent.com/Talkdedsec/tlk-save/main/server/deploy/windows/install.ps1 | iex

  Running it again updates every component in place.

  Optional environment variables, set before running:
    TLK_SAVE_DOMAIN   A domain pointing at this server. Default: <ip>.sslip.io
    TLK_SAVE_ORIGINS  Sites allowed to use the API. Default: https://talkdedsec.github.io
    TLK_SAVE_ROOT     Install folder. Default: C:\tlk-save
#>

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest is many times faster without the bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# `#Requires` is ignored when the script is piped into iex, so check by hand.
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this in PowerShell opened with 'Run as administrator'."
}

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Fetch($url, $out) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out }

$Root = if ($env:TLK_SAVE_ROOT) { $env:TLK_SAVE_ROOT } else { "C:\tlk-save" }
$Origins = if ($env:TLK_SAVE_ORIGINS) { $env:TLK_SAVE_ORIGINS } else { "https://talkdedsec.github.io" }
$Domain = $env:TLK_SAVE_DOMAIN
if (-not $Domain) {
    $ip = (Invoke-RestMethod -UseBasicParsing https://api.ipify.org).ToString().Trim()
    $Domain = ($ip -replace '\.', '-') + ".sslip.io"
}

$Bin = Join-Path $Root "bin"
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force $Bin, $Logs, (Join-Path $Root "work") | Out-Null

foreach ($port in 80, 443) {
    $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } |
        Where-Object { $_ -and $_ -ne "caddy" } | Select-Object -First 1
    if ($owner) { throw "Port $port is already used by '$owner'. Stop it (IIS: Stop-Service W3SVC) and run again." }
}

Step "Stopping the running copy, if any"
foreach ($task in "tlk-save", "tlk-save-caddy") {
    if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $task }
}
Get-Process tlk-save, caddy, yt-dlp -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$temp = Join-Path $env:TEMP "tlk-save-install"
Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $temp | Out-Null

Step "tlk-save server"
Fetch "https://github.com/Talkdedsec/tlk-save/releases/latest/download/tlk-save-x86_64-pc-windows-msvc.exe" "$Bin\tlk-save.exe"

Step "yt-dlp"
Fetch "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" "$Bin\yt-dlp.exe"

Step "ffmpeg (yt-dlp's own build)"
Fetch "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" "$temp\ffmpeg.zip"
Expand-Archive "$temp\ffmpeg.zip" "$temp\ffmpeg"
Get-ChildItem "$temp\ffmpeg" -Recurse -Include ffmpeg.exe, ffprobe.exe | Copy-Item -Destination $Bin -Force

Step "Deno (YouTube needs a JavaScript runtime)"
Fetch "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" "$temp\deno.zip"
Expand-Archive -Force "$temp\deno.zip" $Bin

Step "Caddy (HTTPS)"
Fetch "https://caddyserver.com/api/download?os=windows&arch=amd64" "$Bin\caddy.exe"

Step "Configuration for https://$Domain"
@"
{
	admin off
}

$Domain {
	reverse_proxy 127.0.0.1:8787 {
		flush_interval -1
	}
}
"@ | Set-Content -Encoding ascii (Join-Path $Root "Caddyfile")

@"
@echo off
set PATH=%~dp0bin;%PATH%
"%~dp0bin\tlk-save.exe" --listen 127.0.0.1:8787 --origins $Origins --trust-proxy --work-dir "%~dp0work" --ytdlp "%~dp0bin\yt-dlp.exe" --ffmpeg "%~dp0bin" --max-filesize-mb 4096 >> "%~dp0logs\tlk-save.log" 2>&1
"@ | Set-Content -Encoding ascii (Join-Path $Root "run-server.cmd")

@"
@echo off
"%~dp0bin\caddy.exe" run --config "%~dp0Caddyfile" --adapter caddyfile >> "%~dp0logs\caddy.log" 2>&1
"@ | Set-Content -Encoding ascii (Join-Path $Root "run-caddy.cmd")

Step "Starting with Windows, restarting after a crash"
function Register-Background($name, $script) {
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$script`"" -WorkingDirectory $Root
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $name
}
Register-Background "tlk-save" (Join-Path $Root "run-server.cmd")
Register-Background "tlk-save-caddy" (Join-Path $Root "run-caddy.cmd")

Step "Opening ports 80 and 443 in Windows Firewall"
Get-NetFirewallRule -DisplayName "tlk-save (HTTP/HTTPS)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "tlk-save (HTTP/HTTPS)" -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow | Out-Null

Step "Waiting for the certificate and the first answer"
$url = "https://$Domain/api/health"
for ($i = 0; $i -lt 45; $i++) {
    try {
        $health = Invoke-RestMethod -UseBasicParsing -TimeoutSec 5 $url
        if ($health.ok) {
            Write-Host ""
            Write-Host "tlk-save is running at https://$Domain  (yt-dlp $($health.ytdlp))" -ForegroundColor Green
            Write-Host "Logs: $Logs"
            return
        }
    } catch { }
    Start-Sleep -Seconds 4
}
Write-Host ""
Write-Host "The server started, but $url does not answer yet." -ForegroundColor Yellow
Write-Host "If your hosting panel has its own firewall, open TCP 80 and 443 there. Logs: $Logs"
