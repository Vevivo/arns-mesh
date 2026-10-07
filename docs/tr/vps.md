# VPS hazırlığı

[English](../en/vps.md) · [Destekçi kurulumu](destekci.md)

Herkese açık sayısal adresi, kalıcı diski ve SSH erişimi olan Linux VPS kullanın. Bu adımlar systemd kullanan Debian/Ubuntu içindir. Ayrı sağlayıcıdaki bir makine, ana sunucudaki ikinci süreçten daha bağımsızdır.

## Kapasite

Her kurulum için ölçülmüş tek bir asgari donanım gereksinimi yoktur. Ayrı ayrı planlayın:

- İşletim sistemi ve desteklenen Node.js.
- İçerik bütçesi, isim kayıtları, günlükler ve ağ trafiği.
- Standart kuruluma dahil R84 indeksi: belgelenen ilk indeks ve yenileme payı için içerik alanına ek olarak SSD'de en az **50 GiB boş alan**. Yayıncının indeks boyutu değişebilir.
- Hizmet ve güncelleyici için boş bellek. Varsayılan hizmet sınırları donanım önerisi değildir.

VPS seçerken disk, bellek ve trafik kotasını kontrol edin. Mevcut yoğun sunucuya, diğer işlerin yükünü değerlendirmeden ek hizmet kurmayın.

## Yeni makineyi hazırlayın

Sağlayıcının SSH talimatlarıyla bağlanın ve normal kullanıcı hesabı kullanın. Debian/Ubuntu'da yönetici küçük ön koşulları kurabilir:

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends git curl ca-certificates xz-utils
```

npm içeren, bakımı sürdürülen Node.js 24 LTS kurun veya [kullanıcıya özel sürümlü Node kurulumunu (EN)](../en/node-setup.md) izleyin. Kontrol edin:

```bash
uname -m
node --version
npm --version
git --version
```

`x86_64` için Linux x64, `aarch64` için Linux ARM64 arşivi kullanılır.

## Destekçiyi erişilebilir yapın

Yeni destekçide boş TCP **49741** portunu seçin. Sağlayıcının güvenlik duvarında ve sunucunun mevcut güvenlik duvarı politikasında bu porta izin verin. SSH erişimini koruyun. Güvenlik duvarını tümden kapatmak, domain veya web proxy kurmak gerekmez.

Kurulumdan sonra başka bir ağdan kontrol edin. Sunucunun kendi içinden başarılı yanıt almak, dışarıdan erişildiğini göstermez.

**[Destekçi kurulumuyla devam edin](destekci.md).** R84 indeksi kurulumun içindedir; ardından [bağımsız erişim kontrolünü](dayaniklilik.md) tamamlayın.

0.6.0 destekçi kurulumunda R84, isim çoğaltma ve dosya hazırlama birlikte kurulur. Topluluk ağı varsayılandır; ilk işletmeciden kod istemek gerekmez. VPS profili yeni kurulumda 134 GiB, Pi profili 74 GiB boş alan ister. [Tam kurulum ve kontrol](destekci.md).
