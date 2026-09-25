# Bağlantılar ve destekçi keşfi

Preview.8 için [bağlantı kodu ve otomatik güncellenen ağ listesi](ag-kodu.md) daha kolay kurulum sağlar. Bu sayfa işletmecilerin ve eski kullanıcıların kullanabildiği JSON biçimini açıklar.

## Şu anki masaüstü

Bağlantı yoksa ilk açılışta **Connect to Mesh** ekranı açılır. Profil içe aktarılır. Varsayılan **Add to my existing connections**, eski kaynakları koruyarak yenilerini ekler. **Replace my connections** özellikle seçilirse liste değiştirilir. Sınırlar: 16 Mesh peer, 8 RPC kaynağı, 16 ham Arweave düğümü.

**Your connections**, uygulamaya eklenmiş servis adreslerini gösterir. **Check connections**, bu IP'lere sınırlı istek gönderir. Mesh kontrolü indeksleme veya içerik indirme başlatmaz. Yanıt gelmesi yalnız o anda beklenen protokolde cevap alındığını gösterir; geliştiricinin kimliğini, isim güncelliğini veya bütün sitelerin açılacağını kanıtlamaz.

**Export profile**, yalnız bağlantı adreslerini içeren JSON üretir. Kimlik anahtarı, geçmiş ve saklanan sayfalar eklenmez. Yalnız paylaşma iznin olan servisleri paylaş. Dosya dışa aktarmak bilgisayarını sunucuya dönüştürmez; başka bir işletmecinin RPC hizmeti için izin sağlamaz.

## İlk profil kimden alınacak?

Seni davet eden destekçiden iste. Destekçi tanımıyorsan [repo sahibine veya gönüllülere bağlantı profili talebi aç](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). Bu herkese açık bir koordinasyon kanalıdır; otomatik hizmet veya yanıt garantisi değildir. Özel tanı dosyalarını ekleme.

Şu an pakette doğrulanmış genel destekçi rehberi yok. Bir işletmeci çalışır profil sunana kadar genel önizleme canlı isimleri açamaz. Repodaki örnek JSON çalışır ağ değildir. Destekçi, içerik kaynağının yanında kullanımına izin verilen bir IP tabanlı Solana RPC de sağlamalı veya göstermelidir. Mesh peer olmak otomatik olarak Solana RPC sunmak anlamına gelmez.

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

En az bir RPC ve en az bir Mesh **veya** ham Arweave kaynağı gerekir. Yalnız peer’lerden kopyalayan yapı ham düğüm olmadan çalışabilir; preview.7’de gösterilen ham keşif için çalışan ham kaynak gerekir. Sınırlar: 16 Mesh, 8 RPC, 16 ham adres ve 8 KiB profil dosyası. IPv4 `IP:port` ve köşeli parantezli IPv6 `[adres]:port` kabul edilir; domain, URL, yol, parola veya API anahtarı parametresi kabul edilmez. Biçimin kabul edilmesi uçtan uca IPv6 kurulumunun denendiği anlamına gelmez.

Bir sağlayıcının domainini rastgele IP ile değiştirince TLS/API anahtarlı hizmetinin çalışacağını varsayma; bu taşıma biçimine uygun adres iste. Mesh portunu üç alana da yazma: her alan kendi servisini gerektirir. Kullanıcılara dağıtılacak dosyada `0.0.0.0` veya `127.0.0.1` yerine dışarıdan erişilebilir hedef bulunmalı. Yerel ağ adresi yalnız o ağa erişebilen kullanıcılar içindir.

Profil adres taşır; sunucu kimlik sertifikası, erişim anahtarı veya saklanmış site değildir. Alıcının listelenen servislere ağ erişimi ve kullanım izni gerekir; servis kapasitesi de yeterli olmalıdır. Dosya firewall aşmaz veya erişim onayı mekanizması kurmaz.

## İşletmecinin iki profili

| Rehberdeki dosya | Kimin bağlantılarını ayarlar? | Hangi Mesh adresleri yazılır? |
|---|---|---|
| `mesh-upstream.json` | Yeni destekçi sunucu | Veri/kayıt alabileceği mevcut faydalı kaynak peer’ler |
| `mesh-connect.json` | Kullanıcılar veya yeni sunucudan yararlanacak diğer destekçiler | Yeni destekçinin dışarıdan erişilebilir adresi; isteğe göre başka bağımsız kaynaklar |

İkisi de **aynı dosya biçimini** kullanır; isimleri programın davranışını değiştirmez. Kaynak profilini aynen paylaşmak yeni peer’i eklemez. Boş düğümü yalnız kendisine bağlamak içerik sağlamaz. Kullanıcı dosyasını üretip denemek için [destekçi rehberini](destekci.md#5-kullanıcılara-nasıl-vereceksin) izle. Kullanıcı masaüstünden içe aktarır; destekçi kaynak profilini kurulumda veya peer durmuşken `scripts/profile.mjs apply` ile uygular.

Kesinti öncesi kullandığın profilleri sakla. IP/port veya kullanım izni değişirse işletmeci yeni dosya vermeli, kullanıcı yeniden aktarmalıdır. **Add** önceki adresleri korur; eskileri çıkarmak için **Replace** seçimini bilinçli yap. Birden fazla adres ancak bağımsız, erişilebilir ve faydalı veriye sahip kaynaklarsa yedeklilik sağlar; her arka plan RPC işlemi otomatik yedeğe geçmez.

## Sonraki adım önerisi — henüz uygulanmadı

Uygulamada **Supporters** ekranı geliştirici kimliğini, son yanıt zamanını, sunulan hizmetleri ve erişimin açık mı onaylı mı olduğunu gösterebilir. Onaylı erişimde istek/kabul işleminin sunucuda gerçekten uygulandığı kimlik doğrulamalı protokol gerekir. Yalnız bir düğme eklemek yeterli değildir. Okuyucu bağlantı anahtarı cüzdandan ayrı olmalıdır.

İlk keşif için yine en az bir bilinen, erişilebilir IP gerekir. Zorunlu merkezi bir site yerine süreli ve imzalı duyurular birden fazla bağımsız başlangıç peer'inde çoğaltılabilir. Saklanan duyurunun ne zaman görüldüğü gösterilir. Tek VPS veya tek Raspberry Pi yine tek hata noktasıdır.

Bu özellik açılmadan önce ilk işletmecilerin servislerini ve adreslerini genel kullanıma sunmayı kabul etmesi gerekir. Kimlik taklidi, eski duyuru, erişim reddi/iptali, kapasite sınırı ve başlangıç düğümü kaybı denenmelidir. Mevcut yanıt kontrolü bu özelliklerin yerine geçmez.
