# ArNS Mesh

**Destekçi ağı üzerinden ArNS sitelerine erişin.**

[Windows indir](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.13/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13.zip) · [Kullanmaya başla](docs/tr/kullanici.md) · [Destekçi ol](docs/tr/destekci.md) · [English](README.md)

## Mesh nedir, ne işe yarar?

ArNS Mesh, ArNS sitelerini açmak için geliştirilen bağımsız bir topluluk projesidir. Windows uygulamasına `ar://isim` yazarsınız. Mesh ismin işaret ettiği içeriği bulur, ulaşılabilir kaynaklardan alır, kimliğini ve imzasını doğrulayarak gösterir.

Amaç, normal domain veya gateway erişimi aksadığında kullanılabilecek kayıtları, dosyaları ve bağlantı yollarını paylaşmaktır. Okuyucu sayısal IP kaynaklarını kullanır; siteyi `isim.ar.io` gibi bir gateway domainine yönlendirerek açmaz. Yararlı bir kopyaya ulaşabilen internet bağlantısı yine gereklidir.

## Nasıl katılmak istiyorsunuz?

| Amacınız | Gerekenler | Başlangıç |
|---|---|---|
| Mesh'i denemek ve siteleri açmak | Windows x64, uygulama ZIP'i ve bir işletmecinin bağlantı kodu | [Kullanıcı rehberi](docs/tr/kullanici.md) |
| Depolama ve bağlantınızla destek olmak | Dışarıdan erişilebilen Linux VPS veya 64 bit Raspberry Pi | [Destekçi rehberi](docs/tr/destekci.md) |
| Yazılımı anlamak veya geliştirmek | Doğru kaynak sürümü ve ayrı geliştirme ortamı | [Geliştirici rehberi](docs/tr/gelistirici.md) |

Masaüstü uygulaması **okuyucudur**. Destekçi ise sunucuda veya Pi'de ayrı bir hizmet çalıştırır. İki bilgisayara tarayıcı kurmak, iki içerik sunucusu oluşturmaz.

## Nasıl çalışır?

1. **İsmi bulur:** Ulaşılabilir RPC gözleminden veya kabul edilmiş tarihli kayıttan ismin hedefini öğrenir.
2. **İçeriği bulur:** Mesh destekçilerini, saklanan konum kayıtlarını ve ulaşılabilir ham Arweave kaynaklarını kullanır.
3. **Doğrular ve açar:** Alınan içeriği kontrol eder, sayfayı ve desteklenen kaynaklarını gösterir.

Destekçiler üç ayrı katkı sağlar: **isim–içerik eşleşmesi, içeriğin konumu ve dosyanın kendisi**. Büyük bir konum indeksi, sitelerin dosyalarının da saklandığı anlamına gelmez.

### R84 ile gelen iyileştirme

Destekçi, AR.IO Release 84 ile sunulan imzalı indeksleri kendi diskinden okuyabilir. Böylece bir sitenin arka planda indirilmesini beklemeden daha fazla içeriğin konumunu bulabilir. Mevcut preview.13 tarayıcısı bu cevapları kullanabilir.

Ayrı indeks güncelleyicisi hazırlık sırasında HTTPS kullanır; normal Mesh erişimi, destekçide kurulu indeksten yararlanır. Kullanıcıların büyük indeksi indirmesi gerekmez. [Destekçiye R84 indeksi ekleme](docs/tr/paylasilan-indeks.md).

## İndirip kullanın

1. **[Windows x64 uygulama ZIP'ini](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.13/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13.zip)** indirin.
2. ZIP'in tamamını çıkarın ve `Mesh-Browser.exe` dosyasını açın.
3. Güvendiğiniz işletmeciden tam `mesh1.` bağlantı kodunu alın. **Settings → Mesh connection code → Check code → Join this network** yolunu izleyin.
4. Mesh'in adres çubuğuna örneğin `ar://vevivo` yazın.

Standart indirme paketinde bağlantı kodu bulunmaz. Önceden kurulmuş uygulama kayıtlı bağlantısını kullanır. Kod tekrar kullanılabilir bir ağ davetidir; cüzdan, ödeme veya etkinleştirme lisansı gerekmez. [Bağlantı yardımı](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

Gezinmek için sunucu işletmeniz veya büyük indeksi saklamanız gerekmez. Ancak mevcut tarayıcı bilgisayarda ayarlar, gezinme durumu ve içerik önbelleği tutar; elle kaydedilen sayfalar ek dosya saklar. Bu sürümde sıfır depolama modu yoktur. [Depolama açıklaması](docs/tr/kullanici.md#bilgisayarınızda-tutulan-veriler).

## Bir destekçi kapanırsa

Preview.13 ağa katıldıktan sonra ulaşılabilir destekçileri öğrenir ve içerik kaynağını değiştirebilir. Kesintide yardımcı olacak bağımsız makinede gerekli dosyalar ve kabul edilmiş isim kayıtları önceden bulunmalı; okuyucu o makineye ulaşan bir bağlantıyı biliyor olmalıdır.

**Destekçi keşfi mevcut; bağımsız kopyaları otomatik yerleştirme ve kaybolan kopyaları onarma henüz mevcut değil.** Boş bir sunucu yalnızca ağa katılarak eksiksiz yedek olmaz. [Hazırlık ve devralma rehberi](docs/tr/dayaniklilik.md), bunun için yapılacakları anlatır.

## Güncel sürüm ve kanıtlar

**Windows: v0.5.0-preview.13, topluluk ön sürümü.** Bu belgeler kararlı 1.0 duyurusu değildir ve yayımlanmış uygulamayı değiştirmez.

Sunucu rehberi, çalışan R84 entegrasyonunu içeren sabit kaynak sürümünü kullanır. `main` dalındaki uygulama kodu hâlâ eski preview.8 tabanındadır; yeni destekçi kurarken rehberdeki sürüm seçme adımını izleyin. [Sürüm ve doğrulama özeti](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13) · [Durum ve kalan işler](docs/tr/durum.md).

Açılabilen siteler mevcut isim kayıtlarına ve dosyalara bağlıdır. Haricî API/CDN kaynakları çalışmayabilir; doğrulanmış eski içerik, ismin en güncel hedefi olmayabilir.

## Rehberler

- **Kullan:** [Windows](docs/tr/kullanici.md) · [Bağlantı göstergeleri](docs/tr/baglanti-izleme.md)
- **Destek ol:** [Başlangıç](docs/tr/destekci.md) · [VPS](docs/tr/vps.md) · [Raspberry Pi](docs/tr/raspberry-pi.md) · [R84 indeksleri](docs/tr/paylasilan-indeks.md) · [Kesintiye hazırlık](docs/tr/dayaniklilik.md)
- **Geliştir:** [Kaynak ve kontroller](docs/tr/gelistirici.md) · [Mimari (EN)](docs/en/architecture.md) · [Destekçi keşfi](docs/tr/paylasilan-ag.md)
- **Proje:** [Durum](docs/tr/durum.md) · [Geri bildirim](CONTRIBUTING.md) · [Gizlilik](docs/tr/gizlilik.md) · [Güvenlik](SECURITY.md) · [Lisans](LICENSE)

ArNS Mesh; AR.IO, Arweave veya Solana'nın resmî dağıtımı değildir.
