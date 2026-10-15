# İsim tanığı pilotuna katılma

[English](../en/name-witness-pilot.md) · [Normal destekçi kurulumu](destekci.md) · [Ayrıntılı tanık kaydı](../en/name-witness-setup.md)

**Mesh'in çalışması için önce dört gönüllü bulunması gerekmiyor.** Normal destekçi, doğrulanmış site dosyalarını saklar ve kullanıcılara ulaştırır. İsteğe bağlı isim tanığı pilotu ise ayrı bir koruma ekler: tek bir destekçi, bir ArNS isminin hangi içerik kimliğine gideceğine tek başına karar veremez.

Bu rehber **0.6.3-preview.2 geliştirme adayını** anlatır. Rehber hazırlanırken herkese açık yayımlanmış sürüm **0.6.1**, herkese açık main kaynağının sürümü **0.6.2**, bu aday ise yerel geliştirme çalışmasıdır. Yayımlanmış v0.6.2 etiketi yoktur. Pilot canlı üretim ağına etkinleştirilmiş değildir. Aşağıdaki aday komutları için geliştiricinin incelemeye sunduğu kesin kaynak commit'ini veya paketi kullanın; yayımlanmış bir aday etiketi varmış gibi davranmayın.

## Nasıl destek olabilirsiniz?

| Rol | Sağladığı katkı | Bağımsız isim oyu verir mi? |
| --- | --- | --- |
| İçerik destekçisi | Site dosyaları, hazırlama, kopyalama ve ek erişim yolu | Hayır. Yeni sunucu eklemek tanık politikasını değiştirmez. |
| İsim tanığı | Kendi kontrolündeki imza anahtarı, kalıcı imzalama geçmişi ve kontrol edilmiş güncel zincir gözlemleri | Evet; ancak işletmecisi ve açık anahtarı doğrulanmış pilot politikasına alınmışsa. |
| İkisi birlikte | Aynı sunucuda içerik hizmeti ve kayıtlı isim tanığı | Sunucu sayısından bağımsız olarak bir işletmecinin oyu. |

Bugün erişime katkı vermek için [normal destekçi kurulumunu](destekci.md) izleyebilirsiniz; o kurulum için gerçekten incelenmiş kaynak/sürümü kullanın. Mevcut depolama, R84 ve hazırlama akışı değişmez. Tanık olmak veya dört kişiyi beklemek gerekmez.

Normal kaynak kurulumu için kayda alınan 0.6.2 kaynak noktası [2520b305c85983f4b7c2f76306715e2396a049a5](https://github.com/Vevivo/arns-mesh/tree/2520b305c85983f4b7c2f76306715e2396a049a5) commit'idir. Bu kaynağı yeniden üretirken var olmayan v0.6.2 etiketi yerine bu kesin commit kullanılabilir. Bu eski kaynak noktası yeni isim tanığı adayını içermez.

Pilotun başlangıç düzeni **dört bağımsız işletmeci, üç uyuşan imza ve en fazla bir hatalı işletmeci** varsayımıdır. On gönüllü de katkı verebilir; hepsi içerik sunabilir. Onunun da bağımsız isim tanığı olması isteniyorsa listeyi **etkinleştirmeden önce** buna göre oluşturun: on işletmecili politika **yedi uyuşan imza isteyip en fazla üç hatalı işletmeciyi** tolere edebilir. Eşik, çevrimiçi sunucu sayısından otomatik hesaplanmaz.

Aynı kişinin yönettiği birkaç sunucu, anahtar veya aktarılan imza kopyası bağımsız işletmeci sayısını artırmaz. Politikadaki domain alanı DNS adresi değil, bağımsız yönetim grubudur. Testlerde dört anahtar üretmek gerçek dünyada dört bağımsız işletmeci oluşturmaz. Ortak RPC sağlayıcıları da ortak arıza veya yanlış gözlem riski yaratabilir.

Korunan güncel erişim, politikadaki eşik kadar geçerli kanıt gerektirir. Kesintide ise **tek bir ulaşılabilir destekçi, önceden oluşturulmuş tam sertifikayı ve doğrulanmış dosyaları sunabilir**. Sertifikadaki üç özgün imzayı denetlemek için o üç işletmeciye yeniden bağlanmak gerekmez. Süresi geçmiş kanıt güncel diye gösterilmez. Yeni okuyucu bu geçmiş kanıtı ancak sabitlenmiş politika hâlâ etkinse ilk kez kabul edebilir; politika bittikten sonra yalnızca o okuyucunun daha önce kabul ettiği tam geçmiş kopya kullanılabilir. [Güven modelinin ayrıntıları](../en/name-security.md).

## 1. Ayrı bir pilot kurulumu hazırlayın

Linux, Node 24, dosya ve dizin fsync işlemlerini destekleyen kalıcı yerel disk ve doğru saat kullanın. **Yeni pilot veri ve anahtar dizinleri** oluşturun. Üretim destekçisi zaten çalışıyorsa ayrı sanal makine en anlaşılır seçenektir. Normal kurulum betiğini mevcut üretim kurulumunun üstünde pilot oluşturmak için çalıştırmayın; yönetilen servis adları ve indeks güncelleyicisi ortak kaynaklardır.

İncelenmiş aday kaynak dizininde:

~~~sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
umask 077
PILOT_ROOT="$HOME/.local/share/ArNS-Mesh-Name-Pilot"
PILOT_DATA="$PILOT_ROOT/peer-data"
WITNESS_DATA="$PILOT_ROOT/witness"
mkdir -p "$PILOT_DATA"
node scripts/name-witness.mjs keygen --data-dir "$WITNESS_DATA"
~~~

Anahtar komutu yeni witness dizinini kendisi oluşturur. Üretim kimliğini veya başka bir işletmecinin özel anahtarını kopyalamayın. Üretim içerikleri ve indeksleri mevcut yerinde kalsın.

Pilot listesini hazırlayan kişiye yalnızca şunları iletin:

- Üretilen **public-key.pem** ve komutun gösterdiği açık anahtar kimliği.
- İşletmeci adınız; anahtar, sunucu ve RPC kaynaklarını kimin yönettiği.
- **Gerçek, ulaşılabilir sayısal IP adresiniz ve kullanılmayan TCP portunuz**; DHT erişiminizin durumu.
- Çalıştırdığınız kaynak commit'i ve yerel test sonuçları.

private-key.pem, signer-state, kayıt dosyaları ve özel servis ayarları paylaşılmaz. Bu rehber gerçek işletmeci adresi sağlamıyor; bütün IP/port yer tutucularını anlaşılan gerçek değerlerle değiştirin. Aynı kişinin dört adresi dört bağımsız işletmeci değildir.

## 2. Ortak politikayı inceleyip kimliğini doğrulayın

Listeyi hazırlayan kişi açık anahtarları toplar. Dosya biçimi şöyledir; örnek adları ve PEM yer tutucularını gerçek açık anahtarlarla değiştirin:

~~~json
{
  "schema": "arns-mesh-name-witness-roster/v1",
  "witnesses": [
    {"domain": "operator-a", "publicKeyPem": "A ISLETMECISININ ACIK ANAHTAR PEM ICERIGI"},
    {"domain": "operator-b", "publicKeyPem": "B ISLETMECISININ ACIK ANAHTAR PEM ICERIGI"},
    {"domain": "operator-c", "publicKeyPem": "C ISLETMECISININ ACIK ANAHTAR PEM ICERIGI"},
    {"domain": "operator-d", "publicKeyPem": "D ISLETMECISININ ACIK ANAHTAR PEM ICERIGI"}
  ]
}
~~~

Pilot ağ kimliği, gerçek Solana genesis hash'i, registry program kimliği, işletmeci listesi, imza eşiği, tur süresi, sabit geçerlilik uzatması ve politika başlangıç/bitişi üzerinde anlaşın. Sadece “mainnet” demek zinciri yeterince tanımlamaz. Bu bilgileri işletmecilerin bilinen kimlikleri üzerinden ayrıca doğrulayın.

Politikayı hazırlayan kişi şu komutu kullanır:

~~~sh
node scripts/name-witness-policy.mjs create \
  --roster reviewed-roster.json \
  --network-id AGREED_PILOT_NETWORK_ID \
  --genesis-hash VERIFIED_SOLANA_GENESIS_HASH \
  --registry-program-id VERIFIED_REGISTRY_PROGRAM_ID \
  --max-faults 1 --threshold 3 \
  --round-ms 60000 --lease-ms 0 --max-future-skew-ms 1000 \
  --valid-from AGREED_START_ISO_UTC \
  --valid-until AGREED_END_ISO_UTC \
  --output name-witness-policy.json
~~~

Tarih yer tutucuları yerine pilot için anlaşılan gerçek UTC tarihleri yazılır. Buradaki 60 saniyelik tur ve sıfır ek süre, kanıtın tur sınırında bitmesi anlamına gelir. Bu bir pilot ayarıdır; anlık küresel güncellik iddiası değildir. Saat doğruluğunu ve imza toplama gecikmesini göz önünde bulundurun.

Her işletmeci, **politika kimliğini güvenilir kimlik doğrulaması yapılan bir kanaldan** alır ve dosyayı kontrol eder:

~~~sh
node scripts/name-witness-policy.mjs check \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID
~~~

İndirdiğiniz dosyanın hash'ini hesaplamak tek başına onu kimin onayladığını kanıtlamaz. Kimliği ve işletmeci listesini ayrıca karşılaştırın. Kontrol etkin ve iptal edilmemiş politika ister; uygulama ve kayıt için anlaşılan başlangıç saatini bekleyin.

**Bu pilotta işletmeci listesini sabit tutun.** Tanık eklemek/çıkarmak, eşiği veya bitiş tarihini değiştirmek ve anahtar yenilemek politika kimliğini değiştirir. Korunan mevcut kurulumlar bu değişimi bilinçli olarak reddeder; otomatik politika geçişi henüz yoktur. Engel dosyalarını veya geçmişi silerek bunu aşmayın. Yeni liste, incelenmiş bir geçiş uygulaması veya yeni kimlik ve anahtarlarla ayrı bir pilot gerektirir.

## 3. Korunan profili uygulayın ve tanığı kaydedin

Pilot yöneticisi, aynı politikayı nameWitnessPolicy alanında taşıyan; anlaşılan sayısal destekçi adreslerini ve kullanılabilir RPC/içerik yollarını içeren incelenmiş bağlantı profilini sağlar. Politika eklemek kendi başına başka tanık sunucular oluşturmaz.

Koordinatör gerçek adresler ve doğrulanmış politika kimliğiyle profili oluşturur. Yalnızca tanık örneği aşağıdaki işletmeciye özel RPC dosyalarını kullandığı için ortak RPC/içerik yolları gerektirmez:

~~~sh
node scripts/profile.mjs \
  --peer OPERATOR_A_REAL_IP:49751 \
  --peer OPERATOR_B_REAL_IP:49751 \
  --peer OPERATOR_C_REAL_IP:49751 \
  --peer OPERATOR_D_REAL_IP:49751 \
  --name-policy name-witness-policy.json \
  --name-policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --output protected-pilot-profile.json
node scripts/profile.mjs check protected-pilot-profile.json
~~~

Her yer tutucuyu gerçek sayısal adresle değiştirin. İçerik destekçileri/okuyucular için incelenmiş yolları --rpc IP:PORT, --arweave IP:PORT ve gerekiyorsa --trust-peer PUBLIC_PEER_ID seçenekleriyle ekleyin; her seçenek tekrarlanabilir. Bu işlem kontrol edilen politikayı içeren yeni profil dosyası oluşturur; mevcut çıktının üstüne yazmaz. Servis başlatmaz, bağlantı kodu üretmez ve koordinatörün kimliğini doğrulamaz. Her işletmeci uygulamadan önce aynı politika kimliğini ayrıca doğrular.

Her tanık, ortak profilden ayrı **kendi RPC kaynak dosyasını** da yönetmelidir. İşletmecinin doğruladığı JSON listesini "$PILOT_ROOT/witness-rpc-seeds.private.json" konumuna kaydedin. Örnek biçim: `[{"host":"YOUR_VERIFIED_NUMERIC_RPC_IP","port":8899}]`. Yer tutucuyu ve portu gerçek değerlerle değiştirin. Alan adı veya URL yerine sayısal IP kullanın; bu adres biçimine özel erişim bilgisi eklemeyin. Kaynağı ve zincir/genesis bilgisini doğrulayın. Dört işletmecinin aynı ortak RPC listesini otomatik devralması, bağımsız gözlem kaynakları oluşturmaz.

Komutlarda pilot sürecinin gerçekten kullanacağı **peer-data dizinini** belirtin; bu, özel anahtar dizininden ayrıdır:

~~~sh
node scripts/profile.mjs check protected-pilot-profile.json
node scripts/profile.mjs apply protected-pilot-profile.json "$PILOT_DATA"

node scripts/name-witness.mjs enroll \
  --data-dir "$WITNESS_DATA" \
  --peer-data-dir "$PILOT_DATA" \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --rpc-seeds "$PILOT_ROOT/witness-rpc-seeds.private.json" \
  --max-names 50000
~~~

Kayıt bir defalıktır ve runtime-env.json üretir. Bu dört değeri pilot süreç/servisinin ortam değişkenlerine aynen girin:

| Değişken | Değer |
| --- | --- |
| ARNS_NAME_SIGNER_KEY | runtime-env.json içindeki özel anahtar dosyası yolu |
| ARNS_NAME_SIGNER_STATE | Kalıcı imzalama geçmişi dizini |
| ARNS_NAME_SIGNER_EPOCH | Üretilen epoch değeri, aynen |
| ARNS_NAME_SIGNER_RPC_SEEDS | Bu işletmecinin ayrı, doğrulanmış sayısal IP RPC kaynak dosyası |

runtime-env.json bir JSON dosyasıdır, kabuk betiği olarak çalıştırılmaz. ARNS_NAME_SIGNER_RPC_SEEDS, ortak profilin normal RPC yollarındaki değişikliklerin bu tanığın gözlem kaynağını sessizce değiştirmesini önler. Pilotu üretimin peer-data dizinine yöneltmeyin. İmza geçmişi kayıp veya belirsizse aynı anahtarla boş geçmişten başlamak yerine kurtarma sürecini uygulayın. [Kayıt ve kurtarma ayrıntıları](../en/name-witness-setup.md).

### Yalnızca isim tanığı için gözetimli başlangıç

Bütün işletmeciler aynı politikayı kabul ettikten sonra **site hazırlamayan isim tanığı** için bu ön plan tarifini kullanın. Önce yukarıdaki dört ortam değişkenini ayarlayın, ardından:

~~~sh
export ARNS_MESH_DATA="$PILOT_DATA"
export MESH_ADVERTISE="YOUR_REAL_PUBLIC_IP:49751"
export ARNS_UPSTREAM_FETCH=0
export ARNS_CATALOG_ENABLED=0
export ARNS_ONLINE_PREPARATION=0
export ARNS_PREPARE_ENABLED=0
export ARNS_REPLICATION_ENABLED=0
node apps/peer/main.mjs --listen 0.0.0.0:49751 --name AGREED_TEST_ARNS_NAME
~~~

Bu ayarlar normal dış kaynak içerik indirmesini, kataloğu, hazırlama işçilerini ve içerik kopyalamayı kapatır. Kayıtlı tanığın ARNS_NAME_SIGNER_RPC_SEEDS kullanan açık RPC gözlemcisini kapatmaz. --pin yerine --name kullanılır: bu tarif site dosyalarını hazırlamaz ve bunları sunmayı vaat etmez. Kimlik, imzalama geçmişi ve sertifika bilgileri yine kalıcı alan gerektirir. Gerçek bir isim ve kullanılmayan port seçip gerekli TCP/keşif yollarını açın.

Tarif kaynak ayarlarıyla karşılaştırılmıştır; gerçek Linux başlangıcı, ağ ve bağımsız işletmeci kabulü hâlâ sınanmalıdır. Daha önce başarılı biçimde yapılmış bir dağıtım olarak sunulmuyor. Kontroller geçene kadar ön plan sürecini gözetimli çalıştırın; sonrasında aynı ortam ve dizinlerle ayrı pilot servisi oluşturun.

### İçerik destekçisi veya iki rol birlikte

[Tam destekçi kurulumu](destekci.md), depolama kapasitesini, R84 indekslerini, otomatik hazırlamayı ve kopyalamayı içerir. Yukarıdaki yalnızca tanık ayarları bu görevleri özellikle dışarıda bırakır. Korunan site sunumunu sınamak için incelenmiş aday ve aynı korunan politikayla **ayrı bir pilot içerik destekçisi** de hazırlayın; onun normal hazırlama ayarları ve içerik bütçeleri olsun. Yalnızca içerik sunan pilot destekçisi tanık özel anahtarına ihtiyaç duymaz; özgün sertifikaları toplayıp aktarabilir. Bir işletmeci iki rolü de üstleniyorsa tek tanık anahtarını yukarıdaki gibi kaydedip yalnızca tanık bayrakları yerine tam içerik yapılandırmasını kullanır. Pilot sırasında çalışan üretim kurulumuna yeni politika uygulamayın.

## 4. Gerçek kabul kontrollerini yapın

Linux pilot makinesinde yerel dosya sistemi/kayıt ve gerçek HTTP testlerini çalıştırın:

~~~sh
node --test \
  tests/sharded-name-state-native.test.mjs \
  tests/name-witness-cli-native.test.mjs \
  tests/name-certificate-http.test.mjs
~~~

Bu testlerde hata senaryoları için örnek işletmeci anahtarları kullanılır. Test başarısı, gerçek işletmeci bağımsızlığı veya canlı DHT erişimi kanıtı değildir. Atlanan Linux testi ya da engellenen soket, başarılı test sayılmaz.

Başka bir makineden her gerçek destekçi adresini kontrol edin:

~~~sh
node scripts/probe-peer.mjs YOUR_REAL_PUBLIC_IP:49751
~~~

Yanıt almak yalnızca erişilebilirliği gösterir. Pilot yöneticisi, aynı politikayı taşıyan ve kimliği doğrulanmış **korunan pilot bağlantı kodunu/profilini**, ayrı bir aday okuyucuya da vermelidir. Normal topluluk kodu bu pilotu etkinleştirmez.

Önce gerçek işletmecilerden güncel isim kanıtını kontrol edin:

~~~sh
node scripts/check-name-witnesses.mjs \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --name AGREED_TEST_ARNS_NAME \
  --peer OPERATOR_A_REAL_IP:49751 \
  --peer OPERATOR_B_REAL_IP:49751 \
  --peer OPERATOR_C_REAL_IP:49751 \
  --peer OPERATOR_D_REAL_IP:49751 \
  --mode current --timeout-ms 12000
~~~

Bu araç doğrudan sayısal IP istekleriyle özgün çoğunluk imzalarını denetler. Site dosyalarını, DHT keşfini, gerçek işletmeci bağımsızlığını veya anlık küresel güncelliği kanıtlamaz. Sürecin çalışıyor görünmesi, çoğunluk kontrolünün geçtiği anlamına gelmez. Saklanan kanıtı sınamak için `--mode historical` ile tekrarlayın; özgün tarihler korunmalıdır.

Ardından pilot koduyla saklanan sertifika ve site dosyalarını **hazırlanmış pilot içerik destekçisinde** sınayın; yalnızca isim tanığı sürecini hedeflemeyin:

~~~sh
node scripts/check-supporter.mjs \
  --peer PILOT_CONTENT_SUPPORTER_REAL_IP:49751 \
  --code "$PROTECTED_PILOT_CODE" \
  --name AGREED_TEST_ARNS_NAME \
  --json
~~~

Sonucun anlaşılan politika kimliğini ve eşiği gösterdiğini kontrol edin. Bu işlem seçilen destekçideki saklanan sertifika/dosyaları sınar; yeni imza çoğunluğu veya otomatik keşif kanıtı değildir. Kaynak commit'i, politika kimliği, isimler, içerik kimlikleri, zaman ve dosya kapsamıyla birlikte sonucu kaydedin.

**Yalnızca ayrı pilot ortamında** şu senaryoları tamamlayın:

| Senaryo | Beklenen sonuç |
| --- | --- |
| Üç bağımsız tanık aynı turda aynı kaydı gözler | Yeni okuyucu kaydı kabul eder, site dosyalarını doğrular. |
| Bir tanık erişilemez | Diğer üç tanık yeni sertifika oluşturabilir. |
| Üçten az imza veya aynı imzanın birkaç sunucudan kopyası | Yeni güncel kayıt kabul edilmez; önceden onaylanan tarihli sürüm ayrıca kullanılabilir. |
| Yanlış hedef/imza/politika/ağ veya aynı turda çelişki | Geçersiz kanıt reddedilir; tek imzaya düşülmez. |
| Sertifikanın sabit süresi dolar | Güncel diye gösterilmez, tarihi yenilenmez. |
| Okuyucu ve destekçiler RPC/Arweave erişim yollarını kaybeder | Tam özgün sertifika ve dosyaları olan erişilebilir destekçi tarihli siteyi açar. |
| İlk sunucu dışlanır, adres değişir veya süreç yeniden başlar | Keşif yolları ve saklanan imza/okuyucu geçmişi ayrıca sınanır. Doğrudan IP testi DHT testi yerine geçmez. |
| Sağlıklı yollar varken yeni isim/hedef yayımlanır | Sonraki uygun gözlem kabul edilir ve yeni dosyalar doğrulanır. |
| Paketlenmiş gerçek Windows adayı | Normal açılış, geçmiş, önbellek ve politika reddi kontrolleri gerçek uygulamada da geçer. |

Eksik dosyaları ve başarısızlıkları kaydedin. Sonrasında yalnızca test ortamının erişim yollarını eski hâline getirin. Bu kontroller için çalışan üretim ağını kapatmayın.

## Pilot ne zaman hazır sayılır?

İncelenen listeyi ve politika kimliğini, gerçek işletmeci teyitlerini, aday kaynak commit'ini, Linux/ağ/Windows test sonuçlarını ve sınanan site kapsamını yayımlayın. Açık anahtar ve işletmeci adresleri sahiplerinin onayıyla paylaşılabilir; özel imza verileri paylaşılmaz.

Bu çözüm **yapılandırılmış bağımsız tanıklara dayalıdır**. Solana'nın yerel konsensüs kanıtı veya daha yeni hiçbir güncelleme olmadığı garantisi değildir. Üretime geçiş, pilot kabulünden sonraki ayrı ve incelenmiş uygulamadır. Şimdiye kadar gerçekten yapılan kontroller ve bekleyenler [doğrulama kaydındadır](../validation/name-binding-security-2026-10-15.md).

