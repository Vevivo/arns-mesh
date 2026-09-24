# Sadece masaüstünü kullanmak isteyenler

[Ana sayfa](../../README.tr.md) · [English](../en/user.md)

Gereken yalnızca **Windows x64 masaüstü ZIP'i ve bir destekçinin bağlantı profili**. Chrome, uzantı, VPS, Raspberry Pi, Node.js, cüzdan veya indeksleyici kurmazsın. Tarayıcı motoru ve Mesh okuyucusu paketin içindedir.

## Kurulum

1. [Releases](https://github.com/Vevivo/arns-mesh/releases) içindeki **Preview** sürümden `ArNS-Mesh-Browser-Windows-x64-<sürüm>.zip` dosyasını indir. Masaüstü dosyası yoksa henüz yayımlanmamıştır. GitHub'ın **Source code** ZIP'i çalıştırılabilir masaüstü değildir.
2. İstersen ZIP'in SHA-256 değerini `Get-FileHash -Algorithm SHA256 -LiteralPath 'indirilen-dosya.zip'` ile ölçüp aynı sürümün `SHA256SUMS.txt` dosyasıyla karşılaştır. Bu indirme bütünlüğünü kontrol eder; yayıncı imzası değildir.
3. ZIP'in **tamamını** yeni bir klasöre çıkar. `Mesh-Browser.exe` dosyasını normal kullanıcı olarak aç. Yönetici yetkisi gerekmez. Önizleme kod imzalı değildir; Windows engellerse uyarının ayrıntısını geliştiriciye ilet, antivirüsü kapatma.
4. Destekçinin verdiği JSON dosyasını **Settings → Import connection profile** ile seç. Normal kullanım için terminal komutu gerekmez.
5. Uygulamanın kendi adres çubuğuna `ar://isim` veya yalnız ismi yaz. `+` sekme açar, yıldız yer imi ekler. Kayıtlı undername, yol, sorgu ve sayfa içi bağlantılar aynı adrese eklenebilir.

**Profil ne?** İlk bağlanılacak Mesh peer, IP üzerinden Solana RPC ve isteğe bağlı ham Arweave düğümlerinin servis adresleri. Parola, cüzdan veya gizli anahtar içermez. Genel pakete işletmecinin özel sunucu adresleri gömülmez. Bu yüzden çalışan profil gerekir; repodaki örnek dosya çalışır sunucu listesi değildir. Güvendiğin destekçiden al: isim eşleşmesinde RPC yanıtına güven devam ediyor.

Yeni kurulumda bağlantı ekranı otomatik açılır. Profil varsayılan olarak mevcut kaynaklara eklenir; değiştirme ayrıca seçilir. Aynı ekranda **Check connections** ve **Export profile** bulunur. [Profil kimden alınır, bağlantı listesi neyi gösterir?](baglantilar.md)

## Kullanım ve hata ayrımı

**Page information** dosya doğrulamasını, isim gözlemini ve erişim hatasını ayrı gösterir. Uygulama içi ağ kaydı, işletim sistemi seviyesinde bütün ağın kaydı değildir.

**Save current page** ana belgeyi veya manifestte listelenen dosyaları saklar. Sonucun tamamlanmasını bekle. Yıldızlamak dosyaları indirmez; yarım saklama çevrimdışı tam site değildir. **Saved** modundaki isim eski gözleme dayanır, son sürüm garantisi vermez. **Live** için erişilebilir RPC ve içerik kaynağı gerekir.

| Durum | Anlamı |
|---|---|
| Connection setup needed | Bağlantı profili gerekli. |
| RPC/isim hatası | Canlı isim gözlemi alınamadı; destekçi RPC kaynağını kontrol etmeli. |
| `content_location_unavailable` | İsim çözüldü ama ulaşılabilen kaynaklardan içerik konumu ve doğrulanmış veri alınamadı. İsim yok demek değildir. |
| İmza/veri hatası | Gelen veri reddedildi; doğrulamayı kapatma. |
| Büyük dosya açılmıyor | Önizlemede imzalı öğe için 32 MiB sınır var; büyük dosya akışı tamamlanmadı. |

Harici video, API, font veya CDN isteyen bir sitenin bu bölümleri çalışmayabilir. Uygulama bunları taklit etmez veya gizlice gateway'e geçmez. Ham tanı dosyalarını herkese açık paylaşma; gezinti isimleri ve IP'ler içerebilir.

## Güncelleme, geri dönüş, kaldırma

Uygulamayı kapat. Yeni sürümü **ayrı klasöre** çıkar; eskisini geri dönüş için sakla. Otomatik güncelleme yoktur. Ayarlar ve saklanan veriler normalde `%APPDATA%\ArNS-Mesh-Browser` içindedir; uygulama kapalıyken bu klasörü yedekle. Yedeği GitHub'a koyma. Eski sürüme dönüş için o sürümün programı ve onunla uyumlu veri yedeği birlikte tutulmalı.

Kaldırmak için uygulamayı kapatıp program klasörünü sil. Kişisel verilerin korunur. Bunları da silmek istiyorsan `%APPDATA%\ArNS-Mesh-Browser` klasörünü ayrıca silmen gerekir; profil, geçmiş, yer imleri ve saklanan sayfalar gider. Bu paket uzantı veya native-host kaydı kurmaz.

Kesinti öncesi uygulamayı ve birden fazla bağımsız kaynak içeren profili edin; gerekli siteleri sakla. Çalışma sırasında GitHub/npm gerekmez. Erişilebilir hiçbir kaynakta bulunmayan içerik veya canlı isim bilgisi üretilemez. [Test kapsamı](durum.md).
