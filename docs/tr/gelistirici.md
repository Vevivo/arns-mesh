# ArNS Mesh geliştirme

[English](../en/developer.md) · [Ana sayfa](../../README.tr.md)

Masaüstü, destekçi, R84 okuyucusu ve testler aynı **0.5.0** kaynak ağacındadır.

## Kaynağı alın

```bash
git clone --branch v0.5.0 --depth 1 https://github.com/Vevivo/arns-mesh.git
cd arns-mesh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
```

Geliştirme için güncel `main` dalını kullanın. Kaynak Node.js 22.12 ve üzerini kabul eder; CI Node.js 24.19.0 kullanır. [Node kurulumu](../en/node-setup.md).

## Kodun yerleşimi

| Alan | Konum |
|---|---|
| Windows tarayıcısı | `apps/browser/` |
| Destekçi ve yerel durum ekranı | `apps/peer/`, `apps/operator/` |
| İsim çözümü ve kesintide geri dönüş | `src/swarm-access.mjs`, `src/resilient-access.mjs` |
| İmzalı isim kaydı aktarımı | `src/snapshot-relay.mjs` |
| Doğrulanmış içerik | `src/content-fetcher.mjs`, `src/content-store.mjs` |
| R84 indeksleri | `src/shared-index.mjs`, `scripts/sync-shared-index.mjs` |
| Testler | `tests/`, `qa/` |

## Kesinti kabul testi

[Test raporu](../validation/upstream-outage-2026-10-06.md), gerçek isim ve dosyalarla yapılan Linux ağ yalıtımı sonucunu içerir. `qa/upstream-outage.mjs` bu testi yeniden üretir. Yakalama aşaması yalnızca mevcut açık isim kayıtlarını ve doğrulanmış içerikleri ayrı test dizinine alır; canlı kimliği kopyalamaz.

Windows CI, üretilen ZIP'i açar; gerçek içerikleri test destekçisine hazırlar, hem okuyucunun hem destekçinin dış bağlantılarını güvenlik duvarıyla kapatır ve temiz okuyucuda siteleri açar. Kanıtlar `windows-upstream-outage` çıktısındadır. Özel bağlantı ayarları ve içerik arşivleri yayımlanmaz.

Test trafiğini üretim trafiğinden ayırın. Kesinti denemesi için çalışan sunucuyu veya kullanıcının güvenlik duvarını kapatmayın.

## Windows paketi

```bash
python scripts/download-electron.py --out /tmp/mesh-electron
python scripts/package-windows.py --runtime /tmp/mesh-electron --out dist
```

Windows EXE'sinin gerçek arayüz testi Windows CI'da yapılır. Bir Node sürüm çıktısı, pencerenin ve sitelerin açıldığını kanıtlamaz.

[Güvenlik](../../SECURITY.md) · [Katkı](../../CONTRIBUTING.md) · [Mimari](../en/architecture.md).
