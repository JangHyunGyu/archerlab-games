param(
  [Parameter(Mandatory = $true)]
  [string] $File
)

$ErrorActionPreference = "Stop"
$browserExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (!(Test-Path -LiteralPath $browserExe)) {
  $browserExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$profile = Join-Path $env:TEMP ("codex-webp-" + [guid]::NewGuid().ToString("N"))
$port = Get-Random -Minimum 40000 -Maximum 49999
$browser = $null
$socket = $null
$script:cdpId = 0

function FileUrl([string] $Path) {
  "file:///" + (Resolve-Path -LiteralPath $Path).Path.Replace("\", "/")
}

function Receive-Cdp([System.Net.WebSockets.ClientWebSocket] $Socket) {
  $buffer = New-Object byte[] 1048576
  $stream = New-Object System.IO.MemoryStream
  do {
    $segment = [ArraySegment[byte]]::new($buffer)
    $result = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $stream.Write($buffer, 0, $result.Count)
  } until ($result.EndOfMessage)
  [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
}

function Invoke-Cdp(
  [System.Net.WebSockets.ClientWebSocket] $Socket,
  [string] $Method,
  [hashtable] $Params = @{}
) {
  $script:cdpId += 1
  $payload = @{ id = $script:cdpId; method = $Method; params = $Params } | ConvertTo-Json -Depth 12 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $Socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {
    $json = Receive-Cdp $Socket | ConvertFrom-Json
    if ($json.id -eq $script:cdpId) {
      if ($json.error) { throw ($json.error | ConvertTo-Json -Compress) }
      return $json
    }
  }
}

try {
  New-Item -ItemType Directory -Force -Path $profile | Out-Null
  $browser = Start-Process -FilePath $browserExe -ArgumentList @(
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--remote-debugging-port=$port",
    "--user-data-dir=$profile",
    "about:blank"
  ) -WindowStyle Hidden -PassThru

  $page = $null
  for ($i = 0; $i -lt 80; $i += 1) {
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json" -TimeoutSec 1
      $page = @($targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1)[0]
      if ($page -and $page.webSocketDebuggerUrl) { break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (!$page -or !$page.webSocketDebuggerUrl) { throw "No page target." }

  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync([Uri] $page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  Invoke-Cdp $socket "Runtime.enable" | Out-Null
  Invoke-Cdp $socket "Page.enable" | Out-Null
  Invoke-Cdp $socket "Page.navigate" @{ url = FileUrl ".\school-zombie-defense\index.html" } | Out-Null
  Start-Sleep -Milliseconds 500

  $src = FileUrl $File | ConvertTo-Json -Compress
  $expression = @"
(async () => {
  const img = new Image();
  img.src = $src;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/webp", 0.92).split(",")[1];
})()
"@
  $response = Invoke-Cdp $socket "Runtime.evaluate" @{
    expression = $expression
    awaitPromise = $true
    returnByValue = $true
  }
  if ($response.result.exceptionDetails) {
    throw ($response.result.exceptionDetails | ConvertTo-Json -Depth 8 -Compress)
  }
  $inputPath = (Resolve-Path -LiteralPath $File).Path
  $target = [System.IO.Path]::ChangeExtension($inputPath, ".webp")
  [System.IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($response.result.result.value))
  Get-Item -LiteralPath $target | Select-Object Name, Length, LastWriteTime
} finally {
  if ($socket) { $socket.Dispose() }
  if ($browser -and !$browser.HasExited) { Stop-Process -Id $browser.Id -Force }
  Start-Sleep -Milliseconds 400
  if (Test-Path -LiteralPath $profile) { Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue }
}
