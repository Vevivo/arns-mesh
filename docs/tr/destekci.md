# Destekçiler — VPS ve Raspberry Pi kurulumu

[Ana sayfa](../../README.tr.md) · [Yalnız masaüstü kullanıcısı](kullanici.md) · [English](../en/supporter.md)

Sunucuda masaüstü tarayıcı değil, **arayüzsüz Node.js peer** çalışır. Doğrulanmış içerik paylaşır, konum ipuçları verir, ArNS/ANT hedeflerini takip eder ve sınırlı bütçeyle ham paket başlıklarından konum üretmeye çalışır. Kendi Windows bilgisayarında masaüstünü ayrıca kullanabilirsin.

**Nasıl yararlı olur?** Diğer kullanıcılar düğümüne ulaşabiliyorsa ve yararlı veri/kayıt barındırıyorsan ek kaynak sağlarsın. Aynı verinin bağımsız ikinci kopyası kesintiye dayanıklılık kazandırabilir. Boş bir sunucuda servisin açık olması bütün siteleri yedeklediğin anlamına gelmez. Bu önizlemede yeni sunucular küresel bir listeye otomatik kaydolmaz; IP bağlantı profilleri paylaşılır. Doğrudan bağlantı modunda otomatik NAT geçişi veya relay yoktur.

## 1. VPS hazırlığı

Ubuntu üzerinde ayrı bir normal kullanıcı ve proje dizini kullan. Git, Node.js 24 LTS ve npm kurulu olmalı. Çekirdek Node.js 22.12+ kabul eder; test ortamı Node.js 24'tür. Kurucu sistem Node'unu, nginx'i, sertifikaları veya başka servisleri değiştirmez. Mevcut üretim dizininin üzerine kurma.

```sh
uname -m
node --version
npm --version
git --version
```

Boş bir gelen **TCP** portu ayır. Kurucu **49741** kullanır. Alt seviye peer girişinin varsayılanı 49740'tır; elle çalıştırıyorsan portu açıkça belirt.

## 2. Raspberry Pi hazırlığı

64-bit Linux çalıştırabilen Pi gerekir. Pi 4/5 ve 4 GB RAM başlangıç önerisidir; ölçülmüş asgari gereksinim veya denenmiş donanım iddiası değildir.

1. [Raspberry Pi Imager](https://www.raspberrypi.com/software/) ile **Raspberry Pi OS Lite 64-bit** kur.
2. Imager'da kullanıcı ve SSH erişimini ayarla. [Resmî kurulum](https://www.raspberrypi.com/documentation/computers/getting-started.html) ve [uzak erişim](https://www.raspberrypi.com/documentation/computers/remote-access.html) rehberlerini izle.
3. [Node.js](https://nodejs.org/en/download) üzerinden **Linux ARM64 / Node.js 24 LTS**, npm ve Git hazırla. `uname -m` bu yol için `aarch64` göstermeli.
4. Sürekli indeks yazımı için SSD tercih et; verini yedekle.

Pi'ye tam Solana veya Arweave düğümü kurmuyoruz. Erişilebilir RPC ve içerik kaynakları hâlâ gerekli. Gerçek Pi donanımı bu sürümde test edilmedi; aşağıdaki bağımlılık kontrolü geçmeden servis kurulumuna geçme.

## 3. Ortak kurulum: kaynak ve bağlantı profili

```sh
git clone https://github.com/Vevivo/arns-mesh.git
cd arns-mesh
```

Repo Private ise sahibi erişim vermeli. GitHub/npm kurulum aşamasında kullanılır; çalışan Mesh'in içerik erişim yolu değildir.

Başka destekçiden çalışan bağlantı profili al veya bildiğin gerçek servis adresleriyle üret:

```sh
node scripts/profile.mjs --peer 192.0.2.10:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../network-profile.private.json
node scripts/profile.mjs check ../network-profile.private.json
```

**Komuttaki bütün IP'ler çalışmayan belge örnekleridir; gerçek adreslerinle değiştir.** Birden fazla kaynak için ilgili seçeneği tekrarla. RPC, Mesh portu değildir; IP üzerinden HTTP ile gerekli Solana JSON-RPC yöntemlerini sunmalıdır. Sıradan bir HTTPS/domain veya API anahtarlı URL bu profile konulamaz. Mesh sunucusu kurmak Solana RPC kurmak değildir.

Profil en az bir RPC ile en az bir Mesh veya ham Arweave kaynağı ister. Ham Arweave kaynağı olmadan peer'lerden kopyalama mümkün olabilir ama ham paket taraması yeni konum üretemez. Profil kontrolü yalnız biçimi doğrular; servislerin açık olduğunu kanıtlamaz.

```sh
bash scripts/install-peer.sh ../network-profile.private.json
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Kurulum ayrı sürüm klasörü oluşturur. Veriler `~/.local/share/ArNS-Mesh-Supporter/data`, programlar `releases`, seçili sürümü başlatan dosya `Start-Peer.sh` içindedir. Başka dizin için kurulum ve servis komutlarında aynı `MESH_INSTALL_ROOT` değerini kullan. Aynı veriye iki süreç çalıştırma. Önde çalışan peer'i **Ctrl+C** ile durdur.

Kurucu bağımlılıkları lockfile ile, kurulum betiklerini çalıştırmadan indirir. Yerel bağımlılıkları ayrıca kontrol et:

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node scripts/doctor.mjs ../network-profile.private.json
```

Bu kontrol ağdan gerçek içerik alındığı anlamına gelmez.

## 4. Sunucunun gerçekten erişildiğini dene

Önce aynı cihazda:

```sh
node scripts/probe-peer.mjs 127.0.0.1:49741
```

Sonra **başka bir ağdaki cihazdan**, gerçek dış IP ve portunla aynı komutu çalıştır. Yerelde başarılı olması dışarıdan erişilebilirlik değildir.

VPS'te seçtiğin TCP portunu sağlayıcı ve işletim sistemi güvenlik duvarında mevcut politikan doğrultusunda aç. Pi ev modeminin arkasındaysa public IPv4 ve port yönlendirme veya bilinçli yapılandırılmış erişilebilir IPv6 gerekir. CGNAT altında port yönlendirme yetmeyebilir; bu sürümde otomatik relay yoktur. SSH/yönetim arayüzlerini açmak veya başka kuralları silmek gerekmez.

Probe önbellekte konum sorar. `location_not_found` cevabını alması Mesh servisinin cevap verdiğini gösterir; içerik kapsamını veya site açıldığını göstermez.

Gerçek katkı kontrolü için temiz bir masaüstü veri profilinde kendi peer'ini bağlantı listesine ekle, önceden hazırlanmamış bir isim aç, sonuca ve sunucu sayaçlarına bak. Kaynağı ayırt etmek için yalnız **test profilinden** diğer peer'leri çıkararak dene. Çalışan profilini veya sunucu verilerini silme.

Yaklaşık dakikada bir gelen `peer-status` kaydında:

| Alan | Ne gösterir? |
|---|---|
| `requestsServed` | Başarısız aramalar dahil istek sayısı; açılan sayfa sayısı değil. |
| `contentBytesServed`, `contentChunksServed` | Kullanıcılara gönderilen içerik. |
| `cachedContent`, `indexLocations` | Yerel içerik/konum sayısı; bütün ArNS kapsamı değil. |
| `catalog.completed`, `catalog.meshReplicated`, `catalog.locationsReplicated`, `catalog.lastSuccess` | Tamamlanan işler ve kopyalama ilerlemesi. |
| `catalog.catalogError`, `catalog.lastError` | İsim güncelleme ve içerik işlerinin hataları. |
| `discovery.locationsAdded`, `discovery.lastError` | Ham konum keşfi ve hataları. |

## 5. Kullanıcılara nasıl vereceksin?

Profil üretme komutunda kendi **erişilebilir Mesh IP/portunu** ve kullanımına izin verilen RPC/ham kaynakları yaz. Üretilen küçük JSON dosyasını masaüstü kullanıcılarına ver. Onlar **Settings → Import connection profile** ile dosyayı seçer; IP veya komut yazmaz.

Aynı şekilde diğer destekçiler senin peer'ini listelerine ekleyebilir. Gizli anahtar veya bütün `data` dizini paylaşılmaz. Profil içindeki servis adresleri alıcılar tarafından görülebilir; yalnız paylaşmayı amaçladığın uçları ekle.

Birden fazla bağımsız peer iyi olur ama gerekli kayıtların ve dosyaların oralarda gerçekten bulunması gerekir. Otomatik küresel kopyalama, otomatik düğüm kaydı ve her RPC işleminde garantili yedek geçişi tamamlanmış değildir.

## 6. İsteğe bağlı arka plan servisi

Öndeki peer'i durdurduktan sonra:

```sh
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

Bu ayrı bir kullanıcı servisi kurar, mevcut aynı adlı servisin üzerine yazmaz. VPS'te oturum kapandıktan sonra/yeniden açılışta sürmesi için yönetici gerekirse `sudo loginctl enable-linger KULLANICI` çalıştırabilir. Gerçek normal kullanıcı adını yaz; bu adım kurucu tarafından otomatik yapılmaz.

`~/.local/share/ArNS-Mesh-Supporter/peer.env` dosyasında isteğe bağlı ayarlar:

```text
MESH_LISTEN=0.0.0.0:49741
ARNS_INDEX_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=64
ARNS_INDEX_PARTITION=0/1
```

Değişiklik sonrası yalnız bu servisi yeniden başlat: `systemctl --user restart arns-mesh-supporter`.

Servis başlangıç sınırları: `CPUQuota=25%`, `MemoryMax=512M`, Node heap 384 MiB. Bunlar ölçülmüş gereksinim değil, yapılandırılmış sınırdır; işletim sisteminin cgroup desteği önemlidir. Otomatik içerik 256 MiB, sabitlenen içerik ayrı 512 MiB ile sınırlıdır. İndeks, bağımlılıklar ve loglar ayrıca yer kaplar. `du -sh ~/.local/share/ArNS-Mesh-Supporter/data` ile diski izle.

Ham tarama ve katalog ayrı ayrı varsayılan 64 MiB/gün sayılan yanıt trafiği bütçesine sahiptir. Bunlar **toplam internet kotası değildir**; kullanıcılara içerik gönderme ve başka trafik eklenir. İsim taraması ile katalog içerik işleri aynı katalog bütçesini kullanır: kota dolunca isim güncellemesi de gecikebilir. Kayıt taraması yaklaşık altı saat aralıkla planlanır, ANT'ler artımlı işlenir; anlık güncelleme garantisi yoktur.

Birlikte indeksleyen destekçiler taze ayrı tarama durumlarında `0/2` ve `1/2` gibi tamamlayıcı bölüm seçebilir. Bu blok yükünü paylaşır; otomatik dağıtım veya tam kapsam kanıtı değildir. Mevcut tarama bölümünü yerinde değiştirme; ayrı veri diziniyle başlat.

## 7. Güncelleme, geri dönüş, kaldırma

1. Peer'i durdur: Ctrl+C veya `systemctl --user stop arns-mesh-supporter`.
2. Bütün `data` dizinini, kimlik dahil, özel olarak yedekle. Eski başlatıcıyı da tut. Aynı kimliğin iki kopyasını bağımsız peer gibi çalıştırma.
3. Kaynağı inceleyip güncelle; `install-peer.sh` komutunu profil dosyanla tekrar çalıştır. Yeni sürüm dizini oluşur; mevcut bağlantılar ve veri korunur.
4. Başlatıp kontrol et. Hata varsa durdur, `Start-Peer.sh.previous` dosyasını `Start-Peer.sh` olarak geri getir. Şema değişmişse uygun eski veri yedeği de gerekir.

Profilin bilinçli değişimi için durdurduktan sonra `node scripts/profile.mjs apply PROFIL.json "$HOME/.local/share/ArNS-Mesh-Supporter/data"` çalıştırıp yeniden başlat.

Kullanıcı servisini kaldırmak için:

```sh
systemctl --user disable --now arns-mesh-supporter
rm -- "$HOME/.config/systemd/user/arns-mesh-supporter.service"
systemctl --user daemon-reload
```

`XDG_CONFIG_HOME` özelse yolu uyarla. Program/sürüm klasörlerini süreç kapalıyken silebilirsin. Kimlik, indeks ve içerik silinsin istemiyorsan `data` dizinini koru. Yalnız bu projeye özel eklediğin firewall, port yönlendirme ve lingering ayarlarını kaldır; başka projelerin ayarlarına dokunma.

Windows DNS/gateway engeli ve aynı makinedeki yedekler arasında geçiş gerçek ana belgelerle ölçüldü; [deney kaydı](../disaster-network.md). Gerçek Pi, bağımsız cihaz kaybı ve tam paket kaydı henüz doğrulanmadı. Sıcak peer'de çalışan içerik, boş peer'in bütün isimleri bulabildiği anlamına gelmez. [Durum](durum.md).
