@echo off
rem MORO on the shared factory computer: Chrome full screen (kiosk), no address bar, no swipe back, no pinch zoom.
rem Put a shortcut to this file in the Startup folder (Win+R, shell:startup) so it opens when the computer starts.
rem To close it: Alt+F4.
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
start "" "%CHROME%" --kiosk "https://abdelfatehtebbani-creator.github.io/moro-pwa/kiosk.html" --user-data-dir="%LOCALAPPDATA%\MORO-kiosk" --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI --noerrdialogs --disable-session-crashed-bubble
