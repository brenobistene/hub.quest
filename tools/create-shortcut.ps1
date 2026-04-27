# ============================================================
# Cria atalho do Hub Quest no Desktop com icone customizado.
# Rode UMA VEZ: clique direito → "Run with PowerShell".
# Depois e so dar duplo clique no atalho do desktop.
# ============================================================

$ErrorActionPreference = 'Stop'

# Resolve caminhos absolutos
$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath     = Join-Path $projectRoot 'start-hub.bat'
$iconPath    = Join-Path $PSScriptRoot 'hub-quest.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Hub Quest.lnk'

# Sanity checks
if (-not (Test-Path $batPath))  { throw "start-hub.bat nao encontrado em $batPath" }
if (-not (Test-Path $iconPath)) { throw "hub-quest.ico nao encontrado em $iconPath" }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $batPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation     = "$iconPath,0"
$shortcut.Description      = 'Sobe backend + frontend do Hub Quest e abre no Chrome'
$shortcut.WindowStyle      = 7   # 7 = minimized (so o terminal fica visivel, nao a janelinha do .bat)
$shortcut.Save()

Write-Host "Atalho criado: $shortcutPath" -ForegroundColor Green
Write-Host "Pina ele na barra de tarefas se quiser acesso ainda mais rapido." -ForegroundColor Cyan
