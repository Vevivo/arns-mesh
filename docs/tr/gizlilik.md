# Gizlilik ve paylaşım

Bu kaynak dağıtımında özel sunucu/RPC adresleri, erişim bilgileri, peer kimlik anahtarları, canlı bağlantı profilleri, hazırlanmış özel kataloglar, gezinti verileri, özel tanı kayıtları ve ekran görüntüleri bulunmamalı. Genel başlangıç listeleri boştur; örnek IP'ler çalışmayan belge adresleridir.

`npm run check:public` bilinen özel dosyaları, belirli anahtar/kimlik kalıplarını ve örnek dışı IPv4 adreslerini denetler. **Her türlü sırrı bulma garantisi vermez.** Her commit ve sürüm paketi ayrıca incelenmelidir. `.gitignore`, daha önce Git geçmişine giren bilgiyi temizlemez. Bir anahtar sızarsa iptal/yenileme ve [GitHub geçmiş temizliği](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) gerekir.

Profilleri ve yedekleri kaynak dizininin dışında tut. Çalışan uygulamanın `data` klasörünü bütünüyle yükleme. Profil yalnızca kullanıcılara açmayı amaçladığın servis IP/portlarını içerir; bunlar alıcıya görünür. SSH parolası, cüzdan veya gizli imza anahtarı hiçbir zaman profile konmaz.

Doğrudan HTTP taşıması anonimlik ve şifreli gizlilik sağlamaz. Peer/RPC işletmecisi isteklerini görebilir. İçeriğin imzalı olması isteklerin gizli olduğunu veya RPC isim gözleminin bağımsız kanıtlandığını göstermez.

Tanı dosyaları gezilen isimleri, hedefleri, IP'leri ve yerel yolları içerebilir. Issue açarken yalnız elle temizlenmiş hata kesitini paylaş. Git commit yazar bilgileri de görünür; kişisel e-posta yerine GitHub noreply ayarını kullanabilirsin.

Private repo görünürlüğü sınırlar; kaynakları temizlemenin yerine geçmez. İlk commit'ten itibaren özel operasyon verisini dışarıda tutmak ilerideki açık paylaşımı daha güvenli kılar; sıfır risk garantisi değildir.
