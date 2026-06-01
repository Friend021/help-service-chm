@echo off
REM Creates sample-help.chm using Microsoft HTML Help Compiler (hhc.exe)
REM HTML Help Workshop must be installed: https://www.microsoft.com/en-us/download/details.aspx?id=21138

set HHC="C:\Program Files (x86)\HTML Help Workshop\hhc.exe"

if not exist %HHC% (
    echo HTML Help Workshop not found at %HHC%
    echo Download from: https://www.microsoft.com/en-us/download/details.aspx?id=21138
    echo.
    echo Alternatively, copy any existing .chm file into ..\chm-files\
    pause
    exit /b 1
)

echo Compiling sample-help.chm ...
%HHC% sample-help.hhp
REM hhc.exe returns 1 on success (non-standard), so ignore exit code

if exist sample-help.chm (
    echo.
    echo SUCCESS: sample-help.chm created
    echo Copying to ..\chm-files\sample-help.chm ...
    copy /Y sample-help.chm ..\chm-files\sample-help.chm
    echo Done. Start the service and open http://localhost:8085
) else (
    echo FAILED: sample-help.chm was not created
)
pause
