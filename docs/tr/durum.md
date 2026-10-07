# Mesh 0.6.0 durumu

[English](../en/status.md) · [Ana sayfa](../../README.tr.md)

Masaüstü ve sunucu için güncel kaynak sürümü **0.6.0**'dır. İndirme ve kurulum rehberleri aynı sürümü kullanır.

## Sürekli hazırlık

Destekçi, kaynaklara giden yollar açıkken yeni kayıtları ve mevcut isimlerin içerik hedeflerini takip eder. İsim takibi dosya indirmelerinden bağımsız çalışır. Edinilen isim kayıtları saklanır; dosyalar belirlenen bütçeler içinde indirilip doğrulanır.

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

## İlk sunucu yokken devam etme

Yeni geliştirici, ilk sunucu zaten kapalıyken de yayımlanmış topluluk ağına katılabilir. Sürüm aynı yetkili anahtarla imzalanmış kalıcı ağ tanımını içerir. Sayısal IP üzerinden bağımsız keşif, hem mevcut hem yeni okuyucuların sonraki destekçileri bulmasını sağlar. Senden özel izin veya kullanıcılara yeni kod dağıtılması gerekmez. Masaüstünün güncellenmesi gerekir.

Destekçiler kabul edilen isim kayıtlarını sayfalı biçimde kopyalar, bunların doğrulanmış dosyalarını ayrı bir saklanan kümede hazırlar. Çalışan RPC ve içerik yolları güncel hazırlık için kullanılmaya devam eder. Bu yollar da erişilemezse, istenen kabul edilmiş kaydın ve dosyaların erişilebilen bir kopyası gerekir.

6 Ekim kabul kontrollerinde ilk adres baştan kapalıyken katılım, gerçek genel keşif ağı, imzalı kayıt kopyalama ve ilk kaynak durduktan sonra üç dosyalı bir sitenin sunulması sınandı. Sunucu testleri tek fiziksel makinedeki ayrı süreçlerle yapıldı. Farklı sağlayıcılarda hazır yedek sunucular bulunduğu anlamına gelmez. [Kanıtlar ve kapsam](../validation/independent-supporters-2026-10-06.md).

Windows sürüm akışı ayrıca paketten açılan boş Electron okuyucunun, ilk adres yokken yeni destekçiyi bulup içerik açmasını şart koşar. [Destekçi kurulumu ve doğrulama](destekci.md).

## Kapsam

Her ArNS isminin içeriği arşivlenmiş değildir. Haricî API/CDN işlevleri sitenin saklanan dosyalarından ayrı olabilir. R84 indeksi içerik konumlarını tutar; dosyaların kendisi ayrıca saklanır. Raspberry Pi için 64 bit kurulum rehberi vardır; fiziksel Pi testi yapılmamıştır.

[Kullanım](kullanici.md) · [Destekçi kurulumu](destekci.md) · [Geliştirme](gelistirici.md).
