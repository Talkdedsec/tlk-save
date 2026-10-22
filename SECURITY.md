# Security policy · Güvenlik politikası

## English

Do not open a public issue for a vulnerability. Report it privately:

- **Security → Report a vulnerability** on this repository, or
- email **talkdedsec@proton.me** with `tlk-save` in the subject.

Acknowledgement within 72 hours, assessment within 7 days.

### In scope

- Command or argument injection: a URL or option that makes the server run something other than the
  intended yt-dlp / ffmpeg call.
- Path traversal: a title or file name that writes outside the download folder.
- The server reaching hosts it should not (SSRF), or being reachable from the network when it is
  meant to stay local.
- Script injection in the web interface through titles, thumbnails or metadata.

### Out of scope

- Bugs in yt-dlp or ffmpeg themselves — report those upstream.
- A site blocking downloads or changing its format.

## Türkçe

Güvenlik açığı için herkese açık issue açma. Gizli bildir:

- bu repoda **Security → Report a vulnerability**, ya da
- konu satırında `tlk-save` geçen bir e-postayla **talkdedsec@proton.me**.

72 saat içinde dönüş, 7 gün içinde değerlendirme.

### Kapsamda

- Komut ya da argüman enjeksiyonu: sunucuya amaçlanan yt-dlp / ffmpeg çağrısı dışında bir şey
  çalıştırtan adres ya da seçenek.
- Yol aşımı: indirme klasörünün dışına yazan başlık ya da dosya adı.
- Sunucunun ulaşmaması gereken adreslere ulaşması (SSRF) ya da yerelde kalması gerekirken ağdan
  erişilebilir olması.
- Başlık, küçük resim ya da meta veri üzerinden web arayüzünde script çalıştırma.

### Kapsam dışı

- yt-dlp ya da ffmpeg'in kendi hataları — onları kendi projelerine bildir.
- Bir sitenin indirmeyi engellemesi ya da biçimini değiştirmesi.
