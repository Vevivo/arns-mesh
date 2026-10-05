# ArNS Mesh kullanımı

[English](../en/user.md) · [Ana sayfa ve indirmeler](../../README.tr.md)

Windows x64 uygulama ZIP'i gerekir. Sunucu, cüzdan, Node.js veya indeks kurmanız gerekmez. Veriyi sağlayan ayrı servisi destekçiler çalıştırır.

## 1. İndir ve aç

[Ana sayfadaki sürüm tablosundan](../../README.tr.md#indirme-ve-gerçek-durum) seçin. Yayımlanmış preview.8 ve test adayı preview.13 farklı paketlerdir. GitHub Actions dosyaları süre sonunda silinebilir ve oturum açmanızı isteyebilir. **Source code (zip)** yerine uygulama ZIP'ini indirin.

**Bütün dosyaları** kalıcı bir klasöre çıkarıp `Mesh-Browser.exe` dosyasını açın. EXE diğer dosyalarla aynı klasörde kalsın. Masaüstüne koymak için EXE'ye Windows kısayolu oluşturun; yalnız EXE'yi klasöründen taşımayın. Önizleme imzasızdır. Uyarıyı aşmak için güvenlik yazılımını kapatmayın veya yönetici çalıştırmayın; engellenirse uyarı ayrıntısını bildirin.

Sağlama toplamını kontrol etmek isterseniz PowerShell'de `Get-FileHash -Algorithm SHA256 -LiteralPath 'indirilen-dosyanin-yolu.zip'` çalıştırıp tamamını o paketin değeriyle karşılaştırın. Sağlama toplamı yayıncı imzası değildir.

## 2. Bir kez bağlan

| Paket | İlk bağlantı |
|---|---|
| Ayrı hazırlanmış **Connected ZIP** | Temiz kurulumda sağlayıcının eklediği ağ doğrulanır ve katılım denenir |
| Standart GitHub sürüm/adayı | Güvendiğiniz sağlayıcıdan tam `mesh1.` davetini alıp **Settings → Mesh connection code → Check code** yolunda inceleyin; **Join this network** seçin |
| Önceden ayarlanmış kurulum | Uygulama normalde saklanan bağlantı ayarını kullanır |

Katılım kaynak listesini değiştirir; eski ayarı tutmak için önce **Export profile** kullanın. Eski `mesh-connect.json` dosyası **Settings → Already have a connection file?** bölümünden aktarılabilir. Elle kaynak düzenlemek veya profil aktarmak yönetilen liste güncellemelerini durdurur.

Kod tekrar kullanılabilen ağ bilgisidir; şifre, lisans veya ödeme değildir. Standart indirmelerde bugün hazır davet yoktur. Gerekirse [bağlantı yardımı isteyin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml); bu gönüllü koordinasyonudur, hizmet garantisi değildir.

Hedef, ilk bağlantıları hazır indirip kullanmaktır. Preview.13 ağa katıldıktan sonra yeni erişilebilir destekçileri otomatik öğrenir; [başlangıç bağlantısı ve güven sınırları](paylasilan-ag.md) geçerlidir.

## 3. Site aç veya konu ara

**Üst adres çubuğuna** `ar://vevivo` gibi bir isim yazın. Alt isimlerde gerçekten kayıtlı biçimi kullanın; örneğin `undername_name`. Yol, sorgu ve parça eklenebilir. Ctrl+L adres çubuğunu seçer; sağ tık Yapıştır ve Ctrl+V çalışır.

Preview.13 **Home** alanı ayrıca konu araması yapar. Kaynaklar erişilebilirken **Refresh catalogue** ile sınırlı kataloğu indirin; kelimeler cihazınızda aranır. Sonuç bulunması bütün dosyaların hazır olduğunu göstermez. Bu özellik preview.8'de yoktur. [Arama ayrıntıları](konu-aramasi.md).

Aşamalar **Resolve name → Find sources → Locate content → Download → Verify → Open page** olarak ilerler; zamanlayıcı değil gerçek işlemler izlenir. Eksik dosya, doğrulama ve tarihli isim kaydı için **Page information** kullanın. Harici API'ler ve Arweave dışı CDN dosyaları kullanılamayabilir.

## 4. Önemli siteleri sakla

Yıldız, adresi yer imine ekler. **Save current page**, desteklenen doğrulanmış dosyaları sınırlar içinde saklar. Sonucu bekleyip eksikleri kontrol edin; ana belgenin kaydedilmesi bütün dinamik sitenin arşivlendiğini kanıtlamaz.

Preview.13 **Automatic** modu, erişilebiliyorsa canlı kaynağı kullanır; erişim hatasında kabul edilmiş tarihli sürüme dönebilir. **Saved** tutulan isim bilgisini kullanır, canlı isim kontrolünü/izleme sorgularını durdurur. Eksik içerik Mesh/ham kaynaklardan istenebilir; Saved bütün ağı kapatan düğme değildir. Tam saklanmış kopya yeniden açılırken uygulama HTTP kaydında sıfır yeni istek test edildi. Preview.8'in eski Live/Saved davranışı ayrıdır. [Adayda kurtarma kapsamı](dayanikli-erisim.md).

Adayın **Network monitor** ekranı cihazınızın Mesh/RPC/ham veri gözlemlerini, trafiğini ve doğrulanmış ana belgenin kaynağını gösterir. Peer sayısı dünyadaki Mesh kullanıcı sayısı değildir. “Not checked” çevrimdışı demek değildir; yanıt gelmesi bütün sitelerin mevcut olduğunu kanıtlamaz. [Göstergelerin anlamı](baglanti-izleme.md).

## Sık karşılaşılan durumlar

| Durum | Kontrol |
|---|---|
| İlk açılışta ayarlar geliyor | Standart paket gerçek ağ daveti/profil ister |
| Peer yanıt veriyor ama site açılmıyor | Gerekli isim kaydı, konum veya dosyalar onda bulunmayabilir |
| RPC erişilemez | Güncel isim alınamayabilir; adayda kurtarma kabul edilmiş tarihli kayıt ister |
| Ham Arweave de erişilemez | Gerçek dosyalar yerelde veya erişilebilir Mesh peer'lerinde önceden bulunmalıdır |
| İmza/kimlik uyuşmazlığı | Veri reddedildi; doğrulamayı kapatmayın |
| Görseller/API eksik | Page information inceleyin; dış servis, konum veya dosya sınırı neden olabilir |
| Önceden açılan sayfa kayboldu | Geçici önbellek silinebilir; açıkça kaydedip tamlığını kontrol edin |

Bugünkü imzalı nesne sınırı 32 MiB'dir. Hiçbir sürüm bütün isimleri, anında güncelliği veya erişilebilir kopyasız çalışmayı garanti etmez. Geri bildirimde sürümü ve başarısız aşamayı yazın; özel adresleri, geçmişi ve yolları ayıklayın.

## Güncelleme ve yedek

Uygulamayı kapatın, `%APPDATA%\ArNS-Mesh-Browser` dizinini özel olarak yedekleyin, yeni ZIP'i ayrı klasöre çıkarın. Geri dönüş için eşleşen eski program/veri yedeğini tutun. Otomatik uygulama güncelleyicisi yoktur. Masaüstü güncellemesi sunucuyu güncellemez.

Çıkarılan program klasörünü silmek kullanıcı verisini korur. AppData dizinini ancak ayarları, geçmişi, yer imlerini ve kayıtlı içeriği silmek istiyorsanız ayrıca kaldırın. Chrome eklentisi kurulmaz. [Gizlilik](gizlilik.md) · [Geri bildirim](../../CONTRIBUTING.md).
