# Destekçilerin ortak ağı — 0.6.0

[English](../en/shared-network.md) · [Ana sayfa](../../README.tr.md) · [VPS / Pi kurulumu](destekci.md)

**İlk sunucu erişilemezken yeni destekçi topluluk ağına katılabilir. 0.6.0 kullanan okuyucular aynı desteklenen Mesh koduyla devam eder ve yeni destekçiyi otomatik bulur.** Kurucu, ağ yetkilisinin imzaladığı açık ağ tanımını içerir. Geliştiricinin ilk işletmeciden izin, özel anahtar veya her kullanıcı için ayrı kod alması gerekmez.

Destekçi kurulumu keşfi ve içerik hazırlığını birlikte açar. Bağımsız erişim için kullanılabilir keşif yolu, ulaşılabilir destekçi ve istenen sitenin kayıtlarıyla dosyaları gerekir. Hazırlık arka planda devam eder; gerçek ilerlemesi gösterilir.

## Kurulumdan bağımsız hizmete

1. **Aynı ağa katılır.** Kalıcı tanım ağ kimliğini, onaylı kaynakları, kabul edilen isim yayımlayıcılarını ve sayısal keşif başlangıçlarını içerir. mesh2 kodu bu imzalı tanımı taşır. Sürümdeki topluluk tanımı, mevcut topluluk mesh1 kodunu da aynı yetkilinin imzasını doğrulayarak destekler. Yeni katılım için ilk sunucuya ulaşmak gerekmez.
2. **Kendi adresini duyurur.** Tam kurulum, yeni sunucunun dışarıdan erişilen sayısal IP/portunu ister. Destekçi adres duyurusunu imzalar; hem doğrudan peer paylaşımıyla hem ağ kimliğinden türetilen ayrı HyperDHT keşif konusu üzerinden duyurur.
3. **Okuyucu adresi bulup denetler.** Boş okuyucu, eski HTTP başlangıçları kapanmış olsa da yeni destekçiyi bulabilir. Duyuruyu doğrular ve adresi saklamadan önce HTTP uç noktasından rastgele isteği o kimlikle imzalamasını ister. Keşif isim yetkisi vermez.
4. **Kayıtları ve dosyaları hazırlar.** Kaynak yolları çalışırken isim değişikliklerini takip eder, doğrulanmış dosyaları hazırlar. Diğer destekçilerdeki kabul edilen isim kayıtlarını sayfalar halinde alır, asıl imzaları korur ve dosyaları kotalar içinde otomatik kopyalar. R84 konum bulmaya yardım eder; bütün sitelerin dosya yedeği değildir.
5. **Bağımsız erişim sınanır.** Hazırlık incelenir; sonra başka okuyucudan ilk sunucu dışlanarak [bağımsız destekçi kontrolü](dayaniklilik.md) yapılır. Açık servis veya yüksek isim sayısı, sitenin bütün dosyalarının hazır olduğunu tek başına göstermez.

İlk sunucu kapandıktan sonra kurulan destekçi, kalan kaynak yollarından ve diğer destekçilerden güncel kayıtlarla dosyaları toplayabilir. Bütün kaynak yolları da kesilmişse erişebildiği destekçide önceden saklanmış kayıtlar ve doğrulanmış kopyalar gerekir. Ulaşılabilir hiçbir kaynakta bulunmayan dosyayı kod veya indeks yeniden oluşturamaz.

Bu işleyiş için **okuyucuda ve destekçide 0.6.0 kullanın**. Eski uygulama yükseltilmeden yeni keşif özelliği kazanmaz.

## Keşifte ne paylaşılır?

Ağ keşfi sayısal IP üzerinden UDP kullanır. Ağ kimliğini ve imzalı destekçi adreslerini taşır; ArNS ismi, sayfa adresi, arama sözcüğü veya site dosyası taşımaz. Okuyucu keşif başlangıcına ulaşmak için DNS kullanmaz. Keşif düğümleri adres bulmaya yardım eder; isim yetkilisi veya içerik gateway'i değildir.

Normal Mesh istekleri sonrasında denetlenen sayısal HTTP adresini kullanır. Kaynak sıralaması doğrulanmış yanıt, gecikme ve hata gözlemlerine dayanır. İkinci kaynak 150 ms sonra denenebilir; aynı anda en fazla iki içerik isteği çalışır. Gelen dosyanın kimliği ve imzası yine doğrulanır. Saved modunda otomatik adres keşfi durur.

Destekçinin **TCP** adresi dışarıdan erişilmelidir. UDP keşfi, özel ağdaki HTTP portunu internete açmaz. Modem arkasındaki Pi için port yönlendirme veya başka bir genel erişim yolu gerekir; kurucu modem, güvenlik duvarı veya CGNAT ayarını değiştirmez.

## Asıl imzalar ve otomatik kopyalar

Aktarımda **kabul edilen asıl yayımlayıcının imzası korunur**. Güncel kayıt ile önceden hazırlanmış sürümün kaydı ayrı tutulur. Destekçinin keşfedilmesi, kendi imzasıyla ArNS hedefini değiştirme yetkisi vermez. Canlı çözümleme yapılandırılmış RPC kontrollerini; tarihli kesinti kayıtları kabul edilen yayımlayıcı kimliklerini kullanır.

İsim aktarımı sayfa başına 256 kayıt / 512 KiB, varsayılan geçiş başına sekiz sayfa alır. Varsayılan kapasitesi **40.000 kayıt ve 64 MiB**'dır. İlerleme yeniden başlatmada korunur; kapasite dolunca ilgisiz kabul edilmiş kayıtları silmek yerine sınır bildirilir. Bunlar kayıt kapasitesidir; bütün dosyaları hazır site sayısı değildir.

Kopyalama işi kabul edilen kayıtları otomatik hazırlar; kabul edilen hazırlanmış sürümü tercih eder. Ayrı sabitleme grupları ve replicated-sites.json sayesinde yeni RPC hedefi hazırlanırken önceki kullanılabilir kopya korunur. Varsayılan sınırlar 20.000 site kaydı, günlük 8 GiB ölçülen yanıt verisi ve geçiş başına 32 MiB'dır; kurulum profili farklı kotalar seçebilir. Eksik işler kotalar içinde tekrar denenir. İşletmeci durumunda snapshotRelay, replication, replicatedSites ve readiness alanlarını izleyin.

Her destekçi kendi kopyalarını hazırlar. İki bağımsız sağlayıcıda kopya olduğunu garanti eden veya kopyaları bütün ağda dağıtan bir düzenleyici yoktur. [Hazırlık kontrolü](dayaniklilik.md), seçilen isimleri ve erişilebilen statik dosya setlerini doğrular.

## Ayarlar ve sınırlar

Tam kurulum --advertise GENEL_IP:PORT kullanır. Gelişmiş MESH_ADVERTISE=auto ayarı genel adresi başka peer'in gözlemlemesine dayanır; ilk sunucu yokken duyuru yapacak yeni destekçi için uygun değildir. MESH_ADVERTISE=off kendi duyurusunu kapatır.

| İşlem | Sınır / davranış |
|---|---|
| Öğrenilen adresler | Ağ başına 32 peer; aynı IP'de dört kimlik; adres başına tek kimlik |
| Adres duyuruları | 24 saat geçerli; yaklaşık 12 saat sonra yenilenir |
| HTTP paylaşımı | Geçiş başına iki hedef, dört yeni kayıt kontrolü ve 15 saniye süre |
| HTTP kimlik denetimi | Aynı anda iki; dakikada sekiz yeni deneme |
| Ağ keşfi | İmzalı tanımda sekiz sayısal başlangıç; 12 takip edilen peer, iki giden ve dört gelen bağlantı; 8 KiB mesaj |
| İsim aktarımı | Sayfa başına 256 kayıt / 512 KiB; varsayılan geçiş başına sekiz sayfa |
| Kalıcılık | Geçerli adresler ve kabul edilen kayıtlar yeniden başlatmada korunur; ağ değişince eski dizin temizlenir |

Genel ağ davetleri özel/yerel HTTP duyurularını reddeder. Açıkça yerel test davetinde loopback keşfi de kullanılabilir; özel LAN taraması yapılmaz. Sınırlar iş yükünü kontrol eder, işletmecilerin dürüst veya bağımsız olduğunu kanıtlamaz.

## İlk işletmeci olmadan devam etmek

Kalıcı tanım, ilk işletmecinin süre uzatmasına ihtiyaç duymadan kullanılabilir. Kısa süreli kaynak listelerinin imza, süre ve eski sürümü reddetme kuralları sürer. Süresi dolmuş uzak liste yeni güncelleme olarak kabul edilmez; mevcut kurulum kabul ettiği ayarlarını korur. Destekçi yetkilinin özel anahtarını almaz veya onun imzasını yenilemez.

Bu devamlılık, kalıcı davetler ve aynı yetkilinin imzalı tanımı sürümde bulunan eski kodlar içindir. İlgisiz, yalnız eski biçimdeki bir kodla yeni katılım hâlâ erişilebilir, süresi geçmemiş liste gerektirir. Bütün HTTP ve yapılandırılmış keşif yolları erişilemezse yeni okuyucuya başka ulaşılabilir yol gerekir. İnternet/IP bağlantısı gereklidir.

## Doğrulama

Kontrollü testlerde başlangıç adresi baştan kapalıyken yeni destekçi kuruldu; aynı kodlu boş okuyucu onu sayısal UDP keşfiyle buldu, HTTP kimliğini doğruladı ve isim güven listesini değiştirmedi. Aktarım/kopyalama testleri sayfalı kayıtları, asıl imzaları, eski hazır/yeni güncel kopyaların ayrılığını ve yalnız saklanan dosyalarla hizmet kontrolünü kapsar.

6 Ekim 2026 canlı genel HyperDHT denemesinde de ilk başlangıç olmadan yeni destekçi bulundu, gerçek imzası doğrulanan test dosyası alındı. İki uç aynı fiziksel sunucudaydı. Bu, genel keşif altyapısıyla protokolü doğrular; bağımsız barındırma sağlayıcısının kaybını sınamış sayılmaz. Fiziksel Pi, ev modemi ve ayrı sağlayıcı testleri ayrıca gerekir. [Güncel doğrulamalar](durum.md).
