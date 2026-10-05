# Destekçilerin ortak ağı — 0.5.0

[English](../en/shared-network.md) · [Ana sayfa](../../README.tr.md) · [VPS / Pi kurulumu](destekci.md)

0.5.0, destekçinin kendini duyurmasını, peer adreslerinin paylaşılmasını ve okuyucunun öğrendiği kaynaklara otomatik yönelmesini uygular. Masaüstü ve destekçide aynı 0.5.0 sürümü kullanılır. Bağımsız içerik kopyalarını otomatik yerleştirme ve kayıp kopyaları tamamlama henüz yoktur.

## Yeni destekçi gelince ne olur?

1. Destekçi mevcut ağın `mesh1.` davetiyle kurulum yapar ve bildiği erişilebilir peer'e bağlanır. Yeni ağ kurmaz; her kullanıcıya ayrı kod dağıtmaz.
2. Servis kalıcı kimliği, ağ kimliği, sayısal IP/port adresi, yetenekleri ve geçerlilik süresini içeren duyuruyu imzalar. Varsayılan olarak karşı peer'in gördüğü IP ve kendi dinleme portu kullanılır. Domain veya harici IP öğrenme servisi gerekmez.
3. Karşı peer imzayı, ağı, tarihi, sürüm sırasını ve adresi denetler. İlan edilen adrese geri bağlanıp rastgele bir sorunun o kimlikle imzalanmasını ister. Doğrudan duyurunun adresi, bağlantıyı yapan IP ile eşleşmelidir.
4. Peer'ler bu imzalı adresleri paylaşır. Aynı ağa daha önce katılmış tarayıcı, adresleri kendisi de kontrol ederek saklar. Kullanıcı yeni kod almaz, profil aktarmaz. İşlem açılışta ve yaklaşık dakikada bir, işlem süresi eklenerek yapılır. Saved modunda durur.
5. Dosya için daha önce doğrulanmış veri sunan, hızlı yanıt veren kaynaklar tercih edilir. İlk istekten 150 ms sonra ikinci kaynak denenebilir; aynı anda en fazla iki istek vardır. Hatalı kaynakların önceliği düşer. Dosyanın kimliği ve imzası doğrulanmadan sonuç kabul edilmez. Bu, bütün dünyadaki en hızlı peer'i veya sunucu yükünü ölçen bir sistem değildir.

Katılan destekçilerin ve masaüstünün bu protokolü içeren 0.5.0 veya sonrası kodu kullanması gerekir. Eski peer'ler eski işlevlerini sunabilir; yeni duyuruları paylaşamaz. Eski masaüstü kendiliğinden yeni sürüme yükselmez.

## Adres öğrenmek isim yetkisi vermek değildir

Yeni peer doğrulanabilir dosyaları sunabilir; bir ArNS isminin hedefini belirleme yetkisi kazanmaz. Güvenilen isim/katalog yayımlayıcılarını mevcut imzalı ağ listesi belirler. Keşif bu listeyi veya güven kararını değiştirmez.

Destekçi ayrıca güvenilen eski yayımlayıcının imzaladığı isim gözlemlerini, hazırlanmış sürüm kayıtlarıyla birlikte, **orijinal imzayı koruyarak** aktarabilir. Okuyucu imzayı ve kendi güven listesini kontrol eder. Yeni destekçiyi isim yetkilisi yapmak gerekmez. Bu hazırlık sınırlıdır: geçiş başına en fazla dört bilinen isim, kayıt başına iki kaynak, en fazla 512 kayıt ve 1 MiB saklama alanı. Belirli ismin gerçekten kopyalandığını `snapshotRelay` durumundan doğrulayın.

Kesintide **tarihli isim kaydı ve ona karşılık gelen gerçek dosyalar** gerekir. Adres listesi veya arama kataloğu site yedeği değildir. Mevcut sınırlı içerik hazırlığı ayrı çalışır. İki bağımsız kopyayı otomatik yerleştirme/tamamlama sonraki iştir.

## Ayar ve erişim

- `MESH_ADVERTISE=auto` varsayılandır; görülen genel IP ve dinleme portu duyurulur.
- Dışarıdan erişilen port farklıysa `MESH_ADVERTISE=GENEL_IP:PORT` kullanılır. IPv6 biçimi `[ADRES]:PORT` olur. Bu ayar modem veya güvenlik duvarını yapılandırmaz.
- `MESH_ADVERTISE=off` kendi duyurusunu kapatır; servis adres öğrenmeye ve yapılandırılmış okuyuculara yanıt vermeye devam edebilir.
- Genel ağ davetinde yalnız genel sayısal adresler kabul edilir. Açıkça yerel test için hazırlanmış davetlerde ayrıca loopback kullanılabilir; özel LAN ve bulut metadata adresleri taranmaz.
- Modem arkasındaki Pi için dışarıdan erişim gerekir. Otomatik NAT geçişi, relay veya CGNAT aşma yoktur. Codespaces'in domain tabanlı port yönlendirmesi genel IP peer adresi sayılmaz.

[Kurulum rehberi](destekci.md) komutları içerir. `operator.mjs` / `operator-status.json`, öğrenilen adresi, duyurulan adresi, yakın zamanda duyuruyu kabul eden peer sayısını ve aktarılan isim kayıtlarını gösterir. Bunlar çevrimiçi kullanıcı sayısı veya doğrulanmış depolama kapasitesi değildir. Masaüstü Settings öğrenilen yolları, bağlantı ekranı gözlenen kaynakları gösterir.

## Sınırlar

| İşlem | Sınır / anlam |
|---|---|
| Öğrenilen adresler | Ağ başına 32 peer, aynı IP'de en fazla 4 kimlik, adres başına tek kimlik |
| Duyuru | 24 saat geçerli; yaklaşık 12 saat sonra yenilenir; yanıtta en fazla 16 kayıt |
| Bir paylaşım geçişi | İki hedef, en fazla dört yeni kayıt kontrolü, 15 saniye süre |
| Geri bağlantı kontrolü | Aynı anda iki; dakikada sekiz yeni deneme |
| Dosya isteği | Aynı anda iki kaynak; başarısız kaynağa 2–60 saniyelik öncelik cezası |
| Kalıcılık | Geçerli imzalı adresler yeniden açılışta korunur; ağ değişirse eski dizin temizlenir |

Kotalar iş yükünü sınırlar; her katılımcının dürüst veya bağımsız olduğunu kanıtlamaz, çok sayıda sahte kimlik saldırısını tamamen çözmez. Süresi dolan adresler silinir. Alternatif öğrenilmeden bilinen bütün başlangıç yolları kapanırsa yeni erişilebilir başlangıç adresi gerekir. İnternet/IP bağlantısı şarttır.

Ağ yetkilisi ve liste süreleri değişmedi: kopya sunan peer yetkilinin imzasını yenileyemez. Önceden katılmış okuyucu kabul edilmiş durumunu koruyup tarihli kurtarmadan yararlanabilir; yeni kurulum süresi dolmuş davet listesiyle katılamaz. Connected ZIP daveti içerebilir; standart ZIP'te ilk bağlantı ayarı gerekir.

## Doğrulama

Kaynak testlerinde önceden katılmış okuyucu sonradan gelen destekçiyi öğrendi; yapılandırma dosyası değişmeden, ilk kaynak durdurulduktan sonra doğrulanmış test dosyasını diğerinden aldı. Ayrı süreç ve veri dizinleriyle gerçek ağ aktarımı yapıldı. Yeniden başlatma, sahte/eski/süresi dolmuş duyurular, özel adres engeli, kimlik kontrolü, orijinal isim imzasının aktarımı ve hızlı hatalı veri sınandı.

Bunlar aynı makinede kontrollü testlerdir. Bağımsız sağlayıcı kaybı, ev modemi, Pi performansı ve farklı internet bağlantılarında kabul hâlâ ayrı test gerektirir. [Güncel kanıtlar](durum.md).
