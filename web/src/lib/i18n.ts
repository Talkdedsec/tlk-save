import { createContext, useContext } from "react";

export type Locale = "tr" | "en";

const tr = {
  "meta.title": "tlk-save — video indirici",

  "nav.github": "GitHub'da kaynak kodu",
  "nav.theme": "Tema",
  "nav.theme.system": "Sistem",
  "nav.theme.light": "Açık",
  "nav.theme.dark": "Koyu",
  "nav.language": "Dil",

  "hero.eyebrow": "Reklamsız · Kayıtsız · Açık kaynak",
  "hero.title.a": "Her videoyu",
  "hero.title.b": "tek linkle indir.",
  "hero.lead": "YouTube, TikTok, Instagram, X ve 1800'den fazla site. Linki yapıştır, kaliteyi seç, bitti.",

  "form.label": "Video linki",
  "form.placeholder": "Linki buraya yapıştır…",
  "form.paste": "Yapıştır",
  "form.clear": "Temizle",
  "form.submit": "Getir",
  "form.loading": "Bakılıyor…",
  "form.hint": "İpucu: sayfanın herhangi bir yerinde {key} ile yapıştırabilirsin.",
  "form.detected": "{name} linki",

  "strip.more": "+1800 site",
  "strip.label": "Desteklenen siteler",

  "result.by": "{name}",
  "result.video": "Video",
  "result.audio": "Ses",
  "result.best": "En iyi",
  "result.size.unknown": "boyut bilinmiyor",
  "result.too_large": "Sunucu sınırını aşıyor",
  "result.mp3.note": "Kapak görseli ve etiketlerle",
  "result.m4a.note": "Kayıpsız, orijinal ses",
  "result.download": "{label} indir",
  "result.open": "Kaynakta aç",
  "result.close": "Kapat",
  "result.subtitle": "Altyazı",
  "result.image": "Kapak",
  "result.sub.auto": "otomatik",
  "result.sub.note": "SRT altyazı",
  "result.image.label": "Kapak görseli",
  "result.image.note": "En yüksek çözünürlük, JPG",
  "result.empty": "Bu videoda bu türde bir seçenek yok.",

  "clip.toggle": "Sadece bir bölümünü indir",
  "clip.start": "Başlangıç",
  "clip.end": "Bitiş",
  "clip.hint": "dk:sn olarak yaz, örneğin 1:30. Video süresi {duration}.",
  "clip.invalid": "Bitiş, başlangıçtan en az 1 saniye sonra ve video süresi içinde olmalı.",
  "clip.length": "{length} uzunluğunda klip",

  "job.queued": "Sırada bekliyor…",
  "job.starting": "Başlatılıyor…",
  "job.downloading": "İndiriliyor",
  "job.processing": "Son dokunuşlar yapılıyor…",
  "job.processing.video": "Görüntü ve ses birleştiriliyor…",
  "job.processing.audio": "Ses dönüştürülüyor…",
  "job.ready": "Hazır",
  "job.saved": "İndirme başladı. Başlamadıysa {link}.",
  "job.saved.link": "buraya tıkla",
  "job.expires": "Dosya {time} sunucudan silinir.",
  "job.cancel": "İptal",
  "job.again": "Başka bir kalite seç",
  "job.retry": "Tekrar dene",
  "job.left": "{eta} kaldı",

  "history.title": "Son indirilenler",
  "history.clear": "Temizle",
  "history.empty": "Bu cihazda indirdiklerin burada görünür. Sadece senin tarayıcında saklanır.",

  "features.title": "Neden tlk-save?",
  "features.private.title": "Reklam yok, iz yok",
  "features.private.body": "Hesap, çerez, analiz scripti ya da açılır pencere yok. Dosyan 30 dakika sonra sunucudan silinir.",
  "features.quality.title": "Gerçek en yüksek kalite",
  "features.quality.body": "4K, 60 fps ve HDR, sitede ne varsa o. Her oynatıcıda açılan MP4 olarak birleştirilir.",
  "features.audio.title": "Müzik için MP3",
  "features.audio.body": "Kapak görseli, başlık ve sanatçı bilgisi dosyanın içine gömülü olarak gelir.",
  "features.anywhere.title": "Her yerden",
  "features.anywhere.body": "Telefonda Paylaş menüsünden, bilgisayarda yer imi butonundan tek dokunuş.",

  "bookmarklet.title": "Tek tıkla indir",
  "bookmarklet.body": "Bu butonu yer imleri çubuğuna sürükle. İzlediğin videonun sayfasında tıklayınca tlk-save o linkle açılır.",
  "bookmarklet.button": "tlk-save ile indir",
  "bookmarklet.drag": "Sürükle",
  "bookmarklet.share": "Telefonda: tlk-save'i ana ekrana ekle, sonra videonun Paylaş menüsünden seç.",

  "faq.title": "Sık sorulanlar",
  "faq.how.q": "Nasıl çalışıyor?",
  "faq.how.a": "Linki yapıştırdığında sunucumuz videoyu açık kaynak yt-dlp ile bulur ve indirir, sonra dosyayı sana gönderir. Tarayıcın bu sitelerden doğrudan video çekemediği için arada bir sunucu gerekiyor.",
  "faq.stored.q": "Dosyalarım saklanıyor mu?",
  "faq.stored.a": "Hayır. Hazırlanan dosya 30 dakika sonra kendiliğinden silinir. Linkler ya da ne indirdiğin kaydedilmez. 'Son indirilenler' listesi sadece senin tarayıcında durur.",
  "faq.sites.q": "Hangi siteler destekleniyor?",
  "faq.sites.a": "yt-dlp'nin desteklediği 1800'den fazla site: YouTube, TikTok, Instagram, X, Facebook, Reddit, Twitch, SoundCloud, Vimeo ve daha fazlası. Motor her gün güncelleniyor.",
  "faq.login.q": "Bazı Instagram ya da Facebook videoları neden inmiyor?",
  "faq.login.a": "Bu siteler bazı içerikleri giriş yapmadan vermiyor. Gizli hesaplardaki içerik de indirilemez. Herkese açık gönderiler çoğunlukla sorunsuz iner.",
  "faq.legal.q": "Yasal mı?",
  "faq.legal.a": "Kendi videolarını, izin verilmiş ya da telif hakkı olmayan içeriği indirmek için kullan. Başkasının eserini izinsiz yaymak senin sorumluluğundadır.",
  "faq.self.q": "Kendi sunucumda çalıştırabilir miyim?",
  "faq.self.a": "Evet. Sunucu tek bir Rust programı ve kaynak kodu açık. Kurduktan sonra bu sayfanın altındaki 'Sunucu' bağlantısından adresini girmen yeterli.",

  "footer.made": "Açık kaynak, MIT lisanslı.",
  "footer.engine": "Motor: yt-dlp",
  "footer.server": "Sunucu",
  "footer.status.online": "Çevrimiçi",
  "footer.status.offline": "Ulaşılamıyor",
  "footer.status.checking": "Kontrol ediliyor",

  "server.title": "Sunucu ayarı",
  "server.body": "Varsayılan sunucu yerine kendi kurduğun bir tlk-save sunucusunu kullanabilirsin. Örneğin bilgisayarında çalışan http://127.0.0.1:8787.",
  "server.label": "Sunucu adresi",
  "server.test": "Dene",
  "server.save": "Kaydet",
  "server.reset": "Varsayılana dön",
  "server.ok": "Bağlandı · yt-dlp {version}",
  "server.fail": "Bu adreste bir tlk-save sunucusu bulunamadı.",
  "server.default": "Varsayılan",

  "error.title": "İndirilemedi",
  "error.no_server": "Bu sayfaya henüz bir sunucu tanımlanmamış. Alttaki 'Sunucu' bağlantısından bir adres gir.",
  "error.network": "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et ya da biraz sonra tekrar dene.",
  "error.invalid_url": "Bu bir video linkine benzemiyor. Tarayıcının adres çubuğundaki ya da Paylaş menüsündeki linki yapıştır.",
  "error.unsupported": "Bu site desteklenmiyor ya da linkte video yok.",
  "error.playlist": "Bu bir oynatma listesi ya da kanal sayfası. Tek bir videonun linkini yapıştır.",
  "error.live": "Canlı yayınlar indirilemez. Yayın bittikten sonra tekrar dene.",
  "error.private": "Bu içerik gizli. Sadece herkese açık içerik indirilebilir.",
  "error.age_restricted": "Bu içerik yaş sınırlı ve giriş yapılmadan açılmıyor.",
  "error.login_required": "Bu site içeriği giriş yapmadan vermiyor. Gönderi herkese açıksa birkaç dakika sonra tekrar dene.",
  "error.geo_blocked": "Bu içerik sunucunun bulunduğu ülkede engellenmiş.",
  "error.too_long": "Video çok uzun. Bu sunucu {hours} saate kadar olan videoları indiriyor.",
  "error.too_large": "Dosya bu sunucunun boyut sınırından büyük. Daha düşük bir kalite seç.",
  "error.upstream_limited": "Site şu an çok fazla istek alıyor. Birkaç dakika sonra tekrar dene.",
  "error.bot_check": "Site sunucudan doğrulama istedi. Birkaç dakika sonra tekrar dene.",
  "error.unavailable": "Video bulunamadı. Silinmiş ya da kaldırılmış olabilir.",
  "error.rate_limited": "Çok hızlı istek gönderildi. Bir dakika bekleyip tekrar dene.",
  "error.busy": "Aynı anda en fazla iki indirme yapılabilir. Birinin bitmesini bekle.",
  "error.timeout": "Site çok geç yanıt verdi. Tekrar dene.",
  "error.engine_missing": "Sunucu şu an hazır değil. Biraz sonra tekrar dene.",
  "error.not_found": "Bu indirmenin süresi dolmuş. Tekrar başlat.",
  "error.invalid_option": "Bu kalite artık mevcut değil. Linki yeniden getir.",
  "error.invalid_section": "Seçilen bölüm geçersiz. Başlangıç ve bitiş zamanlarını kontrol et.",
  "error.server_full": "Sunucu şu an çok dolu. Birkaç dakika sonra tekrar dene.",
  "error.cancelled": "İndirme iptal edildi.",
  "error.failed": "Beklenmeyen bir şey oldu. Tekrar dene. Sorun sürerse GitHub'da bildir.",
  "error.details": "Teknik ayrıntı",
} as const;

export type MessageKey = keyof typeof tr;

const en: Record<MessageKey, string> = {
  "meta.title": "tlk-save — video downloader",

  "nav.github": "Source code on GitHub",
  "nav.theme": "Theme",
  "nav.theme.system": "System",
  "nav.theme.light": "Light",
  "nav.theme.dark": "Dark",
  "nav.language": "Language",

  "hero.eyebrow": "No ads · No sign-up · Open source",
  "hero.title.a": "Any video,",
  "hero.title.b": "one link away.",
  "hero.lead": "YouTube, TikTok, Instagram, X and more than 1800 other sites. Paste the link, pick a quality, done.",

  "form.label": "Video link",
  "form.placeholder": "Paste a link here…",
  "form.paste": "Paste",
  "form.clear": "Clear",
  "form.submit": "Fetch",
  "form.loading": "Looking…",
  "form.hint": "Tip: press {key} anywhere on the page to paste.",
  "form.detected": "{name} link",

  "strip.more": "+1800 sites",
  "strip.label": "Supported sites",

  "result.by": "{name}",
  "result.video": "Video",
  "result.audio": "Audio",
  "result.best": "Best",
  "result.size.unknown": "size unknown",
  "result.too_large": "Over the server limit",
  "result.mp3.note": "With cover art and tags",
  "result.m4a.note": "Original audio, untouched",
  "result.download": "Download {label}",
  "result.open": "Open source page",
  "result.close": "Close",
  "result.subtitle": "Subtitles",
  "result.image": "Cover",
  "result.sub.auto": "auto",
  "result.sub.note": "SRT subtitles",
  "result.image.label": "Cover image",
  "result.image.note": "Highest resolution, JPG",
  "result.empty": "This video has nothing of this kind.",

  "clip.toggle": "Download only a part",
  "clip.start": "Start",
  "clip.end": "End",
  "clip.hint": "Type min:sec, for example 1:30. The video is {duration} long.",
  "clip.invalid": "The end must be at least 1 second after the start and within the video.",
  "clip.length": "{length} clip",

  "job.queued": "Waiting in line…",
  "job.starting": "Starting…",
  "job.downloading": "Downloading",
  "job.processing": "Finishing up…",
  "job.processing.video": "Joining picture and sound…",
  "job.processing.audio": "Converting audio…",
  "job.ready": "Ready",
  "job.saved": "Your download has started. If it didn't, {link}.",
  "job.saved.link": "click here",
  "job.expires": "The file is deleted from the server {time}.",
  "job.cancel": "Cancel",
  "job.again": "Pick another quality",
  "job.retry": "Try again",
  "job.left": "{eta} left",

  "history.title": "Recent downloads",
  "history.clear": "Clear",
  "history.empty": "What you download on this device shows up here. It is kept in your browser only.",

  "features.title": "Why tlk-save?",
  "features.private.title": "No ads, no tracking",
  "features.private.body": "No account, no cookies, no analytics, no pop-ups. Your file is deleted from the server after 30 minutes.",
  "features.quality.title": "The real best quality",
  "features.quality.body": "4K, 60 fps and HDR when the site has them, joined into an MP4 that plays everywhere.",
  "features.audio.title": "MP3 for music",
  "features.audio.body": "Cover art, title and artist are embedded in the file.",
  "features.anywhere.title": "From anywhere",
  "features.anywhere.body": "One tap from your phone's Share menu, one click from a bookmark on your computer.",

  "bookmarklet.title": "One-click download",
  "bookmarklet.body": "Drag this button to your bookmarks bar. Click it on any video page and tlk-save opens with that link.",
  "bookmarklet.button": "Save with tlk-save",
  "bookmarklet.drag": "Drag",
  "bookmarklet.share": "On a phone: add tlk-save to your home screen, then pick it from a video's Share menu.",

  "faq.title": "Questions",
  "faq.how.q": "How does it work?",
  "faq.how.a": "When you paste a link, our server finds and downloads the video with the open-source yt-dlp, then sends you the file. A server is needed because browsers are not allowed to pull videos from these sites directly.",
  "faq.stored.q": "Are my files kept?",
  "faq.stored.a": "No. A prepared file deletes itself after 30 minutes. Links and what you download are not logged. The 'Recent downloads' list lives only in your browser.",
  "faq.sites.q": "Which sites work?",
  "faq.sites.a": "More than 1800 sites supported by yt-dlp: YouTube, TikTok, Instagram, X, Facebook, Reddit, Twitch, SoundCloud, Vimeo and many more. The engine is updated daily.",
  "faq.login.q": "Why do some Instagram or Facebook videos fail?",
  "faq.login.a": "Those sites hold some posts back from visitors who are not logged in, and private accounts can't be downloaded at all. Public posts usually work fine.",
  "faq.legal.q": "Is this legal?",
  "faq.legal.a": "Use it for your own videos, content you have permission for, or content without copyright. Redistributing someone else's work without permission is your responsibility.",
  "faq.self.q": "Can I run my own server?",
  "faq.self.a": "Yes. The server is a single Rust program and its source is open. Once it runs, enter its address under 'Server' at the bottom of this page.",

  "footer.made": "Open source, MIT licensed.",
  "footer.engine": "Engine: yt-dlp",
  "footer.server": "Server",
  "footer.status.online": "Online",
  "footer.status.offline": "Unreachable",
  "footer.status.checking": "Checking",

  "server.title": "Server",
  "server.body": "Use a tlk-save server you run yourself instead of the default one — for example http://127.0.0.1:8787 on your own computer.",
  "server.label": "Server address",
  "server.test": "Test",
  "server.save": "Save",
  "server.reset": "Back to default",
  "server.ok": "Connected · yt-dlp {version}",
  "server.fail": "No tlk-save server answered at this address.",
  "server.default": "Default",

  "error.title": "Couldn't download",
  "error.no_server": "This page has no server set yet. Add an address under 'Server' at the bottom.",
  "error.network": "The server can't be reached. Check your connection or try again in a moment.",
  "error.invalid_url": "That doesn't look like a video link. Paste the link from your browser's address bar or the Share menu.",
  "error.unsupported": "This site isn't supported, or there is no video at this link.",
  "error.playlist": "This is a playlist or a channel. Paste the link to a single video.",
  "error.live": "Live streams can't be downloaded. Try again once the stream has ended.",
  "error.private": "This content is private. Only public content can be downloaded.",
  "error.age_restricted": "This content is age-restricted and doesn't open without logging in.",
  "error.login_required": "This site won't hand the content over without logging in. If the post is public, try again in a few minutes.",
  "error.geo_blocked": "This content is blocked in the server's country.",
  "error.too_long": "This video is too long. This server takes videos up to {hours} hours.",
  "error.too_large": "The file is bigger than this server allows. Pick a lower quality.",
  "error.upstream_limited": "The site is getting too many requests right now. Try again in a few minutes.",
  "error.bot_check": "The site asked the server to verify itself. Try again in a few minutes.",
  "error.unavailable": "The video wasn't found. It may have been deleted or taken down.",
  "error.rate_limited": "Too many requests too quickly. Wait a minute and try again.",
  "error.busy": "At most two downloads can run at once. Wait for one to finish.",
  "error.timeout": "The site took too long to answer. Try again.",
  "error.engine_missing": "The server isn't ready right now. Try again shortly.",
  "error.not_found": "This download has expired. Start it again.",
  "error.invalid_option": "That quality is no longer available. Fetch the link again.",
  "error.invalid_section": "That part of the video isn't valid. Check the start and end times.",
  "error.server_full": "The server is too busy right now. Try again in a few minutes.",
  "error.cancelled": "Download cancelled.",
  "error.failed": "Something unexpected happened. Try again, and if it keeps happening, report it on GitHub.",
  "error.details": "Technical details",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { tr, en };

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = MESSAGES[locale][key] ?? MESSAGES.tr[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function errorKey(code: string): MessageKey {
  const key = `error.${code}` as MessageKey;
  return key in tr ? key : "error.failed";
}

export function initialLocale(): Locale {
  const lang = typeof document === "undefined" ? "tr" : document.documentElement.lang;
  return lang === "en" ? "en" : "tr";
}

export interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18n>({
  locale: "tr",
  t: (key, vars) => translate("tr", key, vars),
  setLocale: () => {},
});

export const useI18n = () => useContext(I18nContext);
