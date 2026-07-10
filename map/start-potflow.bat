@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo PotFlow 헬퍼 시작 중... 이 창을 켜 두세요. (종료: 이 창 닫기)
echo.
python potflow-helper.py
echo.
echo 헬퍼가 멈췄습니다. 시작이 안 되면 python.org 에서 Python 설치 후 다시 실행하세요.
pause
