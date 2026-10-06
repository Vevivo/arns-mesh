# Destekçi işletimi

[Kurulum](destekci.md) · [VPS](vps.md) · [Raspberry Pi](raspberry-pi.md)

Masaüstüyle aynı **0.5.1** sürümünü kullanın. Bu komutlardan önce destekçi kurulumunu tamamlayın.

```bash
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 50 --no-pager
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

Son komutu kaynak dizininde çalıştırın. Saklanan isimleri, hazır site kayıtlarını, eksik dosyaları, trafik bütçelerini ve diğer destekçilere yapılan duyuruları inceleyin.

Ayarlar `~/.local/share/ArNS-Mesh-Supporter/peer.env` içindedir. Düzenlerken mevcut ayarları koruyun. Değişiklikten sonra yalnızca bu destekçiyi yeniden başlatın:

```bash
systemctl --user restart arns-mesh-supporter
```

Destekçi kimliğini özel ve kalıcı tutun. Her bağımsız destekçinin kendi kimliği olmalıdır. Güncelleme öncesi veriyi özel olarak yedekleyin; geri dönüş için eşleşen uygulama sürümünü saklayın.

[İsim seçimi ve devralma testi](dayaniklilik.md) · [R84 indeks işletimi](paylasilan-indeks.md) · [Ağ kodları](ag-kodu.md).
