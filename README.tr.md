# ArNS Mesh

**ArNS isimlerini bir gateway domainine yönlendirmeden, peer’lerden ve ham Arweave ağından gelen doğrulanmış içerikle açan masaüstü tarayıcı.**

Amaç, domainler, DNS veya gateway hizmetleri kullanılamadığında **IP bağlantısı ve erişilebilir veri kaynakları hâlâ varsa** içeriğe ulaşabilmek. Uygulamaya `ar://isim` yazılır; ismin hedefi bulunur, veri alınır, kimliği ve imzası doğrulanarak gösterilir. Hiçbir erişilebilir kaynakta bulunmayan veri üretilemez.

**Kaynak sürümü: 0.5.0-preview.8** · [Yayımlanmış Windows paketleri](https://github.com/Vevivo/arns-mesh/releases) · [English](README.md)

Deneysel, bağımsız bir topluluk projesidir; resmî AR.IO, Arweave veya Solana dağıtımı değildir. Canlı isim çözümü IP üzerinden Solana RPC gözlemlerine dayanır. Bütün içerikleri ilk kez bulma ve bağımsız sunucu kaybına dayanıklılık çalışmaları tamamlanmış değildir.

## Nereden başlamalıyım?

| Amacın | Gereken | Başlangıç |
|---|---|---|
| ArNS sitelerini açmak | Windows x64 uygulaması + sağlayıcının bağlantı kodu (veya eski profil) | [Masaüstü kurulumu](#windows-uygulamasını-kur-ve-kullanmaya-başla) |
| Başkalarının içeriğe ulaşmasına destek olmak | Erişilebilir Linux VPS veya Raspberry Pi + disk + veri kaynakları | [Destekçi kurulumu](#vps-veya-raspberry-pi-üzerinde-destekçi-kurulumu) |
| Kodu geliştirmek veya paketlemek | Kaynak kod + Node.js/npm/Git; masaüstü için Electron | [Geliştirici rehberi](docs/tr/gelistirici.md) |

Normal kullanıcı kendi sunucusunu, indeksleyicisini, Node.js’i veya Chrome uzantısını kurmaz; cüzdan gerekmez. Masaüstünü indirmek bilgisayarı otomatik olarak başkalarına veri sunan bir peer yapmaz. Linux destekçi uygulaması ayrı çalışır.

## Bu yaklaşımın özelliği ne?

- **Kolay ağa katılım:** bağlantı kodunu yapıştır, ağı incele ve katıl. Live modunda imzalı adres listesi güncellemeleri otomatik alınır. Sağlayıcı, kodu içinde bulunan bir indirme paketi de hazırlayabilir. [Nasıl kullanılır?](docs/tr/ag-kodu.md)
- **Gateway domainine yönlendirmeden erişim:** uygulama profildeki sayısal IP kaynaklarını kullanır. İçerik bulunamayınca sessizce normal bir gateway’e geçmez.
- **Kullanıcının cihazında doğrulama:** içeriğin kimliği, imzası ve bütünlüğü kontrol edilir. Bu, ismin güncel hedefini bildiren RPC yanıtına güvenmekten ayrı bir kontroldür.
- **Dosya ve konum bilgisi paylaşımı:** destekçiler doğrulanmış dosyaları ve Arweave verisinin nereden alınabileceğini gösteren kayıtları paylaşabilir. Bağımsız cihazlardaki faydalı kopyalar tek işletmeciye bağımlılığı azaltabilir.
- **Mevcut sayfalardaki Arweave dosyaları:** desteklenen `https://arweave.net/<kimlik>` ve `/raw/<kimlik>` adresleri tarayıcının içinde Mesh/ham Arweave yoluna alınır. Kaynak sayfada gateway biçiminde adres görünmesi gateway’e bağlanıldığı anlamına gelmez. Her HTTPS sitesi veya gateway API’si bu kapsamda değildir.
- **Açıkça seçilen saklanmış kopyalar:** kaydetme işlemi manifestleri ve saptanan sabit Arweave bağlantılarını izler. Saved modu doğrulanmış yerel dosyaları okur; eksik kopyalar eksik olarak gösterilir.

Mesh, kesintide ek bir erişim yolu geliştirmeyi amaçlar. Arweave depolama ağının yerine geçmez, tam Solana doğrulayıcısı kurmaz ve bütün sitelerin eksiksiz çalışacağını garanti etmez.

## İsim yazıldıktan sonra ne oluyor?

1. **İlk kaynaklar bulunur:** bağlantı kodu ağın imza anahtarını ve başlangıç IP adreslerini taşır. Bu peer’lerden imzalı kaynak listesi alınır. Eski JSON profilleri de çalışır. Bu, işletmecinin yönettiği listedir; otomatik küresel peer rehberi değildir.
2. **İsim çözülür:** IP üzerinden Solana RPC’den ArNS/ANT hesap gözlemleri alınır; beklenen hesap sahibi, adres türetimi ve veri biçimi yerelde kontrol edilir. Bu, bağımsız hesap dahil edilme kanıtı değildir.
3. **İçeriğin konumu aranır:** yerel kayıtlar, peer’ler ve kullanılabilir indeks/ham keşif yolları değerlendirilir. Konum kaydı dosyanın kendisi değildir; yalnız nereden istenebileceğini söyler.
4. **Veri alınır ve doğrulanır:** Mesh veya ham Arweave üzerinden gelen dosyanın tam kimliği, imzası ve bütünlüğü kontrol edilir.
5. **Sayfa ve desteklenen dosyaları açılır:** içerik ayrı tarayıcı oturumunda gösterilir. Bağlı dosya konumu bulunamazsa preview.7, sayfanın bilinen konumuna yakın ham bloklarda sınırlı arama yapabilir; bulunan dosyayı yine doğrular.
6. **İstenirse kaydedilir:** o tarihteki isim eşleşmesi ve bulunan dosyalar saklanır. Saved modunda açılan kopya en güncel canlı sürüm olduğunu iddia etmez.

[Teknik işleyiş ve güven sınırları](docs/en/architecture.md) · [Dosya keşfi ve sınırları](docs/arweave-resources.md)

## Preview.8 bağlantı deneyi

Linux ve Windows’ta 144 test geçti. Gerçek Windows arayüzünde kodla katıldıktan sonra `vevivo` açıldı; ilk liste süreci kapatılıp uygulama yeniden başlatılınca ikinci süreçten güncelleme alındı. Saved açılışı ve yeniden başlatmada uygulama kaydında yeni ağ isteği oluşmadı. Kodu pakette bulunan temiz kurulum otomatik bağlandı. Liste kopyaları aynı makinedeydi; canlı içerik kaynakları açıktı. [Deney ve sınırları](docs/network-join.md).

## Preview.7 ile gerçekte ne doğrulandı?

Gerçek Windows deneylerinde DNS, gateway HTTPS ve DoH erişimi işletim sistemi kurallarıyla kesiliyken `vevivo`, `internetfireplace`, `permahistory` ve `kh-laboratory` ana belgeleri açıldı. Internet Fireplace’in daha önce bulunamayan font, video ve ses dosyaları ham Arweave yolundan bulunup imzaları doğrulandı; video ve ses oynadı. **Bu medya deneyinde mevcut Mesh kaynağı ve IP üzerinden RPC erişimi açıktı.**

![Gerçek Windows kesinti deneyi: ArNS Mesh içinde Internet Fireplace](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.7/resource-dns-cut-internetfireplace.png)

Bu gerçek test görüntüsüdür; canlı yayın değildir. Linux ve Windows’ta 131 kaynak testi geçti. [Canlı deney](https://github.com/Vevivo/arns-mesh/actions/runs/36088804178) · [Başarılı tekrar](https://github.com/Vevivo/arns-mesh/actions/runs/36089374969) · [Paket ve kanıt kapsamı](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.7)

Önceki deneyde asıl Mesh kaynağı engellenip yerel yedekler ve uzak ham düğümler kullanıldı. Yedekler aynı Windows makinesindeydi; bu, farklı sağlayıcılardaki bağımsız sunucuların dayanıklılığını kanıtlamaz. `permahistory` içindeki harici CDN işlevleri eksik kaldı. [Kesinti kaydı](docs/disaster-network.md)

## Windows uygulamasını kur ve kullanmaya başla

### İndir, bağlan, isim yaz

1. [Sürümlerden](https://github.com/Vevivo/arns-mesh/releases) **Windows ZIP’ini** indir. **Source code (zip)** geliştiriciler içindir. Hazır masaüstü Windows x64 içindir; önizleme kod imzalı değildir. [İndirme kontrolü](docs/tr/kullanici.md).
2. ZIP’in **tamamını** klasöre çıkar, `Mesh-Browser.exe` dosyasını aç. Ayrıca Node.js veya Chrome kurman gerekmez.
3. Sağlayıcından `mesh1.` ile başlayan **bağlantı kodunun tamamını** al. **Settings → Mesh connection code → Check code** seç, ağı incele, **Join this network** düğmesine bas. Bu seçim kaynak listesini değiştirir; eski listeyi tutmak istiyorsan önce dışa aktar.
4. **Check connections** ile kontrol et. **Mesh’in kendi adres çubuğuna** `ar://isim` veya yalnız ismi yazıp Enter’a ya da ok düğmesine bas. Bir kaynağın yanıt vermesi bütün siteleri açabileceği anlamına gelmez.
5. **Resolve name → Find sources → Locate content → Download → Verify → Open page** adımlarını izle. **Page information** eksik dosyaları ve doğrulamayı gösterir.

**Genel GitHub ZIP’inde hazır sağlayıcı bulunmaz.** Sağlayıcının hazırladığı **Connected** ZIP temiz kurulumda içindeki ağa otomatik bağlanabilir. Önceden ayarlanmış kaynaklar korunur. Genel pakette kod veya çalışan JSON dosyası gerekir; repodaki örnek IP’ler çalışır servis değildir.

Elinde `mesh-connect.json` varsa **Settings → Already have a connection file? → Import connection profile** yoluyla aktarabilirsin. Varsayılan aktarım eski kaynaklara ekler; değiştirme ayrıca seçilir. Elle aktarım/ayar değişimi ağın otomatik adres güncellemesini durdurur. Sağlayıcı tanımıyorsan [bağlantı bilgisi isteyebilirsin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml); bu gönüllü iletişim yoludur, anında hizmet garantisi değildir.

Kod **tekrar kullanılabilir; tek kullanımlık lisans veya parola değildir**. İlk adresleri ve açık doğrulama anahtarını taşır, site dosyalarını taşımaz. [Kullanıcı ve sağlayıcı için ayrıntılı anlatım](docs/tr/ag-kodu.md).

`+` yeni sekme açar; yıldız yer imi ekler. **Yer imi sayfayı kaydetmez.** Dosyaları tutmak için **Save current page** seç ve sonucu bekle; sonra kopyayı **Saved** modunda aç. Dinamik adresler, üçüncü taraf API’leri ve Arweave dışındaki CDN’ler tam saklama garantisinin dışındadır.

Güncellemede eski uygulamayı kapat, eski klasörü ve kullanıcı verisi yedeğini sakla, yeni ZIP’i ayrı klasöre çıkar. Ayarlar normalde `%APPDATA%\ArNS-Mesh-Browser` altındadır. [Ayrıntılı kullanım ve sorun giderme](docs/tr/kullanici.md)

## Kullanıcıya verilen bağlantı profili nedir?

Küçük bir JSON dosyasıdır. **Başlangıç adreslerini** taşır; site arşivi, cüzdan, kullanıcı hesabı veya erişim anahtarı değildir.

| Alan | Destekçi ne yazar? |
|---|---|
| `directPeers` | Erişilebilir Mesh destekçilerinin IP:port adresleri |
| `rpcSources` | Canlı isim gözlemleri için kullanımına izin verilen IP tabanlı Solana RPC servisleri |
| `arweavePeers` | Ham veri alma/keşif için isteğe bağlı Arweave düğümlerinin IP:port adresleri |

En az bir RPC ve en az bir Mesh **veya** ham Arweave kaynağı gerekir. Preview.7’de gösterilen ham keşif yolu için çalışan ham Arweave kaynakları yapılandırılmalıdır. Mesh, RPC ve ham Arweave **ayrı servislerdir**; Mesh portunu üç alana da yazmak bu servisleri oluşturmaz.

Profil yalnız sayısal IP:port kabul eder; domain, HTTPS adresi, parola ve URL yolu kabul etmez. Alıcının kullanmasını amaçladığın servisleri ekle. Dosya biçimi özel erişim onayı sağlamaz. **Export profile** yalnız adresleri dışa aktarır; bilgisayarı sunucuya dönüştürmez veya saklanan sayfaları aktarmaz. [Profil biçimi, kaynak bulma ve paylaşım](docs/tr/baglantilar.md)

## Neden destekçi sunucu çalıştırılır?

Destekçi, kullanıcıların faydalı kayıtlara ve doğrulanmış içeriğe ulaşabileceği ek bir kaynak sunar. İsim/hedef değişikliklerini gözlemleyebilir, sınırlı ham indeksleme yapabilir, yapılandırılmış peer’lerden dosya/konum bilgisi kopyalayabilir ve isteklere yanıt verebilir. Masaüstüyle bağlantısı şöyledir: **kullanıcı, imzalı listesinde sunucunun erişilebilir adresi bulunan ağa katılır; tarayıcı o sunucudan veri ister. Eski profil dosyası da kullanılabilir.**

İşletmecinin görevi erişimi, depolamayı ve kaynak bağlantılarını sürdürmek; hata/kotaları izlemek; peer kimliğini/verisini yedeklemek ve doğru imzalı adres listesi yayımlayıp bağlantı kodunu vermektir. Geliştirici sunucu işletmeden koda katkı verebilir; destekçi kod değiştirmeden sunucu çalıştırabilir. Bu repoda otomatik ödül/ödeme mekanizması bulunmaz.

Boş bir peer’in çalışıyor olması tam yedek değildir. Faydalı kayıt/dosyaların gerçekten birikmesi gerekir; geçici önbellek silinebilir. Tek VPS’i tek Pi’ye taşımak tek hata noktasını kaldırmaz. Yedeklilik, bağımsız erişilebilir cihazlardaki yararlı kopyalarla oluşur.

## VPS veya Raspberry Pi üzerinde destekçi kurulumu

İkisinde de Windows ZIP’i yerine **arayüzsüz Node.js peer** çalışır. Bu doğrudan IP kurulumu için domain, nginx veya TLS sertifikası gerekmez. Tam Solana veya Arweave düğümü kurulmaz.

| Platform | Hazırlık |
|---|---|
| Ubuntu VPS | Ayrı normal kullanıcı/proje dizini, Node.js 24 LTS + npm + Git, kalıcı disk ve boş erişilebilir TCP portu |
| Raspberry Pi | Raspberry Pi OS Lite gibi 64-bit Linux, ARM64 Node.js + npm + Git, kalıcı depolama, sürekli güç/ağ ve erişilebilir IP yolu |

**Gerçek Pi donanım kabulü henüz yapılmadı.** Ev modeminin arkasında port yönlendirme/public IP gerekebilir. CGNAT gelen bağlantıyı engelleyebilir; bu modda otomatik NAT geçişi veya relay yoktur. Yerel ağ IP’sinin internetteki kullanıcılarca erişileceğini varsayma.

[Adım adım VPS/Pi rehberi](docs/tr/destekci.md); işletim sistemi/Node hazırlığı, ağ, başlatma, arka plan servisi, kota, yedek ve güncellemeyi açıklar. Ortam hazırlandıktan ve çalışan **kaynak profilini** yeni repo klasörünün yanına koyduktan sonra:

```sh
git clone --branch main --depth 1 https://github.com/Vevivo/arns-mesh.git arns-mesh
cd arns-mesh
node scripts/profile.mjs check ../mesh-upstream.json
bash scripts/install-peer.sh ../mesh-upstream.json
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Komutları seçtiğin normal kullanıcıyla, yeni proje dizininde çalıştır. Varsayılan yollar `MESH_INSTALL_ROOT`/`XDG_DATA_HOME` değiştirilmediğini varsayar. `mesh-upstream.json`, **senin sunucunun kullanacağı** kaynakları göstermelidir; boş peer’i yalnız kendisine bağlamak içerik sağlamaz. Kurulum bağımlılık indirir; kesintiden önce hazırlan. Temel kurucu port açmaz ve mevcut servislere dokunmaz.

Varsayılan dinleme portu **TCP 49741**. Yalnız seçtiğin portu sağlayıcı/işletim sistemi güvenlik duvarında veya modeminde uygun şekilde aç. İkinci terminalde `node scripts/probe-peer.mjs 127.0.0.1:49741` çalıştır; sonra başka bir ağdan gerçek public IP ile dene. Yanıt almak ilk kontroldür; [gerçek içerik ve sayaçları da doğrula](docs/tr/destekci.md#4-sunucunun-gerçekten-erişildiğini-dene).

### Kaynakları hazırla ve kullanıcıya kod ver

Dışarıdan erişim çalıştıktan sonra **senin yeni Mesh sunucunun public adresi** ve izinli RPC/ham kaynaklarla **kullanıcı profili** oluştur. Aşağıdaki IP’ler çalışmayan belge örnekleridir; tamamını değiştir:

```sh
node scripts/profile.mjs --peer 192.0.2.20:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../mesh-connect.json
node scripts/profile.mjs check ../mesh-connect.json
```

Ek kaynaklar için seçenekleri tekrarla, sonra peer’in veri dizininden imzalı ağ listesini yayımla:

```sh
node scripts/network.mjs publish --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --profile ../mesh-connect.json --name "Benim Mesh Agim"
```

Kullanıcıya komutun verdiği **kodu** ve Windows indirme bağlantısını ver. Güncel peer’in gerçekten çalışıp erişilebilir olması gerekir. Eski yöntemle `mesh-connect.json` da verilebilir. [Kod üretme, yedek liste sunucusu, adres güncelleme ve Connected paket](docs/tr/ag-kodu.md). Bütün sunucu veri dizinini veya peer kimliğini gönderme. Başkasından aldığın kaynak profilini aynen paylaşmak senin düğümünü listeye eklemez. [İşletmeciden kullanıcıya dosya aktarımı](docs/tr/destekci.md#5-kullanıcılara-nasıl-vereceksin)

## Mevcut sınırlar ve kalan işler

| Konu | Bugünkü sınır |
|---|---|
| Canlı isimler | IP üzerinden Solana RPC gözlemine dayanır; bağımsız hesap dahil edilme kanıtı veya anında güncellik garantisi yok |
| Bilinmeyen içerik | Genel keşif eksik; bazı eski kataloglar Turbo/Goldsky ile hazırlanmıştı, bu geçmiş önemini korur |
| Bağlı dosya keşfi | Ana sayfa konumu gerekir; başlangıç ve en fazla 64 önceki blok, blok başına 256 işlem, dış bundle başlıkları, 3 dakika, tarama başına 96 MiB ve okuyucuda günlük 256 MiB ayrılan kota |
| Büyük dosyalar | İmzalı nesne sınırı 32 MiB; büyük dosyayı doğrulayarak akıtma tamamlanmadı |
| Saklama | Manifestler ve sınırlı sabit Arweave bağlantıları; her dinamik adres/harici hizmet dahil değil |
| Ağ dayanıklılığı | İmzalı işletmeci listesi ve liste kopyaları var; otomatik küresel üyelik/kopyalama yok; bağımsız cihaz kaybı ve tam paket kaydı kabulü bekliyor |
| Gizlilik | IP bağlantısı anonimlik sağlamaz; Mesh/RPC HTTP trafiği şifreli değildir |

Kesintiye hazırlanırken uygulamayı ve birden fazla kullanılabilir kaynağı önceden edin, önemli sayfaları kaydet. Erişilemeyen ağdan eksik dosya getirilemez. [Durum](docs/tr/durum.md) · [Gizlilik](docs/tr/gizlilik.md)

## Geliştiriciler ve katkı

[Güncel kaynak ZIP’ini indir](https://github.com/Vevivo/arns-mesh/archive/refs/heads/main.zip) veya repoyu klonla. Kaynak ZIP’i hazır masaüstü uygulaması değildir. Test, Electron ve paketleme için [geliştirici rehberini](docs/tr/gelistirici.md) kullan; bağımlılık kilidini ve ayrı test verisini koru. Bu sürüm bağımsız masaüstüdür; Wayfinder Chrome uzantısı veya başka tarayıcıya P2P düğmesi kurmaz.

Faydalı katkılar: genel içerik konumu kapsamı, bağımsız peer çoğaltma, isim güncelleme/RPC güvenilirliği, kaynak kotaları, büyük dosya doğrulaması ve Windows/Pi kesinti kanıtları. Ölçülmüş sonuçları, test verilerini ve tamamlanmamış özellikleri ayrı belirt.

[Katkı](CONTRIBUTING.md) · [Güvenlik](SECURITY.md) · [Apache-2.0 lisansı](LICENSE) · [Lisans bildirimleri](NOTICE.txt)
