# Dayanıklı erişim — Mesh 0.6.0

Bu sayfa güncel Mesh 0.6.0 sürümünü anlatır.
Proje sahibi ilk hizmet sağlayıcısıdır: sunucuyu, depolama bütçesini, ağ kimliğini ve hizmet kapsamını yönetir. Normal kullanıcı masaüstünü indirip site açar. Destekçi isterse ayrı bir peer çalıştırıp veri kopyaları tutar. Geliştirici kod yazar; sunucu çalıştırması şart değildir. Masaüstünü iki bilgisayara kurmak, kendiliğinden iki veri sunucusu oluşturmaz.

| Çalışan kaynaklar | Mesh'in kullanacağı yol |
|---|---|
| RPC ve Arweave | Güncel isim gözlemi + erişilebilen doğrulanmış içerik |
| Yalnız RPC | Güncel isim gözlemi + önceden Mesh'e kopyalanmış içerik |
| Yalnız Arweave | Tarihli isim kaydı + Arweave veya Mesh içeriği |
| İkisi de yok | Tarihli isim kaydı + erişilebilir Mesh kopyaları |

Her durumda Mesh peer'lerine ulaşan IP bağlantısı gerekir. Kopyası olmayan bir dosya üretilemez. Önceden kabul edilmiş isim kaydı zincirin şu anki durumunun bağımsız ispatı değildir; tarih ve güvenilen sağlayıcı açıkça gösterilir. İçerik kimliği ve imzası ayrıca doğrulanır.

Yeni kod, bağlantı sorunu olduğunda uygun kayıtlı sürüme otomatik geçer. Yeni hedefin dosyaları tamamlanmadıysa önceki hazırlanmış sürüm korunur. Yeni sürüm ayrı hazırlanır; gerekli bulunan dosyalar tamamlanmadan eskisinin yerini almaz. Sayfanın alt kaynakları da aynı tarihli isim eşleşmesini kullanır. İmza/isim yetkisi hataları güncel doğrulama başarılıymış gibi gösterilmez.

Sağlayıcı, ağ kodunun imzalayan anahtarıyla hangi peer kimliklerinin tarihli isim kayıtlarına güvenileceğini bildirebilir. Kullanıcı dosya/anahtar taşımaz; ağın bağlantı bilgileriyle birlikte bu açık kimlikleri alır. Gizli anahtar paylaşılmaz.

Sunucu güncel isimleri izleyip tarihli kayıtlar ve sınırlı sayıda hazırlanmış site tutabilir. Registry listesi yaklaşık 15 dakikada yenilenmeye çalışılır; hedefler her turda sekiz isim grubuyla artımlı taranır. Tüm tarama saatler sürebilir; kota ve hatalar süreyi uzatır. Bir isim değiştiği anda yakalama veya bütün ArNS sitelerini saklama garantisi yoktur. Otomatik hazırlık varsayılan olarak kapalıdır; sağlayıcı açar ve kotasını belirler. Bu çalışma bütün CDB64 indeksini indirmez.

İlk aşamada mevcut VPS kullanılabilir. Normal kullanıcının güçlü bilgisayarı, tam indeksi veya kendi sunucusu gerekmez. Tek VPS'in kendisi kaybolursa, erişilebilir başka bir cihazda isim kaydı ve gerçek dosyaların kopyası bulunmalıdır. Raspberry Pi sonraki aşamada böyle bir destekçi olabilir.

Sağlayıcıya özel salt okunur izleme ekranı, yalnız sunucunun yerel adresinde açılır. İsim kaydı sayısı, hazırlanan sürümler, eksik güncellemeler, kuyruk, bellek ve disk kullanımı gösterilir. Ayarlar, kotalar, komutlar ve sınırlar [ayrıntılı teknik rehberde](../resilient-access.md).

Yerel otomatik deney dört bağlantı durumunu, yarım güncellemeyi, yeniden başlatmayı ve güven kontrollerini sınar. Gerçek iki PC, Windows ağ engelleme ve bağımsız sunucu kaybı kabulü henüz yapılmış sayılmaz. Proje sahibi eve geldiğinde bu aşamayı iki PC ile ayrıca yapacak; o zamana kadar masaüstü sürümünü değiştirmesi gerekmez.
