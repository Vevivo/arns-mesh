# Destekçide R84 indeksi

[English](../shared-index.md) · [Tam destekçi kurulumu](destekci.md)

**0.6.0 standart destekçi kurulumu R84 adımını içerir.** VPS ve SSD kullanan Pi, isim kayıtları ve doğrulanmış dosyalarla birlikte içerik konum indeksini de hazırlar. İndeks sunucuda tutulur; okuyucunun bilgisayarına indirilmez. Tam AR.IO gateway kurulmaz.

İndeks içerik kimliğinin Arweave paketindeki yerini gösterir. Dosyanın bulunmasını hızlandırır; dosyanın kendisini veya isim kaydını oluşturmaz. Kesintide hizmet için gerçek doğrulanmış kopyalar da gerekir.

## Kurulum ne yapar?

[Destekçi kurucusu](destekci.md), kapasite denetiminden sonra ayrı indeks kurucusunu çalıştırır:

- Etkileşimli oturum açamayan `mesh-index-sync` sistem hesabı oluşturur.
- Kod, bağımlılıklar ve Node çalıştırıcısını `/opt/arns-mesh-index-tools` altında sürümlü ve root sahipliğinde tutar. Destekçinin verileri ve özel anahtarları kopyalanmaz.
- Genel indeks verisini `/var/lib/arns-mesh-shared-index` altında saklar.
- Kısıtlı bir servis ve tamamlanan çalışmadan 15 dakika sonra yenileme yapan zamanlayıcı kurar.
- İlk başarılı indirmeye kadar **UTC günü başına 24 GiB**, sonraki çalışmalarda **4 GiB** indirme bütçesi uygular.
- Eski/yeni indeksin yenileme sırasında beraber tutulmasını kapsayan **50 GiB disk bütçesi** kullanır.

İlk yayıncının kayıtlı HTTPS adresi ve gözlenen anahtarı `trust.json` dosyasında sabitlenir. Bu, RPC üzerinden kayıt gözlemidir; yerel hesap dahil edilme ispatı değildir. Mevcut güven kaydı sessizce değiştirilmez.

İndiren ayrı süreç HTTPS/DNS kullanır; destekçinin kurulmuş indekse bakması diskten çalışır. Sağlıklı kaynak yolları açık kalır. Bir bant ancak imza, boyut, hash ve CDB işaretçileri doğrulanınca kurulur; başarısız yenilemede önceki bant korunur.

50 GiB, daha önce gözlenen yaklaşık 21 GB yayın ile yenileme payına dayanır; gelecekteki yayın büyürse ek alan gerekebilir.

## İndeksi ayrıca kurmak veya onarmak

Kaynak sürümü `package.json` ile eşleşen güncel sürüm olmalı.

```bash
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
sudo bash scripts/install-shared-index.sh --source "$PWD" --node "$(command -v node)"
```

Normal kurucu destekçinin `ARNS_SHARED_INDEX_DIR` ayarını da yapar. Kurucunun yönettiği dizinler yeniden kullanılabilir; ilgisiz mevcut servis/dizinler korunur. Çalışan güncelleyicinin bitmesini bekle.

## İlerleme ve sorunlar

```bash
systemctl status arns-mesh-index-sync.service --no-pager
journalctl -u arns-mesh-index-sync.service -n 30 --no-pager
cat /var/lib/arns-mesh-shared-index/sync-status.json
cat /var/lib/arns-mesh-shared-index/installed.json
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

İlk indirme sırasında uzun süre `activating (start)` görünmesi normal olabilir. Tamamlanan bantlar kullanılabilir; sonraki bantlar geldikçe destekçi bunları tekrar başlatılmadan okur.

Günlük indirme bütçesi biterse sonraki UTC günü beklenir. Disk bütçesi veya boş alan yetersizse SSD kapasitesi gözden geçirilir. `402` yayıncı erişim/ödeme politikası, `429` hız sınırı, `504` kaynak zaman aşımıdır. Mesh otomatik ödeme yapmaz. İmza/hash hatalarında bant reddedilir; doğrulamayı kapatma.

İlk yüksek indirme bütçesi başarısız çalışmadan sonra kalır; tekrarlayan hataları incele. İndeks sayısı site sayısı değildir. Son olarak [bağımsız hizmet testini](dayaniklilik.md) tamamla.
