# Destekçilerin ortak ağı — kararlaştırılan tasarım, henüz uygulanmadı

[English](../en/shared-network.md) · [Ana sayfa](../../README.tr.md) · [Bugünkü destekçiyi kur](destekci.md)

Ürün hedefi basit: kullanıcı indirip kullanır; gönüllü destekçi kurar; yararlı peer'ler ve içerik kopyaları otomatik paylaşılır. İlk sağlayıcı, sürekli açık kalması gereken tek kaynak veya tek adres defteri olmamalıdır. Bu sayfa geliştirilecek düzeni anlatır; burada sözü edilen otomatik işlemler mevcut komut veya düğme değildir.

## Hedeflenen deneyim

| Kullanıcı | Destekçi |
|---|---|
| İlk bağlantıları hazır tarayıcıyı indirir | VPS veya erişilebilir Pi üzerine arayüzsüz servisi kurar |
| Kod girmeden ArNS ismi açar | Ayıracağı depolama ve trafik miktarını seçer |
| Alternatifleri öğrenmeyi ve hızlı, yararlı kaynak seçimini Mesh'e bırakır | Servis erişilebilir adresini ve sunabildiği veriyi duyurur |
| Bir kaynak kapanınca diğerinden devam eder | Dosya, isim gözlemi ve konum kaydı saklayarak yükü paylaşır |

Ödeme, lisans veya cüzdan gerekmez. Masaüstünden veri sunma ayrı, gelecekte isteğe bağlı bir özelliktir; gezinti yapmak otomatik paylaşım izni değildir.

## Sonradan gelen destekçi nasıl bulunacak?

1. Yeni servis, ayarlarındaki erişilebilir bir başlangıç peer'ine bağlanır. Bildiği bütün yollar kapalıysa ilk tanışma yapılamaz.
2. Kalıcı peer kimliğini kontrol ettiğini kanıtlar; adresini, desteklediği protokolü ve sınırlı içerik bulunabilirliği bilgisini duyurur. İmza duyuruyu yapanı tanımlar; isim doğruluğunu, kapasiteyi veya bağımsızlığı kanıtlamaz.
3. Diğer peer'ler biçimi, izin verilen adresleri, erişimi, imzayı ve tarihi kontrol edip sınırlı kaydı paylaşır. İstek sınırı, süre sonu, eski duyuruyu yeniden oynatmaya karşı koruma ve özel/yerel adres kısıtları gerekir.
4. Tarayıcılar alternatif adresleri düzenli öğrenip saklar. Her destekçi katılımında yeni indirme veya kod gerekmez.
5. Dosya istendiğinde, o içerik kimliğini sunabilen kaynaklar denenir. Geçerli yanıtlar ve ölçülen aktarım performansı kullanılır; eşzamanlı istekler ve süre aşımı sınırlanır. Hızlı gelen hatalı veri kabul edilmez.

Yeni peer doğrulanabilir dosya sunabilir. ArNS isim–içerik iddiasına veya arama kataloğuna güvenmek ayrı karardır; otomatik keşif bu yetkiyi vermemelidir. Bugünkü tek yetkilinin imzaladığı listeden daha dağıtık katılım/güven yönetimine geçişin ayrıntıları henüz uygulanmadı.

## Depolama yükünü kesintiden önce paylaşmak

Her destekçinin kendi kimliği ve seçtiği kotaları olmalıdır. Tarihli isim kaydı ile onun anlattığı tam içerik sürümü birlikte korunur. HTML, manifest ve desteklenen dosyalar gerçekten kopyalanıp doğrulanır; indeks bilgisi kayıp dosyayı sunamaz.

Başlangıç hedefi, seçilen sitelerin bağımsız cihazlarda en az iki kullanılabilir kopyasıdır. Bu bir yerleştirme hedefidir, kalıcılık garantisi değildir. Beyan edilen disk miktarı yerine doğrulanmış kopyalar sayılır; aynı sağlayıcıya/kişiye bağlı makineler bağımsız kesinti alanlarından ayrılır. Otomatik yerleştirme ve eksilen kopyayı tamamlama henüz yazılmadı.

Her şeyi her cihaza indirmek veya tüm Arweave/CDB64'ü kopyalamak vaat edilmez. Seçilen içerikler kotalara göre dağıtılır, kopyalar düzenli denetlenir, kaybolanlar tamamlanır. Yeni sürüm hazırlanırken önceki tam sürüm korunur. Hiç gözlenmemiş veya kopyalanmamış son güncelleme yoktan getirilemez.

## RPC ve ham Arweave birlikte erişilemezse

Kabul edilmiş tarihli isim kaydı, onun gerçek dosyaları ve bu dosyalara ulaşan yol gerekir. Bunlar yerelde veya kalan destekçilerde bulunabilir. Ekran en güncel zincir durumu iddia etmek yerine gözlem tarihini ve eski sürüm kullanıldığını gösterir. Aday sürüm sınırlı tarihî erişimi uygular; bağımsız kopyaları otomatik yerleştirme ayrı iştir.

İlk sağlayıcı kapanmadan önce başka peer'lerde hem yararlı veri hem birbirlerini bulacak bilgiler olmalıdır. Yeni kurulmuş kullanıcı hâlâ bir çalışan başlangıç yoluna ihtiyaç duyar. İnternet bağlantısı varsayılır; bu tasarım bağlantısız cihazlara internet yaratmaz.

## Bugünkü uygulamadan hangi işler kaldı?

| Bugün | Geliştirilecek |
|---|---|
| Standart ZIP'te davet yok; Connected paketleme var | Birden fazla bağımsız ilk peer içeren hazırlanmış varsayılan indirme |
| Ağ yetkilisi kaynak listesini imzalıyor; kopyaları sunulabiliyor | Otomatik ve sınırlı destekçi duyurusu/adres paylaşımı |
| Yapılandırılmış kaynaklar ve sınırlı yeniden denemeler | İçerik başına ölçülen kaynak seçimi, hata geçişi ve yük paylaşımı |
| Sınırlı önbellekler, adayda site hazırlığı | Bağımsız destekçilere otomatik kopya yerleştirme, denetleme ve tamamlama |
| Kurtarma, ayarlanmış yayıncı kimliklerine güveniyor | Katılım, dosya doğrulama ve isim/yayıncı güveninin ayrı yönetimi |
| Liste varsayılan 14 gün; yalnız yetkili yeniliyor | Uzun yetkili kaybı, yeni kurulum, anahtar değişimi ve ele geçirilmiş kayıtlar için kurtarma politikası |
| Açık IP dinleyicisi; doğrudan modda otomatik NAT/relay yok | Ev destekçileri için erişilebilirliği ölçme ve sınırlı bağlantı çözümü |

Liste kopyaları yetkilinin imza süresini uzatamaz. Eski adresi saklamak, süresi dolmuş listeyle yeni katılımı kendiliğinden yetkilendirmez. Bu bağımlılıklar otomatik katılım adı altında gizlenmeden çözülüp denenmelidir.

## Hazır demeden önce kabul koşulları

- Önceden kullanılan tarayıcı, sonradan katılan destekçiyi yeni kod veya elle profil değişikliği olmadan öğrenir.
- İlk sağlayıcı kapatıldığında bağımsız kalan peer'ler adresleri paylaşır ve önceden çoğaltılmış siteleri sunar.
- Önce RPC, sonra ham Arweave, ardından ikisi engellenir; geçerli başlangıç ayarı olan boş okuyucu doğru tarihli sürümü kalan destekçilerden alır.
- Hatalı veri, çelişkili/eski isim iddiası, sahte duyuru, geri alma ve adres bombardımanı reddedilir veya sınırlandırılır.
- Ölçülen yükte depolama/yükleme kotaları korunur; gerçek kopya tamlığı ve eksilen kopyalar görünür.
- Windows okuyucu ve gerçek Pi/VPS farklı ağlarda, ilgili NAT koşullarıyla denenir.

Bu ortak ağın bütün kabul koşulları henüz geçilmiş değildir. Bugünkü aday ve yayımlanmış sürüm kanıtları [durum](durum.md) sayfasında ayrı tutulur.
