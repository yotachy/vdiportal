@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   PotFlow 헬퍼 시작 중... 브라우저가 자동으로 열립니다.
echo   이 창은 켜 두세요.  (종료: 이 창을 닫거나 Ctrl+C)
echo ============================================================
echo.
where python >nul 2>nul && ( python potflow-helper.py & goto :done )
where py >nul 2>nul && ( py potflow-helper.py & goto :done )
echo.
echo [오류] Python 을 찾을 수 없습니다.
echo   https://www.python.org 에서 Python 을 설치한 뒤 이 파일을 다시 실행하세요.
echo   (설치 시 "Add Python to PATH" 체크 권장)
echo.
pause
:done
