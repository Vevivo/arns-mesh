# Mesh 0.5.1 durumu

[English](../en/status.md) · [Ana sayfa](../../README.tr.md)

Masaüstü ve sunucu için güncel kaynak sürümü **0.5.1**'dır. İndirme ve kurulum rehberleri aynı sürümü kullanır.

## Sürekli hazırlık

Sunucuda çalışan 0.5.1 destekçisi, kaynaklara giden yollar açıkken yeni kayıtları ve mevcut isimlerin içerik hedeflerini takip eder. İsim takibi dosya indirmelerinden bağımsız çalışır. Edinilen isim kayıtları saklanır; dosyalar belirlenen bütçeler içinde indirilip doğrulanır.

**6 Ekim 2026, 11:26 UTC** tarihli salt okunur sunucu kontrolünde, alt isimler ve saklanan gözlemler dâhil **13.274 isim** tutuluyordu; isim takibi açıktı. Ardışık kontrollerde kayıt listesinin yenilenme zamanı ilerledi. Bu, bir destekçinin o andaki durumudur; sabit katalog boyutu veya tamamen arşivlenmiş site sayısı değildir. İsim kapsamı ve dosyaların hazır olması ayrı ölçülür. [Hazırlık, güncelleme aralıkları ve sınırlar](surekli-hazirlik.md).

## Dış erişim yolları kesildiğinde doğrulanan erişim

**Domain/DNS olmadan ArNS içeriği açılır. Okuyucunun Solana RPC veya ham Arweave erişimi kesilirse Mesh, ulaşılabilir bir destekçiden kabul edilen isim kayıtlarını ve doğrulanmış dosyaları sağlayabilir.** Dış kaynaklara erişimi süren destekçi güncellemeleri edinmeye devam edebilir. Bu yollar hem okuyucu hem destekçi için kesildiğinde saklanan sürümler kullanılabilir.

6 Ekim 2026 Linux ağ yalıtımı testi, **seçilmiş 35 isimlik bir örnek grup** üzerinde yapıldı. Aşağıdaki sayılar test anındaki örnekleri gösterir; sürekli güncellenen kataloğun toplamı veya sistemin kapasite sınırı değildir:

| Kontrol | Sonuç |
|---|---|
| Ayarlı RPC, ham Arweave, DNS ve HTTPS adreslerine giden yollar | İşletim sistemi düzeyinde erişilemedi |
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
