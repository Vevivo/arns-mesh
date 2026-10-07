# Windows'ta Mesh kullanımı

[English](../en/user.md) · [Ana sayfa](../../README.tr.md)

Windows uygulaması ve çalışan bir ağ daveti yeterlidir. VPS, cüzdan, Node.js veya büyük sunucu indeksi kurmanız gerekmez.

## 1. İndirin

**[0.6.0 Windows x64 uygulama ZIP'ini](https://github.com/Vevivo/arns-mesh/releases/download/v0.6.0/ArNS-Mesh-Browser-Windows-x64-0.6.0.zip)** indirin. GitHub'daki **Source code** arşivleri geliştiriciler içindir.

ZIP'in tamamını kalıcı bir klasöre çıkarın. İçindeki `Mesh-Browser.exe` dosyasını açın. Diğer dosyaları yanında bırakın; masaüstünde simge istiyorsanız kısayol oluşturun.

Bu, topluluk tarafından yayımlanan imzasız bir uygulamadır. Windows engellerse [sürüm ve dosya doğrulama bilgilerini](https://github.com/Vevivo/arns-mesh/releases/tag/v0.6.0) kontrol edip uyarıyı bildirin. Güvenlik yazılımını kapatarak engeli aşmayın.

## 2. Bir kez bağlanın

[Yayımlanmış topluluk kodunu](../community-network.md) kopyalayın. Bunun için ilk işletmeciden ayrıca izin veya kod istemeniz gerekmez. Başka bir ağa katılacaksanız güvendiğiniz işletmecinin `mesh1.` veya `mesh2.` kodunu kullanın.

**Settings → Mesh connection code → Check code → Join this network**

Katılmadan önce gösterilen ağı kontrol edin. Kod tekrar kullanılabilir bir davettir; şifre veya ücretli lisans değildir. Kodunuz yoksa [bağlantı yardımı isteyebilirsiniz](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml); hizmet gönüllü işletmecilerin erişilebilirliğine bağlıdır.

Önceden ayarlanmış kurulum kayıtlı bağlantısını kullanır. Standart ZIP topluluğun imzalı kalıcı ağ tanımını içerir; topluluk kodunu girmek bu ağı seçer. Ayrı sağlanan Connected paket ilk açılışta bir daveti seçebilir. Eski bağlantı dosyası **Settings → Already have a connection file?** bölümünden alınabilir.

## 3. Bir ArNS sitesi açın

**Üst adres çubuğuna** `ar://vevivo` veya ziyaret etmek istediğiniz başka bir ArNS ismini yazın. Örnek adresin her zaman açılacağı garanti edilmez.

Alt isimlerde tam kayıtlı yazımı kullanın: örneğin `altisim_isim`. Ortadaki arama kutusuna music, games veya storage gibi bir konu yazın. Sonuca tıklayıp ArNS sitesini açın; etikete tıklayıp o konuda arama yapın. [Arama rehberi](konu-aramasi.md).

Mesh ismi çözer, dosyaları bulur, doğrular ve sayfayı açar. **Page information**, eksik kaynakları ve tarihli isim kaydının kullanılıp kullanılmadığını gösterir. Domain üzerinden çalışan haricî API ve CDN'ler erişilemez kalabilir.

## Bilgisayarınızda tutulan veriler

Büyük paylaşılan indeks ve destekçi arşivleri **sunucuda** tutulur. Gezinmek için bunları indirmeniz gerekmez; tarayıcı diskinizi otomatik olarak diğer kullanıcılara sunmaz.

Ancak 0.6.0; uygulama ayarlarını, gezinme durumunu, isim kayıtlarını ve sınırlı içerik önbelleğini `%APPDATA%\ArNS-Mesh-Browser` altında tutar. **Save current page** ek dosyalar saklar. Bilerek sayfa kopyası kaydetmek istemiyorsanız bu işlemi kullanmayın; normal önbellekleme yine devam eder.

Bu sürümde desteklenen bir sıfır kalıcı depolama modu yoktur. Arşiv işinin destekçilerde yapılması, mevcut tarayıcıyı disksiz yapmaz.

## Erişim kesilirse

**Automatic** modu çalışan canlı erişim yollarını kullanır; destekçiler isim güncellemelerini takip edip doğrulanmış dosyaları hazırlamaya devam eder. RPC yolunuz kesilirse kabul edilen isim kaydını ulaşılabilir bir destekçi sağlayabilir. Ham Arweave yolunuz kesilirse dosyaları elinde tutan destekçi bunları Mesh üzerinden sunabilir. Siteyi daha önce açmış olmanız gerekmez.

Canlı kaynaklara ulaşabilen destekçiler güncellemeleri edinmeyi sürdürür. Bu yollar hem okuyucu hem ulaşabildiği tüm destekçiler için kesilirse erişim, saklanan isim kayıtları ve dosyalarla sürer. Yeni yayımlanmış bilgi, onu taşıyan bir kaynağa tekrar ulaşılana kadar alınamaz. [Hazırlık ve alternatif erişim nasıl çalışır?](surekli-hazirlik.md).

**Saved** modu işletim sistemi düzeyinde ağı kapatmaz; eksik dosyalar istenebilir. Yer imi adresi hatırlar, siteyi kaydetmez.

Ağa katıldıktan sonra ek destekçiler otomatik öğrenilebilir. Bu, her sitenin başka bir kopyası olduğunu garanti etmez. [Destekçilerde devralma hazırlığı](dayaniklilik.md).

## Bir şey açılmadığında

| Görülen durum | Anlamı / yapılacak kontrol |
|---|---|
| İlk açılışta bağlantı ayarı isteniyor | Gerçek işletmeci davetini girin |
| Mesh kaynağı yanıt veriyor ama sayfa açılmıyor | Yanıt vermesi, istenen dosyayı içerdiğini göstermez |
| İsim çözülmüş, içerik konumu bulunamamış | Hedef biliniyor, depolama konumu bulunamıyor |
| Bazı resimler veya özellikler eksik | Page information içinde eksik dosya ve haricî bağımlılıkları kontrol edin |
| İstek sayacı artıyor | Başarısız olanlar dâhil HTTP isteklerini sayar |
| “In progress 0” | O anda ölçülen bir HTTP isteği yürümüyor |
| İkinci PC Mesh sayısını artırmıyor | Masaüstü kurulumları okuyucudur, destekçi sunucu değildir |

**İki bilgisayarın trafik sayıları neden farklı?** HTTP sayaçları her uygulamanın kendi açılışından itibaren ölçülür. Aynı destekçiye bağlı olsalar da açılan sayfalar, açık kalma süresi, önbellek ve yeniden denemeler farklıdır. Ölçüm tek sunucudan gelen veriyi değil, izlenen Mesh, RPC ve ham Arweave HTTP trafiğini kapsar. Bağlantı yoklamaları hariçtir. Alınan veri sayacı, diskte saklanan veri miktarı değildir.

Mevcut imzalı veri nesnesi sınırı 32 MiB'dir. [Göstergelerin açıklaması](baglanti-izleme.md).

## Uygulamayı güncelleyin

Mesh'i kapatın. Yeni uygulama ZIP'ini ayrı bir klasöre çıkarıp çalıştırın. AppData ayarları normalde korunur. Yer imleri ve kaydedilmiş verileri korumak istiyorsanız özel yedek alın. Otomatik uygulama güncelleyicisi yoktur.

Program klasörünü silmek AppData'yı silmez. Mesh çalışırken AppData'yı silmeyin. [Gizlilik](gizlilik.md) · [Sorun bildirme](../../CONTRIBUTING.md).

Arama kataloğunu destekçi sunucular hazırlar. Kesintide de arama yapabilmek için cihazda en fazla iki sınırlı katalog tutulur (toplam yaklaşık 32 MiB üst sınır). Arama kelimeleri sunucuya gönderilmez.
