@echo off
REM Deploy script for semtalkbot to Azure App Service

setlocal enabledelayedexpansion

echo Verifying Azure CLI login...
call az account show >nul 2>&1
if errorlevel 1 (
    echo ERROR: Not logged into Azure CLI
    echo Run: az login --tenant e6aa0f5f-ec60-485d-8766-f6bcabea9053
    exit /b 1
)

echo Building...
call npm run build
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

echo Creating deployment package...
if exist app.zip del /q app.zip

REM Copy config files to lib/
copy web.config lib\web.config >nul
copy package.json lib\package.json >nul
copy package-lock.json lib\package-lock.json >nul 2>&1

REM Create zip with lib/, web.config, and package files
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('lib', 'app.zip', 'Optimal', $false)"

if not exist app.zip (
    echo Failed to create app.zip
    exit /b 1
)

echo Deploying to Azure App Service...
call az webapp deployment source config-zip ^
    --resource-group Default-Storage-WestEurope ^
    --name bot73f1aa ^
    --src app.zip

if errorlevel 1 (
    echo Deployment failed - check Azure CLI auth is correct tenant
    exit /b 1
)

echo Deployment successful!
del app.zip
echo App should be online at: https://bot73f1aa.azurewebsites.net
