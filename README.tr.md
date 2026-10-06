# ArNS Mesh

**Domain ve DNS olmadan ArNS sitelerini açın.**

[Windows için Mesh 0.5.1 indir](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.1/ArNS-Mesh-Browser-Windows-x64-0.5.1.zip) · [Kullanıcı rehberi](docs/tr/kullanici.md) · [Destekçi ol](docs/tr/destekci.md) · [English](README.md)

Mesh'e `ar://isim` yazın. Uygulama ismin gösterdiği içeriği bulur, dosyaları doğrular ve siteyi açar. Siteye ulaşmak için bir gateway domaini veya DNS çözümü kullanmaz.

## Hemen kullanın

1. Yukarıdaki Windows ZIP'ini indirin ve tamamını bir klasöre çıkarın.
2. `Mesh-Browser.exe` dosyasını açın.
3. İşletmecinizin verdiği `mesh1.` kodunu **Settings → Mesh connection code → Check code → Join this network** bölümüne girin.
4. Adres çubuğuna `ar://vevivo` veya açmak istediğiniz ArNS ismini yazın.

Cüzdan, ödeme, Node.js veya kendi sunucunuz gerekmez. Standart paket bağlantı kodu içermez. [Bağlantı yardımı](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

## Konuya göre site bulun

Ana sayfadaki **orta arama kutusuna** music, games, art veya storage gibi bir konu yazın. ArNS adresleri, varsa açıklamaları ve konu etiketleri listelenir. Sonuca tıklayıp siteyi açın. Bildiğiniz adresleri üst çubuğa yazmaya devam edin. [Arama rehberi](docs/tr/konu-aramasi.md).

## İsimler ve siteler sürekli güncellenir

Otomatik hazırlama açık olan destekçi sunucular yeni ArNS kayıtlarını ve mevcut isimlerin içerik değişikliklerini arka planda düzenli olarak kontrol eder. Edindikleri isim kayıtlarını saklar; site dosyalarını indirir, doğrular ve sunmaya hazırlar. Solana RPC ve Arweave erişim yolları çalıştığı sürece kullanılmaya devam eder. Bu süreç sunucunun disk, trafik ve işlem sınırları içinde sürer. [Sürekli hazırlık nasıl çalışır?](docs/tr/surekli-hazirlik.md).

## Solana RPC veya Arweave erişim yolları kesilirse

**Mesh, ulaşılabilir destekçi sunucular üzerinden alternatif bir erişim yolu sağlar.** Okuyucu Solana RPC'ye ulaşamıyorsa kabul edilen isim kaydını Mesh'ten alabilir. Arweave'e doğrudan erişemiyorsa ilgili doğrulanmış dosyaları Mesh'ten alabilir. Kullanıcının siteyi daha önce açmış olması gerekmez.

Canlı kaynaklara hâlâ erişebilen bir destekçi güncellemeleri edinmeye devam edebilir. Hem okuyucu hem de ulaşabildiği destekçiler bu yolları kaybederse Mesh, önceden edindiği isim kayıtları ve dosyalarla erişimi sürdürür; son alınan sürüm kullanılır. İsim kaydı içeriğin adresini gösterir; sitenin tamamını açmak için ilgili dosyaların da ulaşılabilir bir kaynakta bulunması gerekir. R84 içeriğin yerini bulmaya yardım eder; dosyaları destekçiler ayrıca saklar ve sunar.

Burada anlatılan durum, **dış hizmetlere giden erişim yollarının kesilmesidir**. 6 Ekim 2026'daki yalıtılmış okuyucu/destekçi testi, seçilmiş bir isim grubu üzerinde bu alternatif yolu doğruladı. Testteki isim sayısı, ağın toplam kataloğu veya kapasite sınırı değildir. [Testin kapsamı, sayıları ve sonuçları](docs/validation/upstream-outage-2026-10-06.md) · [Hazırlık durumu](docs/tr/durum.md).

## Mesh nasıl çalışır?

- **Erişim yolları açıkken:** Destekçiler isimleri takip eder ve doğrulanmış içerikleri hazırlar. R84 indeksleri dosyaların Arweave'deki yerini bulmayı hızlandırır.
- **Kullanıcı site açarken:** Mesh ulaşılabilir kaynaklardan dosyaları alır ve kimliklerini/imzalarını doğrular.
- **Dış erişim yolları kesildiğinde:** Ulaşılabilir Mesh destekçileri sakladıkları isimleri ve dosyaları sunar; dış kaynaklara erişebilen destekçiler güncellemeleri edinmeyi sürdürür.

Büyük indeksler destekçi sunucularda tutulur. Windows okuyucusu sınırlı yerel önbellek ve ayarlar saklar. [Bilgisayarda tutulan veriler](docs/tr/kullanici.md#bilgisayarınızda-tutulan-veriler).

## Ağa destek olun

Bir VPS veya Raspberry Pi üzerinde destekçi çalıştırarak isim kayıtları, içerik konumları ve dosyalar sunabilirsiniz. Bağımsız destekçiler, bir sunucu kapandığında erişimin sürmesine yardım eder.

**[VPS kurulumu](docs/tr/vps.md)** · **[Raspberry Pi kurulumu](docs/tr/raspberry-pi.md)** · [R84 indeks kurulumu](docs/tr/paylasilan-indeks.md) · [Başka sunucunun devralmasına hazırlık](docs/tr/dayaniklilik.md)

## Geliştiriciler

Masaüstü ve destekçi aynı **0.5.1** kaynak ağacındadır. `main` güncel kodu içerir; sürümü yeniden üretmek için `v0.5.1` etiketini kullanın.

[Geliştirme ve testler](docs/tr/gelistirici.md) · [Mimari](docs/en/architecture.md) · [Sürüm notları](docs/en/release-notes.md) · [Durum](docs/tr/durum.md) · [Gizlilik](docs/tr/gizlilik.md) · [Lisans](LICENSE)

ArNS Mesh bağımsız bir topluluk projesidir; AR.IO, Arweave veya Solana'nın resmî dağıtımı değildir.
