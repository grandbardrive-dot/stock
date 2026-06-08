# subir-cambios.ps1
# Sube todos los cambios del proyecto a GitHub con un solo doble click.

Set-Location "C:\Users\JOSEFINA\Downloads\grandbar-stock"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  GRANDBAR STOCK — Subir a GitHub" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si hay cambios para subir
$status = git status --porcelain
if (-not $status) {
    Write-Host "No hay cambios nuevos para subir." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Presiona Enter para cerrar..." -ForegroundColor Gray
    Read-Host
    exit 0
}

Write-Host "Cambios detectados:" -ForegroundColor White
git status --short
Write-Host ""

# Agregar todos los archivos
git add .

# Commit con fecha y hora automática
$fecha = Get-Date -Format 'yyyy-MM-dd HH:mm'
$mensaje = "actualizacion $fecha"
git commit -m $mensaje

Write-Host ""

# Push a GitHub
Write-Host "Subiendo a GitHub..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "  Cambios subidos correctamente" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Red
    Write-Host "  Error al subir. Revisa la conexion" -ForegroundColor Red
    Write-Host "  o las credenciales de GitHub." -ForegroundColor Red
    Write-Host "======================================" -ForegroundColor Red
}

Write-Host ""
Write-Host "Presiona Enter para cerrar..." -ForegroundColor Gray
Read-Host
