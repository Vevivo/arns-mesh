# Önizleme durumu ve doğrulama sınırları

**Yayımlanmış preview.8**, imzalı bağlantı kodu, saklanan/güncellenen kaynak listesi ve kodu paket içinde verme yolunu ekler. [Kullanım ve sınırlar](ag-kodu.md). [Windows kabul akışı](../../.github/workflows/network-join.yml) aynı makinedeki kontrollü liste peer’lerini kullanır; bağımsız cihaz kaybı veya ücretli lisans kanıtı değildir. Aşağıdaki eski kesinti ölçümleri preview.7’ye aittir.

**0.5.0-preview.7** kaynak sürümü, Arweave dosya adreslerini gateway’e bağlanmadan doğrulanmış veri yoluna alır; sabit bağlantıları kopyalama ve saklamaya ekler. Sayfanın bilinen konumundan başlayan sınırlı ham blok taraması, daha önce bulunamayan video/ses/font dosyalarını keşfetti. [131 test ve gerçek Windows ölçümü](../arweave-resources.md) geçti: DNS/gateway engeli altında video ve ses oynadı. Bu deneyde mevcut Mesh sunucusu ve IP üzerinden RPC açıktı.

Yayımlanan paketler ve taslak durumu [sürümler sayfasındadır](https://github.com/Vevivo/arns-mesh/releases). Önceki **0.5.0-preview.6** ayrı bir ölçülmüş pakettir. 25 Eylül 2026 DNS/gateway kesinti ölçümleri ve destekçi konum çoğaltma değişikliği [deney kaydında](../disaster-network.md) açıklanır. Özel uçlar çıkarıldı; bağlantı profili aktarımı ve ayrı destekçi kurulumu eklendi. Çalışan üretim sunucusu otomatik güncellenmez.

| Konu | Kanıtın kapsamı |
|---|---|
| Çekirdek testleri | İmza/kimlik, konum, manifest, bütçe, iptal, katalog ve aynı cihazda iki peer denemeleri. Kesin commit sonucu GitHub Actions'ta. |
| Masaüstü kabuğu | Electron API test çiftleriyle sekme, IPC ve profil aktarımı; gerçek çizilmiş sayfa testi değil. |
| Destekçi kurucusu | Ayrı geçici dizinde kurulum/güncelleme; kimlik, veri ve profil korunması. Bağımlılık indirme bu duman testinde taklit edilir, CI'da gerçek `npm ci` ayrıca çalışır. |
| Windows paketi | Yayımlanmış ZIP özeti doğrulandı; gerçek masaüstünde dört ArNS ana belgesi ağ engeli altında açıldı. Harici varlıklar nedeniyle eksik sayfalar var. |
| Önceki canlı veri deneyi | Boş Linux okuyucu, dolu peer'den gerçek HTML doğruladı; saklanan kopya ayrı modda açıldı. Özel kayıtlar repoda yok; bütün isimleri bağımsız bulma kanıtı değil. |
| Gerçek Windows / Raspberry Pi | Windows sayfa deneyi yapıldı; tam kurulum, güncelleme/kaldırma, SmartScreen ve Pi donanım kabulü bekliyor. |
| Ağ kesintisi | Windows Firewall ile izinli IP uçları dışındaki erişim, DNS, IPv6 ve UDP engellendi. DNS, gateway ve DoH olumlu/olumsuz kontrolleri geçti; tam paket kaydı yapılmadı. |
| Bağımsız sunucu kaybı | Tek cihazdaki iki süreç testi var; farklı cihaz/sağlayıcı testi tamamlanmadı. |
| Bilinmeyen konum | Genel keşif tamamlanmadı. Bazı eski kataloglar Turbo/Goldsky hazırlığına dayanıyordu; bunlar repoda değil. |

Canlı isim çözümünde IP üzerinden Solana RPC yanıtına güven sürer. İçerik imzası ismin en güncel kaydını kanıtlamaz. Kayıt taraması yaklaşık altı saat arayla planlanır, ANT hedefleri artımlı okunur. Katalog şu an ilk yapılandırılmış RPC'yi seçer; listeye çok RPC yazmak bu işte otomatik geçiş garantisi sağlamaz.

Katalog varsayılan 64 MiB/gün yanıt bütçesini isim ve içerik işleri birlikte kullanır; kota dolunca güncellemeler gecikebilir. İsim değiştiğinde anında son veriyi göstermek garanti değildir. `Saved` son bilinen kayıt/kopyadır. Bir VPS'i tek Pi'ye taşımak tek nokta bağımlılığını kaldırmaz.

Çalıştırılabilir kontrol:

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
bash scripts/test-install.sh
```

Tam kabul; temiz profil, kayıt kaynağından farklı örnekler, undername/değişen hedef/manifest, bütün yerel varlıklar, bozuk veri, iptal, bağımsız peer kaybı, gerçek Windows/Pi kaynak ölçümü ve süreçlerin tam ağ kaydını gerektirir. Yeşil CI bu kabulün yerine geçmez. Ayrıntılı deney ayrımı ve engel kaydı [English status](../en/status.md), mimari ve kaynak üretimi [architecture](../en/architecture.md) içinde.

## Masaüstü arayüz deneyi

`qa/desktop/user-journey.cjs` paketlenmiş Windows uygulamasını açar; yerel sağ tık ve dosya menülerini, profil içe/dışa aktarımını, hata gösterimini ve yeniden başlatmayı kullanır. HTML/CSS/JS/resim, geri/ileri ve yenileme için gerçek imzalı dosyalardan oluşan kontrollü bir saklanmış sayfa kullanır. Bu deneydeki `mesh-qa` ismi sentetiktir; canlı ArNS kaydı veya yeni içerik keşfi kanıtı değildir. Deney verileri dağıtıma girmez. Tam koşu, ekran kaydı ve sınırlar sürümün kabul kaydında belirtilir.

Yeni tasarım tek adres alanı ve tek Settings girişi kullanır. İlerleme şeridi gerçek motor olaylarını gösterir; Open page, ana belgenin yüklemesi tamamlanınca işaretlenir. Yerel fontlar ve alt kısımdaki resmî ar.io logosu için CDN çağrısı yoktur. Bağımsız topluluk projesi kimliği korunur.
