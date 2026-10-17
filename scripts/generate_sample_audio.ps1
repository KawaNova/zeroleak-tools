# scripts/generate_sample_audio.ps1
# Windows標準の日本語TTS音声エンジン（Microsoft Haruka）を用いて
# 外部通信0バイト・完全ローカルで本物の日本語会議録音WAV音声を生成する

$ErrorActionPreference = "Stop"

$publicDir = [System.IO.Path]::GetFullPath("public")
$evalDir = [System.IO.Path]::GetFullPath("evaluation/audio")
$distDir = [System.IO.Path]::GetFullPath("dist")

New-Item -ItemType Directory -Path $evalDir -Force | Out-Null

$outPublicWav = Join-Path $publicDir "sample_confidential_meeting.wav"
$outEvalWav = Join-Path $evalDir "01_sample_confidential_meeting.wav"

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft Haruka Desktop")
$synth.Rate = 0  # 標準の読み上げ速度

$synth.SetOutputToWaveFile($outPublicWav)

$pb = New-Object System.Speech.Synthesis.PromptBuilder

# セグメント 1: 経営方針
$pb.AppendText("本日の経営会議を始めます。新製品の想定単価は月額49,800円、初期導入目標は300社です。")
$pb.AppendBreak([TimeSpan]::FromMilliseconds(700))

# セグメント 2: 電話・メール
$pb.AppendText("法務担当の鈴木より報告します。顧客窓口の直通電話は 090-1234-5678、連絡先は legal-team@example.co.jp に一本化しました。")
$pb.AppendBreak([TimeSpan]::FromMilliseconds(700))

# セグメント 3: マイナンバー・機密指示
$pb.AppendText("マイナンバー確認番号 1234-5678-9012 などの機密データは外部クラウドへ送信せず、すべてローカル環境で処理してください。")

$synth.Speak($pb)
$synth.Dispose()

Copy-Item $outPublicWav $outEvalWav -Force
if (Test-Path $distDir) {
    Copy-Item $outPublicWav (Join-Path $distDir "sample_confidential_meeting.wav") -Force
}

$fileInfo = Get-Item $outPublicWav
Write-Host "Real Japanese Meeting WAV successfully created!"
Write-Host " - Path: $($fileInfo.FullName)"
Write-Host " - Size: $([math]::Round($fileInfo.Length / 1024, 1)) KB"
