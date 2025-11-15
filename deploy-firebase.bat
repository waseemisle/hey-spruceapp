@echo off
echo ========================================
echo Firebase Function Deployment Script
echo ========================================
echo.

echo Step 1: Authenticating with Firebase...
firebase login --reauth
if %errorlevel% neq 0 (
    echo ERROR: Firebase login failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Deploying Firebase Functions...
firebase deploy --only functions
if %errorlevel% neq 0 (
    echo ERROR: Deployment failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Firebase Function deployed!
echo ========================================
echo.
echo Your impersonation feature is now live!
echo Test it on your Vercel app.
echo.
pause
