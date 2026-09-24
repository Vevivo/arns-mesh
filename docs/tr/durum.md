# Önizleme durumu ve doğrulama sınırları

**0.5.0-preview.2**, bağımsız masaüstü okuyucusunu ve destekçi çekirdeğini paylaşmaya hazırlayan sürümdür. Özel uçlar çıkarıldı; bağlantı profili aktarımı ve ayrı destekçi kurulumu eklendi. Çalışan üretim sunucusu otomatik güncellenmez.

| Konu | Kanıtın kapsamı |
|---|---|
| Çekirdek testleri | İmza/kimlik, konum, manifest, bütçe, iptal, katalog ve aynı cihazda iki peer denemeleri. Kesin commit sonucu GitHub Actions'ta. |
| Masaüstü kabuğu | Electron API test çiftleriyle sekme, IPC ve profil aktarımı; gerçek çizilmiş sayfa testi değil. |
| Destekçi kurucusu | Ayrı geçici dizinde kurulum/güncelleme; kimlik, veri ve profil korunması. Bağımlılık indirme bu duman testinde taklit edilir, CI'da gerçek `npm ci` ayrıca çalışır. |
| Windows paketi | Paketleme/çalıştırılabilir sürüm kontrolü, gerçek Windows sayfa ve SmartScreen kabulü değil. |
| Önceki canlı veri deneyi | Boş Linux okuyucu, dolu peer'den gerçek HTML doğruladı; saklanan kopya ayrı modda açıldı. Özel kayıtlar repoda yok; bütün isimleri bağımsız bulma kanıtı değil. |
| Gerçek Windows / Raspberry Pi | Tam kurulum, sayfa, güncelleme/kaldırma ve Pi donanım kabulü bekliyor. |
| Bütün ağın bağımsızlığı | IP ağ kontrolleri var; DNS/DoH/IPv6/WebRTC dahil işletim sistemi seviyesinde tam engelleme/kayıt kabulü bekliyor. |
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
