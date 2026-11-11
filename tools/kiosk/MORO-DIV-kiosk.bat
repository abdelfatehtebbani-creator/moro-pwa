@echo off
rem MORO DIV (test copy) on a shared computer, full screen. To close it: Alt+F4.
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
start "" "%CHROME%" --kiosk "https://abdelfatehtebbani-creator.github.io/moro-div/kiosk.html" --user-data-dir="%LOCALAPPDATA%\MORO-DIV-kiosk" --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI --noerrdialogs --disable-session-crashed-bubble
