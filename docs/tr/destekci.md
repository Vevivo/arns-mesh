# Bağımsız Mesh destekçisi kur

[English](../en/supporter.md) · [VPS](vps.md) · [Raspberry Pi](raspberry-pi.md)

Destekçi; ArNS isim kayıtlarını ve doğrulanmış dosyaları kendi sunucusunda tutar, kaynaklara erişebildiğinde güncellemeleri toplar ve başka bir destekçi erişilemez olduğunda kullanıcılara hizmet verir. **Kullanıcıların bulunduğu aynı Mesh ağına katıl. Onlar için ayrı bir ağ kodu üretmen gerekmez.**

Bağımsız keşif için hem destekçi hem okuyucu **0.6.0** kullanmalıdır. Eski 0.5.1 okuyucu önceden öğrendiği adresleri kullanabilir; yeni keşif mekanizması için güncelleme gerekir.

## Hazırlık

Yeni bir Linux VPS veya SSD kullanan 64 bit Raspberry Pi; normal kullanıcı hesabı, systemd, sudo, Git ve [Node.js 24 LTS/npm](../en/node-setup.md) hazır olmalı. Genel erişilebilir sayısal IP ve kullanılmayan TCP portu seç; örnek port **49741**. Gelen TCP bağlantısı ve keşif için giden UDP trafiği çalışmalıdır. CGNAT altında dışarıdan erişilebilir bir yol gerekir. Kurucu yönlendiriciyi veya güvenlik duvarını değiştirmez.

Varsayılan kurulum, sürüme eklenen yetkili imzalı genel ağ tanımıyla **mevcut topluluk Mesh ağına** katılır. İlk işletmeciden kod veya özel anahtar istemen gerekmez. Okuyucular aynı desteklenen topluluk kodunu kullanır. Başka bir ağ için bağımsız davetini `--network YOUR_CODE` ile ver. [Topluluk ağı](../community-network.md) · [Kodun anlamı](ag-kodu.md).

| Profil | Site dosyaları | Otomatik önbellek | R84 ve yenileme payı | Yeni kurulum için boş alan |
|---|---:|---:|---:|---:|
| `vps` (varsayılan) | 64 GiB | 16 GiB | 50 GiB | 4 GiB çalışma payıyla **134 GiB** |
| `pi` (SSD) | 16 GiB | 4 GiB | 50 GiB | 4 GiB çalışma payıyla **74 GiB** |

İki profil de 20.000 site kaydına kadar hazırlama kuyruğu, sürekli isim takibi, kabul edilen isim kayıtlarının çoğaltılması ve doğrulanmış dosya hazırlama kullanır. Pi daha az dosya saklayabilir. Bu sınırlar bütün sitelerin sığacağı sözü değildir. Gerçek Raspberry Pi üzerinde kabul testi henüz yapılmadı.

Destekçi bellek sınırı VPS için 1 GiB, Pi için 768 MiB; ayrı R84 güncelleyicisinin sınırı 384 MiB'dır. İşletim sistemine ve diğer uygulamalara da yer bırak. Sağlayıcının trafik kotasını kontrol et; indirme bütçeleri ayrıdır, kullanıcılara gönderilen trafik ayrıca oluşur.

## Kurulum

Normal destekçi hesabıyla çalıştır. `YOUR_PUBLIC_IP` yerine **kendi genel IP adresini** yaz.

```bash
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout --detach v0.6.0
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
bash scripts/setup-supporter.sh --advertise YOUR_PUBLIC_IP:49741 --capacity vps
```

Pi için `--capacity pi` kullan. `--dry-run`, kurulum ve servis başlatmadan planı ve disk payını denetler.

Bu kurulum; kodu ve kapasiteyi kontrol eder, destekçiyi kendi kimliğiyle kurar, isim takibini ve dosya hazırlamayı açar, **R84 indeksini ayrı hesap ve otomatik yenileme servisiyle kurar**, destekçi servisini başlatır ve açılışta çalışmasını sağlar. Varsayılan konum: `~/.local/share/ArNS-Mesh-Supporter`.

Hata varsa sonraki adıma geçme. İlk indeks kurulumu sırasında kaynak erişilemezse mevcut veriler korunur; kaynak döndüğünde yeniden dene. Yarım kalan kurulum hazır bir yedek değildir. [R84 ilerlemesi ve hatalar](paylasilan-indeks.md).

Mevcut kimlik, bağlantı dosyaları ve açıkça seçilmiş ayarlar korunur. Eski küçük kapasiteleri gözden geçir. Kurucu çalışan destekçiyi, ilgisiz servis dosyalarını, mevcut duyuru adresini veya kapalı hazırlama ayarlarını sessizce değiştirmez.

## Kullanıcılar bu sunucuyu nasıl bulur?

Kod ortak ağı tanımlar; `--advertise` ise yeni sunucunun adresini belirtir. Mesh adresleri aynı ağ içinde duyurur ve keşfeder. İlk sunucu yokken de imzalı sayısal IP keşif ayarları üzerinden diğer destekçiler bulunabilir. Bir adresin öğrenilmesi, o sunucuya isim kayıtlarını değiştirme yetkisi vermez.

0.6.0 okuyucuları aynı desteklenen ağ kodunu kullanır. İlk işletmecinin her geliştirici için yeni kod dağıtması gerekmez. Keşif yollarının ulaşılabilir olması gerekir; hiçbir iletişim yolu yoksa yeni adres öğrenilemez.

Başka bir ağdan kontrol et:

```bash
node scripts/probe-peer.mjs YOUR_PUBLIC_IP:49741
```

Bu sadece bağlantı kontrolüdür. Dosyaların hazır olması ve bağımsız erişim ayrıca sınanır.

## Hazırlığı ve bağımsız erişimi kontrol et

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
node scripts/check-supporter.mjs --data "$MESH_ROOT/data" --json
node scripts/operator.mjs --data "$MESH_ROOT/data" --json
systemctl --user status arns-mesh-supporter --no-pager
systemctl status arns-mesh-index-sync.service --no-pager
```

Hazırlık veya ayrı okuyucu kontrolü eksikken hazır olma komutu 2 çıkış kodu verir. İlk indeks indirmesi ve dosya hazırlığı arka planda sürer; başta bekliyor görünmesi normaldir. İsim kayıtlarını, doğrulanmış dosya setlerini, kuyruğu, disk/indirme bütçelerini, indeks güncelliğini ve dış erişimi incele. İsim ve indeks sayıları eksiksiz saklanan site sayısı değildir.

**Son adım [bağımsız destekçi testi](dayaniklilik.md).** Ayrı okuyucu ilk sunucuyu dışarıda bırakarak yeni destekçiyi sınar. Servisin çalışması tek başına devralmanın hazır olduğunu kanıtlamaz.

Ayarlar `peer.env` dosyasındadır; ön planda ve servis olarak çalıştırma aynı dosyayı kullanır. Güncellemeden önce bu destekçiyi durdur, verilerini özel olarak yedekle ve seçilen sürümde kurucuyu yeniden çalıştır. Önceki uygulama/veriyi geri dönüş için sakla; özel kimlik anahtarını birden fazla sunucuya kopyalama.

Yerel hazır olma raporu dışarıdan erişimi kanıtlayamadığı için çıkış kodu 2 verir. `locallyPrepared` yerel dosya hazırlığını gösterir. Ayrı okuyucu kontrolü kendi başarılı/başarısız sonucunu üretir; yerel raporu sonradan bir sertifikaya dönüştürmez.
