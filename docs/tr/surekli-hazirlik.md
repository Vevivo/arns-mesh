# Yeni ArNS sitelerini güncel tutma

[Kullanım](kullanici.md) · [Destekçi kurulumu](destekci.md) · [English](../en/continuous-preparation.md)

Kaynaklar çalışırken destekçi sunucu yeni isimleri öğrenir ve doğrulanmış site dosyalarını edinir. Kullanıcı bir ArNS adı yazdığında bu isteğe ayrıca öncelik verir.

İsim takibi dosya indirmelerinden bağımsızdır. Yeni alınan ve başka hedefe bağlanan isimler takip edilir. Mevcut isimlerin içerik değişiklikleri de kontrol edilir. Daha güçlü sunucularda beş dakikalık toplu değişiklik taraması açılabilir.

R84 geniş bir içerik konumu dizini sağlar. Ancak yeni bir yükleme, dizinin bir sonraki yayımından önce yapılmış olabilir. Sunucudaki ayrı hazırlama işlemi bu durumda Turbo veya Arweave'in güncel dizininden dosyanın hangi pakette olduğunu öğrenir. Bu bilgi tek başına güvenilir sayılmaz: dosyanın kendisi alınır, kimliği ve imzası doğrulanır. HTTPS/DNS kullanan bu hazırlık sunucuda yapılır; okuyucu Mesh'e sayısal IP üzerinden erişir.

## Bir erişim yolu kesildiğinde alternatif yol

Canlı kaynaklara giden yollar çalıştığı sürece açık kalır. Bir hizmete ulaşamamak, o hizmetin bağlı olduğu ağın kapandığı anlamına gelmez.

| Erişim durumu | Mesh nasıl devam eder? |
|---|---|
| Okuyucu Solana RPC'ye ulaşamıyor | Ulaşılabilir destekçi kabul edilen isim kaydını sunabilir. RPC'ye erişimi süren destekçi yeni isim kayıtlarını takip edebilir. |
| Okuyucu ham Arweave adreslerine ulaşamıyor | İstenen dosyaları elinde tutan ulaşılabilir Mesh destekçisi doğrulanmış kopyaları sunabilir. |
| Hem okuyucu hem ulaşabildiği destekçiler RPC ve ham Arweave yollarını kaybetti | Mesh, bu yollar kesilmeden önce edinilmiş isim kayıtlarını ve doğrulanmış dosyaları sunar. |

İsim kaydı, içeriğin hangi adreste olduğunu gösterir; o içeriği açmak için gereken dosyalardan ayrıdır. R84 dosyaların konumlarını sağlar. Dosyaların doğrulanmış kopyaları ise hazırlama süreciyle zaman içinde edinilir.

Bir bilgi hizmetine erişimin kesilmesi, hazırlanmış verileri silmez. Kaynaklara erişimi süren destekçiler üzerinden güncellemeler devam edebilir. Yeni bir kayıt veya dosya hiçbir ulaşılabilir kaynakta yoksa ona giden bir yol yeniden kullanılabilir olana kadar bu eksik bilgi alınamaz. Bu arada kullanılan kayıt, yayıncısının son gözlemlediği sürümü gösterir; en yeni zincir durumunun kanıtı sayılmaz.

[Yalıtılmış erişim testinde](../validation/upstream-outage-2026-10-06.md) bu alternatif yolu denemek için seçilmiş örnekler kullanıldı. Testteki sayılar, sürekli güncellenen kataloğun sınırı değildir.

## Sunucu kapasitesi

Temel kurulum sınırlı bütçelerle otomatik hazırlamayı açar. Geniş kapsam için boş diski ve trafiği yeterli bir VPS'te limitler artırılabilir. Mesh için en az 120 GiB boş alan ayırabilen bir VPS örneği:

```ini
ARNS_ONLINE_PREPARATION=1
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=20000
ARNS_PREPARE_MAX_FILES=8192
ARNS_CATALOG_BULK_SCAN=1
ARNS_CATALOG_MINTS_PER_PASS=32
ARNS_CACHE_MIB=16384
ARNS_SAVED_MIB=65536
ARNS_NAMES_DAILY_MIB=16384
ARNS_CATALOG_DAILY_MIB=8192
ARNS_PREPARATION_DAILY_MIB=64
```

Bu değerler kapasite sınırlarıdır; bütün sitelerin anında arşivlendiği anlamına gelmez. R84, uygulama ve günlükler için ayrıca yer gerekir. Raspberry Pi'de [küçük destekçi örneğiyle](destekci.md) başlanabilir.

İsim listesi normalde 60 saniye aralıkla, isteğe bağlı toplu hedef taraması beş dakika aralıkla kontrol edilir. Gerçek gecikme; işlem süresi, kaynağın güncelliği, erişimi, yeniden deneme süresi ve kalan bütçeye bağlıdır. Her yüklemenin bir dakikada hazır olacağı garanti edilmez.

Sunucu raporunda isim takibi, çevrimiçi hazırlama, eksik dosyalar ve hazır siteler kontrol edilmelidir. Bir sitenin güncellemesi tamamlanmadan eski çalışan sürümü kaldırılmaz. Büyük dizin ve arşivler destekçi sunucularda kalır.

[Canlı hazırlama testi](../validation/continuous-preparation-2026-10-06.md) · [Başka sunucuyu devralmaya hazırlama](dayaniklilik.md)
