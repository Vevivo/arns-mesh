# Destekçiye imzalı R84 indeksi ekleyin

[English / komutların tamamı](../shared-index.md) · [Destekçi kurulumu](destekci.md)

Bu özellik **sunucuda çalışır**. Masaüstü kullanıcısı büyük indeksi indirmez; preview.13'ü yeniden kurması gerekmez. Temel destekçi kurulumu da indeksi kendiliğinden indirmez.

## Ne sağlar?

İndeks, içerik kimliğinin Arweave'de hangi pakette ve hangi konumda bulunduğunu söyler. Mesh destekçisi bu soruya kendi diskinden cevap verir. Okuyucu ulaşılabilir kaynaktan gerçek dosyayı alıp doğrular.

İsim çözümü, konum bulma ve dosya saklama ayrı işlerdir. RPC ve ham Arweave erişilmezse isim kaydı ve gerçek dosyalar destekçide önceden bulunmalıdır. İndeks dosyanın yedeği değildir.

## İki ayrı süreç

- **Güncelleyici:** Yayıncıyı yapılandırırken ve imzalı indeksleri yenilerken DNS/HTTPS kullanır.
- **Mesh hizmeti:** Kurulmuş indeksi diskten okur. Bu sorgu yayıncı domainine erişim gerektirmez.

İmza, dosya boyutu, hash ve indeks işaretçileri denetlenir. Bir bölüm ancak tamamı doğrulanınca kullanıma girer. Yenileme başarısız olduğunda kurulu bölümler kullanılmaya devam eder; eski yayınlar “stale” olarak gösterilir.

Mevcut Mesh güncelleyicisi HTTPS kullanır; otomatik x402 ödeme yapmaz. [Resmî AR.IO indeks paylaşımı rehberi](https://docs.ar.io/build/run-a-gateway/manage/index-sharing).

## Kurulum sırası

Komutların tamamı tek yerde tutulur: **[R84 sunucu kurulum sayfası](../shared-index.md)**. Yeni destekçide şu sırayı izleyin:

1. [Destekçi rehberindeki](destekci.md) sabit kaynak sürümünü kurun. İçerik alanına ek olarak SSD'de en az **50 GiB boş alan** ayırın.
2. İndirme için ayrı `mesh-index-sync` sistem hesabı oluşturun. Güncelleyici destekçinin özel anahtarlarını okuyamamalıdır.
3. `configure-shared-index.mjs` ile yayıncının kayıtlı gözlemci anahtarını sabitleyin. Yazdırılan HTTPS adresini kontrol edin. Cüzdan, bakiye veya özel imza anahtarı gerekmez.
4. Sayfadaki sınırlı kaynak kullanan hizmeti ve zamanlayıcıyı kurun. Mevcut dosyalara karşı korumalar çalışan kurulumun üzerine yazmayı engeller.
5. Yeni destekçinin `peer.env` dosyasına `ARNS_SHARED_INDEX_DIR=/var/lib/arns-mesh-shared-index` ekleyin. İlk bölümden sonra okuma iznini kontrol edip yalnızca bu destekçiyi bir kez yeniden başlatın.
6. `sync-status.json`, `installed.json` ve işletmeci raporundaki `sharedIndex` alanını kontrol edin. Sonraki bölüm yenilemeleri için destekçiyi yeniden başlatmak gerekmez.

Standart yenileme bütçesi UTC günü başına **4 GiB**, disk sınırı **50 GiB**'dir. İsteğe bağlı ilk kurulum ayarı, tam eşitleme başarılı olana kadar günlük **24 GiB**'ye izin verir; başarıdan sonra kaldırılır. Uzun süren ilk indirmede bu geçici bütçeyi gözden geçirin. Bunlar içerik ve isim hazırlığı bütçelerinden ayrıdır.

Zamanlayıcı her tamamlanan/başarısız denemeden 15 dakika sonra yeniden çalışır. Aynı dizinde ikinci elle güncelleyici başlatmayın. İlk indirme için kesin bitiş süresi yoktur.

## Hata veya bekleme varsa

| Durum | Anlamı |
|---|---|
| HTTP 402 | Yayıncının ödeme/erişim politikası dosyayı engelliyor; Mesh kendiliğinden ödeme yapmaz |
| HTTP 429 | Yayıncı hız sınırı; yeniden denemeden önce zaman tanıyın |
| HTTP 504 | Kaynak tarafında zaman aşımı; sonraki deneme devam edebilir |
| Günlük indirme bütçesi dolu | İndeks güncelleyicisinin ayrı bütçesi bitmiş |
| İmza/hash hatası | Bölüm kabul edilmez; doğrulamayı kapatmayın |
| İndeks var, site yok | İsim eşleşmesini ve gerçek dosyaları kontrol edin |

Başarısız yenilemede kurulmuş bölümleri silmeyin. İndeks kayıt sayısı, site sayısı veya başarıyla açılan sayfa sayısı değildir.

[İlk entegrasyon kanıtı](../validation/index-sharing-2026-10-05.md) · [Son okuma kontrolü](../validation/read-only-status-2026-10-06.md) · [Kesintiye hazırlık](dayaniklilik.md).
