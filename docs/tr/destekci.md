# Mesh destekçisi çalıştırın

[English](../en/supporter.md) · [Ana sayfa](../../README.tr.md) · [VPS hazırlığı](vps.md) · [Raspberry Pi hazırlığı](raspberry-pi.md)

Destekçi, sunucusundan **isim kayıtları, içerik konumları ve doğrulanmış dosyalar** sunar. Bu rehber mevcut ağa katılmak içindir. Okuyucular Windows uygulamalarını kullanır; sunucuya Windows tarayıcısı kurulmaz.

Yeni bir klasör ve normal Linux kullanıcı hesabı kullanın. Bunlar yeni destekçi kurulum adımlarıdır; mevcut çalışan kurulumun üzerine uygulanacak güncelleme talimatı değildir.

## Başlamadan önce

1. [Linux VPS](vps.md) veya [64 bit Raspberry Pi](raspberry-pi.md) hazırlayın.
2. Git, npm ve Node.js 24 LTS kurun. Kaynak 22.12+ kabul eder; CI 24.19.0 kullanır. [Sistemdeki Node'u değiştirmeden kurulum (EN)](../en/node-setup.md).
3. İşletmeciden mevcut ağın tam `mesh1.` davetini alın.
4. İnternetten erişilebilen sayısal IP ve boş TCP portu seçin. Bu rehber **49741** kullanır.

Doğrudan IP hizmeti için domain, nginx, TLS sertifikası, cüzdan veya tam Arweave/Solana düğümü gerekmez. İlk indirmeler ve R84 hazırlığı dış hizmetler kullanır.

## 1. Doğru destekçi kaynağını alın

Masaüstü ve destekçi için aynı 0.5.0 sürümünü kullanın. R84 entegrasyonu bu kaynağa dâhildir.

```bash
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout --detach v0.5.0
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
read -r -p 'Tam mesh1 baglanti kodunu yapistirin: ' MESH_CODE
bash scripts/install-peer.sh --network "$MESH_CODE"
unset MESH_CODE
```

Bir komut hata verirse devam etmeyin. Kurucu daveti denetler, sabitlenmiş bağımlılıkları sürümlü klasöre kurar ve yeni destekçi kimliği oluşturur. Mevcut bağlantı dosyaları korunur. Henüz arka plan hizmeti veya güvenlik duvarı kuralı oluşturmaz.

Varsayılan kurulum: `~/.local/share/ArNS-Mesh-Supporter`. Örnekler özel `MESH_INSTALL_ROOT` veya `XDG_DATA_HOME` kullanılmadığını varsayar.

## 2. Katkı sınırlarınızı belirleyin

İlk çalıştırmadan önce `peer.env` oluşturun. Bu örnek mevcut dosyanın üzerine yazmayı reddeder:

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
(
  set -o noclobber
  cat > "$MESH_ROOT/peer.env" <<'MESH_ENV'
MESH_LISTEN=0.0.0.0:49741
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=32
ARNS_CACHE_MIB=256
ARNS_SAVED_MIB=1024
ARNS_NAMES_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=256
ARNS_INDEX_DAILY_MIB=64
MESH_ENV
)
```

| Ayar | Anlamı |
|---|---|
| `ARNS_PREPARE_MAX_SITES` | Otomatik yönetilen site kaydı sınırı; örnekte 32, üst sınır 256 |
| `ARNS_CACHE_MIB` | Otomatik içerik önbelleği bütçesi |
| `ARNS_SAVED_MIB` | Saklanması seçilmiş içerik bütçesi |
| `ARNS_NAMES_DAILY_MIB` | İsim hazırlığı için ayrı günlük bütçe |
| `ARNS_CATALOG_DAILY_MIB` | İçerik hazırlığının ölçülen günlük yanıt verisi bütçesi |
| `ARNS_INDEX_DAILY_MIB` | Ham Arweave keşif bütçesi; R84 güncelleyicisinin bütçesi **değildir** |

Bunlar örneklerdir; kapasite garantisi veya toplam trafik sınırı değildir. Bağımlılıklar, indeksler, günlükler ve dışarı sunulan içerik trafiği ek kaynak tüketir. İçerik bütçesi dolduğunda yeni dosya hazırlığı durabilir; isimler ayrı bütçeyle devam eder. Sınırı artırmak eksik dosyaları veya bağımsız kopyaları kendiliğinden oluşturmaz.

Kalıcı katkı için hangi isimleri tutmak istediğinizi seçip dosyalarını kontrol edin. [İsim hazırlığı ve devralma](dayaniklilik.md).

## 3. Arka plan hizmetini başlatın

Kaynak klasöründen, aynı normal kullanıcıyla:

```bash
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

Kurucu `peer.env` dosyasını okuyan **kullanıcı hizmetini** etkinleştirir ve başlatır. Mevcut hizmet dosyasını değiştirmeyi reddeder. Aynı anda başka terminalden `Start-Peer.sh` çalıştırmayın.

Oturum kapandığında ve sunucu yeniden açıldığında da çalışması için yönetici bu hesapta lingering açabilir:

```bash
sudo loginctl enable-linger "$(id -un)"
```

Sağlanan hizmet, cgroups uygulanıyorsa CPU'yu %25 ve belleği 512 MiB ile sınırlar; başlatıcı 384 MiB Node heap kullanır. Bunlar ölçülmüş donanım gereksinimi değildir.

## 4. Dış erişimi ve keşfi doğrulayın

Destekçinin kaynak klasöründe:

```bash
node scripts/probe-peer.mjs 127.0.0.1:49741
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Ardından **başka bir ağdan**, `YOUR_PUBLIC_IP` yerine gerçek sayısal adresinizi yazarak deneyin:

```bash
node scripts/probe-peer.mjs YOUR_PUBLIC_IP:49741
```

“Mesh endpoint responded” yalnızca erişimi gösterir. İşletmeci raporunda duyurulan adresi ve duyuruyu kabul eden destekçiyi kontrol edin. Keşif için yaklaşık bir dakika ve işlem süresi tanıyın.

Modem dışarı farklı port açıyorsa `peer.env` içine gerçek değerlerle `MESH_ADVERTISE=YOUR_PUBLIC_IP:PUBLIC_PORT` yazın. Ayar değişince yalnızca yeni destekçiyi yeniden başlatın. Bu ayar port açmaz. IPv6 biçimi `[ADDRESS]:PORT` şeklindedir.

Ağa katılmış 0.5.0 okuyucular yeni ulaşılabilir destekçileri ek kod almadan öğrenebilir. İlk temas ve güvenilen yayıncılar ağ davetiyle belirlenir. Yeni öğrenilen destekçi, isimleri değiştirme yetkisi kazanmaz.

## 5. Daha geniş konum kapsamı için R84 ekleyin

[Paylaşılan indeks kurulumunu](paylasilan-indeks.md) izleyin. Bu ayrı, isteğe bağlı bir süreçtir; ayrı disk ve indirme bütçesiyle tamamen sunucuda çalışır. Temel kurucu büyük indeksi veya yenileme zamanlayıcısını **kurmaz**.

Destekçi tam indeks olmadan sakladığı içeriklerle katkı sağlayabilir. Yalnızca konum indeksi tutmak, site yedeği olmak değildir.

## 6. Gerçekten katkı verdiğini görün

En az bir durum döngüsünden sonra:

```bash
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
du -sh "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Desteklemek istediğiniz isimleri, `savedSites.sites` listesini, eksik dosyaları, isim gözlem tarihlerini ve `snapshotRelay.records` değerini kontrol edin. “Hazır” kaydı sadece ana belgeyi kapsıyor olabilir; `scope` alanını okuyun. Birçok isim aynı dosyaya işaret edebilir.

Ayrı okuyucuyla hazırlanmış bir ismi bu destekçiden alın. Ardından [bağımsız devralma işlemini](dayaniklilik.md) uygulayın. Hizmetin çalışması, yüksek indeks sayısı veya açık port, diğer sunucunun yerini alabildiğini kanıtlamaz.

## Günlük işletim

Günlükler: `journalctl --user -u arns-mesh-supporter -n 30 --no-pager`. Durdurma: `systemctl --user stop arns-mesh-supporter`. Başlatma: `systemctl --user start arns-mesh-supporter`.

Güncellemede bu destekçiyi durdurun; verisini ve başlatıcısını özel olarak yedekleyin; seçilen sürümü inceleyip kurucuyu yeniden çalıştırın. Geri dönüş için eşleşen eski uygulamayı ve veriyi koruyun. Kimlikleri ve imza anahtarlarını paylaşmayın; aynı kimliği farklı aktif sunuculara kopyalamayın.

[Keşif ayrıntıları](paylasilan-ag.md) · [Durum ve sınırlar](durum.md) · [İşletim başvurusu](destekci-ayrintili.md)
