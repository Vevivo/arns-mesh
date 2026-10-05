# Masaüstü bağlantı ekranı — preview.12 adayı

Bu sayfa **preview.12 adayını** anlatır; `main` üzerindeki yayımlanmış preview.8 kodunu değil. [Test edilen aday kaynak](https://github.com/Vevivo/arns-mesh/tree/cbd55a7dfd5b754a4d3ac06e4c67dc4c83a4011e).
Adres çubuğunun altındaki şerit Mesh, Solana RPC ve ham Arweave bağlantılarını ayrı gösterir. **Network monitor** düğmesi ayrıntıları açar: yanıt alınan kaynaklar, açık sayfanın kaynağı ve bu uygulama oturumunun veri trafiği.

- **Responding:** Bu bilgisayardan yakın zamanda HTTP yanıtı alındı veya protokol kontrolü geçti. Her sitenin açılacağını garanti etmez. Ayrıntılarda bu iki ölçüm ayrılır.
- **Requesting:** İstek sürüyor. **Request failed:** Son istek veya kontrol başarısız oldu. Kaynağın dünya genelinde kapandığı anlamına gelmez.
- **Not checked:** Henüz ölçüm yok. **No sources:** Bilinen kaynak yok. **Out of date:** Ölçüm 90 saniyeden eski.
- Mesh sayısı **yakın zamanda yanıt veren adres / bilinen adres** biçimindedir. Dünya genelindeki Mesh kullanıcılarını, bağımsız işletmecileri veya sürekli bağlı cihazları saymaz.
- Otomatik erişimde panel açılınca yalnızca ayarlı IP adresleri kontrol edilir. Panel açıkken 60 saniyede bir yinelenir; **Check now** ile yenilenebilir. Panel kapatılınca sürmekte olan panel kontrolü iptal edilir. Normal isteklerin göstergeleri her saniye güncellenir.
- Kayıtlı modda bu kontroller ve canlı RPC sorguları durur. Eksik dosyalar için Mesh veya ham Arweave isteği yapılabilir; kayıtlı mod tam ağ kesintisi demek değildir.

**Current page** ana belgenin bu cihazdan, Mesh eşinden veya ham Arweave kaynağından alındığını gösterir. Bağlı dosyalar farklı yollardan gelebilir. İsim kaydının canlı RPC gözlemi mi, tarihli kayıt mı olduğu ayrıca belirtilir. Uzak eşin arka planda kullandığı kaynaklar bu ekrandan ölçülemez.

Oturum trafiği bağlantı kontrolü dışındaki uygulama HTTP istekleridir. Alınan baytlara metadata ve başarısız/kısmi aktarımlar dahildir; bağımsız paket yakalama veya dosya indirme hızı değildir. Masaüstü okuyucu olarak kalır; kendi kayıtlı dosyalarını diğer kullanıcılara sunmaz. DNS/domain/gateway kısıtları korunur.

Windows testi gerçek aday ZIP'inden açılan uygulamayı, kontrollü yerel test kaynaklarını ve imzalı örnek dosyaları kullanır. Ekran görüntüleri bu testten alınır. Bu, halka açık siteler veya Windows güvenlik duvarıyla yapılmış yeni bir felaket testi değildir. İki gerçek PC ve bağımsız sunucu kaybı testi bekliyor.
