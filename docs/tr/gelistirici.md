# Kaynağı geliştirenler

Sunucu kurmak isteyenler için [VPS/Pi destekçi rehberi](destekci.md) yeterlidir. Bu sayfa kod ve paketleme içindir.

Node.js 24 LTS, npm ve Git kullan; lockfile'ı değiştirmeden kur:

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
node scripts/doctor.mjs examples/network-profile.example.json
bash scripts/test-install.sh
```

Son komut Linux/Bash'te geçici dizinde kurulum/güncelleme kontrolüdür; bağımlılık indiricisi test çiftiyle değiştirilir. CI gerçek bağımlılık kurulumunu ayrıca yapar. Örnek bağlantı profili yapısal olarak geçerlidir ama adresleri çalışmaz.

`apps/browser` masaüstü ve İngilizce arayüz, `apps/helper` ortak çekirdek/profil, `apps/peer` arayüzsüz destekçi, `src` ağ/doğrulama/indeks kodudur. `apps/helper` son kullanıcıya ayrı uygulama kurdurmak anlamına gelmez.

Geliştirme için işletim sistemine uygun resmî Electron 44.4.3 kullan; sürümü sessizce değiştirme. `npm start`, PATH içinde Electron gerektirir. `ARNS_MESH_USER_DATA` ile ayrı test verisi seç; üretim verisine geliştirme kodu çalıştırma.

Windows paketi:

```sh
python scripts/download-electron.py --out ../electron-runtime
python scripts/package-windows.py --runtime ../electron-runtime --out dist
```

İndirici sabit resmî runtime SHA-256 değerini kontrol eder. CI kaynakları Linux/Windows'ta test eder, Windows paketi oluşturur ve aynı sürüm yoksa inceleme için **taslak önizleme sürümü** hazırlar. Repoyu public yapmaz, önceki sürüm dosyasını değiştirmez. Paketleme gerçek Windows sayfa kabulü değildir.

Öncelikli katkılar: bağımsız konum üretimi, isim güncelliğini içerik kotasından ayırma, katalog RPC yedek geçişi, çok peer kopyalama, gerçek Windows/Pi ve tam ağ testi, büyük dosya akışı. Başarısız ismi başlangıç listesine ekleyerek kapsamı başarılı gösterme.

Her deneyde gözlenen hata, kanıtlı neden/hipotez, alternatifler, seçilen deney, ölçülen sonuç ve sonraki adımı kaydet. Özel IP ve anahtarları kanıt diye yayımlama. [Ayrıntılı geliştirici rehberi](../en/developer.md), [gizlilik](gizlilik.md).
