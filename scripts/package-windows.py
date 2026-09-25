"""Package the public desktop from a verified Electron directory and locked deps."""
from pathlib import Path
import argparse,json,shutil,hashlib,zipfile,subprocess,os
parser=argparse.ArgumentParser()
parser.add_argument('--runtime',required=True,type=Path)
parser.add_argument('--out',type=Path,default=Path('dist'))
parser.add_argument('--network-code-file',type=Path,help='Optional operator invitation; the connected build contains its starting addresses.')
parser.add_argument('--network-name',default='Provided Mesh network')
a=parser.parse_args();source=Path(__file__).resolve().parents[1]
subprocess.run(['node',str(source/'scripts/check-public.mjs')],cwd=source,check=True)
version=json.loads((source/'package.json').read_text())['version']
network_code=None
if a.network_code_file:
 if a.network_code_file.stat().st_size>4096:raise SystemExit('Network invitation is too large.')
 network_code=a.network_code_file.read_text().strip()
 if not a.network_name.strip() or len(a.network_name)>80:raise SystemExit('Network name must be 1 to 80 characters.')
 subprocess.run(['node',str(source/'scripts/network.mjs'),'check-code',network_code],cwd=source,check=True)
if (a.runtime/'version').read_text().strip()!='44.4.3':raise SystemExit('Expected pinned Electron 44.4.3 runtime.')
exe=a.runtime/'electron.exe'
if not exe.exists():
 exe=a.runtime/'ArNS-Mesh.exe'
 if not exe.exists() or hashlib.sha256(exe.read_bytes()).hexdigest()!='bf0fe749904ca9f713ccfb2427c519fa39d0bbd0337ba411ba08785802e8d548':raise SystemExit('Unknown runtime executable.')
root=a.out/'Mesh-Browser'
if root.exists():raise SystemExit('Output already exists; use a new directory.')
root.mkdir(parents=True)
for item in a.runtime.iterdir():
 if item.name=='resources':continue
 if item.is_dir():shutil.copytree(item,root/item.name)
 else:shutil.copy2(item,root/('Mesh-Browser.exe' if item==exe else item.name))
app=root/'resources/app';app.mkdir(parents=True)
for name in ['apps','src','resources','package.json','package-lock.json','LICENSE','NOTICE.txt','WAYFINDER-LICENSE','solana-rpc-seeds.json','arweave-peers.json','arweave-peer-seeds.json','hyper-bootstrap.json']:
 item=source/name
 if item.is_dir():shutil.copytree(item,app/name)
 else:shutil.copy2(item,app/name)
if network_code:(app/'resources/networks.json').write_text(json.dumps([{'name':a.network_name,'code':network_code}])+'\n')
shutil.copytree(source/'node_modules',app/'node_modules',symlinks=False)
for name,expected in json.loads((source/'package.json').read_text())['dependencies'].items():
 actual=json.loads((app/'node_modules'/name/'package.json').read_text())['version']
 if actual!=expected:raise SystemExit('Dependency mismatch: '+name)
for name in ['README.md','README.tr.md','LICENSE','NOTICE.txt']:shutil.copy2(source/name,root/name)
shutil.copytree(source/'docs',root/'docs')
suffix='-Connected' if network_code else ''
archive=a.out/f'ArNS-Mesh-Browser-Windows-x64-{version}{suffix}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(root.rglob('*')):
  if f.is_file():z.write(f,str(f.relative_to(a.out)))
summary={'file':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'version':version,'operatorEndpointsBundled':bool(network_code),'networkInvitationBundled':bool(network_code),'windowsAcceptance':'pending'}
(a.out/'build.json').write_text(json.dumps(summary,indent=2)+'\n')
(a.out/'SHA256SUMS.txt').write_text(summary['sha256']+'  '+archive.name+'\n')
print(json.dumps(summary))
