@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "potflow-helper.py" goto :missing
if not exist "potflow.html" goto :missing
echo PotFlow 헬퍼 시작 중... 이 창을 켜 두세요. (종료: 이 창 닫기)
echo.
python potflow-helper.py
echo.
echo 헬퍼가 멈췄습니다. 시작이 안 되면 python.org 에서 Python 설치 후 다시 실행하세요.
pause
goto :eof

:missing
echo [오류] 이 폴더에 potflow-helper.py / potflow.html 가 없습니다.
echo.
echo 세 파일을 반드시 같은 폴더에 두세요:
echo   start-potflow.bat, potflow-helper.py, potflow.html
echo 현재 폴더: %cd%
echo.
echo 이 폴더의 potflow 관련 파일:
dir /b potflow* 2>nul
echo.
echo 참고: 브라우저가 potflow-helper.py.txt 처럼 .txt 를 붙여 저장했을 수 있습니다.
echo       그 경우 확장자를 .py / .html 로 고치세요. (탐색기 보기 - 파일 확장명 체크)
echo.
pause
