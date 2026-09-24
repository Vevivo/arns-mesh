# ArNS Mesh

ArNS isimlerine masaüstü tarayıcıdan erişmek ve gönüllü düğümlerle bu erişimi desteklemek için geliştirilen deneysel proje.

Amaç: IP bağlantısı çalışırken domain, DNS veya gateway hizmetleri kullanılamasa da erişilebilir gerçek ArNS içeriğini açabilmek. Ulaşılamayan dosya üretilmez; otomatik gateway geri dönüşü yapılmaz.

**Sürüm: 0.5.0-preview.5.** Tamamlanmış final sürüm değildir. Windows arayüz deneyinin kapsamı sürüm kaydında açıklanır. Genel canlı ArNS gezintisi kabulü, Raspberry Pi donanımı ve bütün süreçleri kapsayan kesinti kabulü henüz tamamlanmadı. Bağımsız topluluk projesidir; resmî AR.IO dağıtımı değildir.

## Sana uygun başlangıç

| İstediğin | Gereken | Rehber |
|---|---|---|
| Sadece ArNS ismini yazıp site açmak | Windows masaüstü paketi + destekçiden bağlantı profili | [Kullanıcı](docs/tr/kullanici.md) |
| VPS veya Raspberry Pi ile ağa destek olmak | Linux + Node.js + kalıcı disk + erişilebilir bağlantı | [Destekçi](docs/tr/destekci.md) |
| Kodu geliştirmek, test etmek | Node.js 24 LTS + npm + Git | [Geliştirici](docs/tr/gelistirici.md) |

**Normal kullanıcı sunucu veya indeksleyici kurmaz.** Destekçi isteyen kişi kendi bilgisayarında masaüstünü de kullanabilir; sunucu ve masaüstü ayrı görevlerdir.

## Sadece kullanmak isteyenler

1. [Releases](https://github.com/Vevivo/arns-mesh/releases) bölümünde açıkça önizleme diye işaretlenmiş Windows paketini indir. Masaüstü eki yoksa henüz genel ikili dağıtım yayımlanmamıştır. GitHub'ın “Source code (zip)” dosyası çalıştırılabilir uygulama değildir.
2. ZIP'in tamamını çıkar, `Mesh-Browser.exe` dosyasını aç.
3. **Settings → Import connection profile** ile destekçinin verdiği JSON dosyasını seç.
4. `ar://isim` veya yalnız ismi yaz. `+` yeni sekme, yıldız yer imi içindir.

Genel dağıtımda özel sunucu/RPC adresleri gömülü değildir. Profil olmadan ilk bağlantı kurulmaz. Profil yalnız servis IP/port bilgilerini içerir; cüzdan, parola veya anahtar gerekmez. Kesintiden önce uygulamayı, bağlantı profilini ve saklamak istediğin içeriği edinmelisin. Çalışan uygulamanın GitHub'a bağlanması gerekmez.

## Gerçek durum

Canlı isim çözümü hâlâ IP üzerinden erişilen Solana RPC gözlemine dayanır. İmza kontrolü dosyanın doğruluğunu denetler; ismin en güncel eşleşmesini kanıtlamaz. Eski bazı kataloglar Turbo/Goldsky yardımıyla hazırlanmıştır; bu özel kataloglar repoda yoktur. Her yeni/bilinmeyen içerik konumunu bağımsız bulma işi tamamlanmadı.

İsim taraması ve içerik indirme bütçesi şu an ortak olduğundan kota dolunca güncellemeler de bekleyebilir. Sadece bir VPS'i tek Pi'ye taşımak yedeklilik sağlamaz. Ayrıntılar: [durum ve sınırlar](docs/tr/durum.md), [güven ve gizlilik](docs/tr/gizlilik.md).

Kaynaklar Apache-2.0 lisansı ve korunan üçüncü taraf bildirimleriyle sunulur. [Katkı rehberi](CONTRIBUTING.md) · [Güvenlik](SECURITY.md)

**Bağlantı kurma ve profil isteme:** [Önce bunu oku](docs/tr/baglantilar.md). Uygulama eklenmiş kaynakları gösterir; genel destekçi rehberi ve erişim onayı henüz uygulanmadı.
