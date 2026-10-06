# Konuya göre arama — Mesh 0.5.1

**Üstteki adres çubuğu site açar. Ortadaki arama kutusu site bulur.**

1. Mesh ağınıza normal bağlantı kodunuzla katılın.
2. Ana sayfadaki orta kutuya bir konu yazın: örneğin **oyun**, **müzik**, **sanat** veya **depolama**.
3. **Search Mesh** düğmesine basın.
4. İlgili ArNS adresleri, varsa başlıkları, kısa açıklamaları ve konu etiketleri listelenir.
5. Sonuca tıklayarak siteyi açın. Bir etikete tıklayarak aynı konudaki diğer sonuçları bulun.

İsmini bildiğiniz siteyi doğrudan açmak için üstteki adres çubuğuna `ar://isim` yazmaya devam edin. Ek hesap, cüzdan veya arama anahtarı gerekmez.

## Sonuçlar nereden geliyor?

Sunucu, ArNS sahiplerinin girdiği açıklama ve anahtar kelimeleri toplar. Alt isimlerin kendi açıklama/etiketleri de kullanılabilir. Hazırlanmış sayfalardaki başlık, açıklama, HTML anahtar kelimeleri ve metinler aramayı destekler.

Yaygın Türkçe ve İngilizce konular eşleştirilir: örneğin **müzik → music**, **oyun → game**, **depolama → storage**. Bu genel bir çeviri veya yapay zekâ araması değildir. Birden fazla kelime yazarsanız her kelimenin eşleşmesi gerekir.

Arama sonuçları sitenin kaydedildiği anlamına gelmez. **ArNS listing** yazan sonuçta isim bulunmuştur; sayfanın erişilebilirliği açılırken kontrol edilir. **Site copy reported by peer** ise destekçinin hazırladığını bildirdiği kopyayı gösterir. Dış servis isteyen uygulamaların her işlevi çalışmayabilir.

## Güncelleme ve kesinti

Sunucu konu bilgilerini yaklaşık 15 dakikada bir yeniler. Masaüstü de arama kataloğunu düzenli alır; hemen almak için **Refresh catalogue** seçilebilir. Yeni isimlerin görünmesi isim takibine ve bu yenilemelere bağlıdır.

Kaynaklar kesildiğinde önceden alınan arama kataloğu kullanılmaya devam eder. Sonucu açmak için gerekli isim kaydı ve dosyaların ulaşılabilir bir Mesh destekçisinde veya cihazdaki önbellekte bulunması gerekir.

## Bilgisayarda ne tutulur?

Büyük ArNS/R84 indeksleri ve hazırlık sunucudadır. Masaüstü, aramayı yerel yapabilmek için küçük ve sınırlı bir katalog önbelleği tutar; en fazla iki yayıncı için yaklaşık 32 MiB üst sınır vardır. Arama kelimeleri sunucuya gönderilmez. Arama yapmak sitenin tüm dosyalarını indirmez.

Bir sonuç çıkmaması sitenin olmadığı anlamına gelmez. Sahibinin konu bilgisi eksik olabilir veya site henüz katalogda bulunmayabilir. Bilinen ArNS adresi üst çubuktan yine açılabilir.

[Geliştirici ayrıntıları](../topic-search.md) · [Kullanıcı rehberi](kullanici.md)
