# Destekçiler — VPS ve Raspberry Pi kurulumu

[Ana sayfa](../../README.tr.md) · [Yalnız masaüstü kullanıcısı](kullanici.md) · [English](../en/supporter.md)

**Preview.8 kolay kurulum:** [kodla ağa katılma, kendi ağını yayımlama, ikinci liste sunucusu ve Connected masaüstü hazırlama](ag-kodu.md). Aşağıdaki JSON yolu kaynak hazırlığı ve eski kullanıcılar için geçerlidir.

Sunucuda masaüstü tarayıcı değil, **arayüzsüz Node.js peer** çalışır. Doğrulanmış içerik paylaşır, konum ipuçları verir, ArNS/ANT hedeflerini takip eder ve sınırlı bütçeyle ham paket başlıklarından konum üretmeye çalışır. Kendi Windows bilgisayarında masaüstünü ayrıca kullanabilirsin.

**Nasıl yararlı olur?** Diğer kullanıcılar düğümüne ulaşabiliyorsa ve yararlı veri/kayıt barındırıyorsan ek kaynak sağlarsın. Aynı verinin bağımsız ikinci kopyası kesintiye dayanıklılık kazandırabilir. Boş bir sunucuda servisin açık olması bütün siteleri yedeklediğin anlamına gelmez. Bu önizlemede yeni sunucular küresel bir listeye otomatik kaydolmaz; imzalı ağ kodları veya eski IP bağlantı profilleri paylaşılır. Doğrudan bağlantı modunda otomatik NAT geçişi veya relay yoktur.

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

### Node.js yoksa: Ubuntu / 64-bit Pi OS

Uygun Node.js/npm zaten varsa bu bölümü atla. Yeni Debian tabanlı sistemde aşağıdaki paketleri yönetici kurabilir; Node arşivi adımını normal hesabınla çalıştır. Örnek **CI'da kullanılan 24.19.0** sürümünü sabitler; en yeni güvenlik sürümü olduğu iddia edilmez. Güncel ve desteklenen Node 24 LTS seçerken [resmî indirme sayfasını](https://nodejs.org/en/download) kontrol et. [24.19.0 arşivinde](https://nodejs.org/en/download/archive/v24.19.0) Linux x64 ve ARM64 paketleri vardır.

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends git curl ca-certificates xz-utils
```

```sh
(
  set -eu
  MESH_NODE_VERSION=v24.19.0
  case "$(uname -m)" in
    x86_64) MESH_NODE_ARCH=x64 ;;
    aarch64) MESH_NODE_ARCH=arm64 ;;
    *) exit 1 ;;
  esac
  MESH_NODE_ARCHIVE="node-${MESH_NODE_VERSION}-linux-${MESH_NODE_ARCH}.tar.xz"
  MESH_NODE_BASE="https://nodejs.org/download/release/${MESH_NODE_VERSION}"
  MESH_NODE_TMP="$(mktemp -d)"
  trap 'rm -rf -- "$MESH_NODE_TMP"' EXIT
  cd "$MESH_NODE_TMP"
  curl --fail --location --proto '=https' "$MESH_NODE_BASE/$MESH_NODE_ARCHIVE" -o "$MESH_NODE_ARCHIVE"
  curl --fail --location --proto '=https' "$MESH_NODE_BASE/SHASUMS256.txt" -o SHASUMS256.txt
  awk -v name="$MESH_NODE_ARCHIVE" '$2 == name {print}' SHASUMS256.txt > selected.sha256
  test -s selected.sha256
  sha256sum --check selected.sha256
  mkdir -p "$HOME/.local/opt"
  test ! -e "$HOME/.local/opt/node-${MESH_NODE_VERSION}-linux-${MESH_NODE_ARCH}"
  tar -xJf "$MESH_NODE_ARCHIVE" -C "$HOME/.local/opt"
)
```

Mimari `uname -m` sonucundan seçilir. Desteklenmeyen mimari veya hatalı checksum bu bloğu durdurur; hata varsa devam etme. Aynı sürüm dizini zaten varsa üzerine yazılmaz. Bu kontrol resmî HTTPS kaynağındaki checksum ile indirme bütünlüğünü karşılaştırır; ayrıca yayıncı imzası doğrulaması yapmaz.

x86-64 VPS için bu terminalde:

```sh
export PATH="$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$PATH"
```

64-bit Raspberry Pi veya ARM64 VPS için **bunun yerine**:

```sh
export PATH="$HOME/.local/opt/node-v24.19.0-linux-arm64/bin:$PATH"
```

Gerekirse sana uygun satırı sonraki oturumlar için kullanıcı kabuk ayarına ekle; başka sürüm seçtiysen yolu uyarla. `node --version`, `npm --version` ve `git --version` kontrollerini tekrar yap. Mesh kurucusu Node dosyasının tam yolunu kaydeder; servis için bu dizini koru. Sistem `/usr/bin/node` dosyası değiştirilmez.

## 3. Ortak kurulum: kaynak ve bağlantı profili

```sh
git clone --branch v0.5.0-preview.8 --depth 1 https://github.com/Vevivo/arns-mesh.git arns-mesh
cd arns-mesh
```

Bu komut yayımlanmış preview.8 kaynağını yeni bir dizine alır. GitHub/npm kurulum aşamasında kullanılır; çalışan Mesh’in içerik erişim yolu değildir. Bağımlılıkları kesintiden önce indir.

Başka destekçiden çalışan profil al ve repo klasörünün yanına `mesh-upstream.json` olarak koy. Bu dosya **senin sunucunun veri alacağı kaynakları** gösterir. Kullanılabilir adresleri biliyorsan aşağıdaki komutla üretebilirsin. Buradaki `--peer` mevcut bir kaynaktır; kendi yeni boş sunucunu yazmak ona veri sağlamaz:

```sh
node scripts/profile.mjs --peer 192.0.2.10:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../mesh-upstream.json
node scripts/profile.mjs check ../mesh-upstream.json
```

**Komuttaki bütün IP'ler çalışmayan belge örnekleridir; gerçek adreslerinle değiştir.** Birden fazla kaynak için ilgili seçeneği tekrarla. RPC, Mesh portu değildir; IP üzerinden HTTP ile gerekli Solana JSON-RPC yöntemlerini sunmalıdır. Sıradan bir HTTPS/domain veya API anahtarlı URL bu profile konulamaz. Mesh sunucusu kurmak Solana RPC kurmak değildir.

Profil en az bir RPC ile en az bir Mesh veya ham Arweave kaynağı ister. Ham Arweave kaynağı olmadan peer'lerden kopyalama mümkün olabilir ama ham paket taraması yeni konum üretemez. Profil kontrolü yalnız biçimi doğrular; servislerin açık olduğunu kanıtlamaz.

Önce repo dizinindeki bağımlılıkları ve yerel yüklemeyi kontrol et:

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node scripts/doctor.mjs ../mesh-upstream.json
```

Bu kontrol profili ve yerel bağımlılıkları inceler; ağda gerçek içerik bulunduğunu kanıtlamaz. Başarılıysa kur ve başlat:

```sh
bash scripts/install-peer.sh ../mesh-upstream.json
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Başlatıcı önde çalışır ve terminali meşgul tutar. 4. adımdaki kontrolleri ikinci SSH terminalinden yap; arka plan servisine geçmeden önce **Ctrl+C** ile durdur.

Aşağıdaki yollar `MESH_INSTALL_ROOT`/`XDG_DATA_HOME` değiştirilmediğini varsayar. Kurulum ayrı sürüm klasörü oluşturur. Veriler `~/.local/share/ArNS-Mesh-Supporter/data`, programlar `releases`, seçili sürümü başlatan dosya `Start-Peer.sh` içindedir. Başka dizin için kurulum ve servis komutlarında aynı `MESH_INSTALL_ROOT` değerini kullan. Aynı veriye iki süreç çalıştırma. Önde çalışan peer'i **Ctrl+C** ile durdur.

Kurucu bağımlılıkları ayrı sürüme lockfile ile, bağımlılık kurulum betiklerini çalıştırmadan indirir. Arka plan servisi veya firewall kuralı oluşturmaz. Bu doğrudan HTTP/IP kurulumu için domain, nginx veya TLS sertifikası gerekmez.

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

Dış ağdan kontrol başarılı olduktan sonra **kullanıcı profili** üret. `mesh-upstream.json` dosyasından farklı olarak bu dosyada **senin yeni sunucunun public Mesh IP ve portu** bulunur. Public IP'yi VPS sağlayıcının ağ panelinden öğren; evdeki Pi için dışarıdan erişilebilir IP ve yönlendirilen portu kullan. `0.0.0.0` dinleme adresidir, kullanıcıların bağlanacağı adres değildir. `127.0.0.1` alıcının kendi bilgisayarını gösterir. Yerel ağ adresi ancak o ağa erişen kişiler içindir.

Aşağıdaki **çalışmayan örnek adreslerin tamamını**, kullanıcıların kullanmasına izin verilen gerçek Mesh/RPC/ham Arweave servisleriyle değiştir:

```sh
node scripts/profile.mjs --peer 192.0.2.20:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../mesh-connect.json
node scripts/profile.mjs check ../mesh-connect.json
```

Başka bağımsız destekçiler için `--peer` seçeneğini, diğer kaynaklar için ilgili seçenekleri tekrarla. Komut mevcut dosyanın üzerine yazmaz; dosya varsa incele veya yeni çıktı adı seç. `check` yalnız biçimi doğrular. [Her alanın açıklaması ve adreslerin nereden alınacağı](baglantilar.md#dosyanın-içine-ne-yazılır).

Kullanıcıya şunları ver:

1. [Windows indirmeleri](https://github.com/Vevivo/arns-mesh/releases).
2. `mesh-connect.json` dosyan ve **Settings → Already have a connection file? → Import connection profile → Check connections** adımları.
3. IP/port veya kaynak erişimi değişirse yeni profil alabileceği ve hata bildirebileceği iletişim yolu. Profil kendini otomatik güncellemez.

Paylaşacağın dosyanın aynısını ayrı bir masaüstü test profilinde dene. Dosya kullanıcının senin peer'inden veri istemesini sağlar; saklanan siteleri aktarmaz veya her ismin açılacağını garanti etmez. Başlangıçta aldığın kaynak profilini aynen paylaşmak yeni sunucunu listeye eklemez. Diğer destekçiler de senin profilini kendi kaynaklarına ekleyebilir; hiçbir veri kaynağına ulaşmayan kapalı bağlantı döngüsü kurma.

Gizli anahtarı veya bütün `data` dizinini paylaşma. Profildeki servis adresleri alıcılar tarafından görülebilir; yalnız paylaşmayı amaçladığın uçları ekle.

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

Windows DNS/gateway engeli ve aynı makinedeki yedekler arasında geçiş gerçek ana belgelerle ölçüldü; [deney kaydı](../disaster-network.md). Preview.7’de Internet Fireplace medyası ham Arweave yolundan bulunup doğrulanarak oynatıldı; bu deneyde mevcut Mesh ve IP üzerinden RPC açıktı. [Dosya keşfi](../arweave-resources.md). Gerçek Pi, bağımsız cihaz kaybı ve tam paket kaydı henüz doğrulanmadı. Sıcak peer'de çalışan içerik, boş peer'in bütün isimleri bulabildiği anlamına gelmez. [Durum](durum.md).
