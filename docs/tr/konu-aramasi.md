# Konuya göre arama — Mesh 0.5.0

Bu sayfa güncel Mesh 0.5.0 sürümünü anlatır.
Ana sayfada bir konu yazıp **Search Mesh** düğmesine basabilirsin. Üstteki adres çubuğuna ise bildiğin ArNS ismini veya `ar://isim` adresini yazarsın. İkisi farklı giriş yollarıdır; sonuçtaki siteye tıklayınca Mesh'in mevcut isim ve dosya doğrulaması çalışır.

Konu araması Mesh 0.5.0 içinde bulunur. Normal ağ kodunla bağlanırsın; ayrıca arama hesabı veya API anahtarı gerekmez. Eski bağlantı profilinde güvenilen peer kimliği yoksa sağlayıcıdan güncel bağlantı bilgisi alınmalıdır.

**Nasıl kullanılır?** Ana sayfada **Refresh catalogue** ile kataloğu indir. Örneğin `müzik`, `haber` veya `yapay zekâ` yaz. Sonuçlar indirilen küçük katalogdaki sayfa başlıkları, açıklamalar ve sınırlı metinle eşleştirilir. Bütün kelimelerin bulunması gerekir; Türkçe harfler desteklenir. Çeviri veya yapay zekâ ile anlamsal arama yapılmaz; İngilizce sayfayı Türkçe kelimeyle otomatik bulma garantisi yoktur. Bilinen ismi her zaman üst çubuktan doğrudan açabilirsin.

Arama kelimelerin sunucuya gönderilmez. Katalog normal erişimde başlangıçta ve yaklaşık 15 dakikada bir yenilenmeye çalışılır. Sunucu kapanırsa son kabul edilen kopya bilgisayarda kalır; uygulamayı yeniden açınca da aranabilir. **Saved** modunda katalog yenilenmez. Hiç katalog indirmemiş bir cihazda çevrimdışı konu araması için bilgi bulunmaz.

Sonuçlarda isim kaydının gözlem tarihi ve sayfanın indekslenme tarihi gösterilir:

- **Entry page indexed:** Ana sayfa indekslenmiş; diğer dosyalar eksik olabilir.
- **Site copy reported by peer:** Sağlayıcı, indeksleme sırasında kendi saklama kapsamındaki kopyayı hazır bildirmiş. Şu anda erişilebildiğinin garantisi değildir.
- **Saved on this device:** Aynı hedefe ait hazır kopya bu bilgisayarda bulunuyor.

Arama sonucunda görünmek, sitenin tamamının indirilmiş olması anlamına gelmez. Dosyalar sende veya ulaşabildiğin kaynaklarda bulunmalıdır. Sonuç yoksa “bu ArNS ismi yok” denmez; sadece elimizdeki katalogda eşleşme yoktur.

**Proje sahibi olarak senin VPS'in ne yapacak?** Zaten doğrulanarak alınmış ana HTML belgelerinden başlık, açıklama ve küçük bir metin özeti çıkaracak. Bir turda en fazla 32 isim kontrol edilir. Katalog en fazla 256 sayfa ve 384 KiB imzalı veri içerir; boyut sınırı sayıyı azaltabilir. Her sayfanın ilk 1.200 karakterlik statik metni tutulur. Sayfa betikleri çalıştırılmaz. Tam Arweave indeksi indirilmez; bu özellik için SSD yükseltmek gerekmez. Tüm ArNS sitelerinin kapsandığı veya güncellemelerin anında yakalandığı iddia edilmez.

İsim başka hedefe güncellendiği görüldüğünde eski metin yeni hedefin metni gibi kullanılmaz. Yeni belge bulunup doğrulanınca arama kaydı yenilenir. Eksik veya bozuk dosya indekslenmez. JavaScript ile sonradan oluşan sayfa metni bu ilk sürümde aranamayabilir.

**Destekçi ne yapabilir?** Kataloğun bir kopyasını alıp asıl sağlayıcının imzasını koruyarak sunabilir. Bağlantı listesinde destekçinin adresi, güven listesinde de asıl sağlayıcının açık peer kimliği bulunur. Gizli anahtar verilmez. Katalog paylaşmak site dosyalarını da paylaşmış olmak değildir; bunların ayrıca hazırlanması gerekir. Masaüstü kullanıcıları otomatik olarak sunucuya dönüşmez.

İmza, kataloğu kimin yayımladığını doğrular; isim eşleşmesinin şu anki zincir durumunu bağımsız olarak kanıtlamaz. Kullanıcı bu nedenle katalogda tarihleri görür; sonuç açılırken mevcut Mesh doğrulaması yeniden çalışır.

Otomatik testte katalog iki yerel peer üzerinden aktarıldı, iki peer kapatıldı ve yeniden başlayan okuyucu yerelde arama yapabildi. Bu, evdeki iki gerçek PC denemesinin yerine geçmez. O denemeyi sen hazır olduğunda ayrıca yapacağız. [Teknik sınırlar](../topic-search.md).
