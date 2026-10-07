# Raspberry Pi hazırlığı

[English](../en/raspberry-pi.md) · [Destekçi kurulumu](destekci.md)

Pi üzerinde Windows tarayıcısı değil, Linux destekçi hizmeti çalışır. Gerçek Pi donanımında kabul testi henüz tamamlanmamıştır; bu sayfa kurulum yoludur, ölçülmüş kapasite garantisi değildir.

## Cihazı hazırlayın

1. Pi 4 veya Pi 5 gibi 64 bit işletim sistemi destekleyen kart, uygun güç kaynağı ve kararlı ağ kullanın.
2. [Raspberry Pi Imager](https://www.raspberrypi.com/software/) ile **Raspberry Pi OS Lite (64-bit)** kurun. Kendi kullanıcınızı ve SSH erişiminizi ayarlayın. Yazdırma seçilen diskin içeriğini değiştirir; doğru depolamayı seçin.
3. [Resmî ilk kurulum rehberini](https://www.raspberrypi.com/documentation/computers/getting-started.html) izleyin.
4. Kalıcı depolama kullanın; sürekli indeks ve içerik yazımı için SSD tercih edin. R84 standart kurulumun içindedir; indeks için 50 GiB, Pi profilinin tamamı için toplam 74 GiB boş alan ayırın.
5. Git, npm ve desteklenen **Linux ARM64 Node.js 24 LTS** kurun. [Node kurulumu (EN)](../en/node-setup.md).

```bash
uname -m
node --version
npm --version
git --version
```

Bu kurulumda `uname -m` çıktısı `aarch64` olmalıdır. x64 arşivini kullanmayın.

## Evin dışından erişilebilir yapın

Doğrudan IP destekçisi gelen bağlantı yolu ister. Herkese açık IPv4 varsa seçilen TCP portunu (rehberde 49741) modemden Pi'ye yönlendirin ve ilgili güvenlik duvarlarında izin verin. Pi'nin yerel adresini sabit tutun.

İnternet sağlayıcınız **CGNAT** kullanıyorsa sıradan port yönlendirme yeterli olmayabilir. Sağlayıcıdan erişilebilir genel adres alın veya VPS kullanın. Mesh'in doğrudan modu otomatik NAT geçişi, relay veya CGNAT aşma sağlamaz. Dışarıdan erişilemeyen açık bir Pi, dış okuyuculara hizmet veremez.

Genel IP değiştiğinde diğer destekçilerin yeni adresi öğrenebileceği çalışan duyuru ve bağlantı gerekir. Otomatik keşif, internet sağlayıcısı veya adres yönetimi hizmeti değildir.

Varsayılan topluluk ağı ve `--capacity pi` ile **[destekçi kurulumuna devam edin](destekci.md)**. R84 de kurulur; sonra [bağımsız erişimi doğrulayın](dayaniklilik.md).

0.6.0 destekçi kurulumunda R84, isim çoğaltma ve dosya hazırlama birlikte kurulur. Topluluk ağı varsayılandır; ilk işletmeciden kod istemek gerekmez. VPS profili yeni kurulumda 134 GiB, Pi profili 74 GiB boş alan ister. [Tam kurulum ve kontrol](destekci.md).
