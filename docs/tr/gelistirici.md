# ArNS Mesh geliştirme

[English](../en/developer.md) · [Ana sayfa](../../README.tr.md) · [Kod yazmadan destekçi olma](destekci.md)

## Doğru kaynak sürümünü seçin

| Amaç | Sürüm |
|---|---|
| Yayımlanmış Windows preview.13 dosyası | `94ce5d293e3c97a78d1034b83ccbf1e21a2ee86b` |
| R84 ve belgelenmiş hazırlık düzeltmelerini içeren destekçi | `feat/resilient-access` üzerindeki `37d51c79614c389b515b43d4a3bd92f9bd5083d2` |
| Varsayılan dal | `main` hâlâ preview.8 uygulama kodunu içerir; belgeleri preview.13 kullanım yolunu anlatır |

Sunucu değişikliği Windows ZIP'ini değiştirmez. Destekçi için sabitlenen sürüm sonraki belgeleri de içerir; yayımlanmış masaüstü dosyasının kaynak kimliği değildir.

Uygulama geliştirmesinde uygun sürümden **ayrı klasör ve veri diziniyle** başlayın. Katkı tabanını seçmeden [geliştirme PR'ını](https://github.com/Vevivo/arns-mesh/pull/9) kontrol edin. Belge güncellemeleri uygulama değişikliklerini birleştirmeden `main` dalına yöneltilebilir.

## Kaynak kontrolleri

```bash
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-development
cd arns-mesh-development
git checkout --detach 37d51c79614c389b515b43d4a3bd92f9bd5083d2
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
node scripts/doctor.mjs examples/network-profile.example.json
bash scripts/test-install.sh
```

Node.js 24 LTS kullanın; CI tabanı 24.19.0'dır. Son komut POSIX içindir ve kurucu testinde npm taklidi kullanır. CI ayrıca gerçek bağımlılık kurulumu yapar. Örnek profil çalışan sunucu adresi içermez. Üretim verisi gerekmez.

## Katmanlar

Akış: **isim gözlemi → içerik kimliği → konum veya saklanmış kopya → içerik doğrulama → sayfa**.

R84 güncelleyicisi ayrı HTTPS sürecidir; doğrulanmış indeks bölümlerini destekçinin diskine hazırlar. Çalışan Mesh bunlardan konum bilgisi okur. İndeks ne dosyanın kendisidir ne de isim otoritesidir.

| Alan | Kaynak |
|---|---|
| Masaüstü ve yerel veri | `apps/browser` |
| Profil, davet ve çalışma ayarları | `apps/helper` |
| Sunucu | `apps/peer/main.mjs`, `apps/peer/embedded-peer.mjs` |
| Doğrudan IP protokolü | `src/direct-peer.mjs` |
| Keşif ve isim aktarımı | `src/peer-discovery.mjs`, `src/peer-directory.mjs`, `src/snapshot-relay.mjs` |
| İçerik doğrulama ve saklama | `src/content-store.mjs`, `src/ans104.mjs` |
| Hazırlık ve kotalar | `src/catalog-worker.mjs`, `src/site-pinner.mjs` |
| R84 | `src/index-publication.mjs`, `scripts/configure-shared-index.mjs`, `scripts/sync-shared-index.mjs` |
| Yerel durum | `src/operator-status.mjs`, `scripts/operator.mjs` |

Yollar sabitlenmiş destekçi kaynağına aittir. Güncelleyiciyi tarayıcı veya kısıtlanmış destekçi sürecinin içine eklemeyin. Yeni destekçi içerik sunabilir; isimleri yeniden tanımlama yetkisi otomatik kazanmaz.

## Masaüstü ve paketleme

Projenin sabitlediği Electron'u kullanın; çalıştırmak için rastgele Electron sürümü eklemeyin. Geliştirme verisini `ARNS_MESH_USER_DATA` ile ayırın.

Ayrı derleme makinesinde:

```bash
python scripts/download-electron.py --out ../electron-runtime
python scripts/package-windows.py --runtime ../electron-runtime --out dist
```

Son destekçi kaynağından paket üretmek, yayımlanmış preview.13 ZIP'ini yeniden üretmek değildir. Yayımlanmış masaüstünün tabanı üstteki ayrı commit'tir. Connected paket, işletmecinin bilerek eklediği ağ davetini içerebilir; standart paket içermez. [Ağ ve paketleme](ag-kodu.md).

## Doğrulama kapsamını koruyun

Kaynak testi, aynı sunucuda ayrı süreç testi, Windows arayüz testi, saklanan nesneyi okuma ve bağımsız kesinti deneyi ayrı kanıtlardır. Birini diğerinin yerine koymayın.

“Hazır” durumu kaydın belirtilen kapsamıyla sınırlıdır: tek HTML, dinamik sitenin tamamının arşivi değildir. Mevcut tarayıcı yerel veri yazar; disksiz modu yoktur. Bağımsız kopya yerleştirme/onarımı ve gerçek çok sağlayıcılı/Pi kabulü açık işlerdir.

Yayımlamadan önce `npm run check:public` çalıştırın ve değişen dosyaları inceleyin. Canlı profil, kimlik, davet, günlük ve arşivleri repoya koymayın.

[Ayrıntılı mimari (EN)](../en/architecture.md) · [Keşif](paylasilan-ag.md) · [R84](paylasilan-indeks.md) · [Kanıtlar](durum.md).
