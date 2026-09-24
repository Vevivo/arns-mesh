"""Fetch the pinned official Windows runtime; used only for packaging."""
import argparse, hashlib, urllib.request, zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args()
version='44.4.3'
expected='790a355b684d5c7cc8dc3cdd8c4cca7c4b2d054685427c7554a956879a82e70b'
url=f'https://github.com/electron/electron/releases/download/v{version}/electron-v{version}-win32-x64.zip'
if a.out.exists():raise SystemExit('Runtime output already exists.')
a.out.parent.mkdir(parents=True,exist_ok=True)
archive=a.out.parent/'electron-runtime.zip'
with urllib.request.urlopen(url,timeout=60) as response, archive.open('wb') as output:
 while chunk:=response.read(1024*1024):output.write(chunk)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:
 archive.unlink();raise SystemExit('Official runtime SHA-256 mismatch.')
with zipfile.ZipFile(archive) as z:z.extractall(a.out)
archive.unlink();print('Verified and extracted Electron '+version)
