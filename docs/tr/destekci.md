# VPS veya Raspberry Pi ile Mesh'e destek ol

[English](../en/supporter.md) · [Ana sayfa](../../README.tr.md) · [Ağ tasarımı](paylasilan-ag.md)

Destekçi yararlı veriyi saklar ve başka cihazların isteklerini yanıtlar. Yazılım geliştirmeniz gerekmez. Linux servisini sunucunuzda/Pi'de çalıştırın; gezinti için ayrıca Windows tarayıcısını kullanabilirsiniz.

**Bu rehber preview.13 kaynak adayını kurar.** Sınırlı site hazırlığı ve tarihli kurtarma kayıtlarını içerir. Otomatik destekçi duyurusu ve adres paylaşımı eklenmiştir; yayımlanmış sürüm değildir. Yayımlanmış preview.8/profil yolu ve ayrıntılı yönetim için [gelişmiş işlemlere](destekci-ayrintili.md) bakın.

## 1. Gerekenler

| VPS | Raspberry Pi |
|---|---|
| Linux sunucu ve normal kullanıcı hesabı | Pi 4/5 gibi 64 bit Linux çalıştırabilen cihaz |
| Kalıcı disk, yeterli boş RAM ve yükleme kapasitesi | Raspberry Pi OS Lite 64 bit, güvenilir güç/internet ve kalıcı depolama |
| Erişilebilir genel IP ve boş TCP portu | Dışarıdan Pi'ye erişim; ev modeminde port yönlendirme gerekebilir |

[Node.js 24 LTS](https://nodejs.org/en/download), npm ve Git gerekir. Adayın CI testleri Node 24.19.0 kullandı; bu test temeli, en yeni yama iddiası değildir. Çekirdek Node 22.12+ kabul eder. Kontrol edin:

```sh
node --version
npm --version
git --version
uname -m
```

Eksikler için [ayrıntılı kurulumdaki Node adımlarını](destekci-ayrintili.md) ve [resmî Pi rehberini](https://www.raspberrypi.com/documentation/computers/getting-started.html) izleyin. `aarch64` Pi için Linux ARM64 Node, `x86_64` VPS için Linux x64 seçilir. Gerçek Pi donanım/performans testi bekliyor; ölçülmüş minimum donanım şartı yoktur. İşletim sistemi, paketler, günlükler ve indeksler içerik kotasına ek alan kullanır.

Doğrudan IP dinleyicisi domain, nginx veya TLS sertifikası gerektirmez; tam Arweave/Solana düğümü kurmaz. Bugünkü doğrudan modda otomatik NAT aşma veya relay yoktur. CGNAT arkasındaki Pi çalışsa bile internetten erişilemeyebilir.

## 2. Adayı indir ve mevcut ağa katıl

Güvendiğiniz sağlayıcıdan tam `mesh1.` **ağ davetini** alın. Bu, yeni peer'in ilk kaynakları bulmasını sağlar; sizin yeni peer adresiniz veya lisans değildir. Yoksa [bağlantı yardımı isteyin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). Repoda hazır çalışan adres veya davet bulunmaz.

Yeni bir dizinde, servisin sahibi olacak normal kullanıcıyla çalıştırın:

```sh
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout feat/resilient-access
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
bash scripts/install-peer.sh --network 'TAM_MESH1_KODUNU_BURAYA_YAPISTIR'
```

Daldaki güncel aday kurulur; seçtiğiniz commit için [PR #9 testlerini](https://github.com/Vevivo/arns-mesh/pull/9) kontrol edin. Kesintiden önce kurun: GitHub/npm indirme bağımlılıklarıdır. Başka projenin veri dizinini kullanmayın. Kurucu mevcut Mesh ayar/verilerini korur, port açmaz veya başka servisleri değiştirmez.

Varsayılan konum: `~/.local/share/ArNS-Mesh-Supporter`. Önce terminalde başlatın:

```sh
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Terminal açık kalsın. Düzenli durum çıktısı gelir; Ctrl+C ile durdurulur. Bu, peer başlatır; tam arşiv oluşturmaz. Boş peer'in veri edinmesi için davetin ulaştırdığı kaynaklar çalışmalıdır.

## 3. Diğer cihazlar sana ulaşabiliyor mu?

İkinci terminalde, kaynak dizininden:

```sh
node scripts/probe-peer.mjs 127.0.0.1:49741
```

Beklenen çıktı: `Mesh endpoint responded`. Bu yalnız erişimi kontrol eder, sitelerin varlığını değil. Ardından aynı komutu **başka bir ağdan**, `127.0.0.1:49741` yerine sunucunuzun gerçek genel `IP:port` adresini yazarak çalıştırın.

**Peer adresiniz** bu erişilebilir IP ve porttur. `0.0.0.0` dinleme ayarıdır; `127.0.0.1` okuyucunun kendi bilgisayarını gösterir. Pi'nin özel yerel adresi yalnız ona ulaşan ağlarda kullanılabilir. Mevcut sağlayıcı/sunucu/modem kurallarınızda yalnız seçtiğiniz TCP portuna izin verin; varsayılan **49741**. [Ayrıntılı erişim adımları](destekci-ayrintili.md).

**Preview.13 katılımı otomatiktir:** servis kendi imzalı genel adresini mevcut peer'e duyurur. Karşı peer geri bağlanıp kimliği doğrular; ağa katılmış yeni sürüm okuyucular adresi öğrenir. Ağ yöneticisinin her katılımcı için listeyi yeniden yayımlaması gerekmez. İki taraf da yeni protokolü çalıştırmalıdır. Eski sunucu önce güncellenmelidir.

Varsayılan `MESH_ADVERTISE=auto`, karşı peer'in gördüğü IP'yi ve dinleme portunu kullanır. Modemde dış port farklıysa `peer.env` içine `MESH_ADVERTISE=GENEL_IP:PORT` yazın; gerçek adresi kullanın. `off` duyuruyu kapatır. Bu ayar port açmaz, CGNAT sorununu çözmez. Ayrıntılar: [paylaşılan ağ](paylasilan-ag.md).

Her destekçinin ayrı ağ kurup kullanıcılara yeni davet dağıtması gerekmez.

## 4. Yararlı kopyalar hazırla ve arka planda çalıştır

Terminal kontrolünden sonra Ctrl+C ile durdurun. Kurulu ana dizinde **kendi** `peer.env` dosyanızı oluşturun veya mevcut ayarları koruyarak düzenleyin. Bu aday için küçük bir başlangıç örneği:

```sh
(
  set -o noclobber
  cat > "$HOME/.local/share/ArNS-Mesh-Supporter/peer.env" <<'MESH_ENV'
MESH_LISTEN=0.0.0.0:49741
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=16
ARNS_CACHE_MIB=256
ARNS_SAVED_MIB=1024
ARNS_INDEX_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=64
MESH_ENV
)
```

Komut `~/.local/share/ArNS-Mesh-Supporter/peer.env` dosyasını oluşturur; mevcut dosyanın üstüne yazmaz. Zaten varsa aynı dosyayı metin düzenleyicinizle düzenleyin. Arka plan servisi bunu okur; terminalden başlatıcıyı tek başına çalıştırmak bu dosyayı okumaz. Bunlar örnek içerik/iş kotalarıdır; toplam disk, trafik veya RAM sınırı değildir. Kaynağınıza göre seçin. Kurucu katalog işini zaten etkinleştirir. Hazırlık, kaynaklar çalışırken desteklenen site dosyalarını sınırlı biçimde kopyalayıp korur; eksik yeni sürüm, önceki tam sürümün yerini almaz. [Aday ayarlarının anlamı](dayanikli-erisim.md).

Ayrı kullanıcı servisini kurun:

```sh
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

Aynı kaynak dizininde ve hesapta çalıştırın. Mevcut servis dosyasının üstüne yazmaz; servis zaten kuruluysa `peer.env` düzenlendikten sonra yalnız `arns-mesh-supporter` yeniden başlatılır. Çıkıştan/yeniden açılıştan sonra çalışması için yönetici `sudo loginctl enable-linger KULLANICI_ADI` komutunu gerçek hesap adıyla çalıştırabilir. Adımlar varsayılan yolları varsayar; özel kurulum yollarını değiştirdiyseniz aynılarını kullanın.

Servis, cgroup desteği varsa CPU'yu %25 ve belleği 512 MiB ile sınırlar; başlatıcı Node heap'ini 384 MiB yapar. Bunlar ölçülmüş kapasite garantisi değildir. Kullanıcıya dosya sunma trafiği günlük indeks/katalog kotalarını aşabilir; yüklemeyi de izleyin.

Peer ilk durum kaydını ürettikten sonra:

```sh
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
du -sh "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

`Learned peer addresses`, `Announced endpoint`, `Peers accepting announcement in last 24h` ve `Relayed name records` alanlarına da bakın. Bunlar aktif kullanıcı sayısı değildir. Tutulan isim kayıtlarına, hazır sürümlere, eksik dosyalara ve hatalara bakın. Sitenin listede olması bütün dosyalarının bulunduğunu göstermez. Kopya sunan peer kendi kabul edilmiş isim gözlemlerine ihtiyaç duyar; başka peer'in iddiasını kopyalamak onu otomatik güvenilir yapmaz.

## 5. Katkının gerçekten işe yaradığını kontrol et

Ayrı okuyucuda sizin peer'inizi içeren test ayarıyla hazırlanmış siteyi açın, veri kaynağını inceleyin. Sunucudaki `contentBytesServed`, `catalog.meshReplicated`, `catalog.locationsReplicated` ve hazırlık durumuna bakın. Yanıt veren port veya artan istek sayısı tek başına yeterli değildir.

RPC'siz kurtarma için destekçi güvenilen yayımlayıcının orijinal imzalı isim kayıtlarını aktarabilir; yeni destekçiyi isim yetkilisi yapmak şart değildir. `snapshotRelay.records` ve ilgili ismin dosyalarının gerçekten saklandığını kontrol edin. Ayrı bir yayımlayıcının kendi isim gözlemlerine güvenmek ise açık güven ayarı gerektirir. Özel kimlik veya yetkili anahtar paylaşılmaz.

Yedeklilik iddiasından önce ayrı test okuyucuları/peer'leriyle önce ilk kaynağı, ardından RPC/ham Arweave'i erişilemez yaparak deneyin. Bağımsız kalan cihazlarda tarihli isim kaydı, ona karşılık gelen doğrulanmış dosyalar ve yeterli yükleme kapasitesi gerekir. Bu test için başka servisleri kesmeyin. Bağımsız fiziksel sunucu ve Pi kabulü hâlâ bekliyor.

## Adres, kod ve yedek aynı şey değildir

| Bilgi | Görevi |
|---|---|
| Ağ daveti (`mesh1.…`) | Mevcut ağa katılıp imzalı ilk kaynakları öğrenmek |
| Genel peer adresiniz (`IP:port`) | Diğer cihazların servisinize ulaşması |
| İmzalı ağ listesi kopyası | Bağlantı bilgilerinin başka kopyasını sunmak; siteleri kopyalamaz |
| İçerik/isim verileri | Kaynaklar kesildiğinde hazırlanmış sürümleri gerçekten sunmak |

Ağa katılmış destekçi imzalı ağ listesini de otomatik kopyalar; [ayrıntılar](ag-kodu.md). Eski okuyucu kabul ettiği listedeki adresleri deneyebilir; yeni okuyucu erişilebilir bir başlangıç adresi bilmelidir. Liste kopyası süresi dolan yetkili kaydı yenileyemez.

Güncellemede peer'i durdurun, `data` ve başlatıcıyı özel olarak yedekleyin, incelenmiş kaynak sürümünü seçin, kurucuyu yeniden çalıştırıp başlatın. Mevcut bağlantılar korunur. Geri dönüş için eşleşen eski program/veri yedeğini tutun. Aynı özel kimliği farklı cihazlara kopyalayıp bağımsız peer saymayın. [Güncelleme, yedek, geri dönüş ve kaldırma](destekci-ayrintili.md).
