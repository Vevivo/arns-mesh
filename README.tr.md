# ArNS Mesh

**Domain ve gateway erişimi kesildiğinde, erişilebilir peer'ler üzerinden ArNS sitelerini açmayı amaçlayan tarayıcı.**

ArNS Mesh; Windows tarayıcısı ve ayrı bir Linux destekçi servisinden oluşan bağımsız bir topluluk projesidir. `ar://isim` yazarsınız; Mesh ismin içeriğini bulur, erişebildiği dosyaları alır, kimlik ve imzalarını doğrulayıp sayfayı açar. Çalışırken kullanıcıyı bir gateway domainine yönlendirmek yerine sayısal IP kaynaklarını kullanır.

Amaç, erişimi sürdürme yükünü paylaşmaktır. Destekçiler VPS veya Raspberry Pi üzerinde depolama, isim kayıtları ve içerik konumu bilgisi sağlar. Ham Arweave ve Solana RPC erişilemez olduğunda önceden tutulmuş isim kayıtları ve gerçek dosya kopyaları kurtarma yolu oluşturabilir. **Yararlı bir kopyaya çalışan bağlantı yine gereklidir. İndeks, dosyanın kendisi değildir.**

[English](README.md) · [Tarayıcıyı kullan](docs/tr/kullanici.md) · [Destekçi kur](docs/tr/destekci.md) · [Ağın tasarımı](docs/tr/paylasilan-ag.md)

## Nereden başlamalıyım?

| Amacım | Gerekenler | Rehber |
|---|---|---|
| ArNS sitelerini açmak | Windows x64 tarayıcısı ve çalışan ağ bağlantı ayarı | [İndirme ve ilk açılış](docs/tr/kullanici.md) |
| Depolama ve indeks desteği vermek | Erişilebilir Linux VPS veya 64 bit Raspberry Pi, disk ve internet | [Destekçi kurulumu](docs/tr/destekci.md) |
| Sorun veya öneri bildirmek | Sürüm, başarısız aşama ve açıklama | [Geri bildirim](CONTRIBUTING.md) |

Destekçinin kod yazması gerekmez. Aynı kişi hem tarayıcıyı kullanabilir hem destekçi çalıştırabilir. Normal kullanıcıya sunucu, cüzdan, Node.js veya kendi indeksi gerekmez. Masaüstünü indirmek depolama alanını otomatik paylaşıma açmaz.

## İndirme ve gerçek durum

| Sürüm | Şu an sunulan | İndirme / kaynak |
|---|---|---|
| **Yayımlanmış preview.8** | ArNS gezintisi, kayıtlı kopyalar, tekrar kullanılabilir ağ daveti ve imzalı kaynak listesi güncellemeleri | [Windows x64 ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.8/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.8.zip) · [Sürüm ve sağlama toplamları](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.8) |
| **Test adayı preview.12** | Tarihli kesinti kurtarması, sınırlı site hazırlığı, yerel konu araması, bağlantı izleme ve sade ana ekran/logo | [Windows adayı](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323968857) · [Kaynak commit](https://github.com/Vevivo/arns-mesh/tree/cbd55a7dfd5b754a4d3ac06e4c67dc4c83a4011e) · [PR #9](https://github.com/Vevivo/arns-mesh/pull/9) |
| **Planlanan ortak ağ** | Otomatik destekçi duyurusu, peer adresi paylaşımı, ölçülen hıza göre kaynak seçimi ve koordineli içerik kopyaları | [Tasarım ve kabul koşulları](docs/tr/paylasilan-ag.md) — henüz uygulanmadı |

Durum **5 Ekim 2026** tarihinde kontrol edildi. `main` hâlâ preview.8 çalışma kodunu içerir; preview.12 henüz birleştirilmemiş adaydır. Actions dosyaları GitHub oturumu gerektirebilir ve süre sonunda silinir. Yukarıdaki iki standart ZIP'te de sağlayıcı daveti yoktur. Ayrı hazırlanmış bir **Connected ZIP**, temiz kurulumda içindeki ağa otomatik katılabilir; bu paketleme desteği vardır, fakat bu indirmeler Connected paket değildir.

## Bugün nasıl kullanılır?

1. **Windows uygulama ZIP'ini** indirin; GitHub'ın **Source code (zip)** dosyasını değil.
2. Klasörün tamamını çıkarıp `Mesh-Browser.exe` dosyasını açın.
3. Connected paket aldıysanız ilk bağlantıyı bekleyin. Standart pakette güvendiğiniz sağlayıcıdan tam `mesh1.` davetini alıp **Settings → Mesh connection code → Check code → Join this network** yolunu izleyin. Gerekirse [bağlantı yardımı isteyin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml); bu hizmet garantisi değildir.
4. Üst adres çubuğuna ArNS ismini yazın. Preview.12 ana ekranı ayrıca indirilmiş sınırlı katalogda konu araması yapar.
5. Saklamak için **Save current page** seçin ve kopyanın tamamlanıp tamamlanmadığını kontrol edin. Yer imi yalnız adresi hatırlar.

Hedeflenen günlük kullanım **kod girmeden indir, aç, kullan** biçimindedir. Bugünkü kod ağ kimliğini ve başlangıç adreslerini sağlar; lisans, şifre veya ücretli aktivasyon değildir. [Tam kullanıcı rehberi](docs/tr/kullanici.md).

## Bir isim nasıl sayfaya dönüşür?

1. **Kaynaklar bulunur.** Paketteki/aktarılan ayarlar ve daha önce kabul edilen adresler kullanılır. Bugün kaynak listesine katılım ağ yöneticisince yönetilir.
2. **İsmin hedefi bulunur.** Erişilebilirken sayısal IP üzerinden Solana RPC gözlemi alınır; beklenen hesap yapısı kontrol edilir. Aday sürüm, erişim hatasında kabul edilmiş tarihli yerel/sağlayıcı kaydını kullanabilir.
3. **Dosyalar bulunur.** Yerel kopyalar, Mesh peer'leri ve ham Arweave kaynaklarından yararlanılır. Konum kaydı dosyayı bulmaya yardım eder; dosyanın kendisini içermez.
4. **Doğrulanıp gösterilir.** İçerik kimliği ve imzası denetlenir; sayfa ve desteklenen dosyalar açılır. Tarihî isim kaydıyla erişim belirtilir. Dosya doğrulaması, ismin en güncel karşılığını tek başına kanıtlamaz.

İstemci başarısızlıkta gizlice gateway domainine geçmez. Harici API'ler, normal domaine bağlı servisler ve Arweave dışı CDN bağımlılıkları eksik kalabilir. Sayfadaki desteklenen sabit Arweave dosya adresleri Mesh/ham veri yoluna içeriden yönlendirilebilir. [Teknik işleyiş](docs/en/architecture.md).

## Neden destekçi çalıştırılır?

Yararlı bir destekçi, okuyuculara başka bir erişilebilir kopya sağlar ve indeksleme/depolama yükünü paylaşır. Üç farklı şey tutar: **tarihli isim–içerik kayıtları**, **konum bilgileri** ve **doğrulanmış gerçek dosyalar**. Yeterli hazırlıkla ilk sağlayıcı erişilemez olduğunda başka destekçi yanıt verebilir.

Yeni ve boş sunucu yedek değildir. Kesintiden önce ilgili kopyalar bağımsız cihazlarda bulunmalı; kalan peer'lerin disk, bellek ve yükleme kapasitesi yeterli olmalıdır. Bugün yapılandırılmış peer'lerden kopyalama ve aday sürümde sınırlı hazırlık vardır; otomatik kopya yerleştirme ve yeni keşfedilen peer'ler arasında genel yük dengeleme henüz yoktur.

[VPS veya Raspberry Pi kurulumu](docs/tr/destekci.md). Kolay yol mevcut ağa katılmaktır. Ayrı ağ kurmak ve yeni kod dağıtmak, her destekçinin yapması gereken iş değildir; gelişmiş sağlayıcı işlemidir.

## Geliştireceğimiz ortak ağ

- Kullanıcı uygulamayı açar; varsayılan bağlantılar indirmeyle birlikte gelir.
- Destekçi servisi kurar; erişilebilir adresi kontrol edilerek mevcut peer'lere otomatik duyurulur.
- Peer'ler sınırlı adres ve içerik bulunabilirliği kayıtlarını paylaşır; tarayıcı alternatif yolları elle profil değiştirmeden saklar.
- Mesh yararlı ve hızlı yanıt veren kaynakları seçer, hata durumunda değiştirir. İçerik doğrulanır; yeni keşfedilen peer otomatik olarak güvenilir isim yetkilisi olmaz.
- İçerik kopyaları, gönüllülerin ayırdığı kaynaklar içinde bağımsız destekçilere dağıtılır.

**Otomatik katılım, adres paylaşımı, bu kaynak seçimi ve kopya yerleştirme henüz tasarım aşamasındadır.** İlk erişilebilir peer'ler, isim kayıtlarına güven, liste süresi, kötüye kullanım sınırları ve bağımsız sunucu kaybı testleri bu işin parçasıdır. [Tasarımı oku](docs/tr/paylasilan-ag.md).

## Neler test edildi?

- **Preview.12 adayı:** Linux ve Windows'ta 168 kaynak testi, ZIP'ten çıkarılan gerçek Windows uygulamasında 10 arayüz kontrolü geçti. Kontrollü servisler ve imzalı test belgeleri kullanıldı. [İlgili çalışma](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203).
- **Yayımlanmış preview.8:** ağ katılımı, imzalı liste güncellemesi, daveti içeren paketin açılışı ve kayıtlı sayfanın yeniden açılması Windows'ta denendi. Liste kopyaları aynı makinedeydi. [Kanıt](docs/network-join.md).
- **Önceki preview.7:** Windows DNS/gateway engelleme deneyinde dört gerçek ana belge açıldı, desteklenen medya oynadı. Mevcut Mesh ve IP tabanlı RPC erişilebilirdi. [Kanıt ve sınırlar](docs/arweave-resources.md).
- **Bekleyenler:** gerçek kopyalarla bağımsız sağlayıcı kaybı, sahibin iki PC kabul testi ve Raspberry Pi donanım testi. Otomatik genel peer keşfi gösterilmiş değildir.

Mesh resmî AR.IO, Arweave veya Solana dağıtımı değildir. Bütün siteleri kapsama, anında güncelleme veya sınırsız çevrimdışı erişim garantisi yoktur. Doğrudan Mesh/RPC HTTP, anonim veya şifreli aktarım hizmeti değildir. [Durum](docs/tr/durum.md) · [Gizlilik](docs/tr/gizlilik.md).

## Ayrıntılar

[Destekçi kurulumu](docs/tr/destekci.md) · [Bağlantı terimleri ve gelişmiş ağ yönetimi](docs/tr/ag-kodu.md) · [Adayda kesinti kurtarması](docs/tr/dayanikli-erisim.md) · [Konu araması](docs/tr/konu-aramasi.md) · [İzleme göstergeleri](docs/tr/baglanti-izleme.md) · [Kaynak geliştirme](docs/tr/gelistirici.md) · [Güvenlik](SECURITY.md) · [Apache-2.0](LICENSE) · [Atıflar](NOTICE.txt)
