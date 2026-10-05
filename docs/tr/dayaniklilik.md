# Ana sunucu kapandığında devralmaya hazırlık

[English](../en/resilience.md) · [Destekçi kurulumu](destekci.md)

Amaç, ağa katılmış okuyucunun A destekçisi erişilemez olduğunda hazırlanmış içeriği B destekçisinden almasıdır. Bunun hazırlığı kesintiden önce yapılır.

## B sunucusunda ne bulunmalı?

| Gereken | Neden? |
|---|---|
| Bağımsız makine ve erişilebilir IP/port | A içindeki ikinci süreç A ile birlikte kapanır |
| Kendine ait destekçi kimliği | A'nın özel kimliğini kopyalamak bağımsız destekçi oluşturmaz |
| Okuyucuların önceden öğrendiği yol | Bilinmeyen adrese kesinti sırasında kendiliğinden ulaşılamaz |
| Seçilen sürüm için kabul edilmiş isim kaydı | Dosya tek başına ArNS isminin anlamını söylemez |
| Gerekli kaynaklarıyla doğrulanmış gerçek dosyalar | Konum indeksi yalnızca verinin yerini gösterir |
| Yeterli disk, bellek ve yükleme kapasitesi | Saklanan kopyanın kullanıcıya sunulabilmesi gerekir |

B, **aynı mevcut ağın davetiyle** katılır, adresini duyurur ve asıl imzalı ağ listesini yansıtır. Güvenilen yayıncının orijinal imzalı isim kayıtlarını aktarabilir. Kendi kimliği otomatik olarak güvenilen isim yayıncısı olmaz.

## Seçilen isimleri hazırlayın

B'yi [güncel rehberle](destekci.md) kurun. Otomatik hazırlık sınırlıdır. Özellikle tutmak istediğiniz küçük liste için desteklenen `peer-pins.json` dosyası en fazla **16** isim kabul eder.

Yalnızca B'nin hizmetini durdurun. B'nin veri klasöründe aşağıdaki dosya yoksa oluşturun. Örnek:

```json
["vevivo"]
```

Yol: `~/.local/share/ArNS-Mesh-Supporter/data/peer-pins.json`. Örneği gerçekten desteklemek istediğiniz isimlerle değiştirin. Dosya varsa üzerine yazmak yerine listeyi inceleyip düzenleyin. Başka destekçinin tüm veri klasörünü kopyalamayın.

B'yi tekrar başlatın:

```bash
systemctl --user start arns-mesh-supporter
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

Hazırlığın ve sonraki durum döngülerinin tamamlanmasını bekleyin. Seçilen isimleri tek tek kontrol edin:

- `savedSites.sites`: hedef kimliği, durum, saklanan/toplam dosya, hata ve `scope`.
- `retainedNames`: toplam sayıdır; seçtiğiniz ismin bulunduğunun kanıtı değildir.
- `snapshotRelay.records` ve istenen isim cevabı: **aynı içerik sürümü** için güvenilen yayıncının orijinal imzalı kaydının bulunduğunu doğrulayın.
- İçerik ve isim bütçeleri: bekleyen kuyruk, hazırlığın bitmediği anlamına gelebilir.

`document-saved` ana belgeyi kapsar. `linked-resources-saved` ve `manifest-saved` desteklenen, sınırlar içinde gezilen dosyaları kapsar. Haricî API'ler ve dinamik kaynaklar kendiliğinden arşivlenmez. Birçok isim aynı hedefi paylaşabilir.

İsim aktarma sınırlıdır: en fazla 512 kayıt, her döngüde küçük gruplar. Bütün isimlerin aynası değildir. Seçilen sürümün kabul edilmiş kaydı yoksa B o isim için RPC'siz kurtarmaya hazır değildir. İşletmeci ek güvenilen yayıncıları imzalı ağ listesiyle yönetebilir; imza kontrolünü kapatmayın veya yetkili özel anahtarı bütün destekçilere kopyalamayın.

## Çalışan ağı kesmeden doğrulayın

Ayrı okuyucu profili ve yalıtılmış test ortamı kullanın. B'yi denemek için A'yı kapatmayın veya üretim güvenlik duvarlarını değiştirmeyin.

1. **İkisi de erişilebilirken:** Test okuyucusunu mevcut ağa katın, B'yi öğrenmesini bekleyin; A/B kimliklerini ve seçilen isimlerin hedeflerini kaydedin. B ayrı makine/ağda olsun.
2. **Dosyanın B'den geldiğini gösterin:** B'yi hedefleyen test kaynak ayarıyla seçilen belgeleri ve kaynakları doğrulayın. B'nin veri sunma sayaçlarını inceleyin; sayaç tek başına sitenin eksiksizliğini kanıtlamaz.
3. **Test okuyucusuna A'yı erişilemez yapın:** Yalnızca yalıtılmış test ortamında A'yı engelleyin. Okuyucu üretim profilini değiştirmeden öğrenilmiş B yolunu kullanabilmelidir.
4. **RPC ve ham Arweave'i de erişilemez yapın:** Test okuyucusunun bu yollarını sınırlayın. B'nin dışarıdan indirmeye ihtiyaç duymadığını sınarken test tarafındaki destekçi ortamını da yalıtın. B'deki tarihli isim kaydı ve önceden saklanmış dosyaları doğrulayın. Tek kaynak okuyucunun sıcak önbelleği olmamalıdır.
5. **Test okuyucusunu yeniden başlatın:** Yolların ve verinin korunmasını yeniden kontrol edin. Eksik kaynakları, süresi geçmiş veya güvenilmeyen kayıtları başarı saymayın.

Yalnızca önbellekten okuyan API kontrolü, elde bulunan veriyi gösterir; işletim sistemi düzeyinde tam ağ yalıtımını kanıtlamaz. Tek HTML belgesinin yanında kullanım için gereken kaynakları da sınayın.

## İlk bağlantı ve uzun kesintiler

Önceden katılmış okuyucular öğrendikleri yolları saklayabilir. **Yeni kurulumun** hâlâ erişilebilir başlangıç adresine ve geçerli imzalı ağ listesine ihtiyacı vardır. İşletmeci kesintiden önce ayakta kalacak giriş noktalarını davet/kaynak listelerine eklemeli, ağ yetkilisinin yenileme ve yedekleme düzenini planlamalıdır. Aynalar yetkilinin imzasını yenileyemez.

B öğrenilmeden bütün başlangıç adresleri kaybolursa yeni ulaşılabilir giriş noktası sağlamak gerekir. Erişilebilen bütün kopyalarda dosya veya isim eşleşmesi eksikse indeks bunları yeniden yaratamaz.

## Mevcut sınır

Adres keşfi, ölçülen içerik kaynağı seçimi ve orijinal imza aktarımı mevcut. **Bağımsız kopyaların otomatik dağıtımı/onarımı, bütün siteleri kapsama ve bağımsız sağlayıcı kaybı kabul testi henüz tamamlanmış değil.**

Devralma sözü vermeden önce işlemi kendi isimleriniz ve makineleriniz için uygulayın. [Ölçülmüş durum](durum.md) · [Protokol sınırları](paylasilan-ag.md).
