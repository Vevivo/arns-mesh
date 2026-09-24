"""Drive the actual Windows file picker; never replace Electron dialog APIs."""
import sys, time
from pathlib import Path
from PIL import ImageGrab
from pywinauto import Desktop, keyboard

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

deadline = time.monotonic() + 20
while time.monotonic() < deadline:
    windows = Desktop(backend='uia').windows()
    matches = [w for w in windows if 'Import connection profile' in w.window_text()]
    if matches:
        dialog = matches[0]
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
    print('Visible window titles:', [w.window_text() for w in windows])
    raise SystemExit('Native import dialog did not appear.')
