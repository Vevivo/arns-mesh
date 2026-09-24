# Desktop usability investigation — preview.4

This record separates source changes, automated assertions and actual Windows GUI results. Windows runs use the packaged executable, real Electron renderers and native menus/dialogs. They are not public ArNS availability tests.

| Observation | Cause or remaining hypothesis | Alternatives | Experiment and measured result | Next step |
|---|---|---|---|---|
| Address fields lacked mouse Paste | No context-menu handler was installed | Native Electron edit menu; renderer menu with clipboard IPC | Native menu scoped to the requesting webContents. Windows run 36069410924 pasted the exact clipboard text into both the address field and a page input | Retain this GUI regression gate |
| First automation attempt could not find Paste, although it was visible | The menu was nested under an Electron window, not a top-level UIA Menu window | Inspect accessible descendants; hard-code screenshot coordinates | Accessible descendant lookup in Electron windows with renderer accessibility enabled for the test. Native mouse clicks passed in run 36069410924 | Preserve the actual clipboard-value assertion |
| New font files could not initially be compressed | Local fontTools lacked the Brotli encoder | Bundle TTF; install the encoder and produce WOFF2 | WOFF2 files generated from official Google Fonts sources; source/output hashes and OFL files retained. Windows confirmed both local fonts loaded | Keep fonts local and retain licenses |
| Verification state was read before navigation completed in the first page test | Timing was uncertain; an underlying reload defect was also possible | Add a delay; wait for each actual Open page completion | Run 36069895027 completed link/back/forward separately, then timed out for 20 seconds on reload of a URL containing a fragment | Fix the confirmed reload path, then repeat the same gate |
| Reload left fragment URLs in a resolving state | The implementation called loadURL with the unchanged fragment URL, permitting in-page navigation instead of a document reload | Use webContents.reload(); strip and restore the fragment around loadURL | Changed to Electron's reload API while invalidating prior requests and the response cache. The shell regression verifies loaded state after the reload; the release GUI gate repeats the fragment case | Publish only a package whose complete Windows GUI gate passes; exact result is attached to the release |

Native API reference: https://www.electronjs.org/docs/latest/api/web-contents#contentsreload

Runs: https://github.com/Vevivo/arns-mesh/actions/runs/36069410924 and https://github.com/Vevivo/arns-mesh/actions/runs/36069895027

The saved-page fixture contains a synthetic name observation and freshly signed ANS-104 HTML, manifest, CSS, JavaScript and image files. It is excluded from distribution. It checks genuine renderer routing and verification, not current Solana state or independent discovery of an unknown public target.
