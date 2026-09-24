"""Drive the actual Windows file picker; never replace Electron dialog APIs."""
import sys, time
from pathlib import Path
from PIL import ImageGrab
import win32gui
import ctypes
from ctypes import wintypes
last_popup = ctypes.windll.user32.GetLastActivePopup
last_popup.argtypes = [wintypes.HWND]
last_popup.restype = wintypes.HWND

mode, value = sys.argv[1:3]
if mode == 'capture':
    ImageGrab.grab(all_screens=True).save(value)
    raise SystemExit(0)
if mode == 'record':
    import imageio_ffmpeg
    target = Path(value)
    frame = ImageGrab.grab(all_screens=True).convert('RGB')
    writer = imageio_ffmpeg.write_frames(str(target), frame.size, fps=2, quality=6, macro_block_size=1)
    writer.send(None)
    deadline = time.monotonic() + 480
    try:
        while not target.with_suffix('.stop').exists() and time.monotonic() < deadline:
            started = time.monotonic()
            writer.send(ImageGrab.grab(all_screens=True).convert('RGB').tobytes())
            time.sleep(max(0, .5 - (time.monotonic() - started)))
    finally:
        writer.close()
    raise SystemExit(0)

if mode == 'clipboard':
    import win32clipboard
    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardText(value, win32clipboard.CF_UNICODETEXT)
    finally:
        win32clipboard.CloseClipboard()
    raise SystemExit(0)

from pywinauto import Desktop, keyboard

if mode == 'paste':
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        for menu in Desktop(backend='uia').windows():
            if not menu.class_name().startswith('Chrome_WidgetWin'):
                continue
            for item in menu.descendants():
                if item.window_text().replace('&', '') == 'Paste' and item.is_enabled():
                    item.click_input()
                    print('Clicked Paste in the native context menu with the mouse.')
                    raise SystemExit(0)
        time.sleep(.2)
    for window in Desktop(backend='uia').windows():
        if window.class_name().startswith('Chrome_WidgetWin'):
            print('Menu search window:', window.window_text(), window.class_name(), window.rectangle())
            print('Visible controls:', [(x.window_text(), x.element_info.control_type) for x in window.descendants() if x.is_visible()][:100])
    raise SystemExit('Enabled native Paste menu item did not appear.')

deadline = time.monotonic() + 20
while time.monotonic() < deadline:
    handles = []
    win32gui.EnumWindows(lambda hwnd, _: handles.append(hwnd), None)
    candidates = handles + [win32gui.GetForegroundWindow()]
    candidates += [last_popup(h) for h in handles]
    matches = [h for h in candidates if ('Export connection profile' if mode == 'save' else 'Import connection profile') in win32gui.GetWindowText(h)]
    if matches:
        dialog = Desktop(backend='win32').window(handle=matches[0])
        dialog.set_focus()
        if mode == 'cancel':
            keyboard.send_keys('{ESC}')
        else:
            keyboard.send_keys('%n')
            keyboard.send_keys('^a')
            keyboard.send_keys(str(Path(value).resolve()), with_spaces=True)
            keyboard.send_keys('{ENTER}')
        print('Native file picker handled:', mode)
        break
    time.sleep(.2)
else:
    print('Visible window titles:', [win32gui.GetWindowText(h) for h in candidates if win32gui.IsWindowVisible(h)])
    raise SystemExit('Native import dialog did not appear.')
