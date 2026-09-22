# SecureAI Claude proxy-env helper (Windows PowerShell) for local sessions.
# Does NOT claim Protected — Core remains the authority.
# Desktop-managed Claude sessions may ignore these env vars.

function Resolve-SecureAiProxyUrl {
    if ($env:SECUREAI_PROXY_URL -and $env:SECUREAI_PROXY_URL.Trim() -ne "") {
        return $env:SECUREAI_PROXY_URL.Trim()
    }
    $secureai = Get-Command secureai -ErrorAction SilentlyContinue
    if ($secureai) {
        $lines = & secureai proxy-env 2>$null
        foreach ($line in $lines) {
            if ($line -match '^export SECUREAI_PROXY_URL=(.+)$') {
                return $Matches[1]
            }
        }
    }
    $port = if ($env:SECUREAI_GATEWAY_PORT) { $env:SECUREAI_GATEWAY_PORT } else { "17864" }
    return "http://127.0.0.1:$port"
}

$Url = Resolve-SecureAiProxyUrl
$env:HTTP_PROXY = $Url
$env:HTTPS_PROXY = $Url
$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:SECUREAI_PROXY_URL = $Url

Write-Host "secureai: Claude local proxy env set (HTTP_PROXY/HTTPS_PROXY → $Url)"
Write-Host "secureai: Core remains Protected authority; Desktop-managed sessions may ignore proxy"

Write-Output "HTTP_PROXY=$Url"
Write-Output "HTTPS_PROXY=$Url"
Write-Output "NO_PROXY=localhost,127.0.0.1,::1"
Write-Output "SECUREAI_PROXY_URL=$Url"
