# Durum ve test kanıtları

[English](../en/status.md) · [Ana sayfa](../../README.tr.md)

**5 Ekim 2026** tarihinde kontrol edildi. `main` çalışma kodu ve son yayımlanmış sürüm: **preview.8**. Test edilmiş geliştirme adayı: **preview.12**, kaynak [cbd55a7](https://github.com/Vevivo/arns-mesh/tree/cbd55a7dfd5b754a4d3ac06e4c67dc4c83a4011e), [henüz birleştirilmemiş PR #9](https://github.com/Vevivo/arns-mesh/pull/9). Belgelerin yayımlanması aday kodu veya yeni uygulama paketini yayımlamaz.

## Mevcut, aday ve planlanan

| Özellik | Durum |
|---|---|
| ArNS gezintisi ve doğrulanmış Mesh/ham dosyalar | Yayımlandı; kapsam eksik |
| Ağ daveti ve imzalı kaynak güncellemeleri | Yayımlanmış preview.8 |
| İçinde ağ bulunan paketin otomatik katılımı | Paketleme seçeneği var; standart ZIP'lerde davet yok |
| Tarihli isimle kurtarma, yeni sürümü ayrı hazırlama | Preview.12 adayı; preview.9'da eklendi |
| Yerel konu araması ve bağlantı izleme | Preview.12 adayı; katalog kapsamı ve adres sayıları sınırlı |
| Sade ana ekran ve Mesh pencere simgesi | Preview.12 adayı |
| Yeni destekçinin kendini duyurması, otomatik adres paylaşımı | Planlandı; mevcut katılım düğmesi yok |
| İçerik başına ölçülen kaynak seçimi, otomatik kopya yerleştirme/tamamlama | Planlandı |
| Masaüstünden dosya sunma | Yok; okuyucu genel dinleyici açmaz |
| Tam Arweave/CDB64 kopyası, bütün isimlere erişim | Sağlanmıyor |
| Gerçek Pi testi, bağımsız sağlayıcı kaybı | Bekliyor |

## Kanıtlar

| Sürüm | Ölçüm | Sınır |
|---|---|---|
| Preview.12 | [37259769203](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203): Linux/Windows'ta 168 kaynak testi, gerçek ZIP'ten 10 Windows arayüz kontrolü | İmzalı test belgeleri ve kontrollü yerel servisler; bağımsız altyapı veya yeni ağ seviyesinde kesinti testi değil |
| Preview.8 | [Bağlantı kabulü](../network-join.md): katılım, ilk liste süreci kaybından sonra güncelleme, hazır ağla başlangıç, kayıtlı yeniden açılış | Liste süreçleri aynı makinede, canlı kaynaklar erişilebilirdi |
| Preview.7 | [Kaynak/kesinti kanıtı](../arweave-resources.md): Windows DNS/gateway kısıtları altında dört gerçek ana belge ve desteklenen medya | Mevcut Mesh ve IP tabanlı RPC erişilebilirdi |
| Önceki kopya deneyi | [Ayrıntılı kesinti raporu](../disaster-network.md) | Aynı makinedeki kopyalar ve erişilebilir uzak ham kaynaklar bağımsız sağlayıcı kaybı kanıtı değildir |

[Aday ZIP](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323968857) · [Arayüz kanıtı](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323719745). Actions dosyaları 14 gün tutulur; kalıcı sürüm dosyası değildir ve GitHub oturumu gerekebilir.

## Ortak ağı hazır saymadan önce

[Kararlaştırılan tasarım ve kabul koşulları](paylasilan-ag.md) izlenir. Gerçek bağımsız cihazlarda hazırlanan kopyalarla; eski kullanıcının yeni peer'i öğrenmesi, ilk sağlayıcının kapanması ve RPC/ham Arweave'in birlikte kesilmesi denenir. Eksik/eski/hatalı kayıt, duyuru bombardımanı, kapasite sınırı ve süresi dolan listeler ölçülür. Kesintiden önce hangi sürümün hangi peer'de olduğu kaydedilir; boş sunucu yedek değildir.

Sahibin iki PC testi cihazlar kullanılabilir olana kadar ertelendi. İki tarayıcı kurulumu iki veri sunan peer oluşturmaz. Tam ağ paketi yakalama ve gerçek Pi performansı bekliyor. Uygulama HTTP kaydı ve “yanıt veriyor” göstergelerinin kapsamı daha dardır.

Yayımlanmış sürüm, aday, test düzeneği ve gerçek ağ kanıtları ayrı tutulur. Yeşil kaynak testi felaket hazırlığı veya genel kapsam kanıtı değildir. [İşleyiş](../en/architecture.md) · [Adayda kurtarma](dayanikli-erisim.md).
