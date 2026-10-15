# Local test dependencies

This optional development setup uses the dependencies already installed with Mesh. It does not contact the network or modify that application. Every package is linked separately; the workspace's `node_modules` and scope directories remain ordinary local directories.

Run with Node 24 or later:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/prepare-local-test-deps.mjs 'C:\mesh\ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13\Mesh-Browser\resources\app\node_modules'
& 'C:\Program Files\nodejs\node.exe' --test tests/certified-name-observer.test.mjs
```

Do not run `npm install`, `npm update` or `npm ci` over the linked development tree. First remove only the workspace links, preserving their installed-app targets. This setup is for local verification, not packaging or deployment.

The installed app lacks `json-canonicalize@2.0.0`. Its unmodified TypeScript sources and MIT license are retained under `scripts/dev-vendor/json-canonicalize-2.0.0/upstream`, retrieved from the author's [v2.0.0 release source](https://github.com/snowyu/json-canonicalize.ts/tree/v2.0.0). The setup validates recorded source hashes, erases TypeScript syntax, removes the interface-only import and adds explicit JavaScript import extensions. The runtime canonicalization algorithm is unchanged. The generated local package is a source build, not the published npm bundle; normal release builds should use the pinned npm dependency.

The standard test command can then run without custom module-resolution hooks:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test 'tests/*.test.mjs'
```

If Windows blocks creation of package junctions, use the read-only fallback resolver instead. This keeps the installed package export conditions and implementations, and writes only the missing canonicalizer source build in the workspace:

```powershell
$env:ARNS_MESH_TEST_DEPENDENCIES = 'C:\mesh\ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13\Mesh-Browser\resources\app\node_modules'
& 'C:\Program Files\nodejs\node.exe' scripts/prepare-local-test-deps.mjs $env:ARNS_MESH_TEST_DEPENDENCIES --hooks-only
& 'C:\Program Files\nodejs\node.exe' --import ./scripts/local-test-deps.mjs --test tests/certified-name-observer.test.mjs
& 'C:\Program Files\nodejs\node.exe' --import ./scripts/local-test-deps.mjs --test 'tests/*.test.mjs'
```

These hooks are a development test option only and are not imported by Mesh at runtime or in release packages.
