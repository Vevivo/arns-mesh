# Sadece masaüstünü kullanmak isteyenler

[Ana sayfa](../../README.tr.md) · [English](../en/user.md)

Gereken yalnızca **Windows x64 masaüstü ZIP’i ve sağlayıcının bağlantı kodu veya eski profili**. Chrome, uzantı, VPS, Raspberry Pi, Node.js, cüzdan veya indeksleyici kurmazsın. Tarayıcı motoru ve Mesh okuyucusu paketin içindedir.

## Kurulum

1. [Preview.8 sürümünden](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.8) Windows x64 ZIP’ini indir. Bağlantı kodları için preview.8 veya yenisini seç. GitHub’ın **Source code** ZIP’i geliştiriciler içindir.
2. İstersen ZIP'in SHA-256 değerini `Get-FileHash -Algorithm SHA256 -LiteralPath 'indirilen-dosya.zip'` ile ölçüp aynı sürümün `SHA256SUMS.txt` dosyasıyla karşılaştır. Bu indirme bütünlüğünü kontrol eder; yayıncı imzası değildir.
3. ZIP'in **tamamını** yeni bir klasöre çıkar. `Mesh-Browser.exe` dosyasını normal kullanıcı olarak aç. Yönetici yetkisi gerekmez. Önizleme kod imzalı değildir; Windows engellerse uyarının ayrıntısını geliştiriciye ilet, antivirüsü kapatma.
4. Sağlayıcının `mesh1.` kodunu **Settings → Mesh connection code** alanına yapıştır. **Check code** ile ağı incele, **Join this network** seç. Bu işlem kaynak listesini değiştirir. Terminal gerekmez. Eski JSON aktarımı **Already have a connection file?** altında durur.
5. Uygulamanın kendi adres çubuğuna `ar://isim` veya yalnız ismi yazıp Enter’a ya da ok düğmesine bas. `+` sekme açar, yıldız yer imi ekler. Kayıtlı undername, yol, sorgu ve sayfa içi bağlantılar aynı adrese eklenebilir.

**Profil ne?** İlk bağlanılacak Mesh peer, IP üzerinden Solana RPC ve isteğe bağlı ham Arweave düğümlerinin servis adresleri. Parola, cüzdan veya gizli anahtar içermez. Genel pakete işletmecinin özel sunucu adresleri gömülmez. Bu yüzden çalışan kod veya profil gerekir; repodaki örnek dosya çalışır sunucu listesi değildir. Kodu/profili güvendiğin sağlayıcıdan al: isim eşleşmesinde RPC yanıtına güven devam ediyor.

Yeni genel kurulumda bağlantı ekranı otomatik açılır. [Kod, otomatik güncelleme ve Connected paket anlatımı](ag-kodu.md). Profil varsayılan olarak mevcut kaynaklara eklenir; değiştirme ayrıca seçilir. Aynı ekranda **Check connections** ve **Export profile** bulunur. [Profil kimden alınır, bağlantı listesi neyi gösterir?](baglantilar.md)

## Kullanım ve hata ayrımı

İsim yalnız **üstteki adres çubuğuna** yazılır. Sağ tık → **Paste** ile fare kullanarak yapıştırabilirsin; Ctrl+V de çalışır. Sayfalardaki yazı alanlarında aynı düzenleme menüsü vardır. Ctrl+L adres çubuğunu seçer. Çubuğun yanındaki **Settings** simgesi bağlantı ayarlarının tek girişidir.

Çubuğun altındaki sıra **isim çözümü → kaynak arama → içerik konumu → indirme → doğrulama → sayfayı açma** durumlarını gösterir. Süreye göre ilerleyen bir animasyon değildir; gerçek istek bildirimlerini kullanır. İşler örtüşebilir; önbellek kullanılan adımlar atlanabilir. Adımın üzerine gelince durumu görünür. Hata veya durdurma başarı sayılmaz. Son adım ana sayfa yüklemesi bitince tamamlanır; eksik bağımlılıklar Page information bölümünde ayrı gösterilir.


**Page information** dosya doğrulamasını, isim gözlemini ve erişim hatasını ayrı gösterir. Uygulama içi ağ kaydı, işletim sistemi seviyesinde bütün ağın kaydı değildir.

**Save current page** ana belgeyi, manifest girdilerini ve HTML/CSS/JS/JSON içindeki desteklenen sabit Arweave bağlantılarını tarama/depolama sınırları içinde saklar. Sonucun tamamlanmasını bekle. Yıldızlamak dosyaları indirmez; yarım saklama çevrimdışı tam site değildir. **Saved** seçilen kopyanın tarihli isim gözlemini ve doğrulanmış yerel dosyalarını kullanır; eksik dosyayı ağdan tamamlamaz ve son sürüm garantisi vermez. **Live** için erişilebilir RPC ve içerik kaynağı gerekir.

| Durum | Anlamı |
|---|---|
| Connection setup needed | Bağlantı profili gerekli. |
| RPC/isim hatası | Canlı isim gözlemi alınamadı; destekçi RPC kaynağını kontrol etmeli. |
| `content_location_unavailable` | İsim çözüldü ama ulaşılabilen kaynaklardan içerik konumu ve doğrulanmış veri alınamadı. İsim yok demek değildir. |
| İmza/veri hatası | Gelen veri reddedildi; doğrulamayı kapatma. |
| Büyük dosya açılmıyor | Önizlemede imzalı öğe için 32 MiB sınır var; büyük dosya akışı tamamlanmadı. |

Arweave üzerinde bulunan desteklenen font, video ve ses dosyaları Mesh/ham kaynaklardan yüklenebilir. Preview.7, bağlı dosyanın konumu bilinmiyorsa sayfanın bilinen konumuna yakın sınırlı arama yapabilir; ilk erişim daha uzun sürebilir. Kaynak, konum, boyut veya kota sorunu dosyayı yine eksik bırakabilir. Arweave dışındaki CDN ve domain tabanlı canlı API’ler taklit edilmez; gizlice gateway’e geçilmez. Ham tanı dosyalarını herkese açık paylaşma; gezinti isimleri ve IP'ler içerebilir.

## Güncelleme, geri dönüş, kaldırma

Uygulamayı kapat. Yeni sürümü **ayrı klasöre** çıkar; eskisini geri dönüş için sakla. Otomatik güncelleme yoktur. Ayarlar ve saklanan veriler normalde `%APPDATA%\ArNS-Mesh-Browser` içindedir; uygulama kapalıyken bu klasörü yedekle. Yedeği GitHub'a koyma. Eski sürüme dönüş için o sürümün programı ve onunla uyumlu veri yedeği birlikte tutulmalı.

Kaldırmak için uygulamayı kapatıp program klasörünü sil. Kişisel verilerin korunur. Bunları da silmek istiyorsan `%APPDATA%\ArNS-Mesh-Browser` klasörünü ayrıca silmen gerekir; profil, geçmiş, yer imleri ve saklanan sayfalar gider. Bu paket uzantı veya native-host kaydı kurmaz.

Kesinti öncesi uygulamayı ve birden fazla bağımsız kaynak içeren profili edin; gerekli siteleri sakla. Çalışma sırasında GitHub/npm gerekmez. Erişilebilir hiçbir kaynakta bulunmayan içerik veya canlı isim bilgisi üretilemez. [Test kapsamı](durum.md).
