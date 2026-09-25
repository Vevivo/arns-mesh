# Bağlantı koduyla Mesh kullanımı

[Ana sayfa](../../README.tr.md) · [VPS / Pi kurulumu](destekci.md) · [English](../en/network-code.md)

Bu yol **preview.8 ve üzerindeki** masaüstü ve peer içindir. Eski peer'ler içerik sunmaya devam edebilir; bağlantı listesi yayımlamak için güncellenmeleri gerekir. Yazılım güncellemesi çalışan sunucunu kendiliğinden değiştirmez.

## Kullanıcı ne yapar?

1. Windows masaüstü ZIP'ini indirir, tamamını çıkarır ve `Mesh-Browser.exe` dosyasını açar.
2. Sağlayıcısından `mesh1.` ile başlayan **bağlantı kodunu** alır. **Settings → Mesh connection code** alanına yapıştırıp **Check code** seçer.
3. Ağın adını ve kaynak sayısını inceler, **Join this network** seçer. Bu seçim mevcut bağlantı listesini bu ağın listesiyle değiştirir. Eski kaynaklarını tutmak istiyorsa önce **Export profile** ile dışa aktarır.
4. Mesh'in adres çubuğuna ArNS ismini yazar. Sunucu kurması veya IP adresi düzenlemesi gerekmez.

Sağlayıcının özellikle hazırladığı **Connected** paketinde ağ kodu zaten bulunabilir: temiz kurulum ilk açılışta o ağa bağlanmayı dener. Kod kontrolü veya imza doğrulaması atlanmaz. Mevcut bağlantıları olan kurulumlar otomatik değiştirilmez. Standart genel GitHub ZIP'inde hazır sağlayıcı yoktur; kod veya eski JSON profili gerekir.

**Örnek:** Sen iki sunucu işletir, ikisini tek ağ listesine koyarsın. Ayşe uygulamayı indirir ve senin kodunu girer. Tarayıcısı bu listedeki kaynaklara bağlanır. Mehmet de normal kullanıcıysa aynı kodu kullanabilir. Kimsenin Ayşe'ye site dosyalarını elle göndermesi gerekmez. İçerik erişilebilir kaynaklardan alınır ve doğrulanır.

Eski `mesh-connect.json` dosyası hâlâ **Settings → Already have a connection file? → Import connection profile** yoluyla aktarılabilir. Elle dosya aktarımı veya gelişmiş bağlantı düzenlemesi ağın otomatik adres güncellemelerini durdurur.

## Kod ne içerir, ne içermez?

Kod; ağın açık imza anahtarını, ilk ulaşılacak birkaç IP:port adresini ve yerel ağ kullanımına izin verilip verilmediğini taşır. Küçük bir bağlantı paketi olduğu için kısa bir PIN'den uzundur; kopyala/yapıştır kullanılır.

- Tekrar kullanılabilir; tüketilmez ve kişiye/cihaza bağlanmaz.
- Site verisi, cüzdan, özel anahtar veya ödeme bilgisi içermez.
- Kaynak adreslerini gizlemez; sunucuya özel erişim yetkisi sağlamaz.
- İmza, listede aynı ağ yetkilisinin değişiklik yaptığını doğrular. Yetkilinin güvenilirliğini veya bütün içeriklerin bulunabildiğini kanıtlamaz.

Kodun tamamını güvendiğin sağlayıcıdan al. Kod içindeki başlangıç adresleri ilk bağlantıyı sağlar; **Check code** bu adreslerden imzalı listeyi ister. Yerel ağ kodu, özel IP'lere erişime izin verdiğini inceleme ekranında belirtir. Genel ağ kodunun sonradan öğrenilen adresleri özel/yerel ağ adreslerine çevrilemez.

## Sunucu sahibi nasıl kod üretir?

Önce [VPS/Pi rehberindeki](destekci.md) kurulumu ve dışarıdan erişim kontrolünü tamamla. Kullanıcılara sunulacak gerçek Mesh, RPC ve isteğe bağlı ham Arweave adreslerini içeren `mesh-connect.json` dosyan hazır olsun. Bu dosya **sunucunun kendi upstream dosyasından farklı olabilir**: okuyucuların ulaşacağı Mesh adresin listede yer almalı.

Güncellenmiş kaynak dizininde, sunucunun kullandığı **aynı veri dizinini** seç:

```sh
node scripts/network.mjs publish --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --profile ../mesh-connect.json --name "Benim Mesh Agim"
```

Komutun verdiği `code` değerini kullanıcıya, Windows indirme bağlantısıyla birlikte gönder. İlk yayında özel bir ağ imza anahtarı üretilir. Çalışan güncel peer bu veri dizinindeki yayını sunar. Herkese açık, erişilebilir bir Mesh adresi olmadan kod tek başına bağlantı sağlamaz.

Varsayılan olarak profildeki ilk sekiz Mesh adresi başlangıç noktaları olur. Yalnız **bu ağa ait imzalı listeyi sunan** noktaları kullan; diğer içerik peer'leri ağ listesinin içinde kalabilir. Gerekirse seçimi `--seed GERCEK_IP:PORT` seçenekleriyle açıkça yap. İki bağımsız makinede liste ve yararlı veri bulundurmak tek makineye bağlılığı azaltır.

### Yeni bir destekçiyi mevcut ağa bağlamak

Kurucu ilk kurulumda JSON yerine kod kabul eder:

```sh
bash scripts/install-peer.sh --network 'SAGLAYICIDAN_ALDIGIM_MESH1_KODU'
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Tırnak içindeki örneği gerçek kodun tamamıyla değiştir. Sunucu bu ağın kaynak listesini edinir ve güncel tutar. **Ağ listesine otomatik kaydolmuş olmaz.** Ağ yetkilisi yeni sunucunun erişimini ve faydalı içeriğini kontrol ederek onu kullanıcı profiline ekler, `publish` komutunu aynı anahtar/veri diziniyle tekrar çalıştırır.

Güncelleme kurulumu mevcut kaynak ayarlarını korur. Mevcut sunucuyu bilinçli olarak başka ağa geçirmek için peer'i durdur, veriyi yedekle, ardından `node scripts/network.mjs join 'GERCEK_KOD' --data VERI_DIZINI` çalıştır ve yeniden başlat. Bu komut kaynağı değiştirir; masaüstündeki gibi ikinci bir onay ekranı göstermez.

### İkinci sunucuda bağlantı listesini de yayımlamak

Önce ikinci peer'i yukarıdaki kodla ağa bağla. O sunucuda:

```sh
node scripts/network.mjs mirror 'GERCEK_KOD' --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Bu işlem yalnız **imzalı açık listeyi** kopyalar. Gizli anahtarı paylaşmaz. Ağa bağlı mirror peer sonraki kabul edilmiş liste değişikliklerini de sunar. İlk kez bağlanan bir kullanıcının mirror'ı bulabilmesi için adresi verdiğin koddaki başlangıç noktalarından biri olmalı; daha önce bağlanmış kullanıcılar son kabul ettikleri listedeki Mesh noktalarını da dener.

Liste kopyalamak site dosyalarını kopyalamaz. İçerik/katalog çoğaltması ayrı işlerdir; gerçek verinin diğer sunucuda bulunduğunu dene. Bu sürüm masaüstünü otomatik içerik sunucusu yapmaz.

## Adresler değişirse ve bir sunucu kapanırsa

Kullanıcı listesi değişince aynı veri diziniyle `publish` komutunu yeniden çalıştır. Anahtar korunur, sürüm numarası artar. Kodda anahtar ve başlangıç adresleri aynıysa kod da aynı kalır. Başlangıç adreslerini değiştirirsen ilk kurulumlar için yeni kod dağıt; bütün eski başlangıç adresleri erişilemezken yeni kullanıcı kendiliğinden ilk kaynağı bulamaz.

Masaüstü Live modunda açılışta ve yaklaşık 15 dakikada bir güncelleme arar. İmzası değiştirilmiş, süresi geçmiş, eski sürümlü veya aynı sürümde çelişen listeleri kabul etmez. Kaynaklara erişemediğinde son kabul ettiği adresleri silmez. **Saved** modunda bu sorguları yapmaz; kayıtlı dosyaları yerelden açar.

Bir yayın varsayılan 14 gün geçerlidir. Yetkili anahtarın bulunduğu çalışan peer, başlangıçta ve altı saatte bir kontrol eder; üç gün veya daha az kalınca listeyi yeniler. Mirror tek başına süreyi uzatamaz. Süre dolması önceden kaydedilmiş adresleri veya dosyaları silmez; yeni katılım ve yeni liste kabulü için geçerli yayın gerekir. Bu **abonelik süresi değildir**.

**Stop automatic updates** son adresleri koruyup ağ yönetimini bırakır. Tekrar katılmak yeniden güven kararıdır. DNS/gateway olmasa da IP erişimi ve gerekli isim/veri kaynakları gerekir. Bir sağlayıcının çok sunucusu olması o sağlayıcıdan kurumsal bağımsızlık sağlamaz.

## Kodun paketin içinde olduğu sürüm

[Geliştirici rehberindeki](gelistirici.md) Windows paketleme ortamında kodun tamamını tek satırlık, repo dışında bir dosyaya koy:

```sh
python scripts/package-windows.py --runtime ELECTRON_DIZINI --out dist --network-code-file ../ag-kodu.txt --network-name "Benim Mesh Agim"
```

Çıktı adı `-Connected.zip` ile biter. Ağ daveti yalnız bu çıktı paketine eklenir; kaynak reponun genel varsayılanı boş kalır. Bu dosyada adresler herkesçe görülebilir. Paketleme otomatik olarak yeni sunucu açmaz veya bir ağı hazır hâle getirmez.

## Özel anahtar ve ticari model

`network-authority.private.json` dosyasını **özel yedekte** tut; kullanıcıya, mirror'a, GitHub'a veya masaüstü ZIP'ine verme. Anahtar kaybolursa aynı ağ adına imzalı güncelleme yapılamaz. Eski bir yedeğe dönüp sürüm sayacını geriye alma. Anahtar çalınırsa yeni anahtar/kodun güvenilir ayrı yoldan dağıtılması gerekir; otomatik anahtar değişimi bu sürümde yoktur.

Tek sağlayıcı olarak kurulum, kapasite ve destek sunabilirsin. Fakat bu sürümde ücret tahsilatı, tek kullanımlık kod tüketimi, cihaz lisansı veya sunucuda abonelik denetimi **yoktur**. Mevcut kodu satmak onu teknik olarak kopyalanamaz yapmaz. Böyle bir hizmet ayrı kimlik/erişim denetimi ve kesinti sırasında geçerli çalışma politikası gerektirir. Her açılışta merkezi lisans sunucusuna mecbur olmak felaket erişimi hedefiyle çatışır.
