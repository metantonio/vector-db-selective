@echo off
title Vector DB Selective Launcher
echo ========================================================
echo        Vector DB Selective - Multi-Database RAG
echo ========================================================
echo.

:: 1. Check & setup Python Virtual Environment for Backend
echo [1/3] Checking Python Virtual Environment...

if not exist "%~dp0.env" if not exist "%~dp0backend\.env" (
    if exist "%~dp0.env.example" (
        echo [INFO] Creating default .env configuration file from .env.example...
        copy "%~dp0.env.example" "%~dp0.env" >nul
    )
)

if not exist "%~dp0backend\venv" (

    echo Virtual environment not found. Creating venv in backend\venv...
    python -m venv "%~dp0backend\venv"
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment. Please ensure Python is installed and added to PATH.
        pause
        exit /b 1
    )
    echo Installing backend dependencies from requirements.txt...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install --upgrade pip
    "%~dp0backend\venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt"
    if errorlevel 1 (
        echo ERROR: Failed to install Python dependencies.
        pause
        exit /b 1
    )
    echo Backend virtual environment setup completed successfully.
) else (
    echo Backend virtual environment already exists.
)

echo.

:: 2. Check & setup Node modules for Frontend
echo [2/3] Checking Frontend dependencies...
if not exist "%~dp0frontend\node_modules" (
    echo node_modules not found. Installing frontend dependencies...
    cd /d "%~dp0frontend"
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo Frontend dependencies installed successfully.
) else (
    echo Frontend dependencies already installed.
)

echo.

:: 3. Run Backend & Frontend
echo [3/3] Starting backend and frontend services...
echo Starting Python FastAPI Backend on http://localhost:8000 ...
start "Vector DB Backend" cmd /k "cd /d "%~dp0" && backend\venv\Scripts\python.exe backend\main.py"

echo Starting Vite React Frontend on http://localhost:5173 ...
cd /d "%~dp0frontend"
call npm run dev

pause

