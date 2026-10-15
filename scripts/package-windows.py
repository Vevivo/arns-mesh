"""Package the public desktop from a pinned Electron directory and real deps."""
from pathlib import Path
import argparse, json, shutil, hashlib, zipfile, subprocess

ELECTRON_VERSION = '44.4.3'
ELECTRON_SHA256 = 'bf0fe749904ca9f713ccfb2427c519fa39d0bbd0337ba411ba08785802e8d548'
RUNTIME_FILES = ('chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll',
 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'LICENSES.chromium.html',
 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll', 'version')
RUNTIME_DIRS = ('locales',)
CANONICALIZER_SOURCE = 'https://github.com/snowyu/json-canonicalize.ts/tree/v2.0.0'

def digest(file):
 with file.open('rb') as stream:
  return hashlib.file_digest(stream, 'sha256').hexdigest()

def runtime_executable(runtime):
 if (runtime / 'version').read_text().strip() != ELECTRON_VERSION:
  raise ValueError('Expected pinned Electron '+ELECTRON_VERSION+' runtime.')
 candidates = [runtime / name for name in ('electron.exe', 'ArNS-Mesh.exe', 'Mesh-Browser.exe') if (runtime / name).is_file()]
 if len(candidates) != 1 or digest(candidates[0]) != ELECTRON_SHA256:
  raise ValueError('Unknown or ambiguous runtime executable.')
 for name in RUNTIME_FILES:
  if not (runtime / name).is_file() or (runtime / name).is_symlink():
   raise ValueError('Missing or linked runtime file: '+name)
 for name in RUNTIME_DIRS:
  if not (runtime / name).is_dir() or (runtime / name).is_symlink():
   raise ValueError('Missing or linked runtime directory: '+name)
 return candidates[0]

def dependency_plan(source, dependencies, development):
 """Read only. Source rebuild overlays are explicitly development-only."""
 wanted = json.loads((source / 'package.json').read_text())['dependencies']
 overlays = {}
 for name, expected in wanted.items():
  package = dependencies / name
  if not (package / 'package.json').is_file():
   if name != 'json-canonicalize' or not development:
    raise ValueError('Missing dependency: '+name)
   package = source / 'node_modules' / name
   overlays[name] = package
  manifest = json.loads((package / 'package.json').read_text())
  if manifest.get('version') != expected:
   raise ValueError('Dependency mismatch: '+name)
  if manifest.get('_meshDevSourceRebuild'):
   if not development or name != 'json-canonicalize' or manifest['_meshDevSourceRebuild'] != CANONICALIZER_SOURCE:
    raise ValueError('Development source build is not allowed: '+name)
   overlays[name] = package
 return overlays

def copy_runtime(runtime, executable, root):
 """Do not copy an installed app's resources, data, old docs or extra files."""
 root.mkdir(parents=True)
 shutil.copy2(executable, root / 'Mesh-Browser.exe')
 for name in RUNTIME_FILES:
  shutil.copy2(runtime / name, root / name)
 for name in RUNTIME_DIRS:
  shutil.copytree(runtime / name, root / name)

def main(argv=None):
 parser=argparse.ArgumentParser()
 parser.add_argument('--runtime', required=True, type=Path)
 parser.add_argument('--out', type=Path, default=Path('dist'))
 parser.add_argument('--dependencies', type=Path, help='Read-only installed dependency tree; direct versions must match package.json.')
 parser.add_argument('--development', action='store_true', help='Explicit development candidate; permits the documented official-source canonicalizer build.')
 parser.add_argument('--node', default='node', help='Node executable used for public checks.')
 parser.add_argument('--network-code-file', type=Path, help='Optional operator invitation; the connected build contains its starting addresses.')
 parser.add_argument('--network-name', default='Provided Mesh network')
 a=parser.parse_args(argv);source=Path(__file__).resolve().parents[1]
 subprocess.run([a.node,str(source/'scripts/check-public.mjs')],cwd=source,check=True)
 version=json.loads((source/'package.json').read_text())['version']
 dependencies=(a.dependencies or source/'node_modules').resolve()
 overlays=dependency_plan(source,dependencies,a.development)
 runtime=a.runtime.resolve();exe=runtime_executable(runtime)
 root=a.out.resolve()/'Mesh-Browser'
 if root.exists():raise ValueError('Output already exists; use a new directory.')
 if root.is_relative_to(runtime) or root.is_relative_to(dependencies):
  raise ValueError('Output must not be inside the installed runtime or dependencies.')
 network_code=None
 if a.network_code_file:
  if a.network_code_file.stat().st_size>49152:raise ValueError('Network invitation is too large.')
  network_code=a.network_code_file.read_text().strip()
  if not a.network_name.strip() or len(a.network_name)>80:raise ValueError('Network name must be 1 to 80 characters.')
  subprocess.run([a.node,str(source/'scripts/network.mjs'),'check-code',network_code],cwd=source,check=True)
 copy_runtime(runtime,exe,root)
 app=root/'resources/app';app.mkdir(parents=True)
 for name in ['apps','src','resources','package.json','package-lock.json','LICENSE','NOTICE.txt','WAYFINDER-LICENSE','solana-rpc-seeds.json','arweave-peers.json','arweave-peer-seeds.json','hyper-bootstrap.json']:
  item=source/name
  if item.is_dir():shutil.copytree(item,app/name)
  else:shutil.copy2(item,app/name)
 if network_code:(app/'resources/networks.json').write_text(json.dumps([{'name':a.network_name,'code':network_code}])+'\n')
 shutil.copytree(dependencies,app/'node_modules',symlinks=False)
 for name, package in overlays.items():
  destination=app/'node_modules'/name
  if not destination.exists():shutil.copytree(package,destination,symlinks=False)
 for name,expected in json.loads((source/'package.json').read_text())['dependencies'].items():
  actual=json.loads((app/'node_modules'/name/'package.json').read_text())['version']
  if actual!=expected:raise ValueError('Dependency mismatch after copy: '+name)
 for name in ['README.md','README.tr.md','LICENSE','NOTICE.txt']:shutil.copy2(source/name,root/name)
 shutil.copytree(source/'docs',root/'docs')
 if a.development:
  (root/'DEVELOPMENT-BUILD.txt').write_text('Development candidate '+version+'.\nWindows application acceptance: pending.\nIndependent name-witness committee: not provisioned or production-validated.\nDo not describe this package as a completed production security deployment.\n')
 suffix='-Connected' if network_code else ''
 archive=a.out.resolve()/f'ArNS-Mesh-Browser-Windows-x64-{version}{suffix}.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for file in sorted(root.rglob('*')):
   if file.is_file():z.write(file,str(file.relative_to(a.out.resolve())))
 continuity_file=source/'resources/network-continuity.json'
 continuity_count=len(json.loads(continuity_file.read_text()).get('invitations',[])) if continuity_file.exists() else 0
 summary={'file':archive.name,'bytes':archive.stat().st_size,'sha256':digest(archive),'version':version,
  'operatorEndpointsBundled':bool(network_code or continuity_count),'networkContinuityDefinitions':continuity_count,
  'networkInvitationBundled':bool(network_code),'windowsAcceptance':'pending','developmentBuild':a.development,
  'dependencySourceBuilds':{name:CANONICALIZER_SOURCE for name in overlays}}
 if a.development:summary['independentNameWitnessCommittee']='not-provisioned-or-production-validated'
 (a.out/'build.json').write_text(json.dumps(summary,indent=2)+'\n')
 (a.out/'SHA256SUMS.txt').write_text(summary['sha256']+'  '+archive.name+'\n')
 print(json.dumps(summary))

if __name__=='__main__':
 try:main()
 except (ValueError, OSError) as error:raise SystemExit(str(error))
