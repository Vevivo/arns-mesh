# Mesh bağlantı kodu ve bağımsız katılım

[Ana sayfa](../../README.tr.md) · [Destekçi kurulumu](destekci.md) · [Ayrıntılı işletmeci komutları (EN)](../en/network-code.md)

## Kullanıcı için

Mesh **0.6.0** kurun. [Açık topluluk kodunu](../community-network.md) **Settings → Mesh connection code → Check code → Join this network** alanında kullanın. Mevcut kullanıcıların bağlantısı güncellemede korunur.

Kod bir ağ davetidir; parola, lisans veya kişisel izin değildir. Topluluk kodu herkese açık paylaşılabilir. Başka bir ağın kodunu kullanmak, o ağın güven ayarlarını seçmektir.

## Destekçi için

[Destekçi kurulumu](destekci.md), açık topluluk ağını varsayılan olarak kullanır. İlk işletmeciye yazmanız veya onun özel anahtarını almanız gerekmez. Sunucunuz kendi kimliğini oluşturur, kendi erişilebilir adresini duyurur ve hazırlamaya başlar. Kullanıcılara ayrı kod dağıtılmaz.

## İlk sunucu erişilemez olduğunda

0.6.0, ilk sunucunun imzalama kimliğiyle doğrulanan kalıcı bir ağ tanımı taşır. Yeni `mesh2.` kodları bunu kendi içinde taşır; mevcut topluluk `mesh1.` kodu da paketteki aynı anahtarla imzalanmış tanımla eşleştirilir.

Bu tanım sayesinde ilk sunucu kapalıyken de ağa katılınabilir. Okuyucu ve destekçiler, sayısal IP üzerinden bağımsız buluşma noktalarıyla yeni destekçileri öğrenir ve duyurulan adreslerin kimliğini denetler. Kullanıcının ikinci sunucuyu önceden görmüş olması gerekmez.

Kalıcı tanım ilk işletmeci çevrimdışı diye sona ermez. Mevcut güvenilen isim yayıncılarını ve kaynak ayarlarını korur; yeni bir adresin öğrenilmesi o sunucuya isim değiştirme yetkisi vermez. Daha yeni kabul edilmiş kaynak ayarları eski tanımla değiştirilmez.

## İsimler ve dosyalar

Destekçi, kabul edilen isim kayıtlarını özgün imzalarını koruyarak ve dosyaları ayrıca doğrulayarak edinir. Canlı kaynaklar çalışıyorsa güncellemeler takip edilir. Kaynaklara erişim kesilmişse ulaşılabilir kopyalar kullanılır. Hiçbir ulaşılabilir kaynakta bulunmayan bilgi kendiliğinden oluşmaz.

[Hazırlık ve bağımsız okuyucu kontrolü](dayaniklilik.md), hangi isimlerin ve dosyaların hazır olduğunu gösterir. Ağ kodu, içerik arşivinin kendisi değildir.

## Güncellemeler ve eski kodlar

Canlı imzalı kaynak listeleri geçerlilik süresi, sürüm sırası ve imzaya göre denetlenmeye devam eder. Kalıcı tanımı bulunmayan eski ağlarda ilk katılım için erişilebilir ve süresi geçmemiş liste gerekir. Eski uygulamalar yeni keşif özelliğini kendiliğinden edinmez; 0.6.0'a güncellenmelidir.

**Saved** modu otomatik liste yenilemesini ve keşfi durdurur. Ağ üzerinden erişim için kullanılabilir internet/IP yolu gerekir. Bütün bilinen keşif yolları erişilemezse yeni ve bilinmeyen bir sunucu keşfedilemez.

Ağ yetkilisinin özel anahtarı yalnızca yetkili tarafta tutulur; kullanıcıya, pakete veya destekçilere verilmez. [Ayrıntılı anahtar ve yayım işlemleri](../en/network-code.md).
