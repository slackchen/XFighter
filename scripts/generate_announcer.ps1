$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$sfxDir = Join-Path $PSScriptRoot "..\public\assets\audio\sfx"
New-Item -ItemType Directory -Force -Path $sfxDir | Out-Null

$lines = @{
    "ann_round1.mp3"  = "Round One!"
    "ann_round2.mp3"  = "Round Two!"
    "ann_final.mp3"   = "Final Round!"
    "ann_fight.mp3"   = "Fight!"
    "ann_counter.mp3" = "Counter!"
    "ann_ko.mp3"      = "K. O.!"
    "ann_perfect.mp3" = "Perfect!"
    "ann_winner.mp3"  = "Winner!"
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice("Microsoft Zira Desktop")
} catch {
    Write-Warning "Microsoft Zira Desktop not found, using default voice."
}
$synth.Rate = 1
$synth.Volume = 100

foreach ($kv in $lines.GetEnumerator()) {
    $outFile = Join-Path $sfxDir $kv.Key
    $tmpWav = [System.IO.Path]::GetTempFileName() + ".wav"
    $synth.SetOutputToWaveFile($tmpWav)
    $synth.Speak($kv.Value)
    $synth.SetOutputToNull()

    # Arena announcer broadcast filter chain with stereo slapback & punchy presence
    $filter = "aresample=44100,highpass=f=180,lowpass=f=6800,equalizer=f=2400:width_type=h:width=1200:g=4,aecho=0.8:0.75:45|90:0.32|0.16,acompressor=threshold=-16dB:ratio=4,alimiter=limit=0.95"
    & ffmpeg -y -hide_banner -loglevel error -i $tmpWav -af $filter -ac 2 -c:a libmp3lame -b:a 192k $outFile
    if (Test-Path $tmpWav) { Remove-Item $tmpWav -Force }
    Write-Host "[Announcer] Generated $($kv.Key)"
}
$synth.Dispose()
Write-Host "[Announcer] All 8 announcer lines ready!"
