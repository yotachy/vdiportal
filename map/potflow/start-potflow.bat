@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "BASE=https://parksvc.mycafe24.com/map/potflow"
echo ============================================================
echo   PotFlow 준비 중... 필요한 파일을 자동으로 내려받습니다.
echo   (이 .bat 하나만 있으면 됩니다. 인터넷 필요)
echo ============================================================
echo.
call :getfile potflow.html
call :getfile potflow-helper.py
if not exist "potflow-config.txt" call :getfile potflow-config.txt
echo.
rem 다운로드가 조용히 실패한 채 헬퍼를 띄우면 브라우저에 404 JSON 만 떠서 원인 추적이 어렵다.
if not exist "potflow.html" goto :nofile
if not exist "potflow-helper.py" goto :nofile
echo PotFlow 헬퍼 시작... 브라우저가 자동으로 열립니다. 이 창은 켜 두세요.
echo (종료: 이 창 닫기)
echo.
python potflow-helper.py
echo.
echo 헬퍼가 멈췄습니다. Python이 없으면 https://www.python.org 에서 설치 후 다시 실행하세요.
pause
goto :eof

:nofile
echo ============================================================
echo   [오류] 필요한 파일을 내려받지 못했습니다.
echo   받으려던 주소: %BASE%/potflow.html
echo   - 인터넷 연결을 확인하세요.
echo   - 위 주소를 브라우저로 열어 파일이 있는지 확인하세요(주소 변경 가능성).
echo ============================================================
pause
goto :eof

:getfile
echo   내려받는 중: %~1
curl -f -s -L -o "%~1.tmp" "%BASE%/%~1" && move /y "%~1.tmp" "%~1" >nul
if not exist "%~1" powershell -NoProfile -Command "try{Invoke-WebRequest -Uri '%BASE%/%~1' -OutFile '%~1'}catch{}"
del "%~1.tmp" >nul 2>nul
goto :eof
