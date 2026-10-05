# ArNS Mesh

**Domain ve gateway erişimi kesildiğinde, erişilebilir peer'ler üzerinden ArNS sitelerini açmayı amaçlayan tarayıcı.**

ArNS Mesh; Windows tarayıcısı ve ayrı bir Linux destekçi servisinden oluşan bağımsız bir topluluk projesidir. `ar://isim` yazarsınız; Mesh ismin içeriğini bulur, erişebildiği dosyaları alır, kimlik ve imzalarını doğrulayıp sayfayı açar. Çalışırken kullanıcıyı bir gateway domainine yönlendirmek yerine sayısal IP kaynaklarını kullanır.

Amaç, erişimi sürdürme yükünü paylaşmaktır. Destekçiler VPS veya Raspberry Pi üzerinde depolama, isim kayıtları ve içerik konumu bilgisi sağlar. Ham Arweave ve Solana RPC erişilemez olduğunda önceden tutulmuş isim kayıtları ve gerçek dosya kopyaları kurtarma yolu oluşturabilir. **Yararlı bir kopyaya çalışan bağlantı yine gereklidir. İndeks, dosyanın kendisi değildir.**

[English](README.md) · [Tarayıcıyı kullan](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/kullanici.md) · [Destekçi kur](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/destekci.md) · [Ağın tasarımı](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/paylasilan-ag.md)

## Güncel destekçi geliştirmesi

Destekçiler, imzalı AR.IO r84 indekslerini indirip içerik konumlarını yerel diskten Mesh kullanıcılarına sunabilir. Bu, dosyanın yerini bulmayı geliştirir; ArNS isim çözümünün veya site dosyalarını saklamanın yerine geçmez. Mevcut preview.13 kullanıcıları güncellenmiş destekçiden yararlanabilir. [Kurulum ve sınırlar](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/shared-index.md). [Canlı kurulum ve test sonuçları](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/validation/index-sharing-2026-10-05.md).

## Nereden başlamalıyım?

| Amacım | Gerekenler | Rehber |
|---|---|---|
| ArNS sitelerini açmak | Windows x64 tarayıcısı ve çalışan ağ bağlantı ayarı | [İndirme ve ilk açılış](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/kullanici.md) |
| Depolama ve indeks desteği vermek | Erişilebilir Linux VPS veya 64 bit Raspberry Pi, disk ve internet | [Destekçi kurulumu](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/destekci.md) |
| Sorun veya öneri bildirmek | Sürüm, başarısız aşama ve açıklama | [Geri bildirim](CONTRIBUTING.md) |

Destekçinin kod yazması gerekmez. Aynı kişi hem tarayıcıyı kullanabilir hem destekçi çalıştırabilir. Normal kullanıcıya sunucu, cüzdan, Node.js veya kendi indeksi gerekmez. Masaüstünü indirmek depolama alanını otomatik paylaşıma açmaz.

## İndirme ve gerçek durum

| Sürüm | Şu an sunulan | İndirme / kaynak |
|---|---|---|
| **Yayımlanmış preview.8** | ArNS gezintisi, kayıtlı kopyalar, tekrar kullanılabilir ağ daveti ve imzalı kaynak listesi güncellemeleri | [Windows x64 ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.8/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.8.zip) · [Sürüm ve sağlama toplamları](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.8) |
| **Yayımlanan preview.13 ön sürümü** | Önceki kurtarma/arama özellikleri + otomatik destekçi duyurusu, adres paylaşımı ve doğrulanmış kaynağa geçiş | [Windows ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.13/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13.zip) · [Kaynak](https://github.com/Vevivo/arns-mesh/tree/94ce5d293e3c97a78d1034b83ccbf1e21a2ee86b) · [PR #9](https://github.com/Vevivo/arns-mesh/pull/9) |
| **Sonraki iş** | Bağımsız içerik kopyalarını otomatik yerleştirme ve eksikleri tamamlama | [Uygulananlar ve sınırlar](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/paylasilan-ag.md) |

Durum **5 Ekim 2026** tarihinde kontrol edildi. `main` hâlâ preview.8 çalışma kodunu içerir; Test edilmiş preview.13 Windows ZIP kalıcı yayın bağlantısında bulunur. Güncel destekçi kodu `feat/resilient-access` dalındadır; yayımlanan ZIP değiştirilmemiştir. Standart ZIP'te de sağlayıcı daveti yoktur. Ayrı hazırlanmış bir **Connected ZIP**, temiz kurulumda içindeki ağa otomatik katılabilir; bu paketleme desteği vardır, fakat bu indirmeler Connected paket değildir.

## Bugün nasıl kullanılır?

1. **Windows uygulama ZIP'ini** indirin; GitHub'ın **Source code (zip)** dosyasını değil.
2. Klasörün tamamını çıkarıp `Mesh-Browser.exe` dosyasını açın.
3. Connected paket aldıysanız ilk bağlantıyı bekleyin. Standart pakette güvendiğiniz sağlayıcıdan tam `mesh1.` davetini alıp **Settings → Mesh connection code → Check code → Join this network** yolunu izleyin. Gerekirse [bağlantı yardımı isteyin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml); bu hizmet garantisi değildir.
4. Üst adres çubuğuna ArNS ismini yazın. Aday ana ekranı ayrıca indirilmiş sınırlı katalogda konu araması yapar.
5. Saklamak için **Save current page** seçin ve kopyanın tamamlanıp tamamlanmadığını kontrol edin. Yer imi yalnız adresi hatırlar.

Hedeflenen günlük kullanım **kod girmeden indir, aç, kullan** biçimindedir. Bugünkü kod ağ kimliğini ve başlangıç adreslerini sağlar; lisans, şifre veya ücretli aktivasyon değildir. [Tam kullanıcı rehberi](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/kullanici.md).

## Bir isim nasıl sayfaya dönüşür?

1. **Kaynaklar bulunur.** Paketteki/aktarılan ayarlar ve daha önce kabul edilen adresler kullanılır. Preview.13'te ağa katılmış okuyucu kimliği kontrol edilen yeni peer adreslerini otomatik öğrenir; isim yetkisi ayrı yönetilir.
2. **İsmin hedefi bulunur.** Erişilebilirken sayısal IP üzerinden Solana RPC gözlemi alınır; beklenen hesap yapısı kontrol edilir. Aday sürüm, erişim hatasında kabul edilmiş tarihli yerel/sağlayıcı kaydını kullanabilir.
3. **Dosyalar bulunur.** Yerel kopyalar, Mesh peer'leri ve ham Arweave kaynaklarından yararlanılır. Konum kaydı dosyayı bulmaya yardım eder; dosyanın kendisini içermez.
4. **Doğrulanıp gösterilir.** İçerik kimliği ve imzası denetlenir; sayfa ve desteklenen dosyalar açılır. Tarihî isim kaydıyla erişim belirtilir. Dosya doğrulaması, ismin en güncel karşılığını tek başına kanıtlamaz.

İstemci başarısızlıkta gizlice gateway domainine geçmez. Harici API'ler, normal domaine bağlı servisler ve Arweave dışı CDN bağımlılıkları eksik kalabilir. Sayfadaki desteklenen sabit Arweave dosya adresleri Mesh/ham veri yoluna içeriden yönlendirilebilir. [Teknik işleyiş](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/en/architecture.md).

## Neden destekçi çalıştırılır?

Yararlı bir destekçi, okuyuculara başka bir erişilebilir kopya sağlar ve indeksleme/depolama yükünü paylaşır. Üç farklı şey tutar: **tarihli isim–içerik kayıtları**, **konum bilgileri** ve **doğrulanmış gerçek dosyalar**. Yeterli hazırlıkla ilk sağlayıcı erişilemez olduğunda başka destekçi yanıt verebilir.

Yeni ve boş sunucu yedek değildir. Kesintiden önce ilgili kopyalar bağımsız cihazlarda bulunmalı; kalan peer'lerin disk, bellek ve yükleme kapasitesi yeterli olmalıdır. Adayda sınırlı içerik hazırlığı ve öğrenilen peer'lere ölçümlü yönelme vardır; bağımsız kopyaları otomatik yerleştirme ve onarma henüz yoktur.

[VPS veya Raspberry Pi kurulumu](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/destekci.md). Kolay yol mevcut ağa katılmaktır. Ayrı ağ kurmak ve yeni kod dağıtmak, her destekçinin yapması gereken iş değildir; gelişmiş sağlayıcı işlemidir.

## Preview.13 ile otomatik destekçi keşfi

Destekçi mevcut ağ davetiyle kurulur, genel IP/port adresini imzalayıp duyurur. Karşı peer geri bağlanıp kimliğini kontrol eder. Ağa katılmış masaüstü bu adresleri yaklaşık dakikada bir öğrenip saklar; yeni destekçi geldikçe kullanıcıya kod veya profil dağıtılmaz. İstekler yararlı ve hızlı yanıt veren kaynakları tercih eder; hatalı veri kabul edilmez. Yeni peer isim yetkisi kazanmaz, güvenilen yayımlayıcının orijinal imzalı kayıtlarını aktarabilir.

**Bu özellik için masaüstü ve katılan destekçiler güncellenmelidir.** İlk bağlantı, erişilebilir port ve hazırlanmış gerçek dosyalar hâlâ gerekir. Standart ZIP ilk ağ davetini içermez. Otomatik kopya yerleştirme henüz uygulanmadı. [İşleyiş ve sınırlar](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/paylasilan-ag.md).

## Neler test edildi?

- **Preview.13:** Linux/Windows üzerinde 175 kaynak testi ve gerçek Windows uygulamasında 12 arayüz kontrolü geçti. [Çalışma](https://github.com/Vevivo/arns-mesh/actions/runs/37268859233). Sonradan katılım, ilk peer kapandıktan sonra aktarım, yeniden başlatma, hatalı duyuru/veri reddi ve orijinal isim imzasının aktarımı kontrollü testlerle sınandı. [Güncel test durumu](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/durum.md).

- **Preview.12 adayı:** Linux ve Windows'ta 168 kaynak testi, ZIP'ten çıkarılan gerçek Windows uygulamasında 10 arayüz kontrolü geçti. Kontrollü servisler ve imzalı test belgeleri kullanıldı. [İlgili çalışma](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203).
- **Yayımlanmış preview.8:** ağ katılımı, imzalı liste güncellemesi, daveti içeren paketin açılışı ve kayıtlı sayfanın yeniden açılması Windows'ta denendi. Liste kopyaları aynı makinedeydi. [Kanıt](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/network-join.md).
- **Önceki preview.7:** Windows DNS/gateway engelleme deneyinde dört gerçek ana belge açıldı, desteklenen medya oynadı. Mevcut Mesh ve IP tabanlı RPC erişilebilirdi. [Kanıt ve sınırlar](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/arweave-resources.md).
- **Bekleyenler:** gerçek kopyalarla bağımsız sağlayıcı kaybı, sahibin iki PC kabul testi ve Raspberry Pi donanım testi. Farklı ağlarda genel peer keşfi ve NAT kabulü henüz tamamlanmadı.

Mesh resmî AR.IO, Arweave veya Solana dağıtımı değildir. Bütün siteleri kapsama, anında güncelleme veya sınırsız çevrimdışı erişim garantisi yoktur. Doğrudan Mesh/RPC HTTP, anonim veya şifreli aktarım hizmeti değildir. [Durum](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/durum.md) · [Gizlilik](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/gizlilik.md).

## Ayrıntılar

[Destekçi kurulumu](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/destekci.md) · [Bağlantı terimleri ve gelişmiş ağ yönetimi](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/ag-kodu.md) · [Adayda kesinti kurtarması](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/dayanikli-erisim.md) · [Konu araması](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/konu-aramasi.md) · [İzleme göstergeleri](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/baglanti-izleme.md) · [Kaynak geliştirme](https://github.com/Vevivo/arns-mesh/blob/feat/resilient-access/docs/tr/gelistirici.md) · [Güvenlik](SECURITY.md) · [Apache-2.0](LICENSE) · [Atıflar](NOTICE.txt)
