param([string]$ImagePath)

# Le um print (area de transferencia ou arquivo) e devolve o texto via OCR
# nativo do Windows. Gerado pelo GeckoAi; regravado a cada abertura do projeto.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Fail($code, $message) {
  Write-Output ('ERRO: ' + $message)
  exit $code
}

try {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  # 1) Obtem a imagem: caminho informado > imagem na area de transferencia >
  #    arquivo de imagem copiado no Explorer.
  $imageStream = $null
  $bitmap = $null
  $origin = ''
  if ($ImagePath) {
    if (-not (Test-Path -LiteralPath $ImagePath)) {
      Fail 1 'arquivo de imagem nao encontrado no caminho informado.'
    }
    $bytes = [System.IO.File]::ReadAllBytes($ImagePath)
    $imageStream = New-Object System.IO.MemoryStream(,$bytes)
    $bitmap = [System.Drawing.Image]::FromStream($imageStream)
    $origin = 'arquivo'
  } else {
    $fromClipboard = [System.Windows.Forms.Clipboard]::GetImage()
    if ($fromClipboard) {
      $bitmap = $fromClipboard
      $origin = 'area de transferencia'
    } else {
      $dropList = [System.Windows.Forms.Clipboard]::GetFileDropList()
      foreach ($candidate in $dropList) {
        $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
        if ($extension -eq '.png' -or $extension -eq '.jpg' -or $extension -eq '.jpeg' -or $extension -eq '.bmp' -or $extension -eq '.gif') {
          if (Test-Path -LiteralPath $candidate) {
            $bytes = [System.IO.File]::ReadAllBytes($candidate)
            $imageStream = New-Object System.IO.MemoryStream(,$bytes)
            $bitmap = [System.Drawing.Image]::FromStream($imageStream)
            $origin = 'arquivo copiado'
            break
          }
        }
      }
    }
    if (-not $bitmap) {
      Fail 1 'nenhuma imagem na area de transferencia. Oriente o usuario: tire o print de novo (Win+Shift+S) e repita o pedido em seguida, sem copiar outra coisa no meio.'
    }
  }

  # 2) Amplia 2x quando a imagem e pequena: o OCR do Windows foi calibrado
  #    para documento, e texto de interface em 1x sai mastigado (medido).
  $scale = 1
  if ($bitmap.Width -lt 2000) { $scale = 2 }
  $width = $bitmap.Width * $scale
  $height = $bitmap.Height * $scale
  $scaled = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($scaled)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($bitmap, 0, 0, $width, $height)
  $graphics.Dispose()

  $tempPath = Join-Path $env:TEMP ('gecko-ler-print-' + [Guid]::NewGuid().ToString('N') + '.png')
  $scaled.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $scaled.Dispose()

  # 3) OCR via WinRT (Windows.Media.Ocr). O truque do AsTask e necessario
  #    porque o PowerShell 5.1 nao espera IAsyncOperation sozinho.
  $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation') } |
    Select-Object -First 1
  function Await($operation, $resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    $task.Result
  }

  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) {
    foreach ($language in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
      if ($engine) { break }
    }
  }
  if (-not $engine) {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    Fail 2 'o OCR do Windows nao tem nenhum idioma instalado nesta maquina.'
  }

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tempPath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $software = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult])
  $stream.Dispose()
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue

  # 4) Saida: cabecalho + linhas na ordem visual. O cabecalho e ASCII puro;
  #    o texto reconhecido e dado de runtime e sai em UTF-8.
  $lineCount = @($result.Lines).Count
  Write-Output ('LIDO: imagem ' + $bitmap.Width + 'x' + $bitmap.Height + ' (' + $origin + ') | idioma ' + $engine.RecognizerLanguage.LanguageTag + ' | ' + $lineCount + ' linhas')
  if ($lineCount -eq 0) {
    Write-Output 'AVISO: nenhum texto reconhecido na imagem. Ou o print nao contem texto, ou o texto esta minusculo/inclinado demais para o OCR.'
  } else {
    Write-Output '--- transcricao aproximada, de cima para baixo ---'
    foreach ($line in $result.Lines) { Write-Output $line.Text }
  }
  $bitmap.Dispose()
  if ($imageStream) { $imageStream.Dispose() }
  exit 0
} catch {
  Write-Output ('ERRO: falha inesperada ao ler o print (' + $_.Exception.Message + ')')
  exit 3
}
