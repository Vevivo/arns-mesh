# Gizlilik ve paylaşım

Mesh 0.6.0, resources/network-continuity.json içinde **ağ yetkilisinin imzaladığı açık topluluk ağ tanımını** bilinçli olarak paylaşır. Dosyada genel servis adresleri, sayısal keşif başlangıçları, yetkilinin açık anahtarı ve kabul edilen yayımlayıcı kimlikleri bulunur. Bunlar paylaşılmak üzere hazırlanmış bağlantı bilgileridir; parola değildir. Desteklenen topluluk kodunu kullanan güncel veya yeni okuyucunun, ilk işletmeci yokken sonradan gelen destekçiyi bulmasını sağlar.

Özel imza anahtarları, SSH bilgileri, cüzdan sırları, sunucuya yönetim erişimi, kişisel profiller, gezinti verileri, çalışma katalogları, özel loglar ve yedekler kaynak/sürüm dışında tutulur. Diğer varsayılan adres dosyaları boş kalır. Açık tanımın paylaşılması, işletmecinin çalışma dizininin paylaşılmasına izin vermez.

## Katılımcılar ne görebilir?

- **Ağ keşfi:** HyperDHT keşfi sayısal IP üzerinden UDP kullanır. Ağa katılım ve bağlantı bilgileri gözlenebilir; bağlanan peer'ler ağ kimliğiyle imzalı destekçi adreslerini paylaşır. Bu paylaşım ArNS ismi, sayfa adresi, arama sözcüğü veya site dosyası içermez. Okuyucu keşif başlangıcı için DNS sorgusu yapmaz.
- **İsim ve içerik erişimi:** Doğrudan Mesh/RPC HTTP anonimlik veya şifreli taşıma gizliliği sağlamaz. Hizmet veren peer/RPC işletmecisi istekleri ve bağlanan adresi görebilir. Dosya imzası veriyi doğrular; isteği gizlemez ve isim kaydının en güncel durumunu tek başına kanıtlamaz.
- **Yerel arama:** Konu araması cihazda saklanan imzalı katalog üzerinde yapılır. Arama sözcükleri katalog yayımlayıcısına gönderilmez.
- **Destekçi çalıştırmak:** Destekçi genel IP/portunu ve kalıcı açık peer kimliğini duyurur; doğrulanmış içerik ve kabul edilen imzalı kayıtları sunar. Adresinin öğrenilmesi onu güvenilen isim yayımlayıcısı yapmaz.
- **Hazırlık:** Destekçi konum ipuçları için ayrı ve sınırlı bir HTTPS/DNS hazırlık işlemi kullanabilir. İlgili kaynak servisleri bu işlemin isteklerini görebilir. Okuyucuya HTTPS gateway erişimi eklenmez.

Okuyucu cihazında sınırlı uygulama önbelleği, ayarlar ve seçilen veriler tutulur; destekçinin sürekli indeksleme/toplu kopyalama işini çalıştırmaz. İndeksler, aktarılan isim kayıtları ve hazırlanan dosyalar destekçinin sunucusunda saklanır. Roller ve sınırlar için [mimari](../en/architecture.md) ve [destekçi kurulumu](destekci.md).

## Kaynak, sürüm ve tanı dosyaları

Özel profillerle yedekleri kaynak dışında tut. Çalışan uygulamanın data klasörünü bütünüyle yükleme. Paylaşılabilir davet/profil, açıkça paylaşılmak istenen servis adreslerini içerebilir; özel ağ/peer anahtarı, SSH erişimi veya cüzdan sırrı içeremez.

check:public denetimi bilinen çalışma dosyalarını, anahtar kalıplarını ve operasyon kimliklerini kontrol eder. Süreklilik dosyasındaki genel IP'leri ancak imzalı açık davetleri doğruladıktan sonra kabul eder; diğer kaynak örnekleri belge IP'lerini kullanır. **Her türlü sırrı bulma garantisi vermez.** Değişiklikler ve sürüm içeriği ayrıca incelenmelidir. .gitignore, daha önce Git geçmişine giren veriyi temizlemez.

Tanı çıktıları gezilen isimleri, hedefleri, IP'leri, yerel yolları ve zamanları içerebilir. Issue açarken bütün log veya profil yerine elle temizlenmiş hata kesitini paylaş. Commit yazar bilgileri de görünür; gerekirse GitHub noreply adresi kullan. Bir erişim anahtarı açığa çıkarsa iptal et/yenile ve [GitHub geçmiş temizliği](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) adımlarını uygula.
