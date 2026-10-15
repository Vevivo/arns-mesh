"""Portable packaging regressions; synthetic files only, no installed mutations."""
import importlib.util, json, unittest, shutil, uuid
from contextlib import contextmanager
from pathlib import Path

spec=importlib.util.spec_from_file_location('package_windows',Path(__file__).resolve().parents[1]/'scripts/package-windows.py')
package=importlib.util.module_from_spec(spec);spec.loader.exec_module(package)

@contextmanager
def temporary_fixture():
 parent=Path(__file__).resolve().parents[1]/'.test-state'/'packaging'
 parent.mkdir(parents=True,exist_ok=True)
 directory=parent/('synthetic-'+uuid.uuid4().hex)
 directory.mkdir()
 try:yield directory
 finally:
  # Only this newly allocated synthetic test directory is removed.
  if directory.resolve().parent!=parent.resolve():raise RuntimeError('Unsafe test cleanup path')
  shutil.rmtree(directory)

class PackagingTests(unittest.TestCase):
 def test_runtime_copy_excludes_installed_application_and_data(self):
  with temporary_fixture() as temporary:
   base=Path(temporary);runtime=base/'runtime';runtime.mkdir();out=base/'out'
   exe=runtime/'Mesh-Browser.exe';exe.write_bytes(b'synthetic executable')
   for name in package.RUNTIME_FILES:(runtime/name).write_text('synthetic runtime')
   (runtime/'locales').mkdir();(runtime/'locales'/'en-US.pak').write_text('locale')
   for name in ('resources','docs','saved-data'):
    (runtime/name).mkdir();(runtime/name/'private-fixture').write_text('must not be copied')
   (runtime/'unrelated-file').write_text('must not be copied')
   package.copy_runtime(runtime,exe,out)
   self.assertEqual((out/'Mesh-Browser.exe').read_bytes(),b'synthetic executable')
   self.assertEqual((out/'locales'/'en-US.pak').read_text(),'locale')
   for name in ('resources','docs','saved-data','unrelated-file'):self.assertFalse((out/name).exists())

 def fixture(self,base,version='2.0.0',marker=True):
  source=base/'source';source.mkdir();deps=base/'installed';deps.mkdir()
  (source/'package.json').write_text(json.dumps({'dependencies':{'json-canonicalize':'2.0.0'}}))
  local=source/'node_modules'/'json-canonicalize';local.mkdir(parents=True)
  manifest={'name':'json-canonicalize','version':version}
  if marker:manifest['_meshDevSourceRebuild']=package.CANONICALIZER_SOURCE
  (local/'package.json').write_text(json.dumps(manifest));return source,deps,local

 def test_source_overlay_requires_explicit_development_mode(self):
  with temporary_fixture() as temporary:
   source,deps,local=self.fixture(Path(temporary))
   with self.assertRaisesRegex(ValueError,'Missing dependency'):package.dependency_plan(source,deps,False)
   self.assertEqual(package.dependency_plan(source,deps,True),{'json-canonicalize':local})

 def test_source_build_already_in_dependencies_still_cannot_be_released(self):
  with temporary_fixture() as temporary:
   source,_,_=self.fixture(Path(temporary))
   with self.assertRaisesRegex(ValueError,'Development source build'):package.dependency_plan(source,source/'node_modules',False)

 def test_version_mismatch_and_arbitrary_missing_package_fail(self):
  with temporary_fixture() as temporary:
   source,deps,_=self.fixture(Path(temporary),version='1.0.0')
   with self.assertRaisesRegex(ValueError,'Dependency mismatch'):package.dependency_plan(source,deps,True)
   (source/'package.json').write_text(json.dumps({'dependencies':{'missing-real-package':'1.0.0'}}))
   with self.assertRaisesRegex(ValueError,'Missing dependency'):package.dependency_plan(source,deps,True)

if __name__=='__main__':unittest.main()
