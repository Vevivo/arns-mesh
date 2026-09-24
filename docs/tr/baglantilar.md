# Bağlantılar ve destekçi keşfi

## Şu anki masaüstü

Bağlantı yoksa ilk açılışta **Connect to Mesh** ekranı açılır. Profil içe aktarılır. Varsayılan **Add to my existing connections**, eski kaynakları koruyarak yenilerini ekler. **Replace my connections** özellikle seçilirse liste değiştirilir. Sınırlar: 16 Mesh peer, 8 RPC kaynağı, 16 ham Arweave düğümü.

**Your connections**, uygulamaya eklenmiş servis adreslerini gösterir. **Check connections**, bu IP'lere sınırlı istek gönderir. Mesh kontrolü indeksleme veya içerik indirme başlatmaz. Yanıt gelmesi yalnız o anda beklenen protokolde cevap alındığını gösterir; geliştiricinin kimliğini, isim güncelliğini veya bütün sitelerin açılacağını kanıtlamaz.

**Export profile**, yalnız bağlantı adreslerini içeren JSON üretir. Kimlik anahtarı, geçmiş ve saklanan sayfalar eklenmez. Yalnız paylaşma iznin olan servisleri paylaş. Dosya dışa aktarmak bilgisayarını sunucuya dönüştürmez; başka bir işletmecinin RPC hizmeti için izin sağlamaz.

## İlk profil kimden alınacak?

Seni davet eden destekçiden iste. Destekçi tanımıyorsan [repo sahibine veya gönüllülere bağlantı profili talebi aç](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). Bu herkese açık bir koordinasyon kanalıdır; otomatik hizmet veya yanıt garantisi değildir. Özel tanı dosyalarını ekleme.

Şu an pakette doğrulanmış genel destekçi rehberi yok. Bir işletmeci çalışır profil sunana kadar genel önizleme canlı isimleri açamaz. Repodaki örnek JSON çalışır ağ değildir. Destekçi, içerik kaynağının yanında kullanımına izin verilen bir IP tabanlı Solana RPC de sağlamalı veya göstermelidir. Mesh peer olmak otomatik olarak Solana RPC sunmak anlamına gelmez.

## Sonraki adım önerisi — henüz uygulanmadı

Uygulamada **Supporters** ekranı geliştirici kimliğini, son yanıt zamanını, sunulan hizmetleri ve erişimin açık mı onaylı mı olduğunu gösterebilir. Onaylı erişimde istek/kabul işleminin sunucuda gerçekten uygulandığı kimlik doğrulamalı protokol gerekir. Yalnız bir düğme eklemek yeterli değildir. Okuyucu bağlantı anahtarı cüzdandan ayrı olmalıdır.

İlk keşif için yine en az bir bilinen, erişilebilir IP gerekir. Zorunlu merkezi bir site yerine süreli ve imzalı duyurular birden fazla bağımsız başlangıç peer'inde çoğaltılabilir. Saklanan duyurunun ne zaman görüldüğü gösterilir. Tek VPS veya tek Raspberry Pi yine tek hata noktasıdır.

Bu özellik açılmadan önce ilk işletmecilerin servislerini ve adreslerini genel kullanıma sunmayı kabul etmesi gerekir. Kimlik taklidi, eski duyuru, erişim reddi/iptali, kapasite sınırı ve başlangıç düğümü kaybı denenmelidir. Mevcut yanıt kontrolü bu özelliklerin yerine geçmez.
