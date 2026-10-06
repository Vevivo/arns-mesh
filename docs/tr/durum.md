# Mesh 0.5.1 durumu

[English](../en/status.md) · [Ana sayfa](../../README.tr.md)

Masaüstü ve sunucu için güncel kaynak sürümü **0.5.1**'dır. İndirme ve kurulum rehberleri aynı sürümü kullanır.

## Doğrulanan erişim

**Domain/DNS olmadan ArNS içeriği açılır. Solana RPC ve Arweave de erişilemez olduğunda, önceden saklanmış isim kayıtları ve dosyalar Mesh üzerinden kullanılabilir.**

6 Ekim 2026 Linux ağ yalıtımı sonucu:

| Kontrol | Sonuç |
|---|---|
| Dış RPC, Arweave, DNS ve HTTPS erişimi | İşletim sistemi düzeyinde erişilemedi |
| Teste boş başlayan okuyucu | İsim kayıtlarını Mesh'ten aldı |
| 35 gerçek isim | 29 ana içerik açıldı |
| Hazır işaretlenmiş 22 kayıt | Saklanan dosya setlerinin tamamı doğrulandı |
| Başarılı ana içerikler | 9 farklı dosya; bazı isimler aynı hedefe bağlı |
| Eksik dosyası bulunan 6 isim | Açılamadı; başarı sayılmadı |

[Ayrıntılı kanıt](../validation/upstream-outage-2026-10-06.md). Windows sürüm akışı ayrıca paketlenmiş uygulamayı gerçek içerik ve güvenlik duvarı yalıtımıyla test eder; sonuç geçmeden sürümü yayımlamaz.

## Destekçinin kapanmasına hazırlık

Başka bir destekçi erişilebilir olduğunda okuyucu onu öğrenip kullanabilir. İkinci makinenin gerekli dosyaları ve kabul edilen isim kayıtlarını önceden edinmesi gerekir. [Hazırlık rehberi](dayaniklilik.md).

Kesinti testi tek fiziksel makinede yalıtılmış süreçlerle yapılmıştır; farklı sağlayıcılarda iki bağımsız sunucunun devralma kabul testi değildir. Otomatik bağımsız kopya yerleştirme/onarım henüz yoktur.

## Kapsam

Her ArNS isminin içeriği arşivlenmiş değildir. Haricî API/CDN işlevleri sitenin saklanan dosyalarından ayrı olabilir. R84 indeksi içerik konumlarını tutar; dosyaların kendisi ayrıca saklanır. Raspberry Pi için 64 bit kurulum rehberi vardır; fiziksel Pi testi yapılmamıştır.

[Kullanım](kullanici.md) · [Destekçi kurulumu](destekci.md) · [Geliştirme](gelistirici.md).

## Güncel isim ve içerik takibi

[Hazırlık nasıl çalışır, hangi testler yapıldı?](surekli-hazirlik.md).
