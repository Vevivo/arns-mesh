# Bağlantılar ve destekçi keşfi

[Bağlantı kodu ve otomatik güncellenen ağ listesi](ag-kodu.md) daha kolay kurulum sağlar. Bu sayfa işletmecilerin ve eski kullanıcıların kullanabildiği JSON biçimini açıklar.

## Şu anki masaüstü

Bağlantı yoksa ilk açılışta **Connect to Mesh** ekranı açılır. Profil içe aktarılır. Varsayılan **Add to my existing connections**, eski kaynakları koruyarak yenilerini ekler. **Replace my connections** özellikle seçilirse liste değiştirilir. Sınırlar: 16 Mesh peer, 8 RPC kaynağı, 16 ham Arweave düğümü.

**Your connections**, uygulamaya eklenmiş servis adreslerini gösterir. **Check connections**, bu IP'lere sınırlı istek gönderir. Mesh kontrolü indeksleme veya içerik indirme başlatmaz. Yanıt gelmesi yalnız o anda beklenen protokolde cevap alındığını gösterir; geliştiricinin kimliğini, isim güncelliğini veya bütün sitelerin açılacağını kanıtlamaz.

**Export profile**, bağlantı ayarlarını ve yapılandırılmışsa kabul edilen tanık politikasını içeren JSON üretir. Özel kimlik anahtarı, geçmiş ve saklanan sayfalar eklenmez. Yalnız paylaşma iznin olan servisleri paylaş. Dosya dışa aktarmak bilgisayarını sunucuya dönüştürmez; başka bir işletmecinin RPC hizmeti için izin sağlamaz.

## İlk profil kimden alınacak?

[Yayımlanmış topluluk bağlantısını](../community-network.md) kullanabilir veya seni davet eden destekçiden profil alabilirsin. Başka bir ağ için [repo sahibine veya gönüllülere bağlantı profili talebi açabilirsin](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). Bu herkese açık bir koordinasyon kanalıdır; otomatik hizmet veya yanıt garantisi değildir. Özel tanı dosyalarını ekleme.

Topluluk kodu mevcut ağın imzalı bağlantı tanımını sağlar. Aşağıdaki örnek JSON ise yalnız belge adresleri içerir; çalışır ağ değildir. Mesh peer olmak otomatik olarak Solana RPC sunmak anlamına gelmez. Korunan profil, tanıkların doğruladığı isim kayıtlarını Mesh'ten alabilir; normal profilde canlı isim gözlemi için kullanımına izin verilen IP tabanlı RPC kaynağı gerekir.

## Dosyanın içine ne yazılır?

Dosya adı serbesttir; bu rehberlerde kullanıcının aldığı dosya `mesh-connect.json` olarak adlandırılır. Aşağıdaki biçim gerçektir fakat **bütün IP’ler çalışmayan belge örnekleridir**:

```json
{
  "schema": "arns-mesh-network-profile/v1",
  "directPeers": ["192.0.2.20:49741"],
  "rpcSources": ["198.51.100.20:8899"],
  "arweavePeers": ["203.0.113.30:1984"]
}
```

| Alan | Servis ve işletmeci adresi nereden alır? |
|---|---|
| `directPeers` | Mesh destekçi HTTP servisi. Kendi VPS’in için sağlayıcının ağ panelinden public IP’yi, peer dinleme ayarından portu al (kurucu varsayılanı TCP 49741). Başka destekçi için adresi ve kullanım koşullarını işletmeciden iste. |
| `rpcSources` | Canlı ArNS/ANT gözlemlerinde kullanılan, IP üzerinden HTTP ile uyumlu Solana JSON-RPC. İşletmecisinden kullanımına izin verilen adres al veya bu servisi ayrıca kurup yönet. Mesh peer kurmak RPC oluşturmaz. |
| `arweavePeers` | Ham veri/başlık ve konum keşfi sunan isteğe bağlı gerçek Arweave HTTP düğümleri. IP ve portu düğüm işletmecisinden al; buradaki 1984 yalnız örnektir. Mesh ile ham düğüm API’si farklıdır. |

Normal profilde en az bir RPC ve en az bir Mesh **veya** ham Arweave kaynağı gerekir. Kabul edilmiş tanık politikası ve Mesh peer'leri bulunan korunan profilde okuyucunun RPC adresi olmayabilir; imza veren tanıkların yine incelenmiş gözlem kaynakları gerekir. Yalnız peer’lerden kopyalayan yapı ham düğüm olmadan çalışabilir; ham içerik keşfi için çalışan ham kaynak gerekir. Sınırlar: 16 Mesh, 8 RPC, 16 ham adres ve 8 KiB profil dosyası. IPv4 `IP:port` ve köşeli parantezli IPv6 `[adres]:port` kabul edilir; domain, URL, yol, parola veya API anahtarı parametresi kabul edilmez. Biçimin kabul edilmesi uçtan uca IPv6 kurulumunun denendiği anlamına gelmez.

Bir sağlayıcının domainini rastgele IP ile değiştirince TLS/API anahtarlı hizmetinin çalışacağını varsayma; bu taşıma biçimine uygun adres iste. Mesh portunu üç alana da yazma: her alan kendi servisini gerektirir. Kullanıcılara dağıtılacak dosyada `0.0.0.0` veya `127.0.0.1` yerine dışarıdan erişilebilir hedef bulunmalı. Yerel ağ adresi yalnız o ağa erişebilen kullanıcılar içindir.

Profil bağlantı ayarlarını ve yapılandırılmışsa sabitlenmiş tanık politikasını taşır; erişim anahtarı veya saklanmış site değildir. Politikayı ağın kararlaştırdığı kimlik doğrulama yöntemiyle kontrol et; yalnız dosya indirmek işletmeciyi doğrulamaz. Alıcının listelenen servislere ağ erişimi ve kullanım izni gerekir; servis kapasitesi de yeterli olmalıdır. Dosya firewall aşmaz veya erişim onayı mekanizması kurmaz.

## İşletmecinin iki profili

| Rehberdeki dosya | Kimin bağlantılarını ayarlar? | Hangi Mesh adresleri yazılır? |
|---|---|---|
| `mesh-upstream.json` | Yeni destekçi sunucu | Veri/kayıt alabileceği mevcut faydalı kaynak peer’ler |
| `mesh-connect.json` | Kullanıcılar veya yeni sunucudan yararlanacak diğer destekçiler | Yeni destekçinin dışarıdan erişilebilir adresi; isteğe göre başka bağımsız kaynaklar |

İkisi de **aynı dosya biçimini** kullanır; isimleri programın davranışını değiştirmez. Kaynak profilini aynen paylaşmak yeni peer’i eklemez. Boş düğümü yalnız kendisine bağlamak içerik sağlamaz. Kullanıcı dosyasını üretip denemek için [destekçi rehberini](destekci-ayrintili.md#5-kullanıcılara-nasıl-vereceksin) izle. Kullanıcı masaüstünden içe aktarır; destekçi kaynak profilini kurulumda veya peer durmuşken `scripts/profile.mjs apply` ile uygular.

Kesinti öncesi kullandığın profilleri sakla. Bağımsız JSON dosyaları, yollar değiştiğinde açıkça güncellenmelidir; [yönetilen bağlantı kodları](ag-kodu.md) doğrulanmış güncellemeleri ve diğer destekçileri öğrenebilir. **Add** önceki adresleri korur; eskileri çıkarmak için **Replace** seçimini bilinçli yap. Korunan politikanın değiştirilmesi ayrıca sınırlandırılır. Birden fazla adres ancak bağımsız erişilebilir ve faydalı veriye sahip kaynaklarsa yedeklilik sağlar.

## İşletmeci rehberi — henüz uygulanmadı

Uygulamada **Supporters** ekranı geliştirici kimliğini, son yanıt zamanını, sunulan hizmetleri ve erişimin açık mı onaylı mı olduğunu gösterebilir. Onaylı erişimde istek/kabul işleminin sunucuda gerçekten uygulandığı kimlik doğrulamalı protokol gerekir. Yalnız bir düğme eklemek yeterli değildir. Okuyucu bağlantı anahtarı cüzdandan ayrı olmalıdır.

Yönetilen bağlantı kodları ve imzalı destekçi keşfi, diğer peer'lere ulaşma yollarını zaten sağlar; [ağ kodları rehberine](ag-kodu.md) bak. Bu keşif mekanizması, önerilen işletmeci rehberi ve erişim onayı arayüzünden ayrıdır. Bir peer'in yanıt vermesi, tek başına işletmeci bağımsızlığını veya site dosyalarının hazır olduğunu kanıtlamaz.

Bu özellik açılmadan önce ilk işletmecilerin servislerini ve adreslerini genel kullanıma sunmayı kabul etmesi gerekir. Kimlik taklidi, eski duyuru, erişim reddi/iptali, kapasite sınırı ve başlangıç düğümü kaybı denenmelidir. Mevcut yanıt kontrolü bu özelliklerin yerine geçmez.
