# Destekçinin bağımsız erişimini kontrol et

[English](../en/resilience.md) · [Tam destekçi kurulumu](destekci.md)

Amaç, ilk sunucu erişilemez olduğunda okuyucuların aynı Mesh ağıyla devam etmesidir. **0.6.0 keşfi, güncel hazırlığı ve saklanan içeriğin hazır olmasını ayrı gösterir.** Çalışan servis ile eksiksiz içerik kopyası aynı durum değildir.

## İlk sunucu zaten erişilemezse

Yeni geliştirici ilk işletmeciyle görüşmeden [standart kurulumu](destekci.md) yapabilir. Genel topluluk ağı, mevcut kodla aynı yetkilinin imzaladığı ve sürüme eklenen ağ tanımını kullanır. Başka ağlarda bağımsız imzalı davet kullanılır. Geliştirici kendi erişilebilir sayısal IP adresini belirtir; Mesh aynı ağın sayısal IP keşif yollarıyla destekçiyi bulur ve duyurur.

Bu bağımsız keşif için okuyucular da 0.6.0 olmalıdır. 0.5.1'in eski başlangıç/adres öğrenme davranışı güncellemeden değişmez. Mevcut topluluk kodu aynı ağı tanımaya devam eder; kullanıcı yeni geliştiricinin ayrı ağına geçmez.

Bağımsız RPC ve içerik kaynakları erişilebilirken yeni sunucu güncel isimleri izler, dosyaları doğrulayarak hazırlar. İlk sunucunun yokluğu sağlıklı yolları kapatmaz. Bütün kaynak yolları da kesilmişse gerekli kabul edilen kayıtlar ve dosyalar başka bir Mesh kopyasından alınmalıdır. Hiçbir erişilebilir kaynağın tutmadığı bilgi yeniden üretilemez.

Adres keşfi, o sunucuya ArNS isimlerini değiştirme yetkisi vermez. Çoğaltılan kaydın özgün imzası korunur.

## Standart kurulum neyi hazırlar?

İki kapasite profili de sürekli isim takibini, geniş hedef taramasını, imzalı kayıt çoğaltmayı ve otomatik dosya hazırlamayı açar. R84 de kuruluma dahildir. Yeni destekçi kendi kimliğini ve diskini kullanır; ilk sunucunun özel verisi kopyalanmaz.

| Katman | Beklenen sonuç |
|---|---|
| Keşif | İlk sunucuya bağlanmadan destekçinin bulunması |
| İsim | Güncel bağımsız kontrol veya istenen sürüme ait kabul edilen saklanmış kayıt |
| İçerik | Konum ipucu yerine gerçek doğrulanmış dosyaların sunulması |
| Hazır dosya seti | Kök dosya ve desteklenen manifest/statik kaynakların saklanması |
| Kapasite | Hazırlığın devam edebileceği disk ve günlük bütçe |
| Bağımsızlık | İlk sunucu dışarıda bırakılmışken ayrı okuyucunun başarılı olması |

İsim takibi içerik bütçesinden ayrıdır. Çoğaltmanın günlük bütçesi VPS için **8 GiB**, Pi için **2 GiB**; normal içerik hazırlığı ve R84 bütçesi buna ek olarak ayrıdır. Dolu disk veya biten kota hazır olmayan iş olarak görünür. Sınırı artırmak dosyaları kendiliğinden oluşturmaz.

## 1. Sunucuda hazırlığı incele

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
node scripts/check-supporter.mjs --data "$MESH_ROOT/data" --json
```

Rapor; kabul edilen isimleri, saklanan kökleri, tamamlanmış dosya setlerini, çoğaltmayı, indeksi, güven durumunu ve duyurulan adresi gösterir. Yerel rapor her zaman ayrı okuyucu kontrolü ister. Bu kontrol kendi sonucunu verir; yerel rapora dışarıdan erişim sertifikası yazmaz. Çıkış kodu **2**, hazırlık veya doğrulamanın sürdüğünü/eksik olduğunu belirtir.

Öncelikli isimler için destekçiyi durdurup mevcut `data/peer-pins.json` listesini diğer kayıtları koruyarak düzenle, ardından başlat. En fazla 16 açık öncelik kabul edilir:

```json
["vevivo"]
```

Otomatik hazırlık bu isimlerle sınırlı değildir. Başka destekçinin özel kimliğini kopyalama.

## 2. Başka bilgisayardan saklanan içeriği sına

Ayrı kontrol makinesinde aynı kaynak sürümünü ve bağımlılıklarını kullan. Gerçek IP/portları yaz. Topluluk kodu imzalı paket tanımından okunabilir; başka ağ için kendi davetini ver.

```bash
MESH_CODE="$(node scripts/community-network.mjs)"
node scripts/check-supporter.mjs \
  --peer SECOND_SUPPORTER_IP:49741 \
  --code "$MESH_CODE" \
  --name vevivo \
  --exclude ORIGINAL_SUPPORTER_IP:49740 \
  --json
unset MESH_CODE
```

En fazla 32 isim için `--name` tekrarlanabilir. Kontrol yalnızca seçilen destekçiye gider, saklanmış dosyaları ister, kabul edilen imzalı isim kaydını ve kök/manifest/statik kaynakları doğrular. RPC, ham Arweave, DHT veya okuyucunun sıcak disk önbelleğini kullanmaz; eksik dosyayı ilk sunucudan getirmesini istemez.

**0** belirtilen isimlerin kontrol makinesinden geçtiğini; **2** eksik kayıt/dosya, bağlantı/imza sorunu veya sınır olduğunu belirtir. Tarih, isim ve hedeflerle sonucu sakla. Başarı bütün ArNS sitelerinin veya harici uygulama API'lerinin hazır olduğu anlamına gelmez.

## 3. Keşfi ve normal kullanımı ayrıca sına

Adres vererek yapılan kontrol hizmeti kanıtlar; otomatik keşfi ayrıca test et. Üretimi durdurmadan yalıtılmış bir ortamda boş **0.6.0 okuyucu profili** kullan:

1. İlk sunucuyu yalnızca test ortamından erişilemez yap.
2. B'nin adresini elle girmeden aynı desteklenen kodla katıl.
3. Okuyucunun B'yi öğrendiğini ve isimleri ondan açtığını doğrula.
4. Test okuyucusunu yeniden başlatıp tekrarla.
5. RPC/Arweave yolları da kesildiğinde saklanmış erişim iddiası varsa, bu yolları yalıtılmış okuyucu/destekçi ortamında da engelleyerek hazır içerikleri yeniden sına. Eksik kaynakları kaydet.

Önbellek istemiyle API testi, işletim sistemi güvenlik duvarı testi değildir. Tek makinedeki iki süreç protokolü sınar; gerçek makine arızasına karşı bağımsızlık için ayrı makine/sağlayıcı gerekir.

Kaynaklar sağlıklıyken toplamayı açık bırak; kayıt tarihlerini, hazırlık hatalarını, bütçeyi ve boş alanı izle. Yeni içerik doğrulanana kadar son tamamlanmış sürüm korunur. R84 girişleri site kopyası sayısı değildir. Dinamik harici API'ler ayrıca erişim gerektirebilir.

Bütün keşif yolları ve bilinen adresler erişilemezse yeni erişilebilir giriş gerekir. Hiçbir kopyanın tutmadığı dosya veya kabul edilen isim kaydı için saklanmış erişim hazır değildir; rapor bunu açıkça gösterir.
