# Sürüm durumu ve kanıtlar

[English](../en/status.md) · [Ana sayfa](../../README.tr.md)

Belgeler **6 Ekim 2026** tarihinde gözden geçirildi. Proje topluluk ön sürümüdür; eksiksiz kararlı sürüm ilanı değildir.

## Hangi sürüm?

- **Windows:** [v0.5.0-preview.13](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13), kaynak `94ce5d293e3c97a78d1034b83ccbf1e21a2ee86b`. Mevcut ZIP değişmedi.
- **Güncellenmiş destekçi:** [Kurulum rehberi](destekci.md), R84 ve hazırlık düzeltmelerini içeren `37d51c79614c389b515b43d4a3bd92f9bd5083d2` sürümünü sabitler.
- **Varsayılan dal:** `main` eski preview.8 kodunu içerir. Belgeler özellik dalını birleştirmez veya sunucuya kod dağıtmaz.

## Gösterilmiş sonuçlar

| Kanıt | Sonuç | Kapsam |
|---|---|---|
| Yayımlanmış preview.13 CI | Linux/Windows'ta 175 kaynak testi, paketlenmiş Windows'ta 12 arayüz kontrolü | Kontrollü keşif, yeniden başlatma, geçersiz veri ve orijinal katalog aktarımı; [sürüm kanıtı](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13) |
| R84 entegrasyonu | Linux'ta 189 kaynak testi; üç gerçek içerik alınıp doğrulandı | [5 Ekim uygulaması](../validation/index-sharing-2026-10-05.md); önceki entegrasyon sürümü Linux/Windows/paket CI'dan da geçti |
| Canlı okuma kontrolü | 70.909.101 kullanılabilir konum kaydı, beş bölümden üçü, 13.220 saklanmış isim kaydı, 1.322 içerik nesnesi | 6 Ekim 00.25 Türkiye saati / 5 Ekim 21.25 UTC ölçümü; [kayıt](../validation/read-only-status-2026-10-06.md) |
| Windows'tan destekçiye saklanmış nesne kontrolü | Üç örnekte de imzalı isim kaydı ve doğrulanmış asıl içerik alındı | Doğrudan sayısal IP ve `cacheOnly=true`; tüm site veya işletim sistemi düzeyinde yalıtılmış kesinti testi değil |

Bu sayılar genel kapsam, tekil site sayısı veya bütün isimlerin güncellik garantisi değildir. Referans hizmette 32 hazırlanmış site kaydının 22'si kendi kapsamında hazırdı; birden fazla isim aynı dosyayı paylaşabilir.

## Açık işler

- Hazırlanmış bağımsız kopyalarla gerçek sağlayıcı kaybı; ayakta kalan isim otoritesi ve ilk bağlantı noktaları.
- Bağımsız kopyaların otomatik yerleştirilmesi ve onarımı.
- Gerçek Raspberry Pi donanımı ve ev/genel NAT koşullarında kabul.
- Site kaynaklarının tamamı, haricî bağımlılıklar ve yeni isimlerde daha geniş doğrulama.
- İndeks yayıncısının 402/429/504 yanıtlarının, kotaların ve sonlu depolamanın işletimi.

Canlı kontrolde içerik hazırlığının günlük bütçesi dolmuştu; R84 indirmesi tamamlanmamıştı; referans destekçi öğrenilmiş ek destekçi bildirmiyordu. Bu ölçüm, bağımsız sağlayıcılarda yedekli kurulum var anlamına gelmez.

## “Final” için gereken

Desteklenen siteleri, ortamları ve kesinti durumlarını tanımlayıp [kabul işlemini](dayaniklilik.md) karşılamak gerekir. Ayrı makinelerde gerçek kopyalar ve ilk kaynağın kaybından sonra okuyucu kurtarması ölçülmelidir. Belge yenilemek, yüksek indeks sayısı veya kaynak testinin geçmesi bunları tek başına kanıtlamaz.

[Kullanıcı rehberi](kullanici.md) · [Destekçi rehberi](destekci.md) · [Geliştirici rehberi](gelistirici.md).
