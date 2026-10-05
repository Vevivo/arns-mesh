# ArNS Mesh

**Domain ve DNS olmadan ArNS sitelerini açın.**

[Windows için Mesh 0.5.0 indir](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0/ArNS-Mesh-Browser-Windows-x64-0.5.0.zip) · [Kullanıcı rehberi](docs/tr/kullanici.md) · [Destekçi ol](docs/tr/destekci.md) · [English](README.md)

Mesh'e `ar://isim` yazın. Uygulama ismin gösterdiği içeriği bulur, dosyaları doğrular ve siteyi açar. Siteye ulaşmak için bir gateway domaini veya DNS çözümü kullanmaz.

## Hemen kullanın

1. Yukarıdaki Windows ZIP'ini indirin ve tamamını bir klasöre çıkarın.
2. `Mesh-Browser.exe` dosyasını açın.
3. İşletmecinizin verdiği `mesh1.` kodunu **Settings → Mesh connection code → Check code → Join this network** bölümüne girin.
4. Adres çubuğuna `ar://vevivo` veya açmak istediğiniz ArNS ismini yazın.

Cüzdan, ödeme, Node.js veya kendi sunucunuz gerekmez. Standart paket bağlantı kodu içermez. [Bağlantı yardımı](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

## Solana RPC ve Arweave de kapanırsa?

**Mesh'te isim kaydı ve dosyaları bulunan içeriklere erişim devam eder.** Okuyucu, ulaşabildiği Mesh destekçisinden ismin kaydını ve doğrulanmış dosyaları alır. Bunun için okuyucunun siteyi daha önce açmış olması gerekmez.

6 Ekim 2026 testinde okuyucu ve destekçi dış ağdan birlikte ayrıldı. RPC, Arweave ve dış DNS adreslerine erişilemedi; boş okuyucu 35 isimden 29'unun ana içeriğini açtı. Önceden hazır işaretlenmiş 22 kaydın saklanan dosya setleri eksiksiz doğrulandı. [Testin ayrıntıları ve sonuçları](docs/validation/upstream-outage-2026-10-06.md).

Gerekli dosya hiçbir ulaşılabilir Mesh destekçisinde yoksa kesinti sırasında getirilemez. Kesintide kullanılan isim kaydı, daha önce gözlenmiş sürümü gösterir.

## Mesh nasıl çalışır?

- **Bağlantılar açıkken:** Destekçiler isim kayıtlarını ve içerikleri hazırlar. R84 indeksleri dosyaların Arweave'deki yerini bulmayı hızlandırır.
- **Kullanıcı site açarken:** Mesh ulaşılabilir kaynaklardan dosyaları alır ve kimliklerini/imzalarını doğrular.
- **Kaynaklar kesildiğinde:** Önceden hazırlanmış isim ve dosyalar Mesh üzerinden kullanılmaya devam eder.

Büyük indeksler destekçi sunucularda tutulur. Windows okuyucusu sınırlı yerel önbellek ve ayarlar saklar. [Bilgisayarda tutulan veriler](docs/tr/kullanici.md#bilgisayarınızda-tutulan-veriler).

## Ağa destek olun

Bir VPS veya Raspberry Pi üzerinde destekçi çalıştırarak isim kayıtları, içerik konumları ve dosyalar sunabilirsiniz. Bağımsız destekçiler, bir sunucu kapandığında erişimin sürmesine yardım eder.

**[VPS kurulumu](docs/tr/vps.md)** · **[Raspberry Pi kurulumu](docs/tr/raspberry-pi.md)** · [R84 indeks kurulumu](docs/tr/paylasilan-indeks.md) · [Başka sunucunun devralmasına hazırlık](docs/tr/dayaniklilik.md)

## Geliştiriciler

Masaüstü ve destekçi aynı **0.5.0** kaynak ağacındadır. `main` güncel kodu içerir; sürümü yeniden üretmek için `v0.5.0` etiketini kullanın.

[Geliştirme ve testler](docs/tr/gelistirici.md) · [Mimari](docs/en/architecture.md) · [Sürüm notları](docs/en/release-notes.md) · [Durum](docs/tr/durum.md) · [Gizlilik](docs/tr/gizlilik.md) · [Lisans](LICENSE)

ArNS Mesh bağımsız bir topluluk projesidir; AR.IO, Arweave veya Solana'nın resmî dağıtımı değildir.
