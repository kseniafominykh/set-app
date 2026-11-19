'use strict';
/* SET — beta. All data lives on this device (localStorage). */
const VERSION = '0.13.1 beta';
const APP_URL = (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '');
const KEY = 'set.v1';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const num = (v) => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
const money = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayIso = () => isoOf(new Date());
const parseIso = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const mins = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const normTime = (v) => { const d = String(v || '').replace(/\D/g, ''); if (!d) return ''; let h, m; if (d.length <= 2) { h = +d; m = 0; } else { h = +d.slice(0, d.length - 2); m = +d.slice(-2); } if (h > 23 || m > 59) return String(v); return pad(h) + ':' + pad(m); };
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
const plural = (n, a, b, c) => { const k = n % 10, h = n % 100; return (k === 1 && h !== 11) ? a : (k >= 2 && k <= 4 && (h < 12 || h > 14)) ? b : c; };


/* ---------- subscription (manual SBP payment + signed activation link) ---------- */
const SUB = {
  price: 790,                 // ₽ в месяц
  payUrl: '',                 // ссылка на оплату по СБП из банка
  qr: '',                     // картинка QR-кода (путь к файлу), если есть
  tg: '',                     // ник в Telegram без @
  wa: '',                     // номер для WhatsApp, только цифры
  trialDays: 30,
  pub: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhrHIfZAlgDg1cV7unG+No9YgBS15cUqxzTarcsSaT6ZHmYxbpD+xsGGApnrmvspWxIelHEvtUbkJeQ0yMRq8Xw=='
};

/* ---------- state ---------- */
let S = load();
S.shoots.forEach(migrate);
const ui = { step: 1, cal: null, calSel: null, sheet: null, tab: 'main', filter: 'active', per: 'year', src: 'all', q: '', onb: null };

function fresh() {
  return {
    v: 1,
    lang: (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en',
    profile: { name: '', phone: '', city: '', insta: '', roles: [], ownRole: '', ownSkill: '', skills: [], exp: '', rate: '', unit: 'смена', contact: 'Telegram', food: [], foodOther: '', tg: '', onboarded: false },
    people: [],
    shoots: []
  };
}
function load() {
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.v === 1) return Object.assign(fresh(), x); } catch (e) { /* ignore */ }
  return fresh();
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast(T('Не получилось сохранить: память телефона заполнена', 'Could not save: storage is full')); }
  }, 120);
}
function fmtPhone(v) { const raw = String(v || '').trim(); let d = raw.replace(/\D/g, ''); if (!d) return ''; if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = d.slice(1); else if (d.length !== 10) return raw; return '+7 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8, 10); }
function tgNick(v) { const s = String(v || '').trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@+/, '').replace(/[^\w]/g, ''); return s ? '@' + s : ''; }
const PHONE_HINT = () => T('Любой формат: 8 900…, +7 900… или 900… — приведём к одному виду.', 'Any format works — we tidy it up.');
const T = (ru, en) => (S.lang === 'en' ? (en ?? ru) : ru);

/* ---------- dictionaries ---------- */
const MONTHS = { ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
const MONTHS_N = { ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'], en: MONTHS.en };
const MON_S = { ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const WD_S = { ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const WD_L = { ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const L = () => S.lang === 'en' ? 'en' : 'ru';
function fmtDate(iso, o = {}) {
  const d = parseIso(iso); if (!d) return T('без даты', 'no date');
  const s = L() === 'en' ? MONTHS.en[d.getMonth()] + ' ' + d.getDate() : d.getDate() + ' ' + MONTHS.ru[d.getMonth()];
  const wd = o.wd ? ', ' + WD_S[L()][d.getDay()] : '';
  const y = o.year || d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return s + y + wd;
}
function relDay(iso) {
  const n = daysBetween(todayIso(), iso);
  if (n === 0) return T('сегодня', 'today');
  if (n === 1) return T('завтра', 'tomorrow');
  if (n === -1) return T('вчера', 'yesterday');
  if (n > 1) return T('через ' + n + ' ' + plural(n, 'день', 'дня', 'дней'), 'in ' + n + ' days');
  return T(-n + ' ' + plural(-n, 'день', 'дня', 'дней') + ' назад', -n + ' days ago');
}

const GROUPS = [
  { ru: 'Организация', en: 'Production', glow: 'pink', roles: [
    ['producer', 'Продюсер', 'Producer', ['брифы', 'сметы', 'кастинг', 'локации', 'ведение клиента', 'договоры', 'бартер с брендами', 'логистика']],
    ['director', 'Режиссёр', 'Director', ['реклама', 'клипы', 'fashion-видео', 'рилсы', 'работа с актёрами', 'раскадровка', 'сценарий']],
    ['creative', 'Креативный директор / арт-директор', 'Creative / art director', ['концепция', 'мудборды', 'арт-дирекшн на площадке', 'контроль кадра', 'визуальный стиль бренда']],
    ['prodassist', 'Ассистент продюсера', 'Production assistant', ['логистика', 'закупки', 'встреча команды', 'тайминг на площадке', 'возврат вещей']],
    ['execprod', 'Исполнительный продюсер', 'Executive producer', ['бюджеты кампаний', 'переговоры с брендом', 'подбор подрядчиков'], 1],
    ['lineprod', 'Линейный продюсер', 'Line producer / production manager', ['площадка', 'график смен', 'разрешения', 'контроль расходов'], 1],
    ['ad', 'Второй режиссёр', '1st AD', ['тайминг', 'вызывные', 'порядок сцен', 'дисциплина на площадке'], 1],
    ['script', 'Скрипт-супервайзер', 'Script supervisor', ['раскадровка', 'учёт дублей', 'монтажная непрерывность'], 1],
    ['casting', 'Кастинг-директор', 'Casting director', ['модели', 'герои', 'лонг-листы', 'пробы', 'договорённости с агентствами'], 1],
    ['location', 'Локейшн-менеджер', 'Location manager', ['поиск локаций', 'разрешения', 'договор с площадкой'], 1],
    ['runner', 'Раннер / помощник на площадке', 'Runner / set PA', ['закупки', 'доставка', 'встреча людей'], 1],
    ['smm', 'SMM / контент-менеджер', 'SMM / content', ['рилсы', 'сторис', 'контент-план', 'съёмка на телефон'], 1] ] },
  { ru: 'Камера и свет', en: 'Camera & light', glow: 'teal', roles: [
    ['photo', 'Фотограф', 'Photographer', ['fashion', 'бьюти', 'предметка', 'портрет', 'репортаж', 'интерьер', 'еда', 'съёмка на плёнку', 'ретуширую сам']],
    ['video', 'Видеограф / оператор', 'Videographer', ['рилсы', 'реклама', 'клипы', 'ивенты', 'монтирую сам', 'стабилизатор']],
    ['mobile', 'Мобилограф', 'Mobile creator', ['рилсы', 'сторис', 'контент на телефон', 'монтаж в телефоне']],
    ['light', 'Гаффер / световик', 'Gaffer', ['импульсный свет', 'постоянный свет', 'свой свет', 'дым-машина', 'световые схемы']],
    ['photoassist', 'Ассистент фотографа', 'Photo assistant', ['свет', 'отражатели', 'бэкапы', 'сборка-разборка']],
    ['dop', 'Оператор-постановщик (DOP)', 'Director of photography', ['кинотехника', 'световые схемы', 'реклама', 'клипы'], 1],
    ['focus', 'Фокус-пуллер / ассистент оператора', 'Focus puller / AC', ['фокус', 'карточки', 'сборка камеры'], 1],
    ['steadicam', 'Стедикам-оператор', 'Steadicam operator', ['стедикам', 'роним', 'проходы'], 1],
    ['grip', 'Грип / техник по кранам и тележкам', 'Grip', ['тележка', 'кран', 'риг на авто'], 1],
    ['dit', 'Цифровой техник (DIT)', 'Digital tech (DIT)', ['съёмка в ноутбук', 'бэкапы', 'превью клиенту', 'цвет на площадке'], 1],
    ['playback', 'Плейбэк / видеоконтроль', 'Video assist', ['мониторы для клиента', 'запись дублей'], 1],
    ['bts', 'Бэкстейдж', 'Behind the scenes', ['фото', 'видео', 'рилсы со съёмки', 'сторис для бренда'], 1],
    ['drone', 'Дрон-оператор', 'Drone operator', ['съёмка с воздуха', 'свой дрон', 'FPV'], 1] ] },
  { ru: 'Образ', en: 'Look', glow: 'pink', roles: [
    ['stylist', 'Стилист', 'Stylist', ['подбор образов', 'закуп с возвратом', 'аренда вещей', 'свой гардероб', 'работа с брендом', 'шоурумы']],
    ['mua', 'Визажист', 'Make-up artist', ['нюд', 'вечерний', 'графичный', 'бьюти крупным планом', 'грим для видео', 'мужской грим']],
    ['hair', 'Стилист по волосам', 'Hair stylist', ['укладки', 'плетения', 'парики', 'ретро-укладки', 'стрижка на площадке']],
    ['nails', 'Мастер маникюра', 'Nail artist', ['нюд', 'дизайн', 'руки для крупных планов', 'накладные ногти']],
    ['stylistassist', 'Ассистент стилиста', 'Stylist assistant', ['отпаривание', 'возврат вещей', 'переодевания', 'учёт вещей'], 1],
    ['wardrobe', 'Костюмер на площадке', 'Wardrobe on set', ['одевание', 'отпаривание', 'учёт и возврат вещей'], 1],
    ['costume', 'Художник по костюмам', 'Costume designer', ['пошив', 'исторический костюм', 'кино и клипы'], 1],
    ['tailor', 'Портной / подгонка', 'Tailor', ['подгонка по фигуре', 'срочный ремонт', 'пошив'], 1],
    ['grooming', 'Барбер / мужской образ', 'Barber / grooming', ['мужской грим', 'борода', 'стрижка'], 1],
    ['sfx', 'Пластический грим / SFX', 'SFX make-up', ['раны и шрамы', 'возраст', 'фантазийный грим', 'боди-арт'], 1] ] },
  { ru: 'В кадре', en: 'In frame', glow: 'lemon', roles: [
    ['model', 'Модель', 'Model', ['fashion', 'бьюти', 'коммерция', 'каталог', 'маркетплейсы', 'рилсы', 'руки и детали', 'бельё', 'плюс-сайз']],
    ['actor', 'Актёр / актриса', 'Actor', ['реклама', 'короткий метр', 'клипы', 'импровизация']],
    ['blogger', 'Блогер', 'Creator', ['свой блог', 'интеграции', 'работа на камеру', 'UGC']],
    ['hero', 'Герой съёмки', 'Real person', ['эксперт', 'сотрудник бренда', 'клиент бренда', 'семья']],
    ['dancer', 'Танцор', 'Dancer', ['современный танец', 'хореография для клипов', 'contemporary', 'хип-хоп'], 1],
    ['choreo', 'Хореограф / постановщик движения', 'Choreographer', ['постановка движения', 'позинг', 'клипы'], 1],
    ['extra', 'Массовка', 'Extras', ['фон', 'ивенты', 'клипы'], 1],
    ['booker', 'Букер модельного агентства', 'Agency booker', ['подбор моделей', 'условия', 'договоры'], 1],
    ['petwrangler', 'Дрессировщик животных', 'Animal handler', ['собаки', 'кошки', 'лошади'], 1] ] },
  { ru: 'Сет и площадка', en: 'Set & venue', glow: 'cobalt', roles: [
    ['studio', 'Студия / площадка', 'Studio / venue', ['циклорама', 'интерьерные залы', 'свой свет', 'гримёрка', 'парковка']],
    ['setdesign', 'Сет-дизайнер / художник-постановщик', 'Set / production designer', ['декорации', 'фоны', 'строительство сета', 'эскизы']],
    ['props', 'Реквизитор', 'Props', ['поиск реквизита', 'аренда', 'возврат', 'изготовление']],
    ['florist', 'Флорист', 'Florist', ['композиции', 'инсталляции', 'сухоцветы']],
    ['decor', 'Декоратор', 'Set dresser', ['наполнение кадра', 'текстиль', 'расстановка'], 1],
    ['builder', 'Строитель декораций', 'Set builder', ['конструкции', 'покраска', 'монтаж и демонтаж'], 1],
    ['food', 'Фуд-стилист', 'Food stylist', ['еда в кадре', 'напитки', 'кондитерка'], 1],
    ['rental', 'Прокат техники', 'Gear rental', ['свет', 'камеры', 'грип', 'доставка'], 1],
    ['catering', 'Кейтеринг', 'Catering', ['обеды на площадку', 'кофе-брейк', 'вегетарианское меню'], 1],
    ['driver', 'Водитель / логистика', 'Driver / transport', ['перевозка команды', 'перевозка техники', 'минивэн'], 1],
    ['security', 'Охрана площадки', 'Set security', ['охрана техники', 'охрана вещей бренда'], 1] ] },
  { ru: 'Звук и пост', en: 'Sound & post', glow: 'sky', roles: [
    ['retouch', 'Ретушёр', 'Retoucher', ['бьюти-ретушь', 'fashion', 'предметка', 'частотка', 'коллажи']],
    ['editor', 'Монтажёр', 'Editor', ['рилсы', 'реклама', 'клипы', 'субтитры', 'вертикальный формат']],
    ['sound', 'Звукорежиссёр', 'Sound recordist', ['запись на площадке', 'петлички', 'бум', 'сведение'], 1],
    ['color', 'Колорист', 'Colorist', ['цветокор видео', 'цвет фото', 'LUT под бренд'], 1],
    ['motion', 'Моушн-дизайнер', 'Motion designer', ['титры', 'анимация', '3D', 'упаковка рилсов'], 1],
    ['cgi', '3D / CGI-художник', '3D / CGI artist', ['3D-продукт', 'композитинг', 'визуальные эффекты'], 1],
    ['music', 'Композитор / саунд-дизайнер', 'Composer / sound designer', ['музыка под ролик', 'саунд-дизайн', 'лицензии на музыку'], 1],
    ['designer', 'Графический дизайнер / иллюстратор', 'Designer / illustrator', ['вёрстка', 'обложки', 'иллюстрации', 'упаковка кампании'], 1] ] },
  { ru: 'Заказчик', en: 'Client', glow: 'pink', roles: [
    ['brand', 'Бренд', 'Brand', ['лукбуки', 'маркетплейсы', 'рилсы', 'кампании', 'бартер']],
    ['client', 'Частный клиент', 'Private client', ['портрет', 'love story', 'семейная', 'для блога', 'подарочный сертификат']],
    ['agency', 'Агентство', 'Agency', ['реклама', 'SMM', 'ивенты', 'модельное агентство'], 1],
    ['brandrep', 'Представитель бренда на площадке', 'Brand rep on set', ['утверждение кадров', 'контроль продукта'], 1],
    ['marketing', 'Маркетолог бренда', 'Brand marketer', ['брифы', 'цели кампании', 'запуск'], 1] ] }
];
const ROLE = {};
GROUPS.forEach((g) => g.roles.forEach((r) => { ROLE[r[0]] = { id: r[0], ru: r[1], en: r[2], skills: r[3], glow: g.glow, more: !!r[4] }; }));
ROLE.art = ROLE.creative;
const SK_EN = {"брифы": "briefs", "сметы": "budgets", "кастинг": "casting", "локации": "locations", "ведение клиента": "client management", "договоры": "contracts", "бартер с брендами": "brand barter deals", "логистика": "logistics", "реклама": "commercials", "клипы": "music videos", "fashion-видео": "fashion films", "рилсы": "reels", "работа с актёрами": "directing actors", "раскадровка": "storyboards", "сценарий": "script", "концепция": "concept", "мудборды": "moodboards", "арт-дирекшн на площадке": "on-set art direction", "контроль кадра": "frame control", "визуальный стиль бренда": "brand visual identity", "закупки": "purchasing", "встреча команды": "meeting the team", "тайминг на площадке": "on-set schedule", "возврат вещей": "returns", "бюджеты кампаний": "campaign budgets", "переговоры с брендом": "brand negotiations", "подбор подрядчиков": "vendor sourcing", "площадка": "venue", "график смен": "shift schedule", "разрешения": "permits", "контроль расходов": "cost control", "тайминг": "schedule", "вызывные": "call sheets", "порядок сцен": "scene order", "дисциплина на площадке": "set discipline", "учёт дублей": "take logging", "монтажная непрерывность": "continuity", "модели": "models", "герои": "real people", "лонг-листы": "long lists", "пробы": "auditions", "договорённости с агентствами": "agency deals", "поиск локаций": "location scouting", "договор с площадкой": "venue contracts", "доставка": "delivery", "встреча людей": "greeting people", "сторис": "stories", "контент-план": "content plan", "съёмка на телефон": "phone shooting", "fashion": "fashion", "бьюти": "beauty", "предметка": "product", "портрет": "portrait", "репортаж": "reportage", "интерьер": "interiors", "еда": "food", "съёмка на плёнку": "film photography", "ретуширую сам": "own retouching", "работа на камеру": "on-camera work", "клиент бренда": "brand customer", "ивенты": "events", "монтирую сам": "own editing", "стабилизатор": "gimbal", "контент на телефон": "phone content", "монтаж в телефоне": "phone editing", "импульсный свет": "strobes", "постоянный свет": "continuous light", "свой свет": "own lights", "дым-машина": "haze machine", "световые схемы": "lighting setups", "свет": "lighting", "отражатели": "reflectors", "бэкапы": "backups", "сборка-разборка": "set-up and strike", "кинотехника": "cinema cameras", "фокус": "focus", "карточки": "cards", "сборка камеры": "camera build", "стедикам": "Steadicam", "роним": "Ronin", "проходы": "walk-and-talks", "тележка": "dolly", "кран": "crane", "риг на авто": "car rig", "съёмка в ноутбук": "tethered shooting", "превью клиенту": "client previews", "цвет на площадке": "on-set colour", "мониторы для клиента": "client monitors", "запись дублей": "take recording", "фото": "photo", "видео": "video", "рилсы со съёмки": "BTS reels", "сторис для бренда": "brand stories", "съёмка с воздуха": "aerial", "свой дрон": "own drone", "FPV": "FPV", "подбор образов": "styling", "закуп с возвратом": "refundable buying", "аренда вещей": "wardrobe rental", "свой гардероб": "own wardrobe", "работа с брендом": "brand collaboration", "шоурумы": "showrooms", "нюд": "nude", "вечерний": "evening", "графичный": "graphic", "бьюти крупным планом": "beauty close-ups", "грим для видео": "video make-up", "мужской грим": "men's grooming", "укладки": "styling", "плетения": "braids", "парики": "wigs", "ретро-укладки": "retro hair", "стрижка на площадке": "on-set haircuts", "дизайн": "nail art", "руки для крупных планов": "hand close-ups", "накладные ногти": "press-ons", "отпаривание": "steaming", "переодевания": "changes", "учёт вещей": "inventory", "одевание": "dressing", "учёт и возврат вещей": "inventory and returns", "пошив": "tailoring", "исторический костюм": "period costume", "кино и клипы": "film and music videos", "подгонка по фигуре": "fittings", "срочный ремонт": "quick repairs", "борода": "beard", "стрижка": "haircut", "раны и шрамы": "wounds and scars", "возраст": "ageing", "фантазийный грим": "fantasy make-up", "боди-арт": "body art", "коммерция": "commercial", "каталог": "catalogue", "маркетплейсы": "marketplaces", "руки и детали": "hands and details", "бельё": "lingerie", "плюс-сайз": "plus-size", "короткий метр": "short films", "говорю на камеру": "on-camera talking", "импровизация": "improv", "свой блог": "own blog", "интеграции": "sponsorships", "UGC": "UGC", "не модель": "non-model", "эксперт": "expert", "сотрудник бренда": "brand staff", "семья": "family", "современный танец": "modern dance", "хореография для клипов": "music video choreography", "contemporary": "contemporary", "хип-хоп": "hip-hop", "постановка движения": "movement direction", "позинг": "posing", "фон": "background", "подбор моделей": "model selection", "условия": "terms", "собаки": "dogs", "кошки": "cats", "лошади": "horses", "циклорама": "cyclorama", "интерьерные залы": "interior sets", "гримёрка": "make-up room", "парковка": "parking", "декорации": "sets", "фоны": "backdrops", "строительство сета": "set building", "эскизы": "sketches", "поиск реквизита": "prop sourcing", "аренда": "rental", "возврат": "returns", "изготовление": "prop making", "композиции": "arrangements", "инсталляции": "installations", "сухоцветы": "dried flowers", "наполнение кадра": "set dressing", "текстиль": "textiles", "расстановка": "arrangement", "конструкции": "structures", "покраска": "painting", "монтаж и демонтаж": "build and strike", "еда в кадре": "food on camera", "напитки": "drinks", "кондитерка": "pastry", "камеры": "cameras", "грип": "grip", "обеды на площадку": "set lunches", "кофе-брейк": "coffee breaks", "вегетарианское меню": "vegetarian menu", "перевозка команды": "crew transport", "перевозка техники": "gear transport", "минивэн": "minivan", "охрана техники": "gear security", "охрана вещей бренда": "brand goods security", "бьюти-ретушь": "beauty retouching", "частотка": "frequency separation", "коллажи": "composites", "субтитры": "subtitles", "вертикальный формат": "vertical video", "запись на площадке": "on-set recording", "петлички": "lavaliers", "бум": "boom", "сведение": "mixing", "цветокор видео": "video grading", "цвет фото": "photo colour", "LUT под бренд": "brand LUTs", "титры": "titles", "анимация": "animation", "3D": "3D", "упаковка рилсов": "reel packaging", "3D-продукт": "3D product", "композитинг": "compositing", "визуальные эффекты": "VFX", "музыка под ролик": "score", "саунд-дизайн": "sound design", "лицензии на музыку": "music licensing", "вёрстка": "layout", "обложки": "covers", "иллюстрации": "illustrations", "упаковка кампании": "campaign packaging", "лукбуки": "lookbooks", "кампании": "campaigns", "бартер": "barter", "love story": "love story", "семейная": "family", "для блога": "for a blog", "подарочный сертификат": "gift voucher", "SMM": "SMM", "модельное агентство": "model agency", "утверждение кадров": "shot approval", "контроль продукта": "product control", "цели кампании": "campaign goals", "запуск": "launch"};
const skillName = (x) => (L() === 'en' ? SK_EN[x] || x : x);
const roleName = (id) => (ROLE[id] ? (L() === 'en' ? ROLE[id].en : ROLE[id].ru) : (id || ''));
const CLIENT_ROLES = ['brand', 'agency', 'client', 'brandrep', 'marketing'];
const FOOD = [['all', 'ем всё', 'eat everything'], ['nomeat', 'без мяса', 'no meat'], ['nofish', 'без рыбы', 'no fish'], ['gluten', 'без глютена', 'gluten-free'], ['lactose', 'без лактозы', 'lactose-free'], ['vegan', 'веган', 'vegan']];

const UNITS = [['проект', 'project'], ['смена', 'day'], ['час', 'hour'], ['образ', 'look'], ['чел', 'person'], ['шт', 'pcs'], ['пакет', 'package'], ['сумма', 'lump sum']];
const unitName = (u) => { const x = UNITS.find((y) => y[0] === u); return x ? (L() === 'en' ? x[1] : x[0]) : (u || ''); };
const PAY = { money: ['деньги', 'money'], barter: ['бартер', 'barter'], cert: ['сертификат', 'voucher'], mix: ['деньги + бартер', 'money + barter'], tfp: ['TFP', 'TFP'], client: ['силами заказчика', 'by the client'], refund: ['закуп с возвратом', 'refundable purchase'] };
const payName = (k) => (PAY[k] ? (L() === 'en' ? PAY[k][1] : PAY[k][0]) : '');
const SECTIONS = [['team', 'Команда', 'Crew'], ['models', 'Модели', 'Talent'], ['looks', 'Образы и реквизит', 'Wardrobe & props'], ['place', 'Площадка и техника', 'Venue & gear'], ['food', 'Еда и логистика', 'Food & transport'], ['post', 'Пост-продакшн', 'Post-production'], ['other', 'Прочее', 'Other']];
const secName = (k) => { const x = SECTIONS.find((y) => y[0] === k); return x ? (L() === 'en' ? x[2] : x[1]) : k; };
const lineMoney = (x) => (['money', 'mix'].includes(x.pay || 'money') ? (num(x.qty) || 1) * num(x.rate) : 0);
const lineBarter = (x) => (['barter', 'cert', 'mix'].includes(x.pay) ? num(x.barter) : 0);
const lineRefund = (x) => (x.pay === 'refund' ? (num(x.qty) || 1) * num(x.rate) : 0);
function budgetTotals(s) {
  const ls = s.budget.lines;
  const money = ls.reduce((a, x) => a + lineMoney(x), 0);
  const reserve = Math.round(money * num(s.budget.reserve) / 100);
  return { money, reserve, total: money + reserve, barter: ls.reduce((a, x) => a + lineBarter(x), 0), refund: ls.reduce((a, x) => a + lineRefund(x), 0), q: ls.filter((x) => x.q).length };
}
const myMoney = (s) => (['money', 'mix', undefined, ''].includes(s.my.pay) ? num(s.my.fee) : 0);
const myBarter = (s) => (['barter', 'cert', 'mix'].includes(s.my.pay) ? num(s.my.barter) : 0);
function migrate(s) {
  if (!s.budget) s.budget = { lines: [], note: '' };
  if (!s.budget.v2) {
    s.budget.lines = (s.budget.lines || []).map((x) => ({ id: x.id || uid(), sec: x.sec || 'other', label: x.label || '', desc: x.desc || '', qty: x.qty || '1', unit: x.unit || 'сумма', rate: x.rate ?? x.sum ?? '', pay: x.pay || 'money', barter: x.barter || '', q: !!x.q, mid: x.mid || '' }));
    if (s.budget.reserve == null) s.budget.reserve = '10';
    s.budget.v2 = true;
  }
  (s.team || []).forEach((m) => { if (!m.pay) m.pay = 'money'; if (!m.unit) m.unit = 'смена'; });
  if (s.my && !s.my.pay) s.my.pay = 'money';
  if (!s.mood) s.mood = [];
  return s;
}
const memberPayText = (m) => m.pay === 'tfp' ? 'TFP' : m.pay === 'client' ? payName('client') : m.pay === 'barter' ? T('бартер', 'barter') + (num(m.barter) ? ' ' + money(num(m.barter)) + ' ₽' : '') : m.pay === 'cert' ? T('сертификат', 'voucher') + (num(m.barter) ? ' ' + money(num(m.barter)) + ' ₽' : '') : (num(m.rate) ? money(num(m.rate)) + ' ₽/' + unitName(m.unit || 'смена') : '') + (m.pay === 'mix' && num(m.barter) ? ' + ' + T('бартер ', 'barter ') + money(num(m.barter)) : '');

const KINDS = {
  brand: { glow: 'pink', ru: 'Для бренда', en: 'For a brand', sub: ['Лукбук, каталог, кампания. Смета, ссылка для заказчика, права на фото', 'Lookbook, catalogue, campaign. Budget, client link, usage rights'] },
  personal: { glow: 'lemon', ru: 'Частный клиент', en: 'Private client', sub: ['Портрет, love story, семейная. Памятка клиенту, предоплата', 'Portrait, love story, family. Client prep, deposit'] },
  creative: { glow: 'sky', ru: 'Творческая · TFP', en: 'Creative · TFP', sub: ['Без бюджета. Договорённости, кто где публикует, делим аренду', 'No budget. Agreements, credits, split the studio'] },
  custom: { glow: 'cobalt', ru: 'Своя', en: 'Custom', sub: ['Собери из блоков то, что нужно именно тебе', 'Build it from the blocks you need'] }
};

/* ---------- icons ---------- */
const I = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.3.2 4 1.6 4.5 4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};

/* ---------- shoot helpers ---------- */
const getShoot = (id) => S.shoots.find((s) => s.id === id);
const titleOf = (s) => [s.client, s.what].filter(Boolean).join(' · ') || T('Новая съёмка', 'New shoot');
const durationH = (s) => { const a = mins(s.call), b = mins(s.end); if (a == null || b == null || a === b) return 0; return ((b - a + 1440) % 1440) / 60; };
const dayKey = (s, t) => { const m = mins(t); if (m == null) return 99999; const c = mins(s.call) ?? 0; return m < c - 120 ? m + 1440 : m; };
const sortedTiming = (s) => [...s.timing].sort((a, c) => dayKey(s, a.t) - dayKey(s, c.t));
const isPast = (s) => s.status === 'done' || (s.date && s.date < todayIso());
const hasMeal = (s) => s.timing.some((x) => /обед|ланч|еда|перекус|lunch|meal|food/i.test(x.w));
const sortByDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (mins(a.call) || 0) - (mins(b.call) || 0);

function newShoot(kind, o = {}) {
  const s = {
    id: uid(), src: 'set', kind, client: '', what: '', date: '', call: '', end: '', place: '', address: '', notes: '',
    timing: [], team: [], looks: [], checklist: [],
    budget: { lines: [], note: '', reserve: '10', v2: true }, mood: [], rights: '', deliver: '', retouch: '',
    modules: { team: true, timing: true, mood: true, looks: kind !== 'personal', budget: kind === 'brand' || kind === 'custom', print: true },
    my: { role: S.profile.roles[0] || 'producer', fee: '', pay: 'money', barter: '', shifts: 1, paid: false, check: false, note: '' },
    onset: { idx: 0 }, status: 'plan', created: Date.now()
  };
  Object.assign(s, o);
  return s;
}
function genTiming(s) {
  const a = mins(s.call) ?? 600; let d = Math.round(durationH(s) * 60); if (!d) d = 300;
  const tt = (m) => { const n = ((m % 1440) + 1440) % 1440; return pad(Math.floor(n / 60)) + ':' + pad(n % 60); };
  const r15 = (m) => Math.round(m / 15) * 15;
  const rows = [];
  const R = (t1, t2, w, who, det) => rows.push({ id: uid(), t: tt(t1), t2: t2 == null ? '' : tt(t2), w, who: who || '', det: det || '' });
  const prep = s.kind === 'personal' ? Math.min(60, r15(d * 0.3)) : s.kind === 'creative' ? Math.min(60, r15(d * 0.25)) : Math.min(120, r15(d * 0.35));
  const st = a + prep, packAt = a + d - (d > 180 ? 30 : 15);
  R(a, st, s.kind === 'personal' ? T('Мейк и волосы', 'Make-up and hair') : T('Сборы: грим, волосы, одеваем образы', 'Prep: make-up, hair, dressing'), '', s.kind === 'personal' ? '' : T('Параллельно ставим свет', 'Light set-up in parallel'));
  if (d > 300) {
    const lunch = r15(a + d / 2);
    R(st, lunch, T('Съёмка', 'Shooting')); R(lunch, lunch + 45, T('Обед для команды', 'Team lunch')); R(lunch + 45, packAt, T('Съёмка, продолжение', 'Shooting, continued'));
  } else R(st, packAt, T('Съёмка', 'Shooting'));
  R(packAt, a + d, s.kind === 'personal' ? T('Смотрим кадры, прощаемся', 'Quick review, goodbye') : T('Финал: переодеваемся, собираем вещи и свет', 'Wrap: change, pack clothes and light'));
  return rows;
}
function applyTemplate(s) { return genTiming(s); }
function _oldTemplate(s) {
  const shift = (mins(s.call) ?? 0) - (mins(s._tplCall) ?? mins(s.call) ?? 0);
  return (s._tpl || []).map((x) => { const m = mins(x.t); const n = m == null ? null : (((m + shift) % 1440) + 1440) % 1440; return { id: uid(), t: n == null ? x.t : pad(Math.floor(n / 60)) + ':' + pad(n % 60), w: x.w }; });
}

function hints(s) {
  const out = [];
  const h = durationH(s);
  if (h > 5 && !hasMeal(s)) out.push({ text: T('Съёмка ' + Math.round(h) + ' ' + plural(Math.round(h), 'час', 'часа', 'часов') + ' — запланируй обед для команды. Кто что не ест — в карточках людей.', 'The shoot is ' + Math.round(h) + 'h long — plan lunch for the team.'), act: 'addLunch', label: T('Добавить обед', 'Add lunch') });
  if (h > 10) out.push({ text: T('Больше 10 часов — это переработка. Заложи её в смету и предупреди команду.', 'Over 10 hours is overtime. Budget for it and warn the team.') });
  if (!s.date) out.push({ text: T('Поставь дату — съёмка появится в календаре.', 'Set a date so it shows in the calendar.'), act: 'tab', arg: 'main', label: T('Указать', 'Set') });
  else if (!s.address && s.src === 'set') out.push({ text: T('Добавь адрес — его получит вся команда.', 'Add the address — the whole team gets it.'), act: 'tab', arg: 'main', label: T('Добавить', 'Add') });
  const noCall = s.team.filter((m) => !m.call).length;
  if (noCall) out.push({ text: T('У ' + noCall + ' ' + plural(noCall, 'человека', 'человек', 'человек') + ' нет времени сбора.', noCall + ' people have no call time.'), act: 'tab', arg: 'team', label: T('Команда', 'Team') });
  const noModel = s.modules.looks ? s.looks.filter((l) => !l.model).length : 0;
  if (noModel) out.push({ text: T('В ' + noModel + ' ' + plural(noModel, 'образе', 'образах', 'образах') + ' не указана модель.', noModel + ' looks have no model.'), act: 'tab', arg: 'looks', label: T('Образы', 'Looks') });
  if (s.date && daysBetween(todayIso(), s.date) <= 2 && daysBetween(todayIso(), s.date) >= 0) {
    const notYes = s.team.filter((m) => m.status !== 'yes').length;
    if (notYes) out.push({ text: T('Съёмка ' + relDay(s.date) + ', а подтвердили ещё не все: ждём ' + notYes + ' из ' + s.team.length + '.', 'The shoot is ' + relDay(s.date) + ' and ' + notYes + ' people have not confirmed.'), act: 'tab', arg: 'team', label: T('Проверить', 'Check') });
  }
  if (s.kind === 'creative' && s.checklist.some((c) => /публикует|posts/i.test(c.text) && !c.done)) out.push({ text: T('Для TFP главное — заранее договориться, кто где публикует кадры и как отмечает команду.', 'For TFP, agree in advance who posts where and how the team is credited.') });
  if (s.kind === 'personal' && s.checklist.some((c) => /памятка|guide/i.test(c.text) && !c.done)) out.push({ text: T('Отправь клиенту памятку: что взять, как подготовиться, когда будут фото.', 'Send the client a prep guide.'), act: 'shareClientGuide', label: T('Отправить', 'Send') });
  return out;
}

/* ---------- toast & share ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(T('Скопировано', 'Copied')); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(T('Скопировано', 'Copied')); } catch (e2) { toast(T('Не получилось скопировать', 'Could not copy')); } ta.remove(); }
}
function shareSheet(title, text) { ui.sheet = { type: 'share', title, text }; render(); }

function teamText(s) {
  const lines = [];
  lines.push('«' + titleOf(s) + '»');
  if (s.date) lines.push(fmtDate(s.date, { wd: true }) + (s.call ? ' · ' + T('сбор', 'call') + ' ' + s.call : '') + (s.end ? ' · ' + T('до', 'till') + ' ' + s.end : ''));
  if (s.place || s.address) lines.push([s.place, s.address].filter(Boolean).join(', '));
  if (s.timing.length) { lines.push(''); lines.push(T('Тайминг', 'Schedule') + ':'); sortedTiming(s).forEach((x) => lines.push(x.t + (x.t2 ? '–' + x.t2 : '') + ' — ' + x.w + (x.who ? ' (' + x.who + ')' : '') + (x.det ? '. ' + x.det : ''))); }
  if (s.team.length) { lines.push(''); lines.push(T('Команда', 'Team') + ':'); s.team.forEach((m) => lines.push(m.name + ' — ' + roleName(m.role) + (m.call ? ', ' + T('сбор', 'call') + ' ' + m.call : ''))); }
  if (s.modules.looks && s.looks.length) { lines.push(''); lines.push(T('Образы', 'Looks') + ':'); s.looks.forEach((l, i) => lines.push(pad(i + 1) + ' ' + (l.name || '') + (l.model ? ' — ' + l.model : '') + (l.mua ? ', ' + T('мейк', 'MUA') + ': ' + l.mua : ''))); }
  const food = teamFood(s); if (food) { lines.push(''); lines.push(T('Еда', 'Food') + ': ' + food); }
  lines.push(''); lines.push(T('Собрано в SET', 'Made with SET'));
  return lines.join('\n');
}
function personText(s, m) {
  const first = (m.name || '').split(' ')[0];
  return T('Привет' + (first ? ', ' + first : '') + '! Зову тебя на съёмку «' + titleOf(s) + '».' + (m.role ? ' Роль: ' + (roleName(m.role) || '').toLowerCase() + '.' : '') + ' Когда: ' + (s.date ? fmtDate(s.date, { wd: true }) : 'дата скоро') + (m.call || s.call ? ', сбор в ' + (m.call || s.call) : '') + '.' + (s.address ? ' Где: ' + s.address + '.' : '') + (memberPayText(m) ? ' Условия: ' + memberPayText(m) + '.' : '') + (m.note ? ' ' + m.note.replace(/\.$/, '') + '.' : '') + ' Сможешь?',
    'Hi' + (first ? ' ' + first : '') + '! Inviting you as ' + roleName(m.role) + ' for “' + titleOf(s) + '”: ' + (s.date ? fmtDate(s.date, { wd: true }) : 'date tbc') + (m.call || s.call ? ', call ' + (m.call || s.call) : '') + (s.address ? ', ' + s.address : '') + '.' + (memberPayText(m) ? ' Terms: ' + memberPayText(m) + '.' : '') + ' Are you in?');
}
function guideText(s) {
  return T('Как подготовиться к съёмке «' + titleOf(s) + '»\n\n' + (s.date ? 'Когда: ' + fmtDate(s.date, { wd: true }) + ', ' + s.call + '\n' : '') + (s.address ? 'Где: ' + [s.place, s.address].filter(Boolean).join(', ') + '\n' : '') + '\n— Высыпайтесь накануне, пейте воду\n— Возьмите 2–3 образа на вешалках, обувь и украшения\n— Ногти и брови — за пару дней до съёмки\n— Приходите с чистым лицом, если работает визажист\n' + (s.deliver ? '\nФото будут ' + s.deliver + '.' : '') + '\n\nДо встречи!',
    'How to prepare for “' + titleOf(s) + '”\n\n' + (s.date ? 'When: ' + fmtDate(s.date, { wd: true }) + ', ' + s.call + '\n' : '') + (s.address ? 'Where: ' + s.address + '\n' : '') + '\n— Sleep well, drink water\n— Bring 2–3 outfits on hangers, shoes and jewellery\n— Nails and brows a couple of days before\n— Come with a clean face if there is a make-up artist\n\nSee you!');
}
function teamFood(s) {
  const tags = {};
  s.team.forEach((m) => { const p = S.people.find((x) => x.id === m.pid); (p?.food || []).filter((f) => f !== 'all').forEach((f) => { tags[f] = (tags[f] || []).concat(m.name); }); });
  if (S.profile.food.length) S.profile.food.filter((f) => f !== 'all').forEach((f) => { tags[f] = (tags[f] || []).concat(S.profile.name || T('я', 'me')); });
  return Object.keys(tags).map((k) => { const f = FOOD.find((x) => x[0] === k); return (f ? (L() === 'en' ? f[2] : f[1]) : k) + ' — ' + tags[k].join(', '); }).join('; ');
}

/* ---------- path binding ---------- */
// data-b="shoot:ID.field" | "shoot:ID.timing:ROWID.t" | "profile.name" | "person:ID.name"
function resolve(path) {
  const parts = path.split('.');
  let obj = null;
  const head = parts.shift();
  if (head === 'profile') obj = S.profile;
  else if (head.startsWith('shoot:')) obj = getShoot(head.slice(6));
  else if (head.startsWith('person:')) obj = S.people.find((p) => p.id === head.slice(7));
  else if (head === 'ui') obj = ui;
  while (obj && parts.length > 1) {
    const p = parts.shift();
    if (p.includes(':')) { const [arr, id] = p.split(':'); obj = (obj[arr] || []).find((x) => x.id === id); }
    else obj = obj[p];
  }
  return obj ? [obj, parts[0]] : [null, null];
}
function setPath(path, value) { const [o, k] = resolve(path); if (o) { o[k] = value; if (path !== 'ui.q') save(); } }

/* ---------- layout pieces ---------- */
function nav(active) {
  const a = (href, key, icon, label) => '<a href="' + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + icon + label + '</a>';
  return '<nav class="nav" aria-label="' + T('Главное меню', 'Main menu') + '">' + a('#/today', 'today', I.sun, T('Сегодня', 'Today')) + a('#/calendar', 'calendar', I.cal, T('Календарь', 'Calendar')) +
    '<a href="#/new" class="plus" aria-label="' + T('Новая съёмка', 'New shoot') + '">' + I.plus + '</a>' + a('#/projects', 'projects', I.layers, T('Проекты', 'Projects')) + a('#/people', 'people', I.people, T('Люди', 'People')) + '</nav>';
}
const backBtn = (href) => '<a class="iconbtn" href="' + href + '" aria-label="' + T('Назад', 'Back') + '">' + I.back + '</a>';
const initials = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
const chip = (label, pressed, act, arg, cls = '') => '<button class="chip ' + cls + '" aria-pressed="' + (pressed ? 'true' : 'false') + '" data-a="' + act + '" data-x="' + esc(arg) + '">' + esc(label) + '</button>';
const inp = (b, val, o = {}) => o.type === 'time' ? '<input class="inp mono" type="time" data-time="1" data-b="' + esc(b) + '" value="' + esc(val) + '"' + (o.r ? ' data-r="1"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '>' : '<input class="inp' + (o.mono ? ' mono' : '') + (o.cls ? ' ' + o.cls : '') + '" data-b="' + esc(b) + '" value="' + esc(val) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.type ? ' type="' + o.type + '"' : '') + (o.num ? ' inputmode="numeric"' : '') + (o.r ? ' data-r="1"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + '>';
const field = (label, html) => '<label class="f">' + esc(label) + html + '</label>';
const sw = (label, sub, on, act, arg) => '<button class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-a="' + act + '" data-x="' + esc(arg || '') + '"><span class="col" style="gap:2px"><span style="font-weight:500">' + esc(label) + '</span>' + (sub ? '<span class="tiny muted">' + esc(sub) + '</span>' : '') + '</span><span class="track"><i></i></span></button>';


/* ---------- subscription logic ---------- */
const isPro = () => !!(S.pro && S.pro.until >= todayIso());
const freeLeft = () => !S.freeUsed;
const canCreate = () => isPro() || freeLeft();
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function verifyActivation(code) {
  const parts = String(code || '').split('.');
  if (parts.length !== 3) return { ok: false, why: 'format' };
  const [dev, until, sig] = parts;
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(dev)) return { ok: false, why: 'format' };
  if (dev !== S.deviceId) return { ok: false, why: 'device' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, why: 'format' };
  try {
    const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(SUB.pub), (c) => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u(sig), new TextEncoder().encode(dev + '.' + until));
    if (!ok) return { ok: false, why: 'sig' };
    return until < todayIso() ? { ok: false, why: 'expired', until } : { ok: true, until };
  } catch (e) { return { ok: false, why: 'sig' }; }
}
function subStatusText() {
  if (isPro()) return T('Подписка до ', 'Subscribed until ') + fmtDate(S.pro.until, { year: true });
  if (freeLeft()) return T('Первый проект — бесплатно', 'Your first project is free');
  return T('Бесплатный проект использован', 'Free project used');
}
function vPro() {
  const msg = T('Привет! Подписка SET оплачена. Мой код: ', 'Hi! I paid for SET. My code: ') + S.deviceId + (S.profile.phone ? T(', телефон: ', ', phone: ') + S.profile.phone : '') + (S.profile.name ? ' (' + S.profile.name + ')' : '');
  let h = '<div class="screen"><div class="top">' + backBtn('#/me') + '<span class="kicker">' + T('Подписка', 'Subscription') + '</span><span style="width:44px"></span></div>';
  h += '<h1 class="pad4">SET<br>' + T('организатору', 'for organisers') + '</h1>';
  h += '<div class="card glow-pink" style="padding:22px"><span class="small">' + esc(subStatusText()) + '</span><span class="mono" style="font-size:38px;letter-spacing:-0.02em">' + money(SUB.price) + ' ₽<span class="small muted" style="font-family:var(--body)"> / ' + T('месяц', 'month') + '</span></span>' +
    [[T('Сколько угодно съёмок', 'Unlimited shoots')], [T('Смета с бартером и резервом', 'Budgets with barter and contingency')], [T('Лист на площадку и режим площадки', 'Set sheet and on-set mode')], [T('Мой доход и выгрузка для налоговой', 'Income tracking and tax export')]].map((x) => '<span class="small">✓ ' + esc(x[0]) + '</span>').join('') + '</div>';
  h += '<div class="card"><h3>' + T('1. Оплати по СБП', '1. Pay via SBP') + '</h3>' +
    (SUB.qr ? '<img src="' + esc(SUB.qr) + '" alt="QR СБП" style="width:220px;max-width:100%;align-self:center;border-radius:16px;background:#fff;padding:10px">' : '') +
    (SUB.payUrl ? '<a class="btn" href="' + esc(SUB.payUrl) + '" target="_blank" rel="noopener">' + T('Открыть оплату в банке', 'Open payment in your bank') + '</a>' : '<span class="small muted">' + T('Ссылка на оплату скоро появится', 'Payment link coming soon') + '</span>') +
    '<span class="tiny muted">' + T('Картой любого российского банка через приложение банка. Сумма — ', 'Any Russian bank card via your bank app. Amount: ') + money(SUB.price) + ' ₽</span></div>';
  h += '<div class="card"><h3>' + T('2. Напиши мне', '2. Message me') + '</h3><span class="small">' + T('Пришли скриншот оплаты и свой код:', 'Send the payment screenshot and your code:') + '</span><button class="btn soft mono" data-a="copyText" data-x="' + esc(S.deviceId) + '" style="font-size:22px;letter-spacing:0.08em">' + esc(S.deviceId) + '</button>' +
    field(T('Твой номер телефона', 'Your phone number'), '<input class="inp" type="tel" inputmode="tel" autocomplete="tel" data-b="profile.phone" value="' + esc(S.profile.phone || '') + '" placeholder="+7 900 000-00-00">') + '<span class="tiny muted pad4" style="margin-top:-10px">' + PHONE_HINT() + '</span>' +
    '<div class="grid2">' + (SUB.tg ? '<a class="btn" href="https://t.me/' + esc(SUB.tg) + '" target="_blank" rel="noopener">Telegram</a>' : '') + (SUB.wa ? '<a class="btn" href="https://wa.me/' + esc(SUB.wa) + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div></div>';
  h += '<div class="card"><h3>' + T('3. Нажми ссылку из ответа', '3. Tap the link I send back') + '</h3><span class="small muted">' + T('Подписка включится на этом телефоне. Данные никуда не пропадут.', 'The subscription turns on for this phone. Your data stays.') + '</span><input class="inp mono" id="actCode" placeholder="' + T('или вставь код активации сюда', 'or paste the activation code') + '"><button class="btn soft" data-a="activateManual">' + T('Активировать', 'Activate') + '</button></div>';
  h += '<span class="tiny muted pad4">' + T('Съёмки, люди и доход остаются у тебя и без подписки — без неё нельзя только создавать новые проекты.', 'Without a subscription you keep all your data — you just can’t create new projects.') + '</span></div>' + nav('');
  return h;
}
async function doActivate(code) {
  const r = await verifyActivation(code);
  if (r.ok) { S.pro = { until: r.until, code }; save(); toast(T('Подписка включена до ', 'Subscribed until ') + fmtDate(r.until, { year: true })); location.hash = '#/me'; }
  else toast(r.why === 'device' ? T('Этот код для другого телефона', 'This code is for another device') : r.why === 'expired' ? T('Срок этой подписки уже закончился — напиши мне, пришлю новую ссылку', 'This subscription has expired — message me for a new link') : T('Код не подошёл — проверь, что скопирован целиком', 'Code didn’t work — copy it whole'));
}


/* ---------- tips (first-run coaching) ---------- */
const TIPS = {
  today: ['Это главный экран: ближайшая съёмка и что важно сделать сейчас. «+» внизу — новая съёмка, аватар — твой профиль и доход.', 'Your home screen: the next shoot and what matters now. “+” below starts a new shoot; the avatar opens your profile and income.'],
  new: ['Выбери формат — от него зависят подсказки и разделы. Потом всё можно поменять.', 'Pick a format — it shapes hints and sections. You can change everything later.'],
  project: ['Здесь главное: дата, место, подготовка. Вкладки сверху — мудборд, тайминг, команда, образы, смета. «Отправить команде» собирает всё в одно сообщение.', 'The essentials: date, venue, prep. Tabs above: moodboard, schedule, team, looks, budget. “Send to the team” packs it all into one message.'],
  mood: ['Добавь фото с телефона и ссылки на Pinterest. Команде мудборд уходит одной картинкой А4 — её же можно распечатать.', 'Add photos and Pinterest links. The team gets them in one go.'],
  timing: ['Нажми «⋯» у строки — добавишь «до», «кто» и что идёт параллельно. В режиме площадки SET будет подсказывать по этому таймингу.', 'Tap “⋯” on a row to add “until”, “who” and what runs in parallel. On set, SET will prompt you along this schedule.'],
  team: ['Отмечай статус: позвали → идёт. «Написать» готовит приглашение с условиями. Ставки видишь только ты.', 'Track status: asked → in. “Message” drafts an invite with terms. Only you see rates.'],
  looks: ['В «Настроить» оставь только нужные поля: без мейка — без визажиста. Из образов собираются карточки А4 для площадки.', 'A look = model, outfit, make-up, hair and a photo on one card. On set they queue up in order.'],
  budget: ['Нажми на строку — количество, ставка и форма оплаты: деньги, бартер, сертификат. «Подтянуть команду» перенесёт людей сюда.', 'Tap a line for qty, rate and payment: money, barter, voucher. “Pull in the team” brings people here.'],
  onset: ['Режим площадки: что идёт сейчас, что дальше и образы по очереди. Экран не гаснет. Разреши уведомления — SET напомнит за 10 минут до каждого пункта, пока приложение открыто.', 'On-set mode: what’s now, what’s next and looks in order. The screen stays on. Allow notifications and SET reminds you 10 minutes before each item while the app is open.'],
  calendar: ['Пунктиром — съёмки не через SET. Добавляй их, чтобы ничего не наложилось и всё попало в доход.', 'Dashed = shoots outside SET. Log them so nothing overlaps and income adds up.'],
  people: ['Твоя база: все, с кем ты снимаешь. Люди добавляются сами, когда зовёшь их в проект.', 'Your people: everyone you shoot with. They’re added when you invite them to a project.'],
  me: ['Деньги и смены за период. Нажми на съёмку — поправишь сумму, оплату и чек.', 'Money and shifts for a period. Tap a shoot to edit the amount, payment and receipt.']
};
function tip(key) {
  if (S.tipsOff || (S.seenTips || {})[key] || !TIPS[key]) return '';
  return '<div class="hint" style="background:rgba(var(--sky),0.22)"><span class="dot" style="background:rgb(var(--cobalt));box-shadow:0 0 0 4px rgba(var(--cobalt),0.18)"></span><span class="grow">' + esc(L() === 'en' ? TIPS[key][1] : TIPS[key][0]) + '</span><button class="btn sm soft" data-a="tipOk" data-x="' + key + '">' + T('Понятно', 'Got it') + '</button></div>';
}

/* ---------- notifications ---------- */
const notifSupported = () => 'Notification' in window;
const notifState = () => (notifSupported() ? Notification.permission : 'unsupported');
async function notify(title, body) {
  try { if (navigator.vibrate) navigator.vibrate([180, 80, 180]); } catch (e) { /* no vibration */ }
  toast(title + (body ? ' · ' + body : ''));
  if (notifState() !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.ready; if (reg) { reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'set-' + title }); return; } } catch (e) { /* fall through */ }
  try { new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch (e) { /* not allowed here */ }
}
function notifCard(compact) {
  const st = notifState();
  const isIOS = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (st === 'granted') return compact ? '' : '<div class="card"><h3>' + T('Уведомления', 'Notifications') + '</h3><span class="small">' + T('Включены ✓ SET напомнит о пунктах тайминга в режиме площадки, пока приложение открыто.', 'On ✓ SET reminds you of schedule items in on-set mode while the app is open.') + '</span><button class="btn soft sm" data-a="testNotif">' + T('Проверить', 'Test') + '</button></div>';
  if (st === 'unsupported' || (isIOS && !standalone)) return compact ? '' : '<div class="card"><h3>' + T('Уведомления', 'Notifications') + '</h3><span class="small muted">' + T('На iPhone уведомления работают, только если SET добавлен на экран «Домой» и открыт оттуда.', 'On iPhone, notifications work only when SET is added to the Home Screen and opened from there.') + '</span></div>';
  if (st === 'denied') return compact ? '' : '<div class="card"><h3>' + T('Уведомления', 'Notifications') + '</h3><span class="small muted">' + T('Запрещены. Включить можно в настройках телефона → SET → Уведомления.', 'Blocked. Turn them on in your phone settings → SET → Notifications.') + '</span></div>';
  return '<div class="' + (compact ? 'hint' : 'card') + '"' + (compact ? ' style="align-items:center"' : '') + '>' + (compact ? '<span class="dot"></span>' : '<h3>' + T('Уведомления', 'Notifications') + '</h3>') + '<span class="' + (compact ? 'grow' : 'small') + '">' + T('Разреши уведомления — SET напомнит за 10 минут до каждого пункта тайминга.', 'Allow notifications — SET reminds you 10 minutes before each schedule item.') + '</span><button class="btn sm' + (compact ? ' soft' : '') + '" data-a="askNotif">' + T('Разрешить', 'Allow') + '</button></div>';
}

/* ---------- on-set coach: what's now, what's next, nudges ---------- */
function setClock(s) {
  // returns minutes since day start of the shoot (handles overnight), or null if not shoot day
  const now = new Date(); const t = todayIso(); const y = isoOf(new Date(Date.now() - 864e5));
  const nm = now.getHours() * 60 + now.getMinutes();
  if (s.date === t) return nm < (mins(s.call) ?? 0) - 120 ? nm + 1440 : nm;
  if (s.date === y && mins(s.end) != null && mins(s.end) < (mins(s.call) ?? 0)) return nm + 1440;
  return null;
}
function coach(s) {
  const nowK = setClock(s);
  if (nowK == null) return null;
  const rows = sortedTiming(s).map((x) => ({ ...x, k: dayKey(s, x.t), k2: x.t2 ? dayKey(s, x.t2) : null }));
  const callK = mins(s.call) ?? 0; let endK = mins(s.end); if (endK != null && endK <= callK) endK += 1440;
  let cur = null, next = null;
  rows.forEach((r, i) => { const until = r.k2 ?? (rows[i + 1] ? rows[i + 1].k : endK ?? r.k + 60); if (r.k <= nowK && nowK < until) cur = { ...r, until }; });
  next = rows.find((r) => r.k > nowK) || null;
  const nudges = [];
  const elapsed = nowK - callK;
  if (elapsed >= 300 && !hasMeal(s)) nudges.push(T('Команда работает уже ' + Math.floor(elapsed / 60) + ' ч — пора покормить людей.', 'The crew has worked ' + Math.floor(elapsed / 60) + 'h — time to feed people.'));
  if (endK != null && endK - nowK <= 30 && endK - nowK > 0) nudges.push(T('До конца ' + (endK - nowK) + ' мин — начинайте собирать вещи и свет.', (endK - nowK) + ' min to wrap — start packing clothes and light.'));
  if (endK != null && nowK > endK) nudges.push(T('Переработка: уже ' + (nowK - endK) + ' мин сверх тайминга. Предупреди команду и заказчика.', 'Overtime: ' + (nowK - endK) + ' min over. Let the crew and client know.'));
  // pace of looks across the shooting window
  const shootRows = rows.filter((r) => /съёмк|образ|shoot|look/i.test(r.w) && !/обед|lunch/i.test(r.w));
  if (s.looks.length && shootRows.length) {
    const a = shootRows[0].k; const lastR = shootRows[shootRows.length - 1]; const b = lastR.k2 ?? (rows[rows.indexOf(rows.find((r) => r.id === lastR.id)) + 1]?.k ?? endK ?? a + 180);
    if (nowK > a && nowK < b && b > a) {
      const expected = Math.floor(s.looks.length * (nowK - a) / (b - a));
      const done = s.looks.filter((l) => l.done).length;
      if (expected - done >= 1) nudges.push(T('Отстаём на ' + (expected - done) + ' ' + plural(expected - done, 'образ', 'образа', 'образов') + ' — ускоряемся или сокращаем кадры.', 'Behind by ' + (expected - done) + ' look(s) — speed up or cut shots.'));
      else if (done - expected >= 1) nudges.push(T('Идём с опережением — можно снять дубли или бонусные кадры.', 'Ahead of schedule — time for extra takes.'));
    }
  }
  return { nowK, cur, next, nudges, endK };
}
const clockText = (k) => pad(Math.floor(((k % 1440) + 1440) % 1440 / 60)) + ':' + pad(((k % 60) + 60) % 60);
let coachTimer = null, wakeLock = null;
const fired = new Set();
function coachTick() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
  if (parts[0] !== 'p' || parts[2] !== 'onset') return stopCoach();
  const s = getShoot(parts[1]); if (!s) return;
  const c = coach(s);
  if (c) {
    if (c.next) { const left = c.next.k - c.nowK; const key = s.id + c.next.id;
      if (left <= 10 && left > 0 && !fired.has(key + '10')) { fired.add(key + '10'); notify(T('Через ' + left + ' мин', 'In ' + left + ' min'), c.next.t + ' — ' + c.next.w + (c.next.who ? ' (' + c.next.who + ')' : '')); }
      if (left <= 0 && !fired.has(key + '0')) { fired.add(key + '0'); notify(T('Сейчас', 'Now'), c.next.w); } }
    c.nudges.forEach((n) => { const key = s.id + n.slice(0, 18); if (!fired.has(key)) { fired.add(key); notify(T('Подсказка', 'Heads-up'), n); } });
  }
  if (!ui.sheet && !document.activeElement?.matches?.('input,textarea,select')) render();
}
function startCoach() { if (coachTimer) return; coachTimer = setInterval(coachTick, 30000); setTimeout(coachTick, 1500); try { navigator.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => {}); } catch (e) { /* no wake lock */ } }
function stopCoach() { if (coachTimer) { clearInterval(coachTimer); coachTimer = null; } try { wakeLock?.release(); } catch (e) { /* ignore */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && coachTimer && !wakeLock) { try { navigator.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => {}); } catch (e) { /* ignore */ } } });

/* ========== VIEWS ========== */

/* --- onboarding --- */
function vWelcome() {
  const p = S.profile;
  const o = ui.onb || (ui.onb = { step: 1 });
  const clientOnly = p.roles.length > 0 && !p.ownRole && p.roles.every((r) => CLIENT_ROLES.includes(r));
  const steps = clientOnly ? [1, 4] : [1, 2, 3, 4];
  const idx = steps.indexOf(o.step);
  const done = o.step === 5;
  let h = '<div class="screen has-cta">';
  if (!done) {
    h += '<div class="top"><span class="logo">set</span><span class="kicker">' + T('шаг ' + (idx + 1) + ' из ' + steps.length, 'step ' + (idx + 1) + ' of ' + steps.length) + '</span></div>';
    h += '<div class="progress" style="grid-template-columns:repeat(' + steps.length + ',1fr)">' + steps.map((s, i) => '<span class="' + (i <= idx ? 'on' : '') + '"></span>').join('') + '</div>';
  }
  if (o.step === 1) {
    h += '<div class="chips">' + chip('Русский', S.lang === 'ru', 'lang', 'ru', 'sm') + chip('English', S.lang === 'en', 'lang', 'en', 'sm') + '</div>';
    h += '<h1>' + T('Давай<br>знакомиться', 'Nice to<br>meet you') + '</h1><p class="muted" style="margin:0">' + T('Заполнишь один раз — дальше всё подставится само', 'Fill this in once — the rest fills itself in') + '</p>';
    h += '<div class="grid2">' + field(T('Имя', 'Name'), inp('profile.name', p.name, { ph: T('Как к тебе обращаться', 'Your name') })) + field(T('Город', 'City'), inp('profile.city', p.city, { ph: T('Казань', 'City') })) + '</div>';
    h += field(T('Номер телефона', 'Phone number'), '<input class="inp" type="tel" inputmode="tel" autocomplete="tel" data-b="profile.phone" value="' + esc(p.phone || '') + '" placeholder="+7 900 000-00-00">') + '<span class="tiny muted pad4" style="margin-top:-10px">' + PHONE_HINT() + ' ' + T('Нужен, чтобы подключить подписку и чтобы команда могла с тобой связаться.', 'Needed for the subscription and so the team can reach you.') + '</span>' +
      field(T('Ник в Telegram', 'Telegram username'), '<input class="inp" data-b="profile.tg" data-tg="1" autocapitalize="off" autocorrect="off" value="' + esc(p.tg || '') + '" placeholder="@nick">');
    h += '<h2 style="margin-top:6px">' + T('Кто ты на съёмке?', 'What do you do on set?') + '</h2><span class="small muted pad4">' + T('Можно несколько', 'Pick as many as you like') + '</span>';
    ui.moreG = ui.moreG || {};
    GROUPS.forEach((g, gi) => {
      const open = !!ui.moreG[gi];
      const vis = g.roles.filter((r) => !r[4] || open || p.roles.includes(r[0]));
      const hidden = g.roles.filter((r) => r[4] && !open && !p.roles.includes(r[0])).length;
      h += '<div class="col"><span class="tiny muted pad4" style="font-weight:600;letter-spacing:.06em;text-transform:uppercase">' + (L() === 'en' ? g.en : g.ru) + '</span><div class="chips">' +
        vis.map((r) => chip(L() === 'en' ? r[2] : r[1], p.roles.includes(r[0]), 'toggleRole', r[0])).join('') +
        (hidden ? '<button class="chip" data-a="moreG" data-x="' + gi + '" style="background:transparent;border:1.5px dashed var(--ink3)">' + T('Ещё · ', 'More · ') + hidden + '</button>' : open && g.roles.some((r) => r[4]) ? '<button class="chip" data-a="moreG" data-x="' + gi + '" style="background:transparent;color:var(--ink2)">' + T('Свернуть', 'Less') + '</button>' : '') + '</div></div>';
    });
    h += inp('profile.ownRole', p.ownRole, { ph: T('Нет твоей роли? Напиши свою', 'Not listed? Type your role'), cls: 'dashed', r: true });
    if (p.ownRole) h += '<span class="small muted pad4">' + T('Добавим «' + esc(p.ownRole) + '» как твою роль. На следующем шаге расскажешь, что делаешь.', 'We’ll add “' + esc(p.ownRole) + '” as your role.') + '</span>';
    if (clientOnly) h += '<div class="card glow-pink"><b>' + T('Заказчику — всего 2 шага', 'Clients: just 2 steps') + '</b><span class="small">' + T('Навыки и ставки не нужны.', 'No skills or rates needed.') + '</span></div>';
  }
  if (o.step === 2) {
    h += '<h1>' + T('Что<br>умеешь', 'What you<br>do best') + '</h1><p class="muted" style="margin:0">' + T('Это попадёт в твою карточку', 'This goes on your card') + '</p>';
    p.roles.filter((r) => !CLIENT_ROLES.includes(r)).forEach((r) => {
      const R = ROLE[r];
      h += '<div class="card glow-' + R.glow + '"><h3>' + esc(roleName(r)) + '</h3><div class="chips">' + R.skills.map((sk) => chip(skillName(sk), p.skills.includes(r + ':' + sk), 'toggleSkill', r + ':' + sk, 'sm')).join('') + '</div></div>';
    });
    if (p.ownRole) h += '<div class="card"><h3>' + esc(p.ownRole) + '</h3>' + inp('profile.ownSkill', p.ownSkill, { ph: T('Что делаешь на съёмке? Например: свет для предметки', 'What do you do on set?') }) + '<span class="tiny muted">' + T('Новые роли мы смотрим и добавляем в общий список', 'We review new roles and add them for everyone') + '</span></div>';
    if (!p.roles.length && !p.ownRole) h += '<div class="card">' + T('Вернись на шаг назад и выбери, кто ты на съёмке', 'Go back and pick your role') + '</div>';
    h += '<h3 class="pad4">' + T('Опыт', 'Experience') + '</h3><div class="chips">' + [T('до года', '< 1 year'), T('1–3 года', '1–3 years'), T('3+ лет', '3+ years')].map((x) => chip(x, p.exp === x, 'setProfile', 'exp|' + x)).join('') + '</div>';
  }
  if (o.step === 3) {
    h += '<h1>' + T('Ставка<br>и связь', 'Rate &amp;<br>contact') + '</h1><p class="muted" style="margin:0">' + T('Ставку видишь только ты. Подставим её, когда тебя зовут', 'Only you see your rate') + '</p>';
    h += '<div class="card glow-lemon"><label class="f">' + T('Ставка от, ₽', 'Rate from') + inp('profile.rate', p.rate, { mono: true, num: true, ph: '10 000' }) + '</label><div class="chips">' + [['смена', T('за смену', 'per day')], ['час', T('за час', 'per hour')], ['проект', T('за проект', 'per project')]].map((u) => chip(u[1], p.unit === u[0], 'setProfile', 'unit|' + u[0], 'sm')).join('') + '</div></div>';
    h += '<h3 class="pad4">' + T('Как с тобой связаться', 'Preferred contact') + '</h3><div class="chips">' + ['Telegram', 'WhatsApp', T('Звонок', 'Call')].map((x) => chip(x, p.contact === x, 'setProfile', 'contact|' + x)).join('') + '</div>';
    h += field('Instagram', inp('profile.insta', p.insta, { ph: '@nick' }));
  }
  if (o.step === 4) {
    h += '<h1>' + T('На<br>площадке', 'On<br>set') + '</h1><p class="muted" style="margin:0">' + T('Мелочи, из-за которых день проходит спокойно', 'Small things that keep the day calm') + '</p>';
    h += '<div class="card glow-lemon"><h3>' + T('Что не ешь', 'Food') + '</h3><span class="small">' + T('Учтём, когда закажем еду на долгую съёмку', 'For catering on long shoots') + '</span><div class="chips">' + FOOD.map((f) => chip(L() === 'en' ? f[2] : f[1], p.food.includes(f[0]), 'toggleFood', f[0], 'sm')).join('') + '</div>' + inp('profile.foodOther', p.foodOther, { ph: T('Своё: например, без орехов', 'Other: e.g. no nuts') }) + '</div>';
  }
  if (done) {
    const rl = p.roles.map(roleName).concat(p.ownRole ? [p.ownRole] : []).join(' · ');
    h += '<div style="padding-top:24px" class="col"><h1>' + T('Готово', 'Done') + (p.name ? ',<br>' + esc(p.name) : '!') + '</h1><span class="muted">' + T('Твоя карточка', 'Your card') + '</span></div>';
    h += '<div class="card glow-' + (ROLE[p.roles[0]]?.glow || 'pink') + '" style="border-radius:30px;padding:22px"><div class="row between"><span class="avatar" style="width:72px;height:72px;border-radius:36px;font-size:30px">' + esc(initials(p.name)) + '</span>' + (p.exp ? '<span class="badge">' + esc(T('опыт ', 'exp. ') + p.exp) + '</span>' : '') + '</div><span class="h1" style="font-size:34px">' + esc(p.name || T('Твоё имя', 'Your name')) + '</span><span>' + esc(rl || T('Роль не выбрана', 'No role yet')) + '</span>' + (p.insta ? '<b class="small">' + esc(p.insta.startsWith('@') ? p.insta : '@' + p.insta) + '</b>' : '') + (p.tg ? '<span class="small">Telegram ' + esc(tgNick(p.tg)) + '</span>' : '') + (p.phone ? '<span class="small mono">' + esc(p.phone) + '</span>' : '') + '</div>';
  }
  h += '</div>';
  h += '<div class="cta nonav">';
  if (done) h += '<button class="btn big" data-a="finishOnb">' + T('В приложение', 'Open SET') + '</button>';
  else {
    if (idx > 0) h += '<button class="iconbtn" style="width:60px;height:60px;border-radius:30px" data-a="onbBack" aria-label="' + T('Назад', 'Back') + '">' + I.back + '</button>';
    h += '<button class="btn big grow" data-a="onbNext">' + (o.step === 4 ? T('Готово', 'Done') : T('Дальше', 'Next')) + '</button>';
  }
  h += '</div>';
  return h;
}

/* --- today --- */
function vToday() {
  const t = todayIso();
  const up = S.shoots.filter((s) => s.date && s.date >= t && s.status !== 'done').sort(sortByDate);
  const todays = up.filter((s) => s.date === t);
  const nextS = up[0];
  const d = new Date();
  let h = '<div class="screen">';
  h += '<div class="top"><span class="logo">set</span><div class="row"><a class="iconbtn" href="#/settings" aria-label="' + T('Настройки', 'Settings') + '">' + I.gear + '</a><a class="avatar" href="#/me" aria-label="' + T('Профиль и доход', 'Profile and income') + '">' + esc(initials(S.profile.name)) + '</a></div></div>';
  h += '<div class="col pad4" style="gap:4px"><span class="kicker">' + esc(WD_L[L()][d.getDay()]) + ', ' + fmtDate(t) + '</span><h1>' + (todays.length ? T('Сегодня<br>съёмка', 'Shoot<br>today') : (nextS ? T('Сегодня<br>спокойно', 'A calm<br>day') : T('Чистый<br>лист', 'A blank<br>page'))) + '</h1></div>';
  h += tip('today');
  h += recapBanner();
  if (!S.shoots.length) {
    h += '<div class="card glow-pink" style="padding:22px"><h2>' + T('Первая съёмка', 'Your first shoot') + '</h2><span>' + T('Создай проект — тайминг, команда и образы соберутся в одном месте.', 'Create a project — schedule, team and looks in one place.') + '</span><a class="btn" href="#/new">' + T('Новая съёмка', 'New shoot') + '</a><button class="textbtn" data-a="demo">' + T('Сначала посмотреть на примере', 'Explore an example first') + '</button></div>';
  }
  todays.forEach((s) => {
    if (s.src === 'own') { h += '<a class="card dashed" href="#/own/' + s.id + '" style="text-decoration:none;color:inherit"><span class="kicker">' + T('Сегодня', 'Today') + ' · ' + T('сбор', 'call') + ' ' + esc(s.call) + ' · ' + T('не через SET', 'outside SET') + '</span><h2>' + esc(titleOf(s)) + '</h2></a>'; return; }
    h += '<div class="card glow-lemon" style="padding:22px"><span class="kicker">' + T('Сегодня', 'Today') + ' · ' + T('сбор', 'call') + ' ' + esc(s.call) + '</span><h2>' + esc(titleOf(s)) + '</h2><span class="small">' + esc([s.place, s.address].filter(Boolean).join(', ')) + '</span><div class="row"><a class="btn grow" href="#/p/' + s.id + '/onset">' + T('Режим площадки', 'On-set mode') + '</a><a class="btn ghost" href="#/p/' + s.id + '/print">' + T('Лист', 'Sheet') + '</a></div></div>';
  });
  if (nextS && nextS.date !== t) {
    const dd = parseIso(nextS.date);
    h += '<a class="card ' + (nextS.src === 'own' ? 'dashed' : 'glow-pink') + '" href="' + (nextS.src === 'own' ? '#/own/' : '#/p/') + nextS.id + '" style="text-decoration:none;color:inherit;padding:22px"><div class="row between"><span class="kicker">' + T('Следующая', 'Next') + ' · ' + relDay(nextS.date) + '</span><span class="badge">' + esc(L() === 'en' ? KINDS[nextS.kind]?.en || '' : KINDS[nextS.kind]?.ru || '') + '</span></div><div class="row" style="align-items:flex-end;gap:14px"><span class="big-date" style="font-size:64px">' + dd.getDate() + '</span><span class="big-date" style="font-size:30px;padding-bottom:6px">' + MON_S[L()][dd.getMonth()].toUpperCase() + '</span></div><h2>' + esc(titleOf(nextS)) + '</h2><span class="small">' + T('сбор', 'call') + ' ' + esc(nextS.call) + (nextS.end ? '–' + esc(nextS.end) : '') + (nextS.place ? ' · ' + esc(nextS.place) : '') + (nextS.src !== 'own' && nextS.team.length ? ' · ' + nextS.team.length + ' ' + T(plural(nextS.team.length, 'человек', 'человека', 'человек'), 'people') : '') + '</span></a>';
  }
  const all = up.slice(0, 4).flatMap((s) => hints(s).map((x) => ({ ...x, s })));
  if (all.length) {
    h += '<h3 class="pad4">' + T('Сейчас важно', 'Worth doing now') + '</h3>';
    all.slice(0, 3).forEach((x) => { h += '<div class="hint"><span class="dot"></span><div class="col grow" style="gap:6px"><span class="tiny muted">' + esc(titleOf(x.s)) + '</span><span>' + esc(x.text) + '</span></div>' + (x.act ? '<button class="btn sm soft" data-a="' + x.act + '" data-x="' + esc(x.arg || '') + '" data-s="' + x.s.id + '">' + esc(x.label) + '</button>' : '<a class="btn sm soft" href="#/p/' + x.s.id + '">' + T('Открыть', 'Open') + '</a>') + '</div>'; });
  }
  if (up.length > 1) {
    h += '<h3 class="pad4">' + T('Дальше', 'Coming up') + '</h3><div class="card tight">' + up.slice(nextS && nextS.date !== t ? 1 : 0).filter((s) => s.date !== t).slice(0, 5).map((s) => '<a class="li" href="' + (s.src === 'own' ? '#/own/' : '#/p/') + s.id + '"><span class="mono small" style="min-width:58px">' + esc(fmtDate(s.date).replace(/ \d{4}$/, '')) + '</span><span class="grow"><b style="font-weight:600">' + esc(titleOf(s)) + '</b><br><span class="tiny muted">' + T('сбор', 'call') + ' ' + esc(s.call) + '</span></span>' + I.next.replace('<svg', '<svg width="18" height="18"') + '</a>').join('') + '</div>';
  }
  h += '</div>' + nav('today');
  return h;
}

/* --- projects list --- */
function vProjects() {
  const t = todayIso();
  const list = S.shoots.filter((s) => s.src === 'set' || s.src === 'guest');
  const active = list.filter((s) => !isPast(s)).sort(sortByDate);
  const past = list.filter((s) => isPast(s)).sort((a, b) => sortByDate(b, a));
  const shown = ui.filter === 'past' ? past : active;
  let h = '<div class="screen"><div class="top"><span class="logo">set</span><a class="avatar" href="#/me">' + esc(initials(S.profile.name)) + '</a></div><h1 class="pad4">' + T('Проекты', 'Projects') + '</h1>';
  h += '<div class="chips">' + chip(T('Впереди', 'Upcoming') + ' · ' + active.length, ui.filter !== 'past', 'setUi', 'filter|active') + chip(T('Прошли', 'Past') + ' · ' + past.length, ui.filter === 'past', 'setUi', 'filter|past') + '</div>';
  if (!shown.length) h += '<div class="empty">' + (ui.filter === 'past' ? T('Здесь будут прошедшие съёмки', 'Past shoots will appear here') : T('Пока пусто. Нажми «+» внизу.', 'Nothing yet. Tap “+” below.')) + '</div>';
  shown.forEach((s) => {
    const dd = parseIso(s.date);
    h += '<a class="card glow-' + (KINDS[s.kind]?.glow || 'pink') + '" href="#/p/' + s.id + '" style="text-decoration:none;color:inherit;flex-direction:row;gap:14px;align-items:center"><span class="col" style="gap:0;min-width:54px">' + (dd ? '<span class="big-date" style="font-size:40px">' + dd.getDate() + '</span><span class="tiny">' + MON_S[L()][dd.getMonth()] + '</span>' : '<span class="tiny muted">' + T('без даты', 'no date') + '</span>') + '</span><span class="col grow" style="gap:4px"><b style="font-size:16px;font-weight:600">' + esc(titleOf(s)) + '</b><span class="tiny">' + (s.src === 'guest' ? T('позвали', 'invited') + (s.guest?.from?.name ? ' · ' + esc(s.guest.from.name) : '') : esc(L() === 'en' ? KINDS[s.kind]?.en : KINDS[s.kind]?.ru)) + ' · ' + s.team.length + ' ' + T(plural(s.team.length, 'человек', 'человека', 'человек'), 'people') + (s.date && s.date >= t ? ' · ' + relDay(s.date) : '') + '</span></span>' + (s.status === 'done' ? '<span class="badge ok">' + T('сдано', 'done') + '</span>' : '') + '</a>';
  });
  h += '<div class="card dashed" style="gap:10px"><b>' + T('Позвали в проект?', 'Invited to a project?') + '</b><span class="small muted">' + T('Ссылка открылась не в приложении? Вставь её сюда — проект сохранится у тебя.', 'Link opened outside the app? Paste it here and the project is saved.') + '</span><input class="inp" id="joinPaste" placeholder="' + T('ссылка от продюсера', 'link from the producer') + '" autocomplete="off"><button class="btn soft" data-a="pasteJoin">' + T('Открыть проект', 'Open project') + '</button></div>';
  h += '</div>' + nav('projects');
  return h;
}

/* --- new shoot --- */
function vNew() {
  if (!canCreate()) return '<div class="screen"><div class="top">' + backBtn('#/today') + '<span class="kicker">' + T('Новая съёмка', 'New shoot') + '</span><span style="width:44px"></span></div><h1 class="pad4">' + T('Первый проект<br>был бесплатным', 'Your first project<br>was free') + '</h1><div class="card glow-pink"><span>' + T('Он и все твои съёмки, люди и доход остаются с тобой. Чтобы создать следующий проект, оформи подписку — ', 'It stays with you, along with your people and income. To create the next project, subscribe — ') + money(SUB.price) + T(' ₽ в месяц.', ' ₽ a month.') + '</span><a class="btn" href="#/pro">' + T('Оформить подписку', 'Subscribe') + '</a></div><span class="small muted pad4">' + T('Свою съёмку не через SET можно добавить в календаре бесплатно.', 'You can still log your own shoots in the calendar for free.') + '</span></div>' + nav('');
  const n = ui.newKind;
  let h = '<div class="screen has-cta"><div class="top">' + backBtn('#/today') + '<span class="kicker">' + T('Новая съёмка', 'New shoot') + '</span></div>';
  if (!isPro()) h += '<span class="badge warn" style="align-self:flex-start">' + T('Первый проект — бесплатно', 'Your first project is free') + '</span>';
  h += '<h1 class="pad4">' + T('Что<br>снимаем?', 'What are<br>we shooting?') + '</h1>' + tip('new');
  Object.keys(KINDS).forEach((k) => {
    const K = KINDS[k];
    h += '<button class="card glow-' + K.glow + '" data-a="setUi" data-x="newKind|' + k + '" aria-pressed="' + (n === k) + '" style="text-align:left;border:2px solid ' + (n === k ? 'var(--ink)' : 'transparent') + '"><div class="row between"><h2>' + esc(L() === 'en' ? K.en : K.ru) + '</h2>' + (n === k ? '<span class="check on">✓</span>' : '') + '</div><span class="small">' + esc(K.sub[L() === 'en' ? 1 : 0]) + '</span></button>';
  });
  if (n === 'custom') {
    const m = ui.newMods || (ui.newMods = { mood: true, team: true, timing: true, looks: true, budget: false, print: true });
    h += '<div class="card tight">' + [['mood', T('Мудборд', 'Moodboard')], ['timing', T('Тайминг', 'Schedule')], ['team', T('Команда', 'Team')], ['looks', T('Образы', 'Looks')], ['budget', T('Смета', 'Budget')], ['print', T('Распечатка', 'Print sheet')]].map(([k, l]) => sw(l, '', m[k], 'toggleNewMod', k)).join('') + '</div>';
  }
  if (n) {
    h += '<div class="card"><div class="grid2">' + field(n === 'personal' ? T('Клиент', 'Client') : n === 'creative' ? T('Название', 'Title') : T('Бренд / клиент', 'Brand / client'), '<input class="inp" id="nfClient" placeholder="' + (n === 'personal' ? T('Анна К.', 'Anna K.') : n === 'creative' ? 'TFP' : T('Марта', 'Brand')) + '">') + field(T('Что снимаем', 'What'), '<input class="inp" id="nfWhat" placeholder="' + (n === 'personal' ? T('портрет', 'portrait') : T('лукбук', 'lookbook')) + '">') + '</div>' +
      '<div class="grid2">' + field(T('Дата', 'Date'), '<input class="inp" type="date" id="nfDate">') + field(T('Сбор', 'Call time'), '<input class="inp mono" type="time" data-time="1" id="nfCall" value="">') + '</div></div>';
  }
  h += '</div><div class="cta nonav"><button class="btn big" data-a="createShoot"' + (n ? '' : ' disabled') + '>' + (n ? T('Создать', 'Create') : T('Выбери формат', 'Pick a format')) + '</button></div>';
  return h;
}

/* --- project --- */
function vProject(id, tab) {
  const s = getShoot(id);
  if (!s) return vNotFound();
  if (s.src === 'own') { location.hash = '#/me'; return ''; }
  if (s.src === 'guest') return vGuest(s);
  tab = tab || 'main';
  const tabs = [['main', T('Главное', 'Overview')]];
  if (s.modules.mood !== false) tabs.push(['mood', T('Мудборд', 'Moodboard') + ((s.mood || []).length ? ' · ' + s.mood.length : '')]);
  if (s.modules.timing) tabs.push(['timing', T('Тайминг', 'Schedule')]);
  if (s.modules.team) tabs.push(['team', T('Команда', 'Team') + ' · ' + s.team.length]);
  if (s.modules.looks) tabs.push(['looks', T('Образы', 'Looks') + ' · ' + s.looks.length]);
  if (s.modules.budget) tabs.push(['budget', T('Смета', 'Budget')]);
  let h = '<div class="screen has-cta"><div class="top">' + backBtn('#/projects') + '<span class="kicker">' + esc(L() === 'en' ? KINDS[s.kind]?.en : KINDS[s.kind]?.ru) + '</span><button class="iconbtn" data-a="shootMenu" data-s="' + s.id + '" aria-label="' + T('Ещё', 'More') + '">⋯</button></div>';
  h += '<div class="col pad4" style="gap:4px"><span class="kicker">' + (s.date ? fmtDate(s.date, { wd: true }) + ' · ' + relDay(s.date) : T('дата не выбрана', 'no date yet')) + '</span><h1 style="font-size:40px">' + esc(titleOf(s)) + '</h1></div>';
  h += '<div class="seg">' + tabs.map(([k, l]) => chip(l, tab === k, 'go', '#/p/' + s.id + '/' + k)).join('') + '</div>';
  h += tip({ main: 'project', mood: 'mood', timing: 'timing', team: 'team', looks: 'looks', budget: 'budget' }[tab]);
  if (tab === 'main') h += pMain(s);
  if (tab === 'timing') h += pTiming(s) + pTimingClear(s);
  if (tab === 'mood') h += pMood(s);
  if (tab === 'team') h += pTeam(s);
  if (tab === 'looks') h += pLooks(s);
  if (tab === 'budget') h += pBudget(s);
  h += '</div>';
  h += '<div class="cta"><button class="btn big grow" data-a="shareTeam" data-s="' + s.id + '">' + T('Отправить команде', 'Send to the team') + '</button>' + (s.modules.print ? '<a class="btn ghost" style="min-height:60px;border-radius:26px" href="#/p/' + s.id + '/print">' + T('Лист', 'Sheet') + '</a>' : '') + '</div>';
  h += nav('projects');
  return h;
}
function pMain(s) {
  const b = 'shoot:' + s.id;
  let h = '';
  const hs = hints(s);
  if (hs.length) {
    hs.slice(0, 2).forEach((x) => { h += '<div class="hint"><span class="dot"></span><span class="grow">' + esc(x.text) + '</span>' + (x.act && x.act !== 'tab' ? '<button class="btn sm soft" data-a="' + x.act + '" data-x="' + esc(x.arg || '') + '" data-s="' + s.id + '">' + esc(x.label) + '</button>' : x.act === 'tab' && x.arg !== 'main' ? '<button class="btn sm soft" data-a="go" data-x="#/p/' + s.id + '/' + x.arg + '">' + esc(x.label) + '</button>' : '') + '</div>'; });
    if (hs.length > 2) h += '<span class="tiny muted pad4">' + T('Ещё ' + (hs.length - 2) + ' — появятся, когда закроешь эти', (hs.length - 2) + ' more after these') + '</span>';
  }
  h += '<div class="card"><div class="grid2">' + field(s.kind === 'personal' ? T('Клиент', 'Client') : T('Бренд / клиент', 'Brand / client'), inp(b + '.client', s.client, { r: true })) + field(T('Что снимаем', 'What'), inp(b + '.what', s.what, { r: true })) + '</div>' +
    field(T('Дата', 'Date'), inp(b + '.date', s.date, { type: 'date', r: true })) + '<div class="grid2">' + field(T('Сбор', 'Call'), inp(b + '.call', s.call, { type: 'time', r: true })) + field(T('Конец', 'Wrap'), inp(b + '.end', s.end, { type: 'time', r: true })) + '</div>' +
    field(T('Место', 'Venue'), inp(b + '.place', s.place, { ph: T('Студия, локация', 'Studio, location') })) + field(T('Адрес', 'Address'), inp(b + '.address', s.address, { ph: T('Улица, дом, как пройти', 'Street, how to get in'), r: true })) + '</div>';
  if (s.checklist.length || true) {
    const dn = s.checklist.filter((c) => c.done).length;
    h += '<div class="row between pad4"><h3>' + T('Подготовка', 'Prep') + '</h3><span class="small muted mono">' + dn + '/' + s.checklist.length + '</span></div><div class="card tight">';
    s.checklist.forEach((c) => { h += '<div class="li"><button class="check ' + (c.done ? 'on' : '') + '" data-a="toggleCheck" data-s="' + s.id + '" data-x="' + c.id + '" aria-label="' + esc(c.text) + '" aria-pressed="' + c.done + '">' + (c.done ? '✓' : '') + '</button><span class="grow ' + (c.done ? 'strike' : '') + '">' + esc(c.text) + '</span><button class="textbtn" data-a="delRow" data-s="' + s.id + '" data-x="checklist|' + c.id + '" aria-label="' + T('Удалить', 'Delete') + '">' + I.x.replace('<svg', '<svg width="16" height="16"') + '</button></div>'; });
    h += '<div class="li"><input class="inp" id="newCheck" placeholder="' + T('+ Что подготовить', '+ Add a task') + '" style="background:transparent;padding:0" data-enter="addCheck" data-s="' + s.id + '"><button class="btn sm soft" data-a="addCheck" data-s="' + s.id + '">' + T('Добавить', 'Add') + '</button></div></div>';
  }
  if (s.kind === 'brand' || s.kind === 'personal') {
    h += '<div class="card glow-sky"><h3>' + T('Договорились', 'Agreed') + '</h3>' + (s.kind === 'brand' ? field(T('Права на фото', 'Usage rights'), inp(b + '.rights', s.rights, { ph: T('1 год · онлайн · Россия', '1 year · online') })) : '') + field(T('Ретушь', 'Retouching'), inp(b + '.retouch', s.retouch, { ph: T('сколько кадров, сколько кругов правок', 'frames, rounds of edits') })) + field(T('Сдача кадров', 'Delivery'), inp(b + '.deliver', s.deliver, { ph: T('дата или срок', 'date or term') })) + '</div>';
  }
  h += '<div class="card">' + field(T('Заметки', 'Notes'), '<textarea class="inp" data-b="' + b + '.notes" placeholder="' + T('Идеи, детали, что не забыть', 'Ideas, details, reminders') + '">' + esc(s.notes) + '</textarea>') + '</div>';
  h += '<div class="grid2"><a class="btn soft" href="#/p/' + s.id + '/onset">' + T('Режим площадки', 'On-set mode') + '</a><a class="btn soft" href="#/p/' + s.id + '/wrap">' + T('После съёмки', 'After the shoot') + '</a></div>';
  return h;
}
function pTiming(s) {
  const b = 'shoot:' + s.id;
  let h = '';
  if (!s.timing.length) h += '<div class="empty">' + T('Тайминг пустой. Добавь первую строку — время и что происходит.', 'No schedule yet. Add the first line — time and what happens.') + '</div>';
  h += '<div class="row between pad4"><span class="small muted">' + T('Длительность', 'Duration') + ': <b class="mono">' + (durationH(s) ? durationH(s).toFixed(1).replace('.0', '') + T(' ч', 'h') : '—') + '</b></span>' + (durationH(s) > 5 && !hasMeal(s) ? '<span class="badge warn">' + T('нужен обед', 'add lunch') + '</span>' : '') + '</div>';
  h += '<div class="card tight">';
  const rows = sortedTiming(s);
  rows.forEach((x) => {
    const p = b + '.timing:' + x.id;
    const open = ui.tlOpen === x.id;
    h += '<div class="tl">' + inp(p + '.t', x.t, { type: 'time', r: true, aria: T('Время', 'Time'), style: 'padding:0 8px;font-size:15px' }) + '<textarea class="inp tlw" rows="1" data-b="' + p + '.w" aria-label="' + T('Что происходит', 'What happens') + '">' + esc(x.w) + '</textarea><button class="textbtn" data-a="tlToggle" data-x="' + x.id + '" aria-expanded="' + open + '" aria-label="' + T('Подробнее', 'Details') + '">' + (open ? '▴' : '⋯') + '</button></div>';
    if (open) h += '<div class="col" style="padding:0 0 10px 0;gap:6px"><div class="grid2">' + field(T('До', 'Until'), inp(p + '.t2', x.t2 || '', { type: 'time' })) + field(T('Кто', 'Who'), inp(p + '.who', x.who || '', { ph: T('визажисты, Альбина…', 'who') })) + '</div>' + field(T('Параллельно / детали', 'In parallel / details'), inp(p + '.det', x.det || '', { ph: T('что происходит одновременно', 'what happens at the same time') })) + '<button class="textbtn" style="align-self:flex-start;color:var(--red)" data-a="delRow" data-s="' + s.id + '" data-x="timing|' + x.id + '">' + T('Удалить строку', 'Delete row') + '</button></div>';
    else if (x.t2 || x.who || x.det) h += '<div class="tiny muted" style="padding:0 0 10px 104px;margin-top:-4px">' + esc([x.t2 && T('до ', 'till ') + x.t2, x.who, x.det].filter(Boolean).join(' · ')) + '</div>';
  });
  if (!rows.length) h += '<div class="empty">' + T('Тайминг пустой — впиши свой по строчкам.', 'Empty — add your own rows.') + '</div>';
  h += '</div><div class="grid2"><button class="btn soft" data-a="addTiming" data-s="' + s.id + '">' + T('+ Строка', '+ Row') + '</button>' + (!hasMeal(s) ? '<button class="btn soft" data-a="addLunch" data-s="' + s.id + '">' + T('+ Обед', '+ Lunch') + '</button>' : '<span></span>') + '</div>';
  h += (mins(s.end) != null && mins(s.call) != null && mins(s.end) < mins(s.call) ? '<span class="small pad4">' + T('Съёмка через полночь: конец ' + esc(s.end) + ' — уже следующего дня. Тайминг идёт по порядку от сбора.', 'Overnight shoot: wrap at ' + esc(s.end) + ' is the next day.') + '</span>' : '') + '<span class="tiny muted pad4">' + T('Совет: дольше 5 часов — кормим команду. Дольше 10 — это переработка.', 'Tip: over 5 hours — feed the team. Over 10 — overtime.') + '</span>';
  return h;
}
function pTimingClear(s) { return s.timing.length ? '<button class="textbtn" data-a="clearTiming" data-s="' + s.id + '">' + T('Очистить тайминг', 'Clear schedule') + '</button>' : ''; }
function pTeam(s) {
  let h = '';
  const st = { yes: [T('идёт', 'in'), 'ok'], no: [T('не может', 'out'), ''], asked: [T('позвали', 'asked'), 'warn'], '': [T('не звали', 'not asked'), ''] };
  if (!s.team.length) h += '<div class="empty">' + T('Добавь людей — из своей базы или новых', 'Add people — from your base or new') + '</div>';
  s.team.forEach((m) => {
    const x = st[m.status || ''];
    h += '<div class="card" style="gap:8px"><div class="row"><span class="avatar sm soft">' + esc(initials(m.name)) + '</span><span class="col grow" style="gap:0"><b style="font-weight:600">' + esc(m.name) + '</b><span class="tiny muted">' + esc(roleName(m.role)) + (m.call ? ' · ' + T('сбор', 'call') + ' ' + esc(m.call) : '') + (memberPayText(m) ? ' · ' + esc(memberPayText(m)) : '') + '</span>' + (m.note ? '<br><span class="tiny muted">' + esc(m.note) + '</span>' : '') + '</span><span class="badge ' + x[1] + '">' + x[0] + '</span><button class="iconbtn" style="width:40px;height:40px;border:none" data-a="editMember" data-s="' + s.id + '" data-x="' + m.id + '" aria-label="' + T('Изменить', 'Edit') + '">✎</button></div>' +
      '<div class="row wrap">' + [['asked', T('Позвали', 'Asked')], ['yes', T('Идёт', 'In')], ['no', T('Не может', 'Out')]].map(([k, l]) => '<button class="chip sm" aria-pressed="' + (m.status === k) + '" data-a="memberStatus" data-s="' + s.id + '" data-x="' + m.id + '|' + k + '">' + l + '</button>').join('') + '<button class="chip sm" data-a="invitePerson" data-s="' + s.id + '" data-x="' + m.id + '">' + T('Написать', 'Message') + '</button></div></div>';
  });
  h += '<div class="grid2"><button class="btn soft" data-a="pickPeople" data-s="' + s.id + '">' + T('Из моих людей', 'From my people') + '</button><button class="btn soft" data-a="editMember" data-s="' + s.id + '" data-x="">' + T('+ Новый человек', '+ New person') + '</button></div>';
  const handles = s.team.map((m) => S.people.find((p) => p.id === m.pid)?.insta).filter(Boolean);
  if (handles.length) h += '<button class="btn ghost" data-a="copyText" data-x="' + esc(handles.map((x) => (x.startsWith('@') ? x : '@' + x)).join(' ')) + '">' + T('Скопировать отметки для Instagram', 'Copy Instagram tags') + '</button>';
  const food = teamFood(s);
  if (food) h += '<div class="hint"><span class="dot"></span><span>' + T('Еда: ', 'Food: ') + esc(food) + '</span></div>';
  h += '<span class="tiny muted pad4">' + T('В каждом приглашении — ссылка на проект: человек сохранит его в своём SET. Поменялся тайминг или адрес — нажми «Отправить команде», и проект обновится у всех, кто откроет новую ссылку.', 'Every invite has a project link the person saves in their SET. Changed something? Tap “Send to the team” and it updates for everyone who opens the new link.') + '</span>';
  h += '<span class="lock pad4">' + I.lock + T('Ставки видишь только ты. Каждый получает только своё.', 'Only you see rates.') + '</span>';
  return h;
}
function lookSlot(s, l, key, label) {
  if (l[key]) return '<div style="position:relative">' + imgTag(l[key], 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:18px;display:block') + '<span class="tiny" style="position:absolute;left:8px;top:8px;background:rgba(255,255,255,.85);border-radius:10px;padding:2px 8px">' + esc(label) + '</span><button class="chip sm" style="position:absolute;right:8px;bottom:8px" data-a="delLookImg" data-s="' + s.id + '" data-x="' + l.id + '|' + key + '">' + T('Убрать', 'Remove') + '</button></div>';
  return '<button class="btn soft" style="min-height:96px;height:auto;flex-direction:column;border-radius:18px;white-space:normal" data-a="pickLookImg" data-s="' + s.id + '" data-x="' + l.id + '|' + key + '">+ ' + esc(label) + '</button>';
}
const LOOK_F = [
  ['photos', 'Фото', 'Photos', 1],
  ['params', 'Параметры модели', 'Model sizes', 0], ['clothes', 'Одежда', 'Outfit', 1], ['shoes', 'Обувь', 'Shoes', 0], ['acc', 'Аксессуары', 'Accessories', 0],
  ['makeup', 'Мейк', 'Make-up', 1], ['mua', 'Визажист', 'Make-up artist', 1], ['hair', 'Волосы', 'Hair', 1], ['hairby', 'Кто делает волосы', 'Hair by', 0],
  ['shots', 'Шот-лист', 'Shot list', 0], ['comment', 'Комментарий', 'Comment', 1], ['note', 'Важно (красным)', 'Important (in red)', 0],
  ['time', 'Время', 'Time', 0], ['name', 'Название образа', 'Look name', 0], ['ref', 'Ссылка на референс', 'Reference link', 0]];
function lookPics(l) { if (!l.caps || typeof l.caps !== 'object') l.caps = {}; if (!Array.isArray(l.photos)) { l.photos = [l.mimg, l.img, ...(l.pics || [])].filter(Boolean); delete l.mimg; delete l.img; delete l.pics; } return l.photos; }
const LOOK_MAX = 8;
const lfHas = (s, k) => (s.looks || []).some((l) => k === 'photos' ? lookPics(l).length : String(l[k] || '').trim());
function lfOn(s, k) { if (s.lf && k === 'photos' && !('photos' in s.lf)) return s.lf.mimg !== false || s.lf.img !== false; if (s.lf && k in s.lf) return !!s.lf[k]; const f = LOOK_F.find((x) => x[0] === k); return !!(f && f[3]) || lfHas(s, k); }
function pLooks(s) {
  let h = '';
  const on = (k) => lfOn(s, k);
  ui.lfOpen = ui.lfOpen || {};
  const onList = LOOK_F.filter((f) => on(f[0])).map((f) => (L() === 'en' ? f[2] : f[1]).toLowerCase());
  h += '<div class="card tight" style="gap:8px"><div class="row between"><span class="small"><b>' + T('Карточка образа', 'Look card') + '</b><br><span class="muted">' + esc(T('Модель', 'Model') + (onList.length ? ', ' + onList.join(', ') : '')) + '</span></span><button class="chip sm" data-a="lfToggleOpen" data-s="' + s.id + '" aria-pressed="' + !!ui.lfOpen[s.id] + '">' + (ui.lfOpen[s.id] ? T('Готово', 'Done') : T('Настроить', 'Customise')) + '</button></div>' +
    (ui.lfOpen[s.id] ? '<span class="tiny muted">' + T('Оставь только то, что нужно этой съёмке. Выключенное не попадёт ни в карточку, ни на лист для печати.', 'Keep only what this shoot needs. Hidden fields are left off the card and the printout.') + '</span><div class="chips">' + LOOK_F.map((f) => '<button class="chip sm" aria-pressed="' + on(f[0]) + '" data-a="lfToggle" data-s="' + s.id + '" data-x="' + f[0] + '">' + esc(L() === 'en' ? f[2] : f[1]) + '</button>').join('') + '</div>' : '') + '</div>';
  if (!s.looks.length) h += '<div class="empty">' + T('Добавь образ — дальше заполняй только то, что нужно. Лишние поля выключаются в «Настроить».', 'Add a look and fill in only what you need. Turn fields off in Customise.') + '</div>';
  s.looks.forEach((l, i) => {
    const b = 'shoot:' + s.id + '.looks:' + l.id;
    const F = {
      model: () => field(T('Модель', 'Model'), inp(b + '.model', l.model, { r: true, ph: T('Имя модели', 'Model name') })),
      mua: () => field(T('Визажист', 'Make-up artist'), inp(b + '.mua', l.mua)),
      photos: () => { const ph = lookPics(l); return '<div class="col" style="gap:6px"><span class="tiny muted">' + T('Фото: модель, образ, обувь, детали — сколько нужно. Первое — главное на листе.', 'Photos: model, look, details — as many as you need. The first is the main one.') + '</span><div class="grid3">' + ph.map((id, k) => '<div style="position:relative">' + imgTag(id, 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:14px;display:block') + (k ? '<button class="chip sm" style="position:absolute;left:4px;bottom:4px;min-height:30px;padding:0 8px" data-a="lookPicFirst" data-s="' + s.id + '" data-x="' + l.id + '|' + id + '" aria-label="' + T('Сделать главным', 'Make main') + '">★</button>' : '<span class="tiny" style="position:absolute;left:6px;top:6px;background:rgba(255,255,255,.88);border-radius:8px;padding:1px 6px">' + T('главное', 'main') + '</span>') + '<button class="chip sm" style="position:absolute;right:4px;bottom:4px;min-height:30px;padding:0 8px" data-a="delLookPic" data-s="' + s.id + '" data-x="' + l.id + '|' + id + '" aria-label="' + T('Убрать', 'Remove') + '">×</button><input class="inp" style="margin-top:4px;min-height:38px;padding:6px 10px;font-size:16px" data-b="' + esc(b + '.caps.' + id) + '" value="' + esc((l.caps || {})[id] || '') + '" placeholder="' + T('подпись', 'caption') + '" aria-label="' + T('Подпись к фото', 'Photo caption') + '"></div>').join('') + (ph.length < LOOK_MAX ? '<button class="btn soft" style="aspect-ratio:3/4;height:auto;border-radius:14px;flex-direction:column" data-a="pickLookImg" data-s="' + s.id + '" data-x="' + l.id + '|photos">+ ' + T('Фото', 'Photo') + '</button>' : '') + '</div></div>'; },
      params: () => field(T('Параметры модели', 'Model sizes'), inp(b + '.params', l.params, { ph: T('рост, размер, обувь', 'height, size, shoe') })),
      clothes: () => field(T('Одежда', 'Outfit'), inp(b + '.clothes', l.clothes)),
      shoes: () => field(T('Обувь', 'Shoes'), inp(b + '.shoes', l.shoes)),
      acc: () => field(T('Аксессуары', 'Accessories'), inp(b + '.acc', l.acc)),
      makeup: () => field(T('Мейк', 'Make-up'), inp(b + '.makeup', l.makeup)),
      hair: () => field(T('Волосы', 'Hair'), inp(b + '.hair', l.hair)),
      hairby: () => field(T('Кто делает волосы', 'Hair by'), inp(b + '.hairby', l.hairby)),
      shots: () => field(T('Шот-лист — каждый кадр с новой строки', 'Shot list — one shot per line'), '<textarea class="inp" data-b="' + esc(b + '.shots') + '" rows="3">' + esc(l.shots || '') + '</textarea>'),
      comment: () => field(T('Комментарий', 'Comment'), '<textarea class="inp" data-b="' + esc(b + '.comment') + '" rows="2" placeholder="' + T('Всё, что важно знать команде про этот образ', 'Anything the team should know') + '">' + esc(l.comment || '') + '</textarea>'),
      note: () => field(T('Важно — будет красным', 'Important — shown in red'), inp(b + '.note', l.note)),
      time: () => field(T('Время', 'Time'), inp(b + '.time', l.time, { ph: '12:30' })),
      name: () => field(T('Название образа', 'Look name'), inp(b + '.name', l.name, { aria: T('Название образа', 'Look name') })),
      ref: () => field(T('Референс (ссылка)', 'Reference (link)'), inp(b + '.ref', l.ref, { ph: 'pinterest.com/…' })) };
    const rows = [['model', 'mua'], ['photos'], ['params'], ['clothes'], ['shoes', 'acc'], ['makeup'], ['hair', 'hairby'], ['shots'], ['comment'], ['note'], ['time', 'name'], ['ref']];
    h += '<div class="card ' + (i % 2 ? 'glow-sky' : 'glow-pink') + '"><div class="row between"><span class="look-num">' + T('Образ', 'Look') + ' ' + pad(i + 1) + '</span><div class="row"><button class="chip sm" aria-pressed="' + !!l.done + '" data-a="toggleLook" data-s="' + s.id + '" data-x="' + l.id + '">' + (l.done ? T('✓ снят', '✓ shot') : T('не снят', 'to shoot')) + '</button><button class="textbtn" data-a="delRow" data-s="' + s.id + '" data-x="looks|' + l.id + '" aria-label="' + T('Удалить образ', 'Delete look') + '">' + I.trash.replace('<svg', '<svg width="18" height="18"') + '</button></div></div>' +
      rows.map((r) => r.filter((k) => k === 'model' || on(k))).filter((r) => r.length).map((r) => r.length === 2 ? '<div class="grid2">' + F[r[0]]() + F[r[1]]() + '</div>' : F[r[0]]()).join('') + '</div>';
  });
  h += '<button class="btn soft" data-a="addLook" data-s="' + s.id + '">' + T('+ Образ', '+ Look') + '</button>';
  if (s.looks.length) h += '<button class="btn" data-a="lookSheet" data-s="' + s.id + '">' + T('Карточки образов для печати', 'Look cards to print') + '</button><span class="tiny muted pad4">' + T('Лист собирается из того, что заполнено: нет фото — больше места тексту, пустые поля не печатаются.', 'The sheet is built from what you filled in: no photo means more room for text, empty fields are skipped.') + '</span>';
  return h;
}
function pBudget(s) {
  const t = budgetTotals(s);
  const row = (l, v, cls) => '<div class="row between small' + (cls ? ' ' + cls : '') + '"><span>' + l + '</span><b class="mono">' + v + '</b></div>';
  let h = '<div class="card glow-pink" style="padding:22px;gap:8px"><span class="lock">' + I.lock + T('Видишь только ты и заказчик', 'Only you and the client') + '</span><span class="small">' + T('Итого деньгами', 'Total in money') + '</span><span class="mono" style="font-size:38px;letter-spacing:-0.02em;line-height:1.05">' + money(t.total) + ' ₽</span>' +
    row(T('Деньгами по строкам', 'Lines in money'), money(t.money) + ' ₽') +
    '<div class="row between small"><span class="row" style="gap:6px">' + T('Резерв', 'Contingency') + '<input class="inp mono" data-b="shoot:' + s.id + '.budget.reserve" data-r="1" inputmode="numeric" value="' + esc(s.budget.reserve) + '" style="width:64px;min-height:36px;padding:0 8px;font-size:14px" aria-label="' + T('Резерв, %', 'Contingency %') + '">%</span><b class="mono">' + money(t.reserve) + ' ₽</b></div>' +
    (t.barter ? row(T('Бартером и сертификатами', 'In barter and vouchers'), money(t.barter) + ' ₽') : '') +
    (t.refund ? row(T('Закуп с возвратом — нужен до съёмки', 'Refundable purchase — needed upfront'), money(t.refund) + ' ₽') : '') +
    (t.q ? '<span class="badge warn" style="align-self:flex-start">' + T('под вопросом: ', 'open questions: ') + t.q + '</span>' : '') + '</div>';
  SECTIONS.forEach(([k]) => {
    const ls = s.budget.lines.filter((x) => (x.sec || 'other') === k);
    if (!ls.length) return;
    const sm = ls.reduce((a, x) => a + lineMoney(x), 0);
    h += '<div class="row between pad4" style="margin-top:4px"><h3>' + esc(secName(k)) + '</h3><span class="mono small">' + money(sm) + ' ₽</span></div><div class="card tight">' +
      ls.map((x) => { const m = lineMoney(x), br = lineBarter(x), rf = lineRefund(x); const right = m ? money(m) + ' ₽' : rf ? money(rf) + ' ₽' : br ? money(br) + ' ₽' : (num(x.rate) || x.pay !== 'money' ? '' : '—');
        return '<button class="li" data-a="editLine" data-s="' + s.id + '" data-x="' + x.id + '" style="align-items:flex-start"><span class="grow col" style="gap:2px"><b style="font-weight:600">' + esc(x.label || T('Без названия', 'Untitled')) + (x.q ? ' <span class="badge warn">?</span>' : '') + '</b>' + (x.desc ? '<span class="tiny muted">' + esc(x.desc) + '</span>' : '') + '<span class="tiny muted">' + (num(x.rate) ? esc((num(x.qty) || 1) + ' × ' + money(num(x.rate)) + ' ₽ / ' + unitName(x.unit)) + ' · ' : '') + esc(payName(x.pay || 'money')) + (br && m ? ' + ' + money(br) + ' ₽' : '') + '</span></span><span class="mono small" style="white-space:nowrap;padding-top:2px">' + right + '</span></button>'; }).join('') + '</div>';
  });
  h += '<div class="seg">' + SECTIONS.map(([k]) => '<button class="chip sm" data-a="addLine" data-s="' + s.id + '" data-x="' + k + '">+ ' + esc(secName(k)) + '</button>').join('') + '</div>';
  h += '<div class="grid2"><button class="btn soft" data-a="syncTeam" data-s="' + s.id + '">' + T('Подтянуть команду', 'Pull in the team') + '</button><button class="btn soft" data-a="shareBudget" data-s="' + s.id + '">' + T('Заказчику', 'To client') + '</button></div><button class="btn ghost" data-a="budgetCsv" data-s="' + s.id + '">' + T('Таблица CSV — открыть в Excel', 'CSV for Excel') + '</button>';
  h += '<div class="card">' + field(T('Условия и комментарии', 'Terms and notes'), '<textarea class="inp" data-b="shoot:' + s.id + '.budget.note" placeholder="' + T('Предоплата 50%, остаток в день съёмки. Переработка — по часам. Закуп вернётся в течение 7 дней.', '50% upfront, balance on the day.') + '">' + esc(s.budget.note) + '</textarea>') + '</div>';
  return h;
}
function printHtml(s) {
  let h = '<div class="printarea show"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><div><div style="font-family:Neucha,var(--head);font-size:22px">set</div><h1 style="margin:6px 0 0;font-family:var(--head);font-weight:500;letter-spacing:-0.03em;line-height:1">' + esc(titleOf(s)) + '</h1></div><div style="text-align:right;font-size:12px">' + (s.date ? '<b style="font-size:16px">' + esc(fmtDate(s.date, { wd: true, year: true })) + '</b><br>' : '') + T('сбор', 'call') + ' ' + esc(s.call) + ' · ' + T('конец', 'wrap') + ' ' + esc(s.end) + '</div></div>';
  if (s.place || s.address) h += '<p style="margin:10px 0 0"><b>' + esc(s.place) + '</b> ' + esc(s.address) + '</p>';
  if (s.timing.length) h += '<h3 style="margin-top:16px">' + T('Тайминг', 'Schedule') + '</h3><table><tbody>' + sortedTiming(s).map((x) => '<tr><td style="width:92px;font-family:var(--mono)">' + esc(x.t) + (x.t2 ? '–' + esc(x.t2) : '') + '</td><td><b>' + esc(x.w) + '</b>' + (x.det ? '<br><span style="color:#555">' + esc(x.det) + '</span>' : '') + '</td><td>' + esc(x.who || '') + '</td></tr>').join('') + '</tbody></table>';
  if (s.team.length) h += '<h3 style="margin-top:16px">' + T('Команда', 'Team') + '</h3><table><thead><tr><th>' + T('Имя', 'Name') + '</th><th>' + T('Роль', 'Role') + '</th><th>' + T('Сбор', 'Call') + '</th><th>' + T('Связь', 'Contact') + '</th></tr></thead><tbody>' + s.team.map((m) => '<tr><td>' + esc(m.name) + '</td><td>' + esc(roleName(m.role)) + '</td><td style="font-family:var(--mono)">' + esc(m.call || s.call) + '</td><td>' + esc((() => { const p = S.people.find((x) => x.id === m.pid); return [tgNick(p?.tg), p?.phone].filter(Boolean).join(' · '); })()) + '</td></tr>').join('') + '</tbody></table>';
  const food = teamFood(s); if (food) h += '<p style="margin-top:10px"><b>' + T('Еда', 'Food') + ':</b> ' + esc(food) + '</p>';
  if (s.modules.looks && s.looks.length) h += '<h3 class="pb" style="margin-top:16px">' + T('Образы', 'Looks') + '</h3><div class="looks">' + s.looks.map((l, i) => '<div class="look">' + (lookPics(l).length ? '<div style="display:flex;gap:6px;margin-bottom:6px">' + lookPics(l).slice(0, 3).map((x) => imgTag(x, 'flex:1;min-width:0;height:150px;object-fit:cover;border-radius:6px')).join('') + '</div>' : '') + '<div style="font-family:var(--mono);font-size:11px">' + T('ОБРАЗ', 'LOOK') + ' ' + pad(i + 1) + '</div><b style="font-size:15px">' + esc(l.name || '—') + '</b><br>' + T('Модель', 'Model') + ': ' + esc(l.model || '—') + '<br>' + T('Одежда', 'Clothes') + ': ' + esc(l.clothes || '—') + '<br>' + T('Мейк', 'Make-up') + ': ' + esc(l.makeup || '—') + (l.mua ? ' · ' + T('визажист', 'MUA') + ' ' + esc(l.mua) : '') + '<br>' + T('Волосы', 'Hair') + ': ' + esc(l.hair || '—') + (l.shoes ? '<br>' + T('Обувь', 'Shoes') + ': ' + esc(l.shoes) : '') + (l.acc ? '<br>' + T('Аксессуары', 'Accessories') + ': ' + esc(l.acc) : '') + (l.comment ? '<br>' + esc(l.comment) : '') + (l.note ? '<br><b style="color:#B4271B">! ' + esc(l.note) + '</b>' : '') + '<div style="margin-top:6px">☐ ' + T('снят', 'shot') + '</div></div>').join('') + '</div>';
  const mp = (s.mood || []).filter((x) => x.kind === 'img'); const ml = (s.mood || []).filter((x) => x.kind === 'link');
  if (mp.length || ml.length) h += '<h3 class="pb" style="margin-top:16px">' + T('Мудборд', 'Moodboard') + '</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">' + mp.map((x) => imgTag(x.id, 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px')).join('') + '</div>' + (ml.length ? '<p style="font-size:11px;word-break:break-all">' + ml.map((x) => esc(x.url)).join('<br>') + '</p>' : '');
  if (s.notes) h += '<p style="margin-top:14px;white-space:pre-line"><b>' + T('Заметки', 'Notes') + ':</b> ' + esc(s.notes) + '</p>';
  h += '<div class="foot">' + T('Собрано в SET · смета и ставки на этот лист не попадают', 'Made with SET · budget and rates are never printed') + '</div></div>';
  return h;
}
function vPrint(id) {
  const s = getShoot(id); if (!s) return vNotFound();
  return '<div class="screen" style="padding-bottom:0"><div class="top">' + backBtn('#/p/' + s.id) + '<span class="kicker">' + T('Лист на площадку', 'Set sheet') + '</span><span style="width:44px"></span></div><span class="small muted pad4">' + T('Тайминг, команда и образы на А4. Смета и ставки сюда не попадают.', 'Schedule, team and looks on A4. No money on it.') + '</span>' +
    '<div class="grid2" style="margin-top:10px">' + (s.looks.length ? '<button class="btn soft" data-a="lookSheet" data-s="' + s.id + '">' + T('Карточки образов', 'Look cards') + '</button>' : '') + ((s.mood || []).some((x) => x.kind === 'img') ? '<button class="btn soft" data-a="moodSheet" data-s="' + s.id + '">' + T('Мудборд картинкой', 'Moodboard image') + '</button>' : '') + '</div></div>' + printHtml(s) +
    '<div class="cta nonav"><button class="btn big grow" data-a="print">' + T('Распечатать или PDF', 'Print or save PDF') + '</button><button class="btn ghost" style="min-height:60px;border-radius:26px" data-a="shareTeam" data-s="' + s.id + '">' + T('Текстом', 'As text') + '</button></div>';
}

/* --- on set --- */
function vOnSet(id) {
  const s = getShoot(id); if (!s) return vNotFound();
  const looks = s.looks;
  const left = looks.filter((l) => !l.done);
  const cur = left[0];
  const now = new Date();
  const nm = now.getHours() * 60 + now.getMinutes();
  const tl = sortedTiming(s);
  const nmK = nm < (mins(s.call) ?? 0) - 120 ? nm + 1440 : nm;
  const nextT = s.date === todayIso() || s.date === isoOf(new Date(Date.now() - 864e5)) ? tl.find((x) => dayKey(s, x.t) > nmK) : null;
  let h = '<div class="screen dark has-cta" style="margin:0 -0px"><div class="top"><span class="kicker" style="color:#9A968C">' + T('Режим площадки', 'On set') + ' · ' + esc(titleOf(s)) + '</span><a class="iconbtn" href="#/p/' + s.id + '" aria-label="' + T('Выйти', 'Exit') + '">' + I.x + '</a></div>';
  h += '<div class="row between" style="align-items:flex-end"><span class="big-date" style="font-size:84px">' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '</span><span class="mono small" style="color:#9A968C;padding-bottom:10px">' + (looks.length - left.length) + '/' + looks.length + ' ' + T('образов', 'looks') + '</span></div>';
  h += tip('onset') + notifCard(true);
  let nudgeHtml = '';
  const c = coach(s);
  if (c) {
    if (c.cur) { const span = Math.max(1, c.cur.until - c.cur.k); const pct = Math.min(100, Math.round((c.nowK - c.cur.k) / span * 100));
      h += '<div style="background:#232328;border-radius:24px;padding:18px;display:flex;flex-direction:column;gap:8px"><div class="row between"><span class="mono small" style="color:#C9C5BB">' + T('СЕЙЧАС', 'NOW') + ' · ' + esc(c.cur.t) + '–' + esc(clockText(c.cur.until)) + '</span><span class="mono small" style="color:#C9C5BB">' + T('ещё ', '') + Math.max(0, c.cur.until - c.nowK) + T(' мин', ' min left') + '</span></div><b style="font-size:20px">' + esc(c.cur.w) + '</b>' + (c.cur.who ? '<span class="small" style="color:#C9C5BB">' + esc(c.cur.who) + '</span>' : '') + (c.cur.det ? '<span class="small" style="color:#C9C5BB">' + esc(c.cur.det) + '</span>' : '') + '<span style="height:6px;border-radius:3px;background:#3A3A3A;overflow:hidden"><i style="display:block;height:100%;width:' + pct + '%;background:#ECE97E"></i></span></div>'; }
    if (c.next) h += '<div class="hint"><span class="dot"></span><span class="grow">' + T('Через ', 'In ') + (c.next.k - c.nowK) + T(' мин', ' min') + ' · <b>' + esc(c.next.t) + '</b> ' + esc(c.next.w) + (c.next.who ? ' · ' + esc(c.next.who) : '') + '</span></div>';
    c.nudges.forEach((n) => { nudgeHtml += '<div class="hint" style="background:#3A2A1E"><span class="dot" style="background:#EE4A3B;box-shadow:0 0 0 4px rgba(238,74,59,.25)"></span><span>' + esc(n) + '</span></div>'; });
    if (!c.cur && !c.next && !s.timing.length) h += '<div class="hint"><span class="dot"></span><span>' + T('Заполни тайминг — и SET будет подсказывать, что сейчас и что дальше.', 'Fill in the schedule and SET will show what’s now and next.') + '</span></div>';
  } else if (s.timing.length) {
    h += '<div class="hint"><span class="dot"></span><span>' + T('Подсказки по таймингу включатся в день съёмки: ', 'Schedule prompts switch on on the shoot day: ') + (s.date ? esc(fmtDate(s.date, { wd: true })) : T('поставь дату', 'set a date')) + '.</span></div>';
  }
  if (!looks.length) h += '<div class="hint"><span class="dot"></span><span>' + T('Добавь образы в проекте — здесь они пойдут по очереди.', 'Add looks in the project — they’ll queue here.') + '</span></div>';
  if (cur) {
    const i = looks.indexOf(cur);
    h += '<div style="background:radial-gradient(circle at 88% 8%, rgba(244,161,195,0.5), rgba(244,161,195,0.12) 45%, transparent 70%), #232328;border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:8px"><span class="mono small" style="color:#C9C5BB">' + T('СЕЙЧАС · ОБРАЗ ', 'NOW · LOOK ') + pad(i + 1) + '</span>' + (lookPics(cur)[0] ? imgTag(lookPics(cur)[0], 'width:100%;max-height:300px;object-fit:cover;border-radius:18px;display:block;margin:4px 0') : '') + '<span class="h1" style="font-size:44px">' + esc(cur.name || T('Образ ', 'Look ') + pad(i + 1)) + '</span><span>' + esc([cur.model, cur.clothes].filter(Boolean).join(' · ')) + '</span><span class="small" style="color:#C9C5BB">' + esc([cur.makeup && T('мейк: ', 'make-up: ') + cur.makeup, cur.hair && T('волосы: ', 'hair: ') + cur.hair].filter(Boolean).join(' · ')) + '</span>' + (cur.comment ? '<span class="small">' + esc(cur.comment) + '</span>' : '') + (cur.note ? '<b class="small" style="color:#F4A1C3">! ' + esc(cur.note) + '</b>' : '') + (String(cur.shots || '').trim() ? '<div class="col" style="gap:4px;margin-top:6px"><span class="mono tiny" style="color:#C9C5BB">' + T('КАДРЫ', 'SHOTS') + '</span>' + String(cur.shots).split('\n').map((x) => x.trim()).filter(Boolean).map((x) => '<span class="small">☐ ' + esc(x) + '</span>').join('') + '</div>' : '') + '</div>';
    const nx = left[1];
    if (nx) h += '<span class="small pad4" style="color:#9A968C">' + T('Следом: ', 'Then: ') + esc(nx.name || T('образ ', 'look ') + pad(looks.indexOf(nx) + 1)) + (nx.model ? ' · ' + esc(nx.model) + T(' — пора на грим', ' — to make-up') : '') + '</span>';
  } else if (looks.length) {
    h += '<div style="background:#ECE97E;color:var(--ink);border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:10px"><span class="h1" style="font-size:44px">' + T('Снято!', 'That’s a wrap!') + '</span><span>' + T('Все образы сняты. Вещи — по списку возврата.', 'All looks shot. Pack and return the clothes.') + '</span><a class="btn" href="#/p/' + s.id + '/wrap">' + T('Что дальше', 'What’s next') + '</a></div>';
  }
  h += nudgeHtml;
  if (looks.length) h += '<div class="card tight" style="background:#232328">' + looks.map((l, i) => '<button class="li" data-a="toggleLook" data-s="' + s.id + '" data-x="' + l.id + '" style="color:#fff"><span class="check ' + (l.done ? 'on' : '') + '">' + (l.done ? '✓' : '') + '</span><span class="grow ' + (l.done ? 'strike' : '') + '">' + pad(i + 1) + ' · ' + esc(l.name || '') + (l.model ? ' · ' + esc(l.model) : '') + '</span></button>').join('') + '</div>';
  h += '</div>';
  if (cur) h += '<div class="cta nonav dark"><button class="btn big white" data-a="toggleLook" data-s="' + s.id + '" data-x="' + cur.id + '">' + T('Снято — следующий', 'Shot — next') + '</button></div>';
  return h;
}

/* --- wrap --- */
function vWrap(id) {
  const s = getShoot(id); if (!s) return vNotFound();
  const b = 'shoot:' + s.id + '.my';
  let h = '<div class="screen has-cta"><div class="top">' + backBtn('#/p/' + s.id) + '<span class="kicker">' + T('После съёмки', 'After the shoot') + '</span><span style="width:44px"></span></div><h1 class="pad4" style="font-size:40px">' + esc(titleOf(s)) + '</h1>';
  if (s.team.length) {
    const paidN = s.team.filter((m) => m.paid).length;
    h += '<div class="row between pad4"><h3>' + T('Оплаты команде', 'Team payments') + '</h3><span class="mono small">' + paidN + '/' + s.team.length + '</span></div><div class="card tight">' + s.team.map((m) => '<div class="li"><span class="grow"><b style="font-weight:600">' + esc(m.name) + '</b><br><span class="tiny muted">' + esc(roleName(m.role)) + (memberPayText(m) ? ' · ' + esc(memberPayText(m)) : '') + '</span></span><button class="chip sm" aria-pressed="' + !!m.paid + '" data-a="memberPaid" data-s="' + s.id + '" data-x="' + m.id + '">' + (m.paid ? T('✓ оплачено', '✓ paid') : T('отметить', 'mark paid')) + '</button></div>').join('') + '</div><span class="lock pad4">' + I.lock + T('Этот список видишь только ты', 'Only you see this list') + '</span>';
  }
  h += '<div class="card glow-pink"><h3>' + T('Мой гонорар', 'My fee') + '</h3><div class="grid2">' + field(T('Роль', 'Role'), roleSelect(b + '.role', s.my.role)) + field(T('Деньгами, ₽', 'Money'), inp(b + '.fee', s.my.fee, { mono: true, num: true, ph: '0' })) + '</div>' +
    '<div class="chips">' + ['money', 'barter', 'cert', 'mix', 'tfp'].map((k) => '<button class="chip sm" data-a="myPay" data-s="' + s.id + '" data-x="' + k + '" aria-pressed="' + ((s.my.pay || 'money') === k) + '">' + esc(payName(k)) + '</button>').join('') + '</div>' +
    (['barter', 'cert', 'mix'].includes(s.my.pay) ? field(T('Бартер / сертификат на, ₽', 'Barter / voucher value'), inp(b + '.barter', s.my.barter || '', { mono: true, num: true })) : '') +
    '<div class="row between"><span>' + T('Смен', 'Shifts') + '</span><span class="row"><button class="iconbtn" data-a="myShifts" data-s="' + s.id + '" data-x="-1" aria-label="−">−</button><span class="mono" style="min-width:24px;text-align:center">' + s.my.shifts + '</span><button class="iconbtn" data-a="myShifts" data-s="' + s.id + '" data-x="1" aria-label="+">+</button></span></div>' +
    '<div class="row wrap"><button class="chip sm" aria-pressed="' + !!s.my.paid + '" data-a="myFlag" data-s="' + s.id + '" data-x="paid">' + (s.my.paid ? T('✓ Мне оплатили', '✓ I got paid') : T('Ждёт оплаты', 'Awaiting payment')) + '</button><button class="chip sm" aria-pressed="' + !!s.my.check + '" data-a="myFlag" data-s="' + s.id + '" data-x="check">' + (s.my.check ? T('✓ Чек выбит', '✓ Receipt issued') : T('Чек не выбит', 'No receipt yet')) + '</button></div>' +
    '<span class="tiny muted">' + T('Попадёт в «Мои съёмки и доход». Видишь только ты.', 'Goes to “My shoots & income”. Only you see it.') + '</span></div>';
  if (s.deliver || s.retouch) h += '<div class="card glow-sky"><h3>' + T('Сдача', 'Delivery') + '</h3><span class="small">' + esc([s.retouch, s.deliver].filter(Boolean).join(' · ')) + '</span></div>';
  h += '</div><div class="cta nonav">' + (s.status === 'done' ? '<button class="btn big ghost" data-a="reopen" data-s="' + s.id + '">' + T('Вернуть в работу', 'Reopen') + '</button>' : '<button class="btn big" data-a="finishShoot" data-s="' + s.id + '">' + T('Съёмка сдана', 'Mark as delivered') + '</button>') + '</div>';
  return h;
}
function roleSelect(b, val, r) {
  const opts = GROUPS.map((g) => '<optgroup label="' + esc(L() === 'en' ? g.en : g.ru) + '">' + g.roles.map((x) => '<option value="' + x[0] + '"' + (val === x[0] ? ' selected' : '') + '>' + esc(L() === 'en' ? x[2] : x[1]) + '</option>').join('') + '</optgroup>').join('');
  const custom = val && !ROLE[val] ? '<option value="' + esc(val) + '" selected>' + esc(val) + '</option>' : '';
  return '<select class="inp" data-b="' + esc(b) + '"' + (r ? ' data-r="1"' : '') + '>' + custom + opts + '</select>';
}

/* --- calendar --- */
function vCalendar() {
  const now = new Date();
  const c = ui.cal || (ui.cal = { y: now.getFullYear(), m: now.getMonth() });
  const first = new Date(c.y, c.m, 1);
  const dim = new Date(c.y, c.m + 1, 0).getDate();
  const off = (first.getDay() + 6) % 7;
  const t = todayIso();
  const byDay = {};
  S.shoots.forEach((s) => { if (s.date) (byDay[s.date] = byDay[s.date] || []).push(s); });
  const sel = ui.calSel;
  let h = '<div class="screen"><div class="top"><span class="logo">set</span><a class="avatar" href="#/me">' + esc(initials(S.profile.name)) + '</a></div>';
  h += '<div class="row between pad4" style="align-items:flex-end"><div class="col" style="gap:0"><span class="big-date" style="font-size:44px;font-weight:600">' + esc(MONTHS_N[L()][c.m].toUpperCase()) + '</span><span class="big-date" style="font-size:32px;color:#5C5A63">' + c.y + '</span></div><div class="row"><button class="iconbtn" data-a="calMove" data-x="-1" aria-label="' + T('Предыдущий месяц', 'Previous month') + '">' + I.back + '</button><button class="iconbtn" data-a="calMove" data-x="1" aria-label="' + T('Следующий месяц', 'Next month') + '">' + I.next + '</button></div></div>';
  h += '<div class="cal">' + (L() === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']).map((w) => '<span class="wd">' + w + '</span>').join('');
  for (let i = 0; i < off; i++) h += '<span class="empty" aria-hidden="true"></span>';
  for (let d = 1; d <= dim; d++) {
    const iso = c.y + '-' + pad(c.m + 1) + '-' + pad(d);
    const list = byDay[iso] || [];
    let cls = iso < t ? 'past' : '';
    if (list.some((s) => s.src !== 'own')) cls = 'has'; else if (list.length) cls = 'own';
    if (iso === t && !list.length) cls = 'today';
    if (sel === iso) cls += ' sel';
    h += '<button class="' + cls + '" data-a="calPick" data-x="' + iso + '" aria-label="' + esc(fmtDate(iso)) + (list.length ? ', ' + list.length + ' ' + T('съёмки', 'shoots') : '') + '">' + d + '</button>';
  }
  h += '</div>' + tip('calendar') + '<div class="row wrap small muted pad4" style="gap:14px"><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:5px;background:rgb(var(--pink))"></span>' + T('в SET', 'in SET') + '</span><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:5px;border:1.5px dashed var(--ink)"></span>' + T('не через SET', 'outside SET') + '</span></div>';
  h += '<button class="card dashed" data-a="ownSheet" data-x="' + esc(sel || '') + '" style="text-align:left"><b>' + T('+ Своя съёмка', '+ Add your own shoot') + '</b><span class="small muted">' + T('Не всё идёт через приложение — отметь, чтобы не наложилось и попало в доход', 'Not everything runs through the app — log it so nothing overlaps and it counts in your income') + '</span></button>';
  const prefix = c.y + '-' + pad(c.m + 1);
  const monthList = S.shoots.filter((s) => s.date && (sel ? s.date === sel : s.date.startsWith(prefix))).sort(sortByDate);
  if (sel) h += '<div class="row between pad4"><h3>' + esc(fmtDate(sel, { wd: true })) + '</h3><button class="textbtn" data-a="calPick" data-x="">' + T('Весь месяц', 'Whole month') + '</button></div>';
  if (!monthList.length) h += '<div class="empty">' + (sel ? T('В этот день свободно', 'Free that day') : T('В этом месяце пока пусто', 'Nothing this month yet')) + '</div>';
  monthList.forEach((s) => {
    const dd = parseIso(s.date);
    const own = s.src === 'own';
    h += '<a class="card ' + (own ? 'dashed' : 'glow-' + (KINDS[s.kind]?.glow || 'pink')) + '" href="' + (own ? '#/own/' + s.id : '#/p/' + s.id) + '" style="text-decoration:none;color:inherit;flex-direction:row;gap:14px"><span class="col" style="gap:0;min-width:70px"><span class="tiny">' + esc(WD_L[L()][dd.getDay()]) + '</span><span class="big-date" style="font-size:44px">' + dd.getDate() + '</span><span class="big-date" style="font-size:22px">' + MON_S[L()][dd.getMonth()].toUpperCase() + '</span></span><span class="col grow" style="gap:6px"><b style="font-weight:600">' + esc(titleOf(s)) + '</b>' + (own ? '<span class="tiny muted">' + T('не через SET', 'outside SET') + (s.my.fee !== '' ? ' · ' + (num(s.my.fee) ? money(num(s.my.fee)) + ' ₽' : 'TFP') : '') + '</span>' : '') +
      (s.call ? '<span class="row between small" style="background:rgba(255,255,255,.45);border-radius:10px;padding:6px 10px"><b>' + esc(s.call) + '</b><span>' + T('сбор', 'call') + '</span></span>' : '') + (s.end ? '<span class="row between small" style="background:rgba(255,255,255,.45);border-radius:10px;padding:6px 10px"><b>' + esc(s.end) + '</b><span>' + T('конец', 'wrap') + '</span></span>' : '') + '</span></a>';
  });
  h += '<span class="tiny muted pad4">' + T('Съёмки не через SET видишь только ты.', 'Only you see shoots outside SET.') + '</span></div>' + nav('calendar');
  return h;
}

/* --- people --- */
function vPeople() {
  const q = (ui.q || '').toLowerCase();
  const list = S.people.filter((p) => !q || (p.name + ' ' + roleName(p.role) + ' ' + (p.insta || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  let h = '<div class="screen"><div class="top"><span class="logo">set</span><a class="avatar" href="#/me">' + esc(initials(S.profile.name)) + '</a></div><h1 class="pad4">' + T('Люди', 'People') + '</h1>' + tip('people');
  h += '<input class="inp" type="search" data-b="ui.q" data-live="1" value="' + esc(ui.q || '') + '" placeholder="' + T('Имя, роль или @ник', 'Name, role or @handle') + '" aria-label="' + T('Поиск', 'Search') + '">';
  if (!S.people.length) h += '<div class="empty">' + T('Все, с кем ты снимаешь, будут здесь. Люди добавляются сами, когда ты зовёшь их в проект.', 'Everyone you shoot with lives here. People are added when you invite them to a project.') + '</div>';
  h += '<div class="card tight">' + list.map((p) => { const n = S.shoots.filter((s) => s.team.some((m) => m.pid === p.id)).length; return '<button class="li" data-a="editPerson" data-x="' + p.id + '"><span class="avatar sm soft">' + esc(initials(p.name)) + '</span><span class="grow"><b style="font-weight:600">' + esc(p.name) + '</b><br><span class="tiny muted">' + esc(roleName(p.role)) + (p.insta ? ' · ' + esc(p.insta.startsWith('@') ? p.insta : '@' + p.insta) : '') + '</span></span><span class="tiny muted mono">' + n + ' ' + T(plural(n, 'съёмка', 'съёмки', 'съёмок'), 'shoots') + '</span></button>'; }).join('') + '</div>';
  h += '<button class="btn soft" data-a="editPerson" data-x="">' + T('+ Человек', '+ Person') + '</button></div>' + nav('people');
  return h;
}

/* --- projects shared by link: the team keeps the project in their own SET --- */
const B64S = {
  enc: (u8) => { let x = ''; for (let i = 0; i < u8.length; i += 0x8000) x += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (str) => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const b = atob(str); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
};
async function packJson(o) {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  if (window.CompressionStream) { try { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'z' + B64S.enc(new Uint8Array(await new Response(st).arrayBuffer())); } catch (e) { /* fall back to plain */ } }
  return 'j' + B64S.enc(bytes);
}
async function unpackJson(str) {
  let u = B64S.dec(str.slice(1));
  if (str[0] === 'z') { const st = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw')); u = new Uint8Array(await new Response(st).arrayBuffer()); }
  return JSON.parse(new TextDecoder().decode(u));
}
const appBase = () => location.origin + location.pathname.replace(/index\.html$/, '');
const pickK = (o, ks) => { const r = {}; ks.forEach((k) => { if (o && o[k] != null && o[k] !== '') r[k] = o[k]; }); return r; };
// what the team gets: no budget, no checklist, no notes, no one else's money
function shareSnapshot(s, memberId) {
  if (!s.shareId) s.shareId = uid() + uid();
  return { v: 1, sid: s.shareId, u: Date.now(), from: pickK(S.profile, ['name', 'phone', 'tg']), me: memberId || '',
    s: { ...pickK(s, ['kind', 'client', 'what', 'date', 'call', 'end', 'place', 'address']),
      modules: { team: !!s.modules.team, timing: !!s.modules.timing, looks: !!s.modules.looks, mood: s.modules.mood !== false },
      timing: (s.timing || []).map((x) => pickK(x, ['id', 't', 't2', 'w', 'who', 'det'])),
      team: (s.team || []).map((m) => ({ ...pickK(m, ['id', 'name', 'role', 'call', 'status']), ...(m.id === memberId ? pickK(m, ['rate', 'unit', 'pay', 'barter', 'note']) : {}) })),
      looks: (s.looks || []).map((l) => pickK(l, ['id', 'name', 'model', 'clothes', 'makeup', 'hair', 'mua', 'ref', 'done'])),
      mood: (s.mood || []).filter((x) => x.kind === 'link' && x.url).map((x) => ({ kind: 'link', url: x.url })) } };
}
async function shareLink(s, memberId) { const snap = shareSnapshot(s, memberId); save(); return appBase() + '#/join/' + await packJson(snap); }
function importShared(d) {
  const ex = S.shoots.find((x) => x.src === 'guest' && x.guest && x.guest.sid === d.sid);
  if (ex && ex.guest.u > d.u) { toast(T('У тебя уже более свежая версия этого проекта', 'You already have a newer version of this project')); return ex.id; }
  const me = d.me || (ex && ex.guest.me) || '';
  const mem = (d.s.team || []).find((m) => m.id === me);
  const fee = mem && ['money', 'mix'].includes(mem.pay || 'money') && num(mem.rate) ? String(num(mem.rate)) : '';
  const my = ex ? ex.my : { role: (mem && mem.role) || S.profile.roles[0] || '', fee, pay: (mem && mem.pay) || 'money', barter: (mem && mem.barter) || '', shifts: 1, paid: false, check: false, note: '' };
  if (ex && mem && !my.fee && fee) { my.fee = fee; my.pay = mem.pay || 'money'; }
  const g = { id: ex ? ex.id : 'g' + uid(), src: 'guest', kind: d.s.kind || 'custom', client: '', what: '', date: '', call: '', end: '', place: '', address: '', notes: '',
    timing: [], team: [], looks: [], checklist: [], mood: [], budget: { lines: [], note: '', reserve: '10', v2: true }, rights: '', deliver: '', retouch: '',
    ...d.s, modules: { ...(d.s.modules || {}), budget: false, print: false },
    my, onset: ex ? ex.onset : { idx: 0 }, status: 'plan', created: ex ? ex.created : Date.now(),
    guest: { sid: d.sid, u: d.u, me, from: d.from || {} } };
  if (mem && my.fee === '' && fee) my.fee = fee;
  (g.team || []).forEach((m) => { if (!m.pay) m.pay = 'money'; if (!m.unit) m.unit = 'смена'; });
  if (ex) Object.assign(ex, g); else S.shoots.push(g);
  save();
  toast(ex ? T('Проект обновлён', 'Project updated') : T('Проект сохранён в SET', 'Project saved to SET'));
  return g.id;
}
async function joinFrom(code) {
  let d = null;
  try { d = await unpackJson(code); } catch (e) { d = null; }
  if (!d || d.v !== 1 || !d.s || !d.sid) { toast(T('Ссылка повреждена — попроси прислать её заново', 'This link is broken — ask for a new one')); location.replace('#/today'); return; }
  if (!S.profile.onboarded) { S.pendingJoin = code; save(); location.replace('#/welcome'); toast(T('Пара слов о себе — и откроем проект', 'Tell us a bit about you — then we open the project')); return; }
  const id = importShared(d);
  location.replace('#/p/' + id);
}
const fmtStamp = (ms) => { if (!ms) return ''; const d = new Date(ms); return d.getDate() + ' ' + MON_S[L()][d.getMonth()] + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function vGuest(s) {
  const g = s.guest || {}; const me = (s.team || []).find((m) => m.id === g.me); const from = g.from || {};
  let h = '<div class="screen has-cta"><div class="top">' + backBtn('#/projects') + '<span class="kicker">' + T('Тебя позвали', 'You’re on the team') + '</span><span style="width:44px"></span></div>';
  h += '<div class="col pad4" style="gap:6px"><span class="kicker">' + (s.date ? fmtDate(s.date, { wd: true }) + ' · ' + relDay(s.date) : T('дата скоро', 'date tbc')) + '</span><h1 style="font-size:40px">' + esc(titleOf(s)) + '</h1><span class="small muted">' + (from.name ? T('от ', 'from ') + esc(from.name) + ' · ' : '') + T('версия от ', 'version of ') + esc(fmtStamp(g.u)) + '</span></div>';
  if (me) h += '<div class="card glow-pink" style="gap:8px"><span class="kicker">' + T('твоё', 'yours') + '</span><h2>' + esc(roleName(me.role) || T('в команде', 'on the team')) + '</h2><span class="small">' + T('сбор ', 'call ') + '<b class="mono">' + esc(me.call || s.call || '—') + '</b>' + (memberPayText(me) && (me.rate || me.barter || me.pay === 'tfp') ? ' · ' + esc(memberPayText(me)) : '') + '</span>' + (me.note ? '<span class="small">' + esc(me.note) + '</span>' : '') + '</div>';
  const addr = [s.place, s.address].filter(Boolean).join(', ');
  h += '<div class="card" style="gap:10px"><div class="row between"><span class="small muted">' + T('Сбор', 'Call') + '</span><b class="mono">' + esc(s.call || '—') + '</b></div>' + (s.end ? '<div class="row between"><span class="small muted">' + T('Конец', 'Wrap') + '</span><b class="mono">' + esc(s.end) + '</b></div>' : '') +
    (addr ? '<div class="col" style="gap:6px"><span class="small muted">' + T('Где', 'Where') + '</span><span>' + esc(addr) + '</span><a class="btn soft sm" style="align-self:flex-start" target="_blank" rel="noopener" href="https://yandex.ru/maps/?text=' + encodeURIComponent(addr) + '">' + T('Открыть на карте', 'Open map') + '</a></div>' : '') + '</div>';
  if (s.timing && s.timing.length) h += '<h3 class="pad4">' + T('Тайминг', 'Schedule') + '</h3><div class="card tight">' + sortedTiming(s).map((x) => '<div class="li" style="align-items:flex-start"><span class="mono small" style="min-width:96px">' + esc(x.t) + (x.t2 ? '–' + esc(x.t2) : '') + '</span><span class="grow"><b style="font-weight:600">' + esc(x.w || '') + '</b>' + (x.who || x.det ? '<br><span class="tiny muted">' + esc([x.who, x.det].filter(Boolean).join(' · ')) + '</span>' : '') + '</span></div>').join('') + '</div>';
  if (s.looks && s.looks.length) h += '<h3 class="pad4">' + T('Образы', 'Looks') + '</h3>' + s.looks.map((l, i) => '<div class="card ' + (i % 2 ? 'glow-sky' : 'glow-pink') + '" style="gap:6px"><span class="look-num">' + T('Образ', 'Look') + ' ' + pad(i + 1) + (l.done ? ' · ' + T('снят', 'shot') : '') + '</span>' + (l.name ? '<b>' + esc(l.name) + '</b>' : '') + [[T('модель', 'model'), l.model], [T('одежда', 'outfit'), l.clothes], [T('мейк', 'make-up'), l.makeup], [T('волосы', 'hair'), l.hair], [T('визажист', 'MUA'), l.mua], [T('референс', 'ref'), l.ref]].filter((r) => r[1]).map((r) => '<span class="small"><span class="muted">' + r[0] + ':</span> ' + esc(r[1]) + '</span>').join('') + '</div>').join('');
  if (s.mood && s.mood.length) h += '<h3 class="pad4">' + T('Мудборд', 'Moodboard') + '</h3><div class="card tight">' + s.mood.map((m) => '<a class="li" target="_blank" rel="noopener" href="' + esc(m.url) + '"><span class="grow small" style="word-break:break-all">' + esc(m.url) + '</span></a>').join('') + '</div>';
  if (s.team && s.team.length) h += '<h3 class="pad4">' + T('Команда', 'Team') + '</h3><div class="card tight">' + s.team.map((m) => '<div class="li"><span class="avatar sm soft">' + esc(initials(m.name)) + '</span><span class="grow"><b style="font-weight:600">' + esc(m.name) + (m.id === g.me ? T(' · это ты', ' · you') : '') + '</b><br><span class="tiny muted">' + esc(roleName(m.role)) + (m.call ? ' · ' + T('сбор ', 'call ') + esc(m.call) : '') + '</span></span></div>').join('') + '</div>';
  h += '<span class="tiny muted pad4">' + T('Когда ' + (from.name || 'продюсер') + ' что-то поменяет, придёт новая ссылка — открой её, и проект здесь обновится.', 'When the producer changes something you’ll get a new link — open it and this project updates.') + '</span>';
  h += '<button class="btn ghost" data-a="guestDelete" data-s="' + s.id + '">' + T('Убрать проект у себя', 'Remove from my SET') + '</button>';
  h += '</div><div class="cta">' + (s.timing && s.timing.length ? '<a class="btn big grow" href="#/p/' + s.id + '/onset">' + T('Режим площадки', 'On set') + '</a>' : '') + (from.tg ? '<a class="btn ghost" style="min-height:60px;border-radius:26px" href="https://t.me/' + esc(tgNick(from.tg).slice(1)) + '" target="_blank" rel="noopener">Telegram</a>' : '') + (from.phone ? '<a class="btn ghost" style="min-height:60px;border-radius:26px" href="tel:' + esc(String(from.phone).replace(/[^\d+]/g, '')) + '">' + T('Позвонить', 'Call') + '</a>' : '') + '</div>' + nav('projects');
  return h;
}

/* --- me / income --- */
function myEntries() {
  const t = todayIso();
  return S.shoots.filter((s) => s.date && (s.status === 'done' || s.date <= t)).sort((a, b) => sortByDate(b, a));
}
function vMe() {
  const p = S.profile;
  const now = new Date();
  const ym = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  const all = myEntries();
  const inPer = (s) => ui.per === 'all' || (ui.per === 'year' ? s.date.startsWith(String(now.getFullYear())) : s.date.startsWith(ym));
  const list = all.filter(inPer);
  const shown = list.filter((s) => ui.src === 'all' || (ui.src === 'set' ? s.src !== 'own' : s.src === ui.src));
  const earned = list.filter((s) => s.my.paid).reduce((a, s) => a + myMoney(s), 0);
  const bartered = list.reduce((a, s) => a + myBarter(s), 0);
  const owed = list.filter((s) => !s.my.paid).reduce((a, s) => a + myMoney(s), 0);
  const shifts = list.reduce((a, s) => a + (Number(s.my.shifts) || 0), 0);
  const paidShifts = list.filter((s) => s.my.paid && myMoney(s) > 0).reduce((a, s) => a + (Number(s.my.shifts) || 0), 0);
  const noCheck = list.filter((s) => s.my.paid && myMoney(s) > 0 && !s.my.check);
  const months = {};
  list.forEach((s) => { const k = s.date.slice(0, 7); months[k] = (months[k] || 0) + (s.my.paid ? myMoney(s) : 0); });
  const mk = Object.keys(months).sort().reverse().slice(0, 6);
  const max = Math.max(1, ...mk.map((k) => months[k]));
  const rl = p.roles.map(roleName).concat(p.ownRole ? [p.ownRole] : []).join(' · ');
  let h = '<div class="screen"><div class="top">' + backBtn('#/today') + '<a class="iconbtn" href="#/settings" aria-label="' + T('Настройки', 'Settings') + '">' + I.gear + '</a></div>';
  h += '<div class="row pad4" style="gap:14px"><span class="avatar" style="width:60px;height:60px;border-radius:30px;font-size:24px">' + esc(initials(p.name)) + '</span><span class="col grow" style="gap:2px"><b style="font-size:18px">' + esc(p.name || T('Без имени', 'No name')) + '</b><span class="small muted">' + esc(rl) + '</span></span><button class="btn sm soft" data-a="editProfile">' + T('Изменить', 'Edit') + '</button></div>';
  h += '<a class="row between card" href="#/pro" style="flex-direction:row;text-decoration:none;color:inherit;padding:14px 18px"><span class="small">' + esc(subStatusText()) + '</span><span class="badge ' + (isPro() ? 'ok' : 'ink') + '">' + (isPro() ? 'SET Pro' : T('Подписка', 'Subscribe')) + '</span></a>';
  h += '<h1 class="pad4">' + T('Мои съёмки', 'My shoots') + '</h1>' + tip('me');
  h += '<div class="chips">' + chip(MONTHS_N[L()][now.getMonth()], ui.per === 'month', 'setUi', 'per|month') + chip(String(now.getFullYear()), ui.per === 'year', 'setUi', 'per|year') + chip(T('Всё время', 'All time'), ui.per === 'all', 'setUi', 'per|all') + '</div>';
  h += '<div class="card glow-pink" style="padding:22px;gap:14px"><div class="col" style="gap:2px"><span class="tiny">' + T('Заработано', 'Earned') + '</span><span class="h1" style="font-family:var(--mono);font-size:42px;letter-spacing:-0.03em">' + money(earned) + ' ₽</span></div>' +
    '<div class="grid3">' + [[shifts, T(plural(shifts, 'смена', 'смены', 'смен'), 'shifts')], [list.length, T(plural(list.length, 'съёмка', 'съёмки', 'съёмок'), 'shoots')], [paidShifts ? money(earned / paidShifts) : '—', T('₽ за смену в среднем', 'avg per shift')]].map((x) => '<div class="col" style="gap:2px;padding:12px;border-radius:16px;background:rgba(255,255,255,.5)"><span class="mono" style="font-size:20px;font-weight:500">' + x[0] + '</span><span class="tiny">' + x[1] + '</span></div>').join('') + '</div>' +
    (bartered ? '<div class="row between small"><span>' + T('Бартером и сертификатами', 'In barter and vouchers') + '</span><b class="mono">' + money(bartered) + ' ₽</b></div>' : '') + (owed ? '<div class="inkcard row between"><span>' + T('Ещё должны заплатить', 'Still owed to you') + '</span><b class="mono">' + money(owed) + ' ₽</b></div>' : '') +
    (noCheck.length ? '<span class="small">' + T('Чек в «Мой налог» не выбит: ', 'No receipt yet: ') + esc(noCheck.map((s) => s.client || titleOf(s)).join(', ')) + '</span>' : '') + '</div>';
  if (list.length) h += '<button class="btn big" data-a="openRecap" data-x="' + (ui.per === 'month' ? 'm0' : 'y0') + '">' + T('Поделиться итогами', 'Share my recap') + ' ↗</button>';
  if (mk.length) h += '<div class="card bars"><span class="tiny muted">' + T('По месяцам, ₽', 'By month') + '</span>' + mk.map((k) => '<div style="display:grid;grid-template-columns:62px minmax(0,1fr) 78px;gap:10px;align-items:center" class="small"><span>' + esc(MON_S[L()][Number(k.slice(5)) - 1] + ' ' + k.slice(2, 4)) + '</span><span class="bar"><i style="width:' + Math.round(months[k] / max * 100) + '%"></i></span><span class="mono" style="text-align:right">' + money(months[k]) + '</span></div>').join('') + '</div>';
  h += '<div class="chips">' + chip(T('Все', 'All'), ui.src === 'all', 'setUi', 'src|all', 'sm') + chip(T('Через SET', 'Via SET'), ui.src === 'set', 'setUi', 'src|set', 'sm') + chip(T('Мои вручную', 'Added by me'), ui.src === 'own', 'setUi', 'src|own', 'sm') + '</div>';
  if (!shown.length) h += '<div class="empty">' + T('Прошедшие съёмки появятся здесь. Свои — добавь в календаре.', 'Past shoots appear here. Add your own in the calendar.') + '</div>';
  shown.forEach((s) => {
    const d = parseIso(s.date); const fee = myMoney(s); const br = myBarter(s); const tfp = s.my.pay === 'tfp' || (s.my.fee !== '' && fee === 0 && !br);
    const badge = (s.my.fee === '' && !br && s.my.pay !== 'tfp') ? ['', T('сумма?', 'amount?')] : (!fee && br) ? ['', payName(s.my.pay)] : tfp ? ['', T('без оплаты', 'unpaid')] : s.my.paid ? ['ok', s.my.check ? T('оплачено · чек', 'paid · receipt') : T('оплачено', 'paid')] : ['ink', T('ждёт оплаты', 'awaiting')];
    h += '<button class="card ' + (s.src === 'own' ? 'dashed' : '') + '" data-a="editIncome" data-x="' + s.id + '" style="flex-direction:row;gap:12px;align-items:flex-start;text-align:left;padding:16px"><span class="col mono" style="gap:0;min-width:42px"><span style="font-size:20px">' + d.getDate() + '</span><span class="tiny">' + MON_S[L()][d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + String(d.getFullYear()).slice(2) : '') + '</span></span><span class="col grow" style="gap:3px"><b style="font-weight:600">' + esc(titleOf(s)) + '</b><span class="tiny muted">' + esc(roleName(s.my.role)) + ' · ' + s.my.shifts + ' ' + T(plural(Number(s.my.shifts) || 0, 'смена', 'смены', 'смен'), 'shifts') + ' · ' + (s.src === 'own' ? T('добавлено вручную', 'added by me') : T('через SET', 'via SET')) + '</span></span><span class="col" style="align-items:flex-end;gap:4px"><span class="mono">' + (tfp ? 'TFP' : fee ? money(fee) + ' ₽' + (br ? ' + ' + money(br) : '') : br ? money(br) + ' ₽' : '—') + '</span><span class="badge ' + badge[0] + '">' + badge[1] + '</span></span></button>';
  });
  h += '<div class="grid2"><button class="btn soft" data-a="ownSheet" data-x="">' + T('+ Своя съёмка', '+ Own shoot') + '</button><button class="btn soft" data-a="exportCsv">' + T('Таблица CSV', 'Export CSV') + '</button></div>';
  h += '<span class="lock pad4">' + I.lock + T('Суммы видишь только ты.', 'Only you see the amounts.') + '</span></div>' + nav('');
  return h;
}

/* --- settings --- */
function vSettings() {
  let h = '<div class="screen"><div class="top">' + backBtn('#/me') + '<span class="kicker">' + T('Настройки', 'Settings') + '</span><span style="width:44px"></span></div><h1 class="pad4">' + T('Настройки', 'Settings') + '</h1>';
  h += '<div class="card"><h3>' + T('Язык', 'Language') + '</h3><div class="chips">' + chip('Русский', S.lang === 'ru', 'lang', 'ru') + chip('English', S.lang === 'en', 'lang', 'en') + '</div></div>';
  h += notifCard(false);
  h += '<div class="card tight">' + sw(T('Подсказки-обучалки', 'Coaching tips'), T('короткие подсказки на каждом экране', 'short tips on each screen'), !S.tipsOff, 'toggleTips', '') + '</div>' + (S.seenTips && Object.keys(S.seenTips).length && !S.tipsOff ? '<button class="textbtn" style="align-self:flex-start" data-a="resetTips">' + T('Показать подсказки заново', 'Show tips again') + '</button>' : '');
  h += '<div class="card glow-teal"><h3>' + T('Как поставить на телефон', 'Install on your phone') + '</h3><span class="small">' + T('iPhone: в Safari нажми «Поделиться» → «На экран Домой». Android: в Chrome меню ⋮ → «Добавить на главный экран». SET откроется как приложение и будет работать без интернета.', 'iPhone: in Safari tap Share → Add to Home Screen. Android: Chrome menu ⋮ → Add to Home screen.') + '</span></div>';
  h += '<a class="card glow-pink" href="#/pro" style="text-decoration:none;color:inherit"><h3>' + T('Подписка', 'Subscription') + '</h3><span class="small">' + esc(subStatusText()) + '</span></a>';
  h += '<div class="card"><h3>' + T('Резервная копия', 'Backup') + '</h3><span class="small muted">' + T('Все данные хранятся только в этом телефоне. Сохраняй копию раз в неделю — и перед сменой телефона.', 'Your data lives only on this device. Save a backup weekly.') + '</span><div class="grid2"><button class="btn soft" data-a="exportJson">' + T('Сохранить копию', 'Save backup') + '</button><button class="btn soft" data-a="importJson">' + T('Загрузить копию', 'Restore') + '</button></div></div>';
  h += '<div class="card"><h3>' + T('Пример', 'Example') + '</h3><span class="small muted">' + T('Добавит съёмку для бренда, TFP, частного клиента и пару прошедших — чтобы всё потрогать.', 'Adds sample shoots to explore.') + '</span><button class="btn soft" data-a="demo">' + T('Добавить пример', 'Add example') + '</button></div>';
  h += '<div class="card"><h3>' + T('Начать с чистого листа', 'Start over') + '</h3><button class="btn danger" data-a="wipe">' + T('Удалить все данные', 'Delete all data') + '</button></div>';
  h += '<span class="tiny muted pad4">SET ' + VERSION + ' · ' + T('бета: данные только на этом устройстве', 'beta: data on this device only') + '</span></div>' + nav('');
  return h;
}
function vNotFound() { return '<div class="screen"><div class="top">' + backBtn('#/today') + '</div><div class="empty">' + T('Такой съёмки нет', 'Shoot not found') + '</div></div>' + nav(''); }

/* ---------- sheets ---------- */
function vSheet() {
  const sh = ui.sheet; if (!sh) return '';
  let h = '<div class="sheet-bg" data-a="closeSheet" data-self="1"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>';
  if (sh.type === 'share') {
    h += '<div class="row between"><h2>' + esc(sh.title) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div><textarea class="inp" id="shareText" style="min-height:200px;font-size:14px">' + esc(sh.text) + '</textarea>' +
      '<div class="grid2"><button class="btn" data-a="shareTo" data-x="tg">Telegram</button><button class="btn" data-a="shareTo" data-x="wa">WhatsApp</button></div><div class="grid2"><button class="btn soft" data-a="shareTo" data-x="copy">' + T('Скопировать', 'Copy') + '</button>' + (navigator.share ? '<button class="btn soft" data-a="shareTo" data-x="native">' + T('Ещё…', 'More…') + '</button>' : '') + '</div><span class="tiny muted">' + T('Текст можно поправить перед отправкой', 'You can edit the text before sending') + '</span>';
  }
  if (sh.type === 'member') {
    const s = getShoot(sh.s); const m = sh.data;
    h += '<div class="row between"><h2>' + (sh.isNew ? T('Новый человек', 'New person') : T('В команде', 'Team member')) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>' +
      field(T('Имя', 'Name'), '<input class="inp" id="mName" value="' + esc(m.name) + '" placeholder="' + T('Карина', 'Name') + '">') + field(T('Роль на этой съёмке', 'Role on this shoot'), roleSelect('', m.role).replace('data-b=""', 'id="mRole"')) +
      field(T('Сбор', 'Call'), '<input class="inp mono" type="time" data-time="1" id="mCall" value="' + esc(m.call || s.call) + '">') +
      '<div class="col"><span class="tiny muted">' + T('Как платим', 'Payment') + '</span><div class="chips">' + ['money', 'barter', 'cert', 'mix', 'tfp', 'client'].map((k) => '<button class="chip sm" data-a="memberPay" data-x="' + k + '" aria-pressed="' + ((m.pay || 'money') === k) + '">' + esc(payName(k)) + '</button>').join('') + '</div></div>' +
      (['money', 'mix'].includes(m.pay || 'money') ? '<div class="grid2">' + field(T('Ставка, ₽', 'Rate'), '<input class="inp mono" inputmode="numeric" id="mRate" value="' + esc(m.rate) + '">') + field(T('За', 'Per'), '<select class="inp" id="mUnit">' + UNITS.map((u) => '<option value="' + u[0] + '"' + ((m.unit || 'смена') === u[0] ? ' selected' : '') + '>' + esc(L() === 'en' ? u[1] : u[0]) + '</option>').join('') + '</select>') + '</div>' : '') +
      (['barter', 'cert', 'mix'].includes(m.pay) ? field(T('Бартер / сертификат: на сколько, ₽', 'Barter / voucher value'), '<input class="inp mono" inputmode="numeric" id="mBarter" value="' + esc(m.barter || '') + '">') : '') +
      field(T('Заметка', 'Note'), '<input class="inp" id="mNote" value="' + esc(m.note || '') + '" placeholder="' + T('монтаж входит, привозит свой свет…', 'editing included, brings own light…') + '">') +
      (sh.isNew ? field(T('Телефон', 'Phone'), '<input class="inp" type="tel" inputmode="tel" id="mPhone" placeholder="+7 900 000-00-00" value="' + esc(sh.phone || '') + '">') + '<div class="grid2">' + field('Telegram', '<input class="inp" id="mTg" data-tg="1" autocapitalize="off" placeholder="@nick" value="' + esc(sh.tg || '') + '">') + field('Instagram', '<input class="inp" id="mInsta" placeholder="@" value="' + esc(sh.insta || '') + '">') + '</div>' : '') +
      '<button class="btn big" data-a="saveMember">' + T('Сохранить', 'Save') + '</button>' + (!sh.isNew ? '<button class="btn danger" data-a="removeMember">' + T('Убрать из проекта', 'Remove from project') + '</button>' : '');
  }
  if (sh.type === 'pick') {
    const s = getShoot(sh.s); const inTeam = new Set(s.team.map((m) => m.pid));
    const avail = S.people.filter((p) => !inTeam.has(p.id));
    h += '<div class="row between"><h2>' + T('Мои люди', 'My people') + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>';
    if (!avail.length) h += '<div class="empty">' + T('Все уже в команде или база пуста', 'Everyone is in, or your base is empty') + '</div>';
    h += '<div class="card tight">' + avail.map((p) => { const busy = S.shoots.some((x) => x.id !== s.id && x.date && x.date === s.date && x.team.some((m) => m.pid === p.id && m.status !== 'no')); return '<button class="li" data-a="addFromBase" data-x="' + p.id + '"><span class="avatar sm soft">' + esc(initials(p.name)) + '</span><span class="grow"><b style="font-weight:600">' + esc(p.name) + '</b><br><span class="tiny muted">' + esc(roleName(p.role)) + '</span></span>' + (busy ? '<span class="badge warn">' + T('занят(а) в этот день', 'busy that day') + '</span>' : '<span class="badge">+</span>') + '</button>'; }).join('') + '</div>';
  }
  if (sh.type === 'person') {
    const p = sh.data;
    h += '<div class="row between"><h2>' + (sh.isNew ? T('Новый человек', 'New person') : esc(p.name)) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>' +
      field(T('Имя', 'Name'), '<input class="inp" id="pName" value="' + esc(p.name) + '">') + field(T('Роль', 'Role'), roleSelect('', p.role).replace('data-b=""', 'id="pRole"')) +
      field(T('Телефон', 'Phone'), '<input class="inp" type="tel" inputmode="tel" id="pPhone" value="' + esc(p.phone || '') + '" placeholder="+7 900 000-00-00">') +
      '<div class="grid2">' + field('Telegram', '<input class="inp" id="pTg" data-tg="1" autocapitalize="off" value="' + esc(p.tg || '') + '" placeholder="@nick">') + field('Instagram', '<input class="inp" id="pInsta" value="' + esc(p.insta || '') + '" placeholder="@">') + '</div>' +
      '<div class="col"><span class="tiny muted">' + T('Не ест', 'Food') + '</span><div class="chips">' + FOOD.slice(1).map((f) => '<button class="chip sm" data-a="togglePFood" data-x="' + f[0] + '" aria-pressed="' + (p.food || []).includes(f[0]) + '">' + esc(L() === 'en' ? f[2] : f[1]) + '</button>').join('') + '</div></div>' +
      field(T('Заметка', 'Note'), '<textarea class="inp" id="pNote" placeholder="' + T('Размеры, рост, что важно знать', 'Sizes, notes') + '">' + esc(p.note || '') + '</textarea>') +
      '<button class="btn big" data-a="savePerson">' + T('Сохранить', 'Save') + '</button>' + (!sh.isNew ? '<button class="btn danger" data-a="deletePerson">' + T('Удалить из базы', 'Delete') + '</button>' : '');
  }
  if (sh.type === 'own' || sh.type === 'income') {
    const s = sh.data;
    const own = s.src === 'own';
    const clash = s.date && S.shoots.find((x) => x.id !== s.id && x.date === s.date);
    h += '<div class="row between"><h2>' + (sh.isNew ? T('Своя съёмка', 'Own shoot') : esc(titleOf(s))) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>';
    if (own) h += field(T('Что снимаем', 'What'), '<input class="inp" id="oTitle" value="' + esc(s.client || s.what ? titleOf(s) : '') + '" placeholder="' + T('Шоурум · лукбук', 'Showroom · lookbook') + '">') +
      field(T('Дата', 'Date'), '<input class="inp" type="date" id="oDate" value="' + esc(s.date) + '" data-a2="ownDate">') +
      '<div class="grid2">' + field(T('Сбор', 'Call'), '<input class="inp mono" type="time" data-time="1" id="oCall" value="' + esc(s.call) + '">') + field(T('Конец', 'Wrap'), '<input class="inp mono" type="time" data-time="1" id="oEnd" value="' + esc(s.end || '') + '">') + '</div><span class="tiny muted">' + T('По сбору и концу посчитаем часы на площадке — для твоих итогов', 'Call and wrap give your hours on set — for your recap') + '</span>';
    if (clash) h += '<span class="small" style="color:var(--red);font-weight:600">' + T('В этот день уже есть: ', 'Already booked that day: ') + esc(titleOf(clash)) + '</span>';
    h += '<div class="grid2">' + field(T('Роль', 'Role'), roleSelect('', s.my.role).replace('data-b=""', 'id="oRole"')) + field(T('Деньгами, ₽', 'Money'), '<input class="inp mono" inputmode="numeric" id="oFee" value="' + esc(s.my.fee) + '" placeholder="0">') + '</div>' +
      '<div class="chips">' + ['money', 'barter', 'cert', 'mix', 'tfp'].map((k) => '<button class="chip sm" data-a="sheetPay" data-x="' + k + '" aria-pressed="' + ((s.my.pay || 'money') === k) + '">' + esc(payName(k)) + '</button>').join('') + '</div>' +
      (['barter', 'cert', 'mix'].includes(s.my.pay) ? field(T('Бартер / сертификат на, ₽', 'Barter / voucher value'), '<input class="inp mono" inputmode="numeric" id="oBarter" value="' + esc(s.my.barter || '') + '">') : '') +
      '<div class="row between"><span>' + T('Смен', 'Shifts') + '</span><span class="row"><button class="iconbtn" data-a="sheetShift" data-x="-1">−</button><span class="mono" id="oShifts" style="min-width:24px;text-align:center">' + s.my.shifts + '</span><button class="iconbtn" data-a="sheetShift" data-x="1">+</button></span></div>' +
      '<div class="row wrap"><button class="chip sm" data-a="sheetFlag" data-x="paid" aria-pressed="' + !!s.my.paid + '">' + (s.my.paid ? T('✓ Оплачено', '✓ Paid') : T('Ждёт оплаты', 'Awaiting')) + '</button><button class="chip sm" data-a="sheetFlag" data-x="check" aria-pressed="' + !!s.my.check + '">' + (s.my.check ? T('✓ Чек выбит', '✓ Receipt') : T('Чек не выбит', 'No receipt')) + '</button></div>' +
      '<input class="inp" id="oNote" value="' + esc(s.my.note) + '" placeholder="' + T('Заметка: аванс, переработка', 'Note: advance, overtime') + '">' +
      '<button class="btn big" data-a="saveOwn">' + T('Сохранить', 'Save') + '</button>' + (!sh.isNew && own ? '<button class="btn danger" data-a="deleteOwn">' + T('Удалить', 'Delete') + '</button>' : '') + (!own ? '<a class="btn ghost" href="#/p/' + s.id + '">' + T('Открыть проект', 'Open project') + '</a>' : '');
  }
  if (sh.type === 'line') {
    const x = sh.data;
    const showB = ['barter', 'cert', 'mix'].includes(x.pay);
    h += '<div class="row between"><h2>' + (sh.isNew ? T('Новая строка', 'New line') : T('Строка сметы', 'Budget line')) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>' +
      field(T('Раздел', 'Section'), '<select class="inp" id="lSec">' + SECTIONS.map(([k]) => '<option value="' + k + '"' + (x.sec === k ? ' selected' : '') + '>' + esc(secName(k)) + '</option>').join('') + '</select>') +
      field(T('Статья', 'Item'), '<input class="inp" id="lLabel" value="' + esc(x.label) + '" placeholder="' + T('Фотограф, аренда света…', 'Photographer, light rental…') + '">') +
      field(T('Что входит', 'What’s included'), '<input class="inp" id="lDesc" value="' + esc(x.desc) + '" placeholder="' + T('кто, сколько, что включено', 'who, how much, what’s included') + '">') +
      '<div class="grid3">' + field(T('Кол-во', 'Qty'), '<input class="inp mono" inputmode="decimal" id="lQty" value="' + esc(x.qty) + '">') + field(T('Ед.', 'Unit'), '<select class="inp" id="lUnit">' + UNITS.map((u) => '<option value="' + u[0] + '"' + (x.unit === u[0] ? ' selected' : '') + '>' + esc(L() === 'en' ? u[1] : u[0]) + '</option>').join('') + '</select>') + field(T('Ставка, ₽', 'Rate'), '<input class="inp mono" inputmode="numeric" id="lRate" value="' + esc(x.rate) + '" placeholder="?">') + '</div>' +
      '<div class="col"><span class="tiny muted">' + T('Как платим', 'Payment') + '</span><div class="chips">' + Object.keys(PAY).filter((k) => k !== 'tfp').map((k) => '<button class="chip sm" data-a="linePay" data-x="' + k + '" aria-pressed="' + ((x.pay || 'money') === k) + '">' + esc(payName(k)) + '</button>').join('') + '</div></div>' +
      (showB ? field(T('Бартер / сертификат, ₽ — сколько стоит', 'Barter / voucher value'), '<input class="inp mono" inputmode="numeric" id="lBarter" value="' + esc(x.barter) + '">') : '') +
      sw(T('Под вопросом', 'Open question'), T('ещё не согласовано или ждём сумму', 'not agreed yet or waiting for a number'), x.q, 'lineQ', '') +
      '<button class="btn big" data-a="saveLine">' + T('Сохранить', 'Save') + '</button>' + (!sh.isNew ? '<button class="btn danger" data-a="deleteLine">' + T('Удалить строку', 'Delete line') + '</button>' : '');
  }
  if (sh.type === 'out') {
    h += '<div class="row between"><h2>' + esc(sh.title) + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>';
    if (sh.kind === 'looks' || sh.kind === 'looks4') h += '<div class="seg">' + chip(T('По образу на лист', 'One look per page'), sh.kind === 'looks', 'outMode', 'looks', 'sm') + chip(T('Все на одном листе', 'All on one page'), sh.kind === 'looks4', 'outMode', 'looks4', 'sm') + '</div>';
    if (!sh.urls) h += '<div class="empty">' + T('Собираю лист…', 'Building the sheet…') + '</div>';
    else h += sh.urls.map((u, i) => '<img src="' + u + '" alt="' + esc(sh.title) + ' ' + (i + 1) + '" style="width:100%;border-radius:12px;display:block;box-shadow:0 2px 14px rgba(0,0,0,.12)">').join('') +
      (sh.urls.length > 1 ? '<span class="tiny muted">' + T('Страниц: ', 'Pages: ') + sh.urls.length + '</span>' : '') +
      '<button class="btn big" data-a="outShare">' + T('Отправить или распечатать', 'Send or print') + '</button><button class="btn soft" data-a="outSave">' + T('Сохранить картинку', 'Save image') + '</button>' +
      '<span class="tiny muted">' + T('Распечатать: «Отправить» → «Напечатать». Формат А4, смета и ставки сюда не попадают.', 'To print: Send → Print. A4, no money on it.') + '</span>';
  }
  if (sh.type === 'img') {
    h += '<div class="row between"><h2>' + T('Референс', 'Reference') + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>' + imgTag(sh.id, 'width:100%;border-radius:18px;display:block') + '<button class="btn danger" data-a="delMood" data-s="' + sh.s + '" data-x="' + sh.id + '">' + T('Убрать из мудборда', 'Remove') + '</button>';
  }
  if (sh.type === 'recap') {
    const d = recapData(sh.k);
    const per = rcPeriods().filter((x) => x.k !== 'y1' || recapData('y1').n);
    h += '<div class="row between"><h2>' + T('Итоги', 'Recap') + '</h2><button class="iconbtn" data-a="closeSheet" aria-label="' + T('Закрыть', 'Close') + '">' + I.x + '</button></div>';
    h += '<div class="chips">' + per.map((x) => chip(x.label, x.k === sh.k, 'rcPer', x.k, 'sm')).join('') + '</div>';
    if (!d.n) h += '<div class="empty">' + T('В этом периоде пока нет прошедших съёмок. Добавь свои в календаре — и итоги соберутся.', 'No past shoots in this period yet. Add your own in the calendar and the recap fills itself.') + '</div>';
    else {
      h += '<img id="rcImg" alt="' + T('Итоги — картинка для сторис', 'Recap story image') + '" style="width:100%;aspect-ratio:9/16;border-radius:22px;display:block;background:#EDEBEF;box-shadow:0 12px 40px rgba(26,26,34,.12)">';
      h += '<div class="chips">' + RC_TH.map((t, i) => chip(L() === 'en' ? t.en : t.ru, (S.rcTh || 0) === i, 'rcTh', String(i), 'sm')).join('') + '</div>';
      h += sw(T('Показать сумму', 'Show the amount'), T('выключи — останутся съёмки и часы', 'off — only shoots and hours stay'), !S.rcHide, 'rcHide', '');
      if (d.owed && !S.rcHide) h += '<span class="tiny muted">' + T('В сумме и то, что ещё должны заплатить: ', 'Includes money still owed: ') + money(d.owed) + ' ₽</span>';
      h += '<button class="btn big" data-a="rcShare">' + T('Поделиться в сторис', 'Share to stories') + '</button><button class="btn soft" data-a="rcSave">' + T('Сохранить картинку', 'Save image') + '</button>';
      h += '<span class="tiny muted">' + T('В сторис добавь стикер «Ссылка» на ' + APP_URL + ' — так друзья спросят «где это сделано?» и найдут приложение', 'Add a Link sticker to ' + APP_URL + ' in your story — that’s how friends find the app') + '</span>';
    }
  }
  if (sh.type === 'menu') {
    const s = getShoot(sh.s);
    h += '<h2>' + esc(titleOf(s)) + '</h2><button class="btn soft" data-a="dupShoot">' + T('Дублировать как шаблон', 'Duplicate as template') + '</button><button class="btn soft" data-a="go" data-x="#/p/' + s.id + '/wrap">' + T('После съёмки', 'After the shoot') + '</button><button class="btn danger" data-a="deleteShoot">' + T('Удалить съёмку', 'Delete shoot') + '</button><button class="btn ghost" data-a="closeSheet">' + T('Отмена', 'Cancel') + '</button>';
  }
  h += '</div></div>';
  return h;
}

/* --- recap: итоги месяца и года --- */
const RC_TH = [
  { ru: 'Розовый', en: 'Pink', bg: '#F7F6F4', ink: '#1A1A22', sub: '#6E6B75', card: 'rgba(255,255,255,0.62)', glow: [['244,161,195', 0.95, 0.1, 0.75], ['249,217,62', 0.02, 0.72, 0.55], ['133,163,229', 0.9, 0.95, 0.45]] },
  { ru: 'Лимонный', en: 'Lemon', bg: '#F7F6F4', ink: '#1A1A22', sub: '#6E6B75', card: 'rgba(255,255,255,0.6)', glow: [['249,217,62', 0.9, 0.08, 0.8], ['133,163,229', 0.05, 0.85, 0.6], ['244,161,195', 0.95, 0.6, 0.35]] },
  { ru: 'Ночь', en: 'Night', bg: '#1A1A22', ink: '#F7F6F4', sub: '#CFCCD6', card: 'rgba(16,16,24,0.42)', glow: [['59,79,176', 0.95, 0.08, 0.85], ['244,161,195', 0.02, 0.8, 0.55], ['9,118,156', 0.9, 0.98, 0.45]] },
];
function rcPeriods() {
  const n = new Date(); const y = n.getFullYear(); const m = n.getMonth(); const pm = new Date(y, m - 1, 1);
  const mo = (yy, mm) => ({ kind: 'month', pre: yy + '-' + pad(mm + 1), y: yy, m: mm, label: MONTHS_N[L()][mm] + (yy !== y ? ' ' + yy : '') });
  return [{ k: 'm0', ...mo(y, m) }, { k: 'm1', ...mo(pm.getFullYear(), pm.getMonth()) }, { k: 'y0', kind: 'year', pre: String(y), y, label: String(y) }, { k: 'y1', kind: 'year', pre: String(y - 1), y: y - 1, label: String(y - 1) }];
}
function recapData(k) {
  const p = rcPeriods().find((x) => x.k === k) || rcPeriods()[2];
  const list = myEntries().filter((s) => !s.demo && s.date.startsWith(p.pre));
  const sh = (s) => Math.max(1, Number(s.my.shifts) || 1);
  const earned = list.reduce((a, s) => a + myMoney(s), 0);
  const owed = list.filter((s) => !s.my.paid).reduce((a, s) => a + myMoney(s), 0);
  const barter = list.reduce((a, s) => a + myBarter(s), 0);
  const shifts = list.reduce((a, s) => a + sh(s), 0);
  const hours = list.reduce((a, s) => a + durationH(s) * sh(s), 0);
  const longest = Math.max(0, ...list.map(durationH));
  const people = new Set(); list.forEach((s) => (s.team || []).forEach((m) => { const id = m.pid || (m.name || '').trim().toLowerCase(); if (id) people.add(id); }));
  const clients = new Set(list.map((s) => (s.client || '').trim().toLowerCase()).filter(Boolean)).size;
  const byM = {}; list.forEach((s) => { const km = Number(s.date.slice(5, 7)) - 1; byM[km] = (byM[km] || 0) + 1; });
  const topM = Object.keys(byM).sort((a, b) => byM[b] - byM[a])[0];
  const byR = {}; list.forEach((s) => { if (s.my.role) byR[s.my.role] = (byR[s.my.role] || 0) + 1; });
  const topR = Object.keys(byR).sort((a, b) => byR[b] - byR[a])[0];
  return { p, n: list.length, earned, owed, barter, shifts, hours, longest, people: people.size, clients, topM: topM == null ? null : Number(topM), topMn: topM == null ? 0 : byM[topM], topR, roles: Object.keys(byR).length };
}
function recapBanner() {
  const d = new Date(); const day = d.getDate(); const m = d.getMonth();
  let k = null;
  if ((m === 11 && day >= 15)) k = 'y0'; else if (m === 0 && day <= 15) k = 'y1'; else if (day >= 25) k = 'm0'; else if (day <= 5) k = 'm1';
  if (!k) return '';
  const r = recapData(k); const key = k + ':' + r.p.pre;
  if (!r.n || S.rcSeen === key) return '';
  const what = r.p.kind === 'year' ? T('Итоги ' + r.p.y + ' года', 'Your ' + r.p.y + ' recap') : T('Итоги ' + MONTHS[L()][r.p.m].replace(/^./, (c) => c), 'Your ' + MONTHS.en[r.p.m] + ' recap');
  return '<div class="card glow-lemon" style="gap:10px"><div class="row between" style="align-items:flex-start"><b style="font-size:17px">' + esc(what) + T(' готовы', ' is ready') + '</b><button class="iconbtn sm" data-a="rcHideBanner" data-x="' + esc(key) + '" aria-label="' + T('Скрыть', 'Hide') + '">' + I.x + '</button></div><span class="small">' + r.n + ' ' + T(plural(r.n, 'съёмка', 'съёмки', 'съёмок'), 'shoots') + (r.hours ? ' · ' + rcNum(r.hours) + T(' ч на площадке', ' h on set') : '') + T(' — одной картинкой для сторис', ' — in one story image') + '</span><button class="btn" data-a="openRecap" data-x="' + k + '">' + T('Посмотреть и поделиться', 'View and share') + '</button></div>';
}
const rcNum = (h) => (h < 10 ? String(Math.round(h * 10) / 10).replace('.', ',') : String(Math.round(h)));
let rcFile = null; let rcJob = 0;
function rcDownload() { const a = document.createElement('a'); a.href = URL.createObjectURL(rcFile); a.download = rcFile.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
async function paintRecap() {
  const img = $('#rcImg'); if (!img) return;
  const job = ++rcJob; rcFile = null;
  const d = recapData(ui.sheet.k);
  const cv = document.createElement('canvas');
  await drawRecap(cv, d, { hide: !!S.rcHide, th: S.rcTh || 0 });
  if (job !== rcJob) return;
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (job !== rcJob || !blob) return;
  rcFile = new File([blob], 'set-' + T('itogi', 'recap') + '-' + d.p.pre + '.png', { type: 'image/png' });
  const el = $('#rcImg'); if (el) el.src = URL.createObjectURL(blob);
}
function rcFit(c, text, font, size, maxW) { let s = size; c.font = font.replace('%', s); while (c.measureText(text).width > maxW && s > 20) { s -= 4; c.font = font.replace('%', s); } return s; }
function rcRound(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
async function drawRecap(cv, d, o) {
  const W = 1080, H = 1920, X = 88; cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); const th = RC_TH[o.th] || RC_TH[0];
  try { await Promise.race([Promise.all(['400 90px Neucha', '500 150px "Inter Tight"', '400 40px Inter', '600 40px Inter', '500 100px "IBM Plex Mono"'].map((f) => document.fonts.load(f, 'Итоги set 0123 ₽'))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* offline: system fonts */ }
  const HEAD = '"Inter Tight", Inter, system-ui, sans-serif', BODY = 'Inter, system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const ls = (v) => { if ('letterSpacing' in c) c.letterSpacing = v; };
  c.fillStyle = th.bg; c.fillRect(0, 0, W, H);
  th.glow.forEach(([rgb, gx, gy, r]) => { const g = c.createRadialGradient(gx * W, gy * H, 0, gx * W, gy * H, r * W * 1.3); g.addColorStop(0, 'rgba(' + rgb + ',0.9)'); g.addColorStop(0.42, 'rgba(' + rgb + ',0.32)'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); });
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  // header
  c.fillStyle = th.ink; c.font = '400 96px Neucha, ' + HEAD; ls('0px'); c.fillText('set', X, 300);
  c.textAlign = 'right'; c.fillStyle = th.sub; c.font = '500 32px ' + MONO; ls('2px');
  c.fillText((d.p.kind === 'year' ? T('ИТОГИ ГОДА', 'YEAR IN REVIEW') : T('ИТОГИ МЕСЯЦА', 'MONTH IN REVIEW')), W - X, 290); c.textAlign = 'left'; ls('0px');
  // title
  const t1 = d.p.kind === 'year' ? T('Мой', 'My') : T('Мой', 'My');
  const t2 = d.p.kind === 'year' ? String(d.p.y) : (L() === 'en' ? MONTHS.en[d.p.m] : MONTHS_N.ru[d.p.m].toLowerCase());
  c.fillStyle = th.ink; ls('-6px');
  const fs = rcFit(c, t2, '500 %px ' + HEAD, 176, W - 2 * X);
  c.font = '500 ' + fs + 'px ' + HEAD; c.fillText(t1, X - 6, 520); c.fillText(t2, X - 6, 520 + fs * 0.92); ls('0px');
  let y = 520 + fs * 0.92 + 76;
  const who = [S.profile.name, d.topR && ROLE[d.topR] ? roleName(d.topR).toLowerCase() : ''].filter(Boolean).join(' · ');
  if (who) { c.fillStyle = th.sub; rcFit(c, who, '400 %px ' + BODY, 40, W - 2 * X); c.fillText(who, X, y); }
  y += 140;
  // hero
  const showMoney = !o.hide && d.earned > 0;
  const heroLabel = showMoney ? T('заработано на съёмках', 'earned on shoots') : d.hours ? T('на площадке', 'on set') : T('съёмок', 'shoots');
  const heroVal = showMoney ? money(d.earned) + ' ₽' : d.hours ? rcNum(d.hours) + T(' ч', ' h') : String(d.n);
  c.fillStyle = th.sub; c.font = '400 36px ' + BODY; c.fillText(heroLabel, X, y);
  c.fillStyle = th.ink; ls('-4px'); const hs = rcFit(c, heroVal, '500 %px ' + MONO, 150, W - 2 * X); c.fillText(heroVal, X - 4, y + hs * 0.98); ls('0px');
  y += hs * 0.98 + 70;
  // tiles
  const tiles = [];
  if (!(heroLabel === T('съёмок', 'shoots'))) tiles.push([String(d.n), T(plural(d.n, 'съёмка', 'съёмки', 'съёмок'), 'shoots')]);
  if (d.hours && showMoney) tiles.push([rcNum(d.hours), T('часов на площадке', 'hours on set')]);
  tiles.push([String(d.shifts), T(plural(d.shifts, 'смена', 'смены', 'смен'), 'shifts')]);
  if (d.people) tiles.push([String(d.people), T(plural(d.people, 'человек', 'человека', 'человек') + ' в командах', 'people on my teams')]);
  if (d.clients) tiles.push([String(d.clients), T(plural(d.clients, 'клиент', 'клиента', 'клиентов') + ' и брендов', 'clients & brands')]);
  if (d.longest >= 8) tiles.push([rcNum(d.longest) + T(' ч', 'h'), T('самый длинный день', 'longest day')]);
  if (!o.hide && d.barter) tiles.push([money(d.barter), T('₽ бартером', '₽ in barter')]);
  const tw = (W - 2 * X - 28) / 2, tht = 214;
  tiles.slice(0, 4).forEach((t, i) => {
    const tx = X + (i % 2) * (tw + 28), ty = y + Math.floor(i / 2) * (tht + 28);
    c.fillStyle = th.card; rcRound(c, tx, ty, tw, tht, 48); c.fill();
    c.fillStyle = th.ink; ls('-2px'); const ns = rcFit(c, t[0], '500 %px ' + MONO, 92, tw - 72); c.fillText(t[0], tx + 36, ty + 40 + ns * 0.9); ls('0px');
    c.fillStyle = th.sub; rcFit(c, t[1], '400 %px ' + BODY, 32, tw - 72); c.fillText(t[1], tx + 36, ty + tht - 40);
  });
  y += Math.ceil(Math.min(4, tiles.length) / 2) * (tht + 28) + 40;
  // fact line
  let fact = '';
  if (d.p.kind === 'year' && d.topM != null && d.topMn > 1) fact = T('Самый плотный месяц — ' + MONTHS_N.ru[d.topM].toLowerCase() + ', ' + d.topMn + ' ' + plural(d.topMn, 'съёмка', 'съёмки', 'съёмок'), 'Busiest month — ' + MONTHS.en[d.topM] + ', ' + d.topMn + ' shoots');
  else if (d.roles > 1) fact = T('В ' + d.roles + ' ' + plural(d.roles, 'роли', 'ролях', 'ролях') + ' за ' + (d.p.kind === 'year' ? 'год' : 'месяц'), d.roles + ' different roles this ' + (d.p.kind === 'year' ? 'year' : 'month'));
  if (fact && y < 1660) { c.fillStyle = th.ink; rcFit(c, fact, '600 %px ' + BODY, 38, W - 2 * X); c.fillText(fact, X, y + 20); }
  // footer
  c.fillStyle = th.sub; c.globalAlpha = 0.35; c.fillRect(X, 1700, W - 2 * X, 2); c.globalAlpha = 1;
  c.font = '400 30px ' + BODY; c.fillText(T('Собрано в SET — приложении для съёмок', 'Made with SET — the shoot app'), X, 1760);
  c.fillStyle = th.ink; c.font = '500 30px ' + MONO; c.fillText(APP_URL, X, 1806);
}

/* ---------- actions ---------- */
const A = {
  go: (el) => { location.hash = el.dataset.x; },
  lang: (el) => { S.lang = el.dataset.x; document.documentElement.lang = S.lang; save(); render(); },
  setUi: (el) => { const [k, v] = el.dataset.x.split('|'); ui[k] = v; render(); },
  setProfile: (el) => { const [k, v] = el.dataset.x.split('|'); S.profile[k] = v; save(); render(); },
  moreG: (el) => { ui.moreG = ui.moreG || {}; ui.moreG[el.dataset.x] = !ui.moreG[el.dataset.x]; render(); },
  toggleRole: (el) => { const r = el.dataset.x, a = S.profile.roles; const i = a.indexOf(r); if (i >= 0) a.splice(i, 1); else a.push(r); save(); render(); },
  toggleSkill: (el) => { const k = el.dataset.x, a = S.profile.skills; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); save(); render(); },
  toggleFood: (el) => { const k = el.dataset.x; let a = S.profile.food; if (k === 'all') a = a.includes('all') ? [] : ['all']; else { a = a.filter((x) => x !== 'all'); a = a.includes(k) ? a.filter((x) => x !== k) : a.concat(k); } S.profile.food = a; save(); render(); },
  onbNext: () => {
    const p = S.profile; const o = ui.onb;
    if (o.step === 1 && !p.name.trim()) { toast(T('Напиши, как тебя зовут', 'Tell us your name')); $('[data-b="profile.name"]')?.focus(); return; }
    if (o.step === 1 && String(p.phone || '').replace(/\D/g, '').length < 10) { toast(T('Укажи номер телефона', 'Add your phone number')); $('[data-b="profile.phone"]')?.focus(); return; }
    if (o.step === 1 && !p.roles.length && !p.ownRole.trim()) { toast(T('Выбери хотя бы одну роль', 'Pick at least one role')); return; }
    const clientOnly = p.roles.length > 0 && !p.ownRole && p.roles.every((r) => CLIENT_ROLES.includes(r));
    o.step = clientOnly && o.step === 1 ? 4 : o.step + 1; window.scrollTo(0, 0); render();
  },
  onbBack: () => { const p = S.profile; const o = ui.onb; const clientOnly = p.roles.length > 0 && !p.ownRole && p.roles.every((r) => CLIENT_ROLES.includes(r)); o.step = clientOnly && o.step === 4 ? 1 : Math.max(1, o.step - 1); window.scrollTo(0, 0); render(); },
  finishOnb: () => { S.profile.onboarded = true; ui.onb = null; const pj = S.pendingJoin; delete S.pendingJoin; save(); if (pj) { joinFrom(pj); return; } location.hash = '#/today'; render(); },
  editProfile: () => { ui.onb = { step: 1 }; location.hash = '#/welcome'; },
  demo: () => { loadDemo(); toast(T('Пример добавлен', 'Example added')); location.hash = '#/today'; render(); },
  createShoot: () => {
    const k = ui.newKind; if (!k) return;
    const s = newShoot(k, { client: $('#nfClient')?.value.trim() || '', what: $('#nfWhat')?.value.trim() || '', date: $('#nfDate')?.value || '' });
    const call = normTime($('#nfCall')?.value); if (call) s.call = call;
    if (k === 'custom' && ui.newMods) s.modules = { ...ui.newMods };
    if (!isPro()) S.freeUsed = true;
    S.shoots.push(s); save(); ui.newKind = null; ui.newMods = null; location.hash = '#/p/' + s.id;
  },
  toggleNewMod: (el) => { ui.newMods[el.dataset.x] = !ui.newMods[el.dataset.x]; render(); },
  toggleCheck: (el) => { const s = getShoot(el.dataset.s); const c = s.checklist.find((x) => x.id === el.dataset.x); c.done = !c.done; save(); render(); },
  addCheck: (el) => { const s = getShoot(el.dataset.s); const v = $('#newCheck').value.trim(); if (!v) return; s.checklist.push({ id: uid(), text: v, done: false }); save(); render(); $('#newCheck')?.focus(); },
  delRow: (el) => { const s = getShoot(el.dataset.s); const [arr, id] = el.dataset.x.split('|'); if (arr === 'looks' && !confirm(T('Удалить образ?', 'Delete this look?'))) return; if (arr === 'looks') { const l = s.looks.find((x) => x.id === id); if (l) lookPics(l).forEach(mDel); } s[arr] = s[arr].filter((x) => x.id !== id); save(); render(); },
  useTemplate: (el) => { const s = getShoot(el.dataset.s); s.timing = genTiming(s); save(); render(); },
  tlToggle: (el) => { ui.tlOpen = ui.tlOpen === el.dataset.x ? null : el.dataset.x; render(); },
  clearTiming: (el) => { if (!confirm(T('Удалить все строки тайминга?', 'Clear the whole schedule?'))) return; const s = getShoot(el.dataset.s); s.timing = []; save(); render(); },
  addTiming: (el) => { const s = getShoot(el.dataset.s); const all = sortedTiming(s); const last = all[all.length - 1]; s.timing.push({ id: uid(), t: last && last.t2 ? last.t2 : '', w: '' }); save(); render(); },
  addLunch: (el) => { const s = getShoot(el.dataset.s); const a = mins(s.call) ?? 600; const d = durationH(s) * 60 || 480; const m = (Math.round((a + d / 2) / 30) * 30) % 1440; s.timing.push({ id: uid(), t: pad(Math.floor(m / 60)) + ':' + pad(m % 60), w: T('Обед для команды', 'Team lunch') }); const f = teamFood(s); save(); toast(T('Обед добавлен в тайминг', 'Lunch added') + (f ? ' · ' + f : '')); render(); },
  tab: (el) => { location.hash = '#/p/' + el.dataset.s + '/' + (el.dataset.x || 'main'); },
  shareTeam: async (el) => { const s = getShoot(el.dataset.s); const link = await shareLink(s, ''); shareSheet(T('Команде', 'To the team'), teamText(s) + '\n\n' + T('Проект целиком — сохрани в SET, там всегда свежая версия:', 'The whole project — save it in SET:') + '\n' + link); },
  shareClientGuide: (el) => { const s = getShoot(el.dataset.s); const c = s.checklist.find((x) => /памятка|guide/i.test(x.text)); if (c) { c.done = true; save(); } shareSheet(T('Памятка клиенту', 'Client guide'), guideText(s)); },
  invitePerson: async (el) => { const s = getShoot(el.dataset.s); const m = s.team.find((x) => x.id === el.dataset.x); if (!m.status) { m.status = 'asked'; save(); } const link = await shareLink(s, m.id); ui.sheet = { type: 'share', title: m.name, text: personText(s, m) + '\n\n' + T('Тайминг, адрес и твой образ — в SET:', 'Schedule, address and your look — in SET:') + '\n' + link, phone: S.people.find((p) => p.id === m.pid)?.phone }; render(); },
  pasteJoin: () => { const v = ($('#joinPaste')?.value || '').trim(); const i = v.indexOf('#/join/'); if (i < 0) { toast(T('Это не ссылка на проект SET', 'This is not a SET project link')); return; } joinFrom(v.slice(i + 7)); },
  guestDelete: (el) => { if (!confirm(T('Убрать этот проект у себя? У продюсера он останется.', 'Remove this project from your SET? The producer keeps it.'))) return; S.shoots = S.shoots.filter((x) => x.id !== el.dataset.s); save(); location.hash = '#/projects'; },
  shareTo: async (el) => {
    const text = $('#shareText')?.value || ui.sheet.text; const k = el.dataset.x;
    if (k === 'copy') return copy(text);
    if (k === 'native') { try { await navigator.share({ text }); } catch (e) { /* cancelled */ } return; }
    const url = k === 'tg' ? 'https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(text) : 'https://wa.me/' + (ui.sheet.phone ? String(ui.sheet.phone).replace(/\D/g, '') : '') + '?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
  },
  openRecap: (el) => { ui.sheet = { type: 'recap', k: el.dataset.x || 'y0' }; render(); },
  rcPer: (el) => { ui.sheet.k = el.dataset.x; render(); },
  rcTh: (el) => { S.rcTh = Number(el.dataset.x); save(); render(); },
  rcHide: () => { S.rcHide = !S.rcHide; save(); render(); },
  rcHideBanner: (el) => { S.rcSeen = el.dataset.x; save(); render(); },
  rcShare: async () => {
    if (!rcFile) { toast(T('Картинка ещё рисуется…', 'Still drawing…')); return; }
    if (navigator.canShare && navigator.canShare({ files: [rcFile] })) { try { await navigator.share({ files: [rcFile] }); } catch (e) { /* cancelled */ } return; }
    rcDownload(); toast(T('Картинка сохранена — выложи её в сторис', 'Saved — post it to your story'));
  },
  lookSheet: (el) => makeOut(el.dataset.s, 'looks'),
  moodSheet: (el) => makeOut(el.dataset.s, 'mood'),
  outShare: async () => { const f = ui.sheet?.files; if (!f) return; if (navigator.canShare && navigator.canShare({ files: f })) { try { await navigator.share({ files: f }); } catch (e) { /* cancelled */ } return; } A.outSave(); },
  outSave: () => { const f = ui.sheet?.files; if (!f) return; f.forEach((x, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(x); a.download = x.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }, i * 400)); toast(T('Картинка сохранена', 'Image saved')); },
  rcSave: () => { if (rcFile) { rcDownload(); toast(T('Картинка сохранена', 'Image saved')); } },
  closeSheet: (el, ev) => { if (el.dataset.self && ev.target !== el) return; closeSheet(); },
  memberStatus: (el) => { const s = getShoot(el.dataset.s); const [id, st] = el.dataset.x.split('|'); const m = s.team.find((x) => x.id === id); m.status = m.status === st ? '' : st; save(); render(); },
  editMember: (el) => { const s = getShoot(el.dataset.s); const id = el.dataset.x; const m = id ? s.team.find((x) => x.id === id) : { id: uid(), name: '', role: 'model', call: s.call, rate: '', unit: 'смена', pay: 'money', barter: '', note: '', status: '' }; ui.sheet = { type: 'member', s: s.id, data: { ...m }, isNew: !id }; render(); setTimeout(() => $('#mName')?.focus(), 50); },
  saveMember: () => {
    const sh = ui.sheet; const s = getShoot(sh.s); const name = $('#mName').value.trim(); if (!name) { toast(T('Нужно имя', 'Name needed')); return; }
    keepMemberInputs(); const d = { ...sh.data, name };
    if (sh.isNew) { let p = S.people.find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!p) { p = { id: uid(), name, role: d.role, phone: sh.phone || '', tg: sh.tg || '', insta: sh.insta || '', food: [], note: '' }; S.people.push(p); } d.pid = p.id; s.team.push(d); }
    else { const i = s.team.findIndex((x) => x.id === d.id); s.team[i] = d; }
    ui.sheet = null; save(); render();
  },
  removeMember: () => { const sh = ui.sheet; const s = getShoot(sh.s); s.team = s.team.filter((x) => x.id !== sh.data.id); ui.sheet = null; save(); render(); },
  pickPeople: (el) => { ui.sheet = { type: 'pick', s: el.dataset.s }; render(); },
  addFromBase: (el) => { const s = getShoot(ui.sheet.s); const p = S.people.find((x) => x.id === el.dataset.x); s.team.push({ id: uid(), pid: p.id, name: p.name, role: p.role, call: s.call, rate: '', unit: 'смена', pay: 'money', barter: '', note: '', status: '' }); save(); render(); },
  editPerson: (el) => { const id = el.dataset.x; const p = id ? S.people.find((x) => x.id === id) : { id: uid(), name: '', role: 'model', phone: '', insta: '', food: [], note: '' }; ui.sheet = { type: 'person', data: JSON.parse(JSON.stringify(p)), isNew: !id }; render(); },
  togglePFood: (el) => { const d = ui.sheet.data; d.food = d.food || []; const k = el.dataset.x; d.food = d.food.includes(k) ? d.food.filter((x) => x !== k) : d.food.concat(k); keepSheetInputs(['pName', 'pPhone', 'pInsta', 'pNote']); render(); },
  savePerson: () => {
    const sh = ui.sheet; const name = $('#pName').value.trim(); if (!name) { toast(T('Нужно имя', 'Name needed')); return; }
    const d = { ...sh.data, name, role: $('#pRole').value, phone: fmtPhone($('#pPhone').value), tg: tgNick($('#pTg').value), insta: $('#pInsta').value, note: $('#pNote').value };
    if (sh.isNew) S.people.push(d); else { const i = S.people.findIndex((x) => x.id === d.id); S.people[i] = d; S.shoots.forEach((s) => s.team.forEach((m) => { if (m.pid === d.id) m.name = d.name; })); }
    ui.sheet = null; save(); render();
  },
  deletePerson: () => { if (!confirm(T('Удалить из базы? Из прошлых проектов человек не пропадёт.', 'Delete? Past projects keep the name.'))) return; S.people = S.people.filter((x) => x.id !== ui.sheet.data.id); ui.sheet = null; save(); render(); },
  copyText: (el) => copy(el.dataset.x),
  tipOk: (el) => { S.seenTips = S.seenTips || {}; S.seenTips[el.dataset.x] = true; save(); render(); },
  toggleTips: () => { S.tipsOff = !S.tipsOff; save(); render(); },
  resetTips: () => { S.seenTips = {}; save(); toast(T('Подсказки снова включены', 'Tips are back')); render(); },
  askNotif: async () => { try { const r = await Notification.requestPermission(); if (r === 'granted') notify(T('Уведомления включены', 'Notifications on'), T('Так SET будет напоминать о тайминге', 'This is how SET will remind you')); } catch (e) { toast(T('Не получилось включить уведомления', 'Could not enable notifications')); } render(); },
  testNotif: () => notify(T('Через 10 мин', 'In 10 min'), T('13:00 — Обед для команды', '13:00 — Team lunch')),
  activateManual: () => { const v = ($('#actCode')?.value || '').trim(); const m = v.match(/activate\/(.+)$/); doActivate(m ? decodeURIComponent(m[1]) : v); },

  pickMood: (el) => { mediaTarget = { s: el.dataset.s, kind: 'mood' }; pickFiles(true); },
  pickLookImg: (el) => { const [look] = el.dataset.x.split('|'); mediaTarget = { s: el.dataset.s, kind: 'look', look }; pickFiles(true); },
  lookPicFirst: (el) => { const s = getShoot(el.dataset.s); const [lid, id] = el.dataset.x.split('|'); const l = s.looks.find((x) => x.id === lid); if (!l) return; const ph = lookPics(l); l.photos = [id, ...ph.filter((x) => x !== id)]; save(); render(); },
  delLookPic: (el) => { const s = getShoot(el.dataset.s); const [lid, id] = el.dataset.x.split('|'); const l = s.looks.find((x) => x.id === lid); if (!l) return; mDel(id); l.photos = lookPics(l).filter((x) => x !== id); save(); render(); },
  lfToggleOpen: (el) => { ui.lfOpen = ui.lfOpen || {}; ui.lfOpen[el.dataset.s] = !ui.lfOpen[el.dataset.s]; render(); },
  lfToggle: (el) => { const s = getShoot(el.dataset.s); if (!s.lf) { s.lf = {}; LOOK_F.forEach((f) => { s.lf[f[0]] = lfOn(s, f[0]); }); } s.lf[el.dataset.x] = !s.lf[el.dataset.x]; save(); render(); },
  outMode: (el) => makeOut(ui.sheet.s, el.dataset.x),
  delLookImg: (el) => { const s = getShoot(el.dataset.s); const [id, key = 'img'] = el.dataset.x.split('|'); const l = s.looks.find((x) => x.id === id); if (l && l[key]) { mDel(l[key]); l[key] = ''; save(); render(); } },
  addMoodLink: (el) => { const u = prompt(T('Ссылка на Pinterest, Instagram или папку', 'Link to Pinterest, Instagram or a folder')); if (!u || !u.trim()) return; const s = getShoot(el.dataset.s); s.mood = s.mood || []; s.mood.push({ id: uid(), kind: 'link', url: u.trim() }); save(); render(); },
  delMood: (el) => { const s = getShoot(el.dataset.s); const it = (s.mood || []).find((x) => x.id === el.dataset.x); if (it && it.kind === 'img') mDel(it.id); s.mood = (s.mood || []).filter((x) => x.id !== el.dataset.x); ui.sheet = null; save(); render(); },
  viewImg: (el) => { ui.sheet = { type: 'img', s: el.dataset.s, id: el.dataset.x }; render(); },
  shareMood: async (el) => {
    const s = getShoot(el.dataset.s); const pics = (s.mood || []).filter((x) => x.kind === 'img');
    const files = []; for (const p of pics) { const b = await mGet(p.id); if (b) files.push(new File([b], 'mood-' + (files.length + 1) + '.jpg', { type: 'image/jpeg' })); }
    const links = (s.mood || []).filter((x) => x.kind === 'link').map((x) => x.url).join('\n');
    const text = T('Мудборд · ', 'Moodboard · ') + titleOf(s) + (links ? '\n' + links : '');
    if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, text }); } catch (e) { /* cancelled */ } }
    else toast(T('Этот браузер не умеет отправлять фото пачкой — открой SET в Safari или Chrome на телефоне', 'This browser cannot share photos — use Safari or Chrome on your phone'));
  },
  addLook: (el) => { const s = getShoot(el.dataset.s); s.looks.push({ id: uid(), name: '', model: '', clothes: '', makeup: '', hair: '', mua: '', ref: '', img: '', mimg: '', done: false }); save(); render(); setTimeout(() => { const all = document.querySelectorAll('[aria-label="' + T('Название образа', 'Look name') + '"]'); all[all.length - 1]?.focus(); }, 30); },
  toggleLook: (el) => { const s = getShoot(el.dataset.s); const l = s.looks.find((x) => x.id === el.dataset.x); l.done = !l.done; save(); render(); },
  editLine: (el) => { const s = getShoot(el.dataset.s); const x = s.budget.lines.find((y) => y.id === el.dataset.x); ui.sheet = { type: 'line', s: s.id, data: JSON.parse(JSON.stringify(x)), isNew: false }; render(); },
  addLine: (el) => { ui.sheet = { type: 'line', s: el.dataset.s, data: { id: uid(), sec: el.dataset.x, label: '', desc: '', qty: '1', unit: el.dataset.x === 'models' ? 'чел' : 'сумма', rate: '', pay: 'money', barter: '', q: false, mid: '' }, isNew: true }; render(); setTimeout(() => $('#lLabel')?.focus(), 50); },
  linePay: (el) => { keepLineInputs(); ui.sheet.data.pay = el.dataset.x; render(); },
  lineQ: () => { keepLineInputs(); ui.sheet.data.q = !ui.sheet.data.q; render(); },
  saveLine: () => { keepLineInputs(); const sh = ui.sheet; const s = getShoot(sh.s); const i = s.budget.lines.findIndex((y) => y.id === sh.data.id); if (i >= 0) s.budget.lines[i] = sh.data; else s.budget.lines.push(sh.data); ui.sheet = null; save(); render(); },
  deleteLine: () => { const sh = ui.sheet; const s = getShoot(sh.s); s.budget.lines = s.budget.lines.filter((y) => y.id !== sh.data.id); ui.sheet = null; save(); render(); },
  syncTeam: (el) => {
    const s = getShoot(el.dataset.s); let n = 0;
    s.team.forEach((m) => {
      const pay = m.pay === 'tfp' ? 'barter' : (m.pay || 'money');
      const data = { sec: m.role === 'model' ? 'models' : 'team', label: roleName(m.role), desc: m.name + (m.note ? ' · ' + m.note : ''), qty: '1', unit: m.unit || 'смена', rate: m.rate || '', pay, barter: m.barter || '' };
      const ex = s.budget.lines.find((y) => y.mid === m.id) || s.budget.lines.find((y) => !y.mid && y.sec === data.sec && !num(y.rate) && !num(y.barter) && (y.label || '').toLowerCase() === data.label.toLowerCase());
      if (ex) Object.assign(ex, data, { mid: m.id }); else { s.budget.lines.push({ id: uid(), q: false, mid: m.id, ...data }); n++; }
    });
    save(); render(); toast(T('Команда в смете', 'Team added') + (n ? ': +' + n : ''));
  },
  budgetCsv: (el) => {
    const s = getShoot(el.dataset.s); const t = budgetTotals(s);
    const rows = [[T('Раздел', 'Section'), T('Статья', 'Item'), T('Что входит', 'Included'), T('Кол-во', 'Qty'), T('Ед.', 'Unit'), T('Ставка', 'Rate'), T('Деньгами', 'Money'), T('Бартер / сертификат', 'Barter / voucher'), T('Оплата', 'Payment'), T('Под вопросом', 'Open')]];
    SECTIONS.forEach(([k]) => s.budget.lines.filter((x) => (x.sec || 'other') === k).forEach((x) => rows.push([secName(k), x.label, x.desc, x.qty, unitName(x.unit), num(x.rate) || (x.rate === '' ? '?' : 0), lineMoney(x) || lineRefund(x), lineBarter(x), payName(x.pay), x.q ? '?' : ''])));
    rows.push([]); rows.push(['', T('Деньгами', 'Money'), '', '', '', '', t.money]); rows.push(['', T('Резерв ', 'Contingency ') + num(s.budget.reserve) + '%', '', '', '', '', t.reserve]); rows.push(['', T('ИТОГО ДЕНЬГАМИ', 'TOTAL MONEY'), '', '', '', '', t.total]); if (t.barter) rows.push(['', T('Бартером и сертификатами', 'Barter and vouchers'), '', '', '', '', '', t.barter]); if (t.refund) rows.push(['', T('Закуп с возвратом', 'Refundable purchase'), '', '', '', '', t.refund]);
    download(T('смета-', 'budget-') + titleOf(s).replace(/[^\wа-яё]+/gi, '-') + '.csv', '﻿' + rows.map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\n'), 'text/csv');
  },
  memberPay: (el) => { keepMemberInputs(); ui.sheet.data.pay = el.dataset.x; render(); },
  myPay: (el) => { const s = getShoot(el.dataset.s); s.my.pay = el.dataset.x; save(); render(); },
  addBudget: (el) => { const s = getShoot(el.dataset.s); s.budget.lines.push({ id: uid(), label: '', sum: '' }); save(); render(); },
  delBudget: (el) => { const s = getShoot(el.dataset.s); s.budget.lines = s.budget.lines.filter((x) => x.id !== el.dataset.x); save(); render(); },
  shareBudget: (el) => { const s = getShoot(el.dataset.s); const t = budgetTotals(s); const out = [T('Смета · ', 'Budget · ') + titleOf(s) + (s.date ? ' · ' + fmtDate(s.date) : ''), ''];
    SECTIONS.forEach(([k]) => { const ls = s.budget.lines.filter((x) => (x.sec || 'other') === k && (x.label || num(x.rate))); if (!ls.length) return; out.push(secName(k).toUpperCase()); ls.forEach((x) => { const m = lineMoney(x) || lineRefund(x), br = lineBarter(x); out.push('— ' + x.label + (x.desc ? ' (' + x.desc + ')' : '') + ': ' + (m ? money(m) + ' ₽' : '') + (br ? (m ? ' + ' : '') + payName(x.pay === 'mix' ? 'barter' : x.pay) + ' ' + money(br) + ' ₽' : '') + (!m && !br ? payName(x.pay) : '') + (x.q ? ' — ' + T('уточняем', 'tbc') : '')); }); out.push(''); });
    out.push(T('Деньгами: ', 'Money: ') + money(t.money) + ' ₽'); if (t.reserve) out.push(T('Резерв ', 'Contingency ') + num(s.budget.reserve) + '%: ' + money(t.reserve) + ' ₽'); out.push(T('ИТОГО ДЕНЬГАМИ: ', 'TOTAL: ') + money(t.total) + ' ₽'); if (t.barter) out.push(T('Бартером и сертификатами: ', 'Barter and vouchers: ') + money(t.barter) + ' ₽'); if (t.refund) out.push(T('Закуп с возвратом (нужен до съёмки): ', 'Refundable purchase: ') + money(t.refund) + ' ₽');
    if (s.rights) out.push(T('Права: ', 'Rights: ') + s.rights); if (s.budget.note) out.push('', s.budget.note);
    shareSheet(T('Смета заказчику', 'Budget to client'), out.join('\n')); },
  print: () => window.print(),
  memberPaid: (el) => { const s = getShoot(el.dataset.s); const m = s.team.find((x) => x.id === el.dataset.x); m.paid = !m.paid; save(); render(); },
  myShifts: (el) => { const s = getShoot(el.dataset.s); s.my.shifts = Math.max(1, (Number(s.my.shifts) || 1) + Number(el.dataset.x)); save(); render(); },
  myFlag: (el) => { const s = getShoot(el.dataset.s); s.my[el.dataset.x] = !s.my[el.dataset.x]; save(); render(); },
  finishShoot: (el) => { const s = getShoot(el.dataset.s); s.status = 'done'; if (!s.date) s.date = todayIso(); save(); toast(T('Съёмка в архиве и в доходе', 'Moved to archive and income')); location.hash = '#/me'; },
  reopen: (el) => { const s = getShoot(el.dataset.s); s.status = 'plan'; save(); render(); },
  shootMenu: (el) => { ui.sheet = { type: 'menu', s: el.dataset.s }; render(); },
  dupShoot: () => { if (!canCreate()) { ui.sheet = null; location.hash = '#/pro'; return; } const s = getShoot(ui.sheet.s); const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.date = ''; c.status = 'plan'; c.what = (c.what || '') + T(' (копия)', ' (copy)'); c.team.forEach((m) => { m.id = uid(); m.status = ''; m.paid = false; }); c.looks.forEach((l) => { l.id = uid(); l.done = false; }); c.checklist.forEach((x) => { x.id = uid(); x.done = false; }); c.my = { ...c.my, paid: false, check: false, fee: '' }; delete c.demo; if (!isPro()) S.freeUsed = true; S.shoots.push(c); ui.sheet = null; save(); location.hash = '#/p/' + c.id; },
  deleteShoot: () => { if (!confirm(T('Удалить съёмку целиком?', 'Delete this shoot?'))) return; S.shoots = S.shoots.filter((x) => x.id !== ui.sheet.s); ui.sheet = null; save(); location.hash = '#/projects'; },
  calMove: (el) => { const c = ui.cal; c.m += Number(el.dataset.x); if (c.m < 0) { c.m = 11; c.y--; } if (c.m > 11) { c.m = 0; c.y++; } ui.calSel = null; render(); },
  calPick: (el) => { ui.calSel = el.dataset.x && ui.calSel !== el.dataset.x ? el.dataset.x : null; render(); },
  ownSheet: (el) => { const s = newShoot('custom', { src: 'own', date: el.dataset.x || todayIso(), call: '', end: '', modules: { team: false, timing: false, looks: false, budget: false, print: false } }); s.my.fee = ''; ui.sheet = { type: 'own', data: s, isNew: true }; render(); },
  editIncome: (el) => { const s = getShoot(el.dataset.x); ui.sheet = { type: s.src === 'own' ? 'own' : 'income', data: JSON.parse(JSON.stringify(s)), isNew: false }; render(); },
  sheetShift: (el) => { const d = ui.sheet.data; d.my.shifts = Math.max(1, (Number(d.my.shifts) || 1) + Number(el.dataset.x)); $('#oShifts').textContent = d.my.shifts; },
  sheetPay: (el) => { keepOwnInputs(); ui.sheet.data.my.pay = el.dataset.x; render(); },
  sheetFlag: (el) => { const d = ui.sheet.data; keepOwnInputs(); d.my[el.dataset.x] = !d.my[el.dataset.x]; render(); },
  saveOwn: () => {
    keepOwnInputs(); const d = ui.sheet.data;
    if (d.src === 'own' && !d.date) { toast(T('Укажи дату', 'Set a date')); return; }
    const i = S.shoots.findIndex((x) => x.id === d.id);
    if (i >= 0) S.shoots[i] = d; else S.shoots.push(d);
    save(); toast(T('Сохранено', 'Saved')); closeSheet();
  },
  deleteOwn: () => { if (!confirm(T('Удалить эту съёмку?', 'Delete this shoot?'))) return; S.shoots = S.shoots.filter((x) => x.id !== ui.sheet.data.id); save(); closeSheet(); },
  exportCsv: () => {
    const rows = [[T('Дата', 'Date'), T('Съёмка', 'Shoot'), T('Роль', 'Role'), T('Смен', 'Shifts'), T('Сумма', 'Amount'), T('Оплачено', 'Paid'), T('Чек', 'Receipt'), T('Источник', 'Source'), T('Заметка', 'Note')]];
    myEntries().forEach((s) => rows.push([s.date, titleOf(s), roleName(s.my.role), s.my.shifts, myMoney(s) + (myBarter(s) ? ' + ' + payName(s.my.pay) + ' ' + myBarter(s) : ''), s.my.paid ? 1 : 0, s.my.check ? 1 : 0, s.src === 'own' ? 'own' : 'SET', s.my.note || '']));
    const csv = '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    download('set-income-' + todayIso() + '.csv', csv, 'text/csv');
  },
  exportJson: async () => {
    toast(T('Собираю копию…', 'Preparing backup…'));
    const ids = []; S.shoots.forEach((s) => { (s.mood || []).forEach((x) => { if (x.kind === 'img') ids.push(x.id); }); s.looks.forEach((l) => { lookPics(l).forEach((x) => ids.push(x)); }); });
    const media = {}; for (const id of ids) { const b = await mGet(id); if (b) media[id] = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
    download('set-backup-' + todayIso() + '.json', JSON.stringify({ ...S, media }), 'application/json');
  },
  importJson: () => $('#importFile').click(),
  wipe: () => { if (!confirm(T('Точно удалить все съёмки, людей и профиль? Это нельзя отменить.', 'Delete everything? This cannot be undone.'))) return; const keepDev = S.deviceId, keepPro = S.pro; localStorage.removeItem(KEY); S = fresh(); S.deviceId = keepDev; S.pro = keepPro; S.firstRun = todayIso(); S.freeUsed = true; ui.onb = null; location.hash = '#/welcome'; render(); }
};
function closeSheet() { if (ui.sheet && ui.sheet.urls) ui.sheet.urls.forEach((u) => URL.revokeObjectURL(u)); ui.sheet = null; if (location.hash.startsWith('#/own')) location.hash = '#/calendar'; else render(); }
function pickFiles(multi) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; if (multi) i.multiple = true; i.style.display = 'none'; document.body.appendChild(i); i.addEventListener('change', () => { onMediaFiles([...i.files]); i.remove(); }); i.click(); }
function keepMemberInputs() { const d = ui.sheet.data; const g = (i) => $('#' + i); if (g('mName')) d.name = g('mName').value.trim(); if (g('mRole')) d.role = g('mRole').value; if (g('mCall')) d.call = normTime(g('mCall').value); if (g('mRate')) d.rate = g('mRate').value.replace(/[^\d]/g, ''); if (g('mUnit')) d.unit = g('mUnit').value; if (g('mBarter')) d.barter = g('mBarter').value.replace(/[^\d]/g, ''); if (g('mNote')) d.note = g('mNote').value; if (g('mPhone')) ui.sheet.phone = fmtPhone(g('mPhone').value); if (g('mTg')) ui.sheet.tg = tgNick(g('mTg').value); if (g('mInsta')) ui.sheet.insta = g('mInsta').value; }
function keepLineInputs() { const d = ui.sheet.data; const g = (i) => $('#' + i); if (g('lSec')) d.sec = g('lSec').value; if (g('lLabel')) d.label = g('lLabel').value; if (g('lDesc')) d.desc = g('lDesc').value; if (g('lQty')) d.qty = g('lQty').value.replace(',', '.'); if (g('lUnit')) d.unit = g('lUnit').value; if (g('lRate')) d.rate = g('lRate').value.replace(/[^\d]/g, ''); if (g('lBarter')) d.barter = g('lBarter').value.replace(/[^\d]/g, ''); }
function keepSheetInputs(ids) { const d = ui.sheet.data; const map = { pName: 'name', pPhone: 'phone', pTg: 'tg', pInsta: 'insta', pNote: 'note' }; ids.forEach((i) => { const e = $('#' + i); if (e) d[map[i]] = e.value; }); }
function keepOwnInputs() {
  const d = ui.sheet.data; const g = (i) => $('#' + i);
  if (g('oTitle')) { const v = g('oTitle').value.trim(); const parts = v.split(' · '); d.client = parts.length > 1 ? parts.shift() : ''; d.what = parts.join(' · '); }
  if (g('oDate')) d.date = g('oDate').value;
  if (g('oCall')) d.call = normTime(g('oCall').value);
  if (g('oEnd')) d.end = normTime(g('oEnd').value);
  if (g('oRole')) d.my.role = g('oRole').value;
  if (g('oFee')) d.my.fee = g('oFee').value.replace(/[^\d]/g, '');
  if (g('oNote')) d.my.note = g('oNote').value;
  if (g('oBarter')) d.my.barter = g('oBarter').value.replace(/[^\d]/g, '');
}
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}


/* ---------- media (photos live in IndexedDB on this device) ---------- */
let dbP = null;
function mdb() {
  if (!dbP) dbP = new Promise((res, rej) => { const r = indexedDB.open('set-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbP;
}
async function mPut(id, blob) { const d = await mdb(); return new Promise((res, rej) => { const t = d.transaction('img', 'readwrite'); t.objectStore('img').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function mGet(id) { const d = await mdb(); return new Promise((res) => { const q = d.transaction('img').objectStore('img').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function mDel(id) { const d = await mdb(); return new Promise((res) => { const t = d.transaction('img', 'readwrite'); t.objectStore('img').delete(id); t.oncomplete = res; t.onerror = res; }); }
const urlCache = {};
async function imgUrl(id) { if (urlCache[id]) return urlCache[id]; const b = await mGet(id); if (!b) return ''; urlCache[id] = URL.createObjectURL(b); return urlCache[id]; }
function growTa(el) { el.style.height = 'auto'; el.style.height = Math.max(44, el.scrollHeight) + 'px'; }
function hydrate() { document.querySelectorAll('img[data-img]:not([src])').forEach(async (el) => { const u = await imgUrl(el.dataset.img); if (u) el.src = u; else el.alt = T('фото не найдено на этом телефоне', 'photo not on this device'); }); }
async function compress(file) {
  const bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
  const max = 1400; const k = Math.min(1, max / Math.max(bmp.naturalWidth, bmp.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.naturalWidth * k); c.height = Math.round(bmp.naturalHeight * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); URL.revokeObjectURL(bmp.src);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.8));
}
const imgTag = (id, style) => '<img data-img="' + esc(id) + '" alt="" loading="lazy" style="' + (style || '') + '">';
function pMood(s) {
  const items = s.mood || [];
  const pics = items.filter((x) => x.kind === 'img');
  const links = items.filter((x) => x.kind === 'link');
  let h = '<span class="small muted pad4">' + T('Референсы по съёмке: свет, позы, цвет, локация. Команде мудборд уходит одной картинкой А4 — её же можно распечатать.', 'References: light, poses, colour, location. The team gets it as one A4 image you can also print.') + '</span>';
  if (!items.length) h += '<div class="card dashed" style="align-items:center;text-align:center;padding:28px"><h3>' + T('Мудборд пустой', 'Moodboard is empty') + '</h3><span class="small muted">' + T('Для TFP хватит 5–6 картинок, для бренда — сколько нужно, чтобы все поняли одно и то же.', '5–6 images for TFP; for a brand, enough for everyone to see the same picture.') + '</span></div>';
  if (pics.length) h += '<div class="grid2">' + pics.map((x) => '<div class="col" style="gap:4px"><button data-a="viewImg" data-s="' + s.id + '" data-x="' + x.id + '" style="padding:0;border:none;background:var(--line);border-radius:18px;overflow:hidden;aspect-ratio:3/4">' + imgTag(x.id, 'width:100%;height:100%;object-fit:cover;display:block') + '</button><input class="inp" style="min-height:38px;padding:6px 10px;font-size:16px" data-b="shoot:' + s.id + '.mood:' + x.id + '.cap" value="' + esc(x.cap || '') + '" placeholder="' + T('подпись', 'caption') + '" aria-label="' + T('Подпись к фото', 'Photo caption') + '"></div>').join('') + '</div>';
  if (links.length) h += '<div class="card tight">' + links.map((x) => '<div class="li"><a class="grow" href="' + esc(/^https?:/i.test(x.url) ? x.url : 'https://' + x.url) + '" target="_blank" rel="noopener" style="word-break:break-all">' + esc(x.url) + '</a><button class="textbtn" data-a="delMood" data-s="' + s.id + '" data-x="' + x.id + '" aria-label="' + T('Удалить', 'Delete') + '">' + I.x.replace('<svg', '<svg width="16" height="16"') + '</button></div>').join('') + '</div>';
  h += '<div class="grid2"><button class="btn soft" data-a="pickMood" data-s="' + s.id + '">' + T('+ Фото', '+ Photos') + '</button><button class="btn soft" data-a="addMoodLink" data-s="' + s.id + '">' + T('+ Ссылка', '+ Link') + '</button></div>';
  h += '<div class="card">' + field(T('Описание мудборда', 'Moodboard description'), '<textarea class="inp" rows="3" data-b="shoot:' + s.id + '.moodText" placeholder="' + T('Идея, настроение, свет, цвета — попадёт на лист вместе с картинками', 'Idea, mood, light, colours — goes on the sheet with the images') + '">' + esc(s.moodText || '') + '</textarea>') + '</div>';
  if (pics.length) h += '<button class="btn" data-a="moodSheet" data-s="' + s.id + '">' + T('Мудборд одной картинкой', 'Moodboard as one image') + '</button>';
  return h;
}
let mediaTarget = null;
async function onMediaFiles(files) {
  const t = mediaTarget; mediaTarget = null; if (!t || !files.length) return;
  const s = getShoot(t.s); if (!s) return;
  toast(T('Загружаю…', 'Uploading…'));
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    try {
      const blob = await compress(f); const id = 'img_' + uid(); await mPut(id, blob);
      if (t.kind === 'mood') { s.mood = s.mood || []; s.mood.push({ id, kind: 'img' }); }
      else if (t.kind === 'look') { const l = s.looks.find((x) => x.id === t.look); if (l) { const ph = lookPics(l); if (ph.length < LOOK_MAX) ph.push(id); else mDel(id); } }
    } catch (e) { toast(T('Не получилось добавить фото', 'Could not add a photo')); }
  }
  save(); render(); toast(T('Добавлено', 'Added'));
}


/* --- A4 sheets as images: look sheet and moodboard --- */
const A4 = { W: 1240, H: 1754, M: 70 };
async function sheetFonts() { if (!document.fonts) return; await Promise.all(["600 40px 'Inter Tight'", "400 24px Inter", "600 24px Inter", "30px Neucha", "500 20px 'IBM Plex Mono'"].map((f) => document.fonts.load(f).catch(() => {}))); }
async function loadImg(id) { if (!id) return null; const b = await mGet(id); if (!b) return null; return new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = URL.createObjectURL(b); }); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function drawCap(c, text, x, y, w, h, r) { text = String(text || '').trim(); if (!text || w < 80) return; c.save(); if (r) { rrect(c, x, y, w, h, r); c.clip(); } c.font = "500 20px Inter, sans-serif"; const lines = wrapLines(c, text, w - 24, h > 400 ? 2 : 1); const bh = lines.length * 26 + 18; c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(x, y + h - bh, w, bh); c.fillStyle = '#1A1A22'; lines.forEach((ln, j) => c.fillText(ln, x + 12, y + h - bh + 30 + j * 26)); c.restore(); }
function coverImg(c, im, x, y, w, h, r) { c.save(); rrect(c, x, y, w, h, r); c.clip(); c.fillStyle = '#EFEDEA'; c.fillRect(x, y, w, h); if (im) { const k = Math.max(w / im.width, h / im.height); const iw = im.width * k, ih = im.height * k; c.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); } c.restore(); }
function wrapLines(c, text, maxW, maxLines) { const words = String(text || '').split(/\s+/).filter(Boolean); const out = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); if (out.length > maxLines) { const keep = out.slice(0, maxLines); let last = keep[maxLines - 1]; while (c.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1); keep[maxLines - 1] = last + '…'; return keep; } return out; }
function sheetHead(c, s, label, page, pages) {
  const { W, M } = A4; c.fillStyle = '#fff'; c.fillRect(0, 0, W, A4.H);
  c.fillStyle = 'rgb(244,161,195)'; c.fillRect(0, 0, W, 14);
  c.fillStyle = '#1A1A22'; c.textBaseline = 'alphabetic';
  c.font = "30px Neucha, 'Inter Tight', sans-serif"; c.fillText('set', M, M + 20);
  c.font = "500 20px 'IBM Plex Mono', monospace"; c.fillStyle = '#6E6B75'; const lb = label + (pages > 1 ? '  ' + page + '/' + pages : ''); c.fillText(lb, M + 70, M + 18);
  c.fillStyle = '#1A1A22'; let fs = 58; c.font = "600 " + fs + "px 'Inter Tight', Inter, sans-serif"; const title = titleOf(s); while (c.measureText(title).width > W - 2 * M - 360 && fs > 30) { fs -= 4; c.font = "600 " + fs + "px 'Inter Tight', Inter, sans-serif"; }
  c.fillText(title, M, M + 96);
  c.textAlign = 'right'; c.font = "600 28px Inter, sans-serif"; if (s.date) c.fillText(fmtDate(s.date, { wd: true, year: true }), W - M, M + 50);
  c.font = "400 24px Inter, sans-serif"; c.fillStyle = '#4A4852'; const tm = [s.call ? T('сбор ', 'call ') + s.call : '', s.end ? T('конец ', 'wrap ') + s.end : ''].filter(Boolean).join(' · '); if (tm) c.fillText(tm, W - M, M + 90); c.textAlign = 'left';
  let y = M + 132; const pl = [s.place, s.address].filter(Boolean).join(', ');
  if (pl) { c.font = "400 24px Inter, sans-serif"; c.fillStyle = '#4A4852'; wrapLines(c, pl, W - 2 * M, 2).forEach((ln) => { c.fillText(ln, M, y); y += 32; }); }
  c.fillStyle = '#E3E0E6'; c.fillRect(M, y + 4, W - 2 * M, 2); return y + 34;
}
function sheetFoot(c) { const { W, H, M } = A4; c.font = "400 18px Inter, sans-serif"; c.fillStyle = '#6E6B75'; c.fillText(T('SET — приложение для съёмок', 'SET — the app for shoots'), M, H - M + 20); }
async function drawLookPages(s) {
  await sheetFonts(); const { W, H, M } = A4; const per = 4; const looks = s.looks; const pages = Math.max(1, Math.ceil(looks.length / per)); const files = [];
  const on = (k) => lfOn(s, k); const v = (l, k) => on(k) ? String(l[k] || '').trim() : '';
  for (let p = 0; p < pages; p++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const top = sheetHead(c, s, T('ВСЕ ОБРАЗЫ', 'ALL LOOKS'), p + 1, pages);
    const chunk = looks.slice(p * per, p * per + per); const cols = chunk.length === 1 ? 1 : 2; const rows = Math.ceil(chunk.length / cols) || 1;
    const gap = 30, cw = (W - 2 * M - gap * (cols - 1)) / cols, ch = (H - M - 40 - top - gap * (rows - 1)) / rows;
    for (let i = 0; i < chunk.length; i++) {
      const l = chunk[i], n = p * per + i + 1; const x = M + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
      c.fillStyle = '#F7F6F4'; rrect(c, x, y, cw, ch, 22); c.fill();
      const pad = 18; const ims = (await Promise.all((on('photos') ? lookPics(l).slice(0, 3) : []).map(loadImg))).filter(Boolean);
      const pw = cw - pad * 2; const ph = ims.length ? Math.min(ch * 0.5, pw * 0.75) : 0;
      if (ims.length) { const w1 = (pw - 12 * (ims.length - 1)) / ims.length; ims.forEach((im, k) => coverImg(c, im, x + pad + k * (w1 + 12), y + pad, w1, ph, 14)); }
      let ty = y + pad + (ims.length ? ph + 34 : 34); const tx = x + pad, tw = cw - pad * 2, yEnd = y + ch - 50;
      c.font = "500 20px 'IBM Plex Mono', monospace"; c.fillStyle = '#6E6B75'; c.fillText(T('ОБРАЗ ', 'LOOK ') + pad2(n) + (v(l, 'time') ? ' · ' + v(l, 'time') : ''), tx, ty); ty += 40;
      c.fillStyle = '#1A1A22'; c.font = "600 34px 'Inter Tight', Inter, sans-serif"; wrapLines(c, l.model || v(l, 'name') || '—', tw, 1).forEach((ln) => c.fillText(ln, tx, ty)); ty += 40;
      const rowsT = [[T('Одежда', 'Outfit'), v(l, 'clothes')], [T('Обувь', 'Shoes'), v(l, 'shoes')], [T('Мейк', 'Make-up'), v(l, 'makeup')], [T('Волосы', 'Hair'), v(l, 'hair')], [T('Визажист', 'MUA'), v(l, 'mua')], [T('Комментарий', 'Comment'), v(l, 'comment')]].filter((r) => r[1]);
      for (const [k, val] of rowsT) { if (ty > yEnd) break; c.font = "600 22px Inter, sans-serif"; c.fillStyle = '#1A1A22'; c.fillText(k + ':', tx, ty); const kw = c.measureText(k + ': ').width; c.font = "400 22px Inter, sans-serif"; const ls = wrapLines(c, val, tw - kw, ims.length ? 2 : 4); ls.forEach((ln, j) => c.fillText(ln, tx + kw, ty + j * 28)); ty += ls.length * 28 + 8; }
      if (v(l, 'note') && ty < yEnd) { c.font = "600 22px Inter, sans-serif"; c.fillStyle = '#B4271B'; wrapLines(c, '! ' + v(l, 'note'), tw, 2).forEach((ln, j) => c.fillText(ln, tx, ty + j * 28)); }
      c.strokeStyle = '#1A1A22'; c.lineWidth = 2; c.strokeRect(x + cw - pad - 26, y + ch - pad - 26, 22, 22); c.font = "400 20px Inter, sans-serif"; c.fillStyle = '#1A1A22'; c.textAlign = 'right'; c.fillText(T('снят', 'shot'), x + cw - pad - 36, y + ch - pad - 8); c.textAlign = 'left';
    }
    sheetFoot(c);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    files.push(new File([blob], fileBase(s, T('obrazy', 'looks')) + (pages > 1 ? '-' + (p + 1) : '') + '.png', { type: 'image/png' }));
  }
  return files;
}
async function drawLookCards(s) {
  await sheetFonts(); const { W, H } = A4; const M = 60; const files = []; const total = s.looks.length;
  const ink = '#1A1A22', mid = '#4A4852', soft = '#6E6B75', red = '#B4271B'; const on = (k) => lfOn(s, k);
  const v = (l, k) => on(k) ? String(l[k] || '').trim() : '';
  for (let i = 0; i < total; i++) {
    const l = s.looks[i]; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgb(244,161,195)'; c.fillRect(0, 0, W, 12); c.textBaseline = 'alphabetic';
    // header
    c.fillStyle = soft; c.font = "500 22px 'IBM Plex Mono', monospace"; c.fillText(T('ОБРАЗ', 'LOOK'), M, M + 30);
    c.textAlign = 'right'; c.font = "400 20px Inter, sans-serif"; c.fillText([titleOf(s), s.date ? fmtDate(s.date, { year: true }) : ''].filter(Boolean).join(' · '), W - M, M + 26); c.textAlign = 'left';
    c.fillStyle = ink; c.font = "700 150px 'Inter Tight', Inter, sans-serif"; const num = pad2(i + 1); c.fillText(num, M - 6, M + 170); const nw = c.measureText(num).width;
    const tm = v(l, 'time'); const nx = M + nw + 34, nmax = W - M - nx - (tm ? 190 : 0);
    let fs = 64; c.font = "700 " + fs + "px 'Inter Tight', Inter, sans-serif"; const who = (l.model || '').toUpperCase() || (v(l, 'name') || T('Образ', 'Look')).toUpperCase(); while (c.measureText(who).width > nmax && fs > 34) { fs -= 4; c.font = "700 " + fs + "px 'Inter Tight', Inter, sans-serif"; }
    c.fillText(who, nx, M + 104);
    const sub = [l.model && v(l, 'name') ? '«' + v(l, 'name') + '»' : '', v(l, 'params')].filter(Boolean).join(' · ');
    c.font = "400 26px Inter, sans-serif"; c.fillStyle = mid; if (sub) wrapLines(c, sub, nmax, 2).forEach((ln, j) => c.fillText(ln, nx, M + 146 + j * 32));
    if (tm) { c.textAlign = 'right'; c.fillStyle = ink; c.font = "700 64px 'Inter Tight', Inter, sans-serif"; c.fillText(tm, W - M, M + 104); c.textAlign = 'left'; }
    // photos: only what exists
    const phIds = on('photos') ? lookPics(l) : []; const loaded = await Promise.all(phIds.map(loadImg)); const caps = []; const ims = []; loaded.forEach((im, k) => { if (im) { ims.push(im); caps.push((l.caps || {})[phIds[k]] || ''); } });
    const top = M + 230, bottom = H - M - 70, gap = 16; let textX = M, textW = W - 2 * M, y = top + 20, afterY = top;
    if (ims.length === 1) { const pw = 540, ph = 720; coverImg(c, ims[0], M, top, pw, ph, 10); drawCap(c, caps[0], M, top, pw, ph, 10); textX = M + pw + 40; textW = W - M - textX; afterY = top + ph + 40; }
    else if (ims.length >= 2) {
      const n = ims.length, AW = W - 2 * M, AH = n <= 2 ? 760 : n <= 4 ? 800 : 860; const R = [];
      const grid = (x0, y0, w, h, cols, rows, cnt) => { const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows; for (let k = 0; k < cnt; k++) R.push([x0 + (k % cols) * (cw + gap), y0 + Math.floor(k / cols) * (ch + gap), cw, ch]); };
      if (n === 2) grid(M, top, AW, AH, 2, 1, 2);
      else if (n === 4) grid(M, top, AW, AH, 2, 2, 4);
      else if (n === 6) grid(M, top, AW, AH, 3, 2, 6);
      else { const bw = Math.round(AW * (n === 3 ? 0.6 : 0.46)); R.push([M, top, bw, AH]); const rest = n - 1; const cols = rest <= 2 ? 1 : 2; grid(M + bw + gap, top, AW - bw - gap, AH, cols, Math.ceil(rest / cols), rest); }
      R.forEach((r, k) => { coverImg(c, ims[k], r[0], r[1], r[2], r[3], 10); drawCap(c, caps[k], r[0], r[1], r[2], r[3], 10); });
      y = top + AH + 56; afterY = y;
    }
    // text blocks
    const fsz = ims.length ? 26 : 32, lh = Math.round(fsz * 1.32);
    const block = (x, w, title, rows, yy) => { c.fillStyle = soft; c.font = "500 20px 'IBM Plex Mono', monospace"; c.fillText(title, x, yy); yy += 38; rows.forEach(([k, val]) => { if (yy > bottom) return; c.font = "600 " + fsz + "px Inter, sans-serif"; c.fillStyle = ink; c.fillText(k, x, yy); const kw = c.measureText(k + '  ').width; c.font = "400 " + fsz + "px Inter, sans-serif"; const ls = wrapLines(c, val, w - kw, 4); ls.forEach((ln, j) => c.fillText(ln, x + kw, yy + j * lh)); yy += ls.length * lh + 10; }); return yy + 18; };
    const look = [[T('Одежда', 'Outfit'), v(l, 'clothes')], [T('Обувь', 'Shoes'), v(l, 'shoes')], [T('Аксессуары', 'Accessories'), v(l, 'acc')]].filter((r) => r[1]);
    const beauty = [[T('Мейк', 'Make-up'), v(l, 'makeup')], [T('Визажист', 'MUA'), v(l, 'mua')], [T('Волосы', 'Hair'), v(l, 'hair')], [T('Волосы делает', 'Hair by'), v(l, 'hairby')]].filter((r) => r[1]);
    const blocks = [look.length && [T('ОБРАЗ', 'LOOK'), look], beauty.length && [T('МЕЙК И ВОЛОСЫ', 'MAKE-UP & HAIR'), beauty]].filter(Boolean);
    if (ims.length === 1 || blocks.length < 2) { blocks.forEach(([t, r]) => { y = block(textX, textW, t, r, y); }); }
    else { const cw2 = (textW - 40) / 2; y = Math.max(block(textX, cw2, blocks[0][0], blocks[0][1], y), block(textX + cw2 + 40, cw2, blocks[1][0], blocks[1][1], y)); }
    if (ims.length === 1 && y < afterY) { /* text beside the photo ended; continue below the photo if needed */ }
    const wideY = () => { if (ims.length === 1 && y > afterY - 60) { textX = M; textW = W - 2 * M; } };
    const shots = on('shots') ? String(l.shots || '').split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const para = (title, text, color, weight) => { if (!text || y > bottom - 40) return; wideY(); c.fillStyle = soft; c.font = "500 20px 'IBM Plex Mono', monospace"; if (title) { c.fillText(title, textX, y); y += 38; } c.fillStyle = color; c.font = weight + " " + fsz + "px Inter, sans-serif"; String(text).split('\n').forEach((p) => { const maxL = Math.max(1, Math.floor((bottom - y) / lh)); wrapLines(c, p, textW, maxL).forEach((ln) => { if (y > bottom) return; c.fillText(ln, textX, y); y += lh; }); }); y += 22; };
    if (shots.length && y < bottom - 40) { wideY(); c.fillStyle = soft; c.font = "500 20px 'IBM Plex Mono', monospace"; c.fillText(T('КАДРЫ', 'SHOTS'), textX, y); y += 40; c.font = "400 " + fsz + "px Inter, sans-serif"; c.fillStyle = ink; const cols2 = shots.length > 3 && textW > 800 ? 2 : 1; const colW = (textW - (cols2 - 1) * 40) / cols2; shots.slice(0, 10).forEach((t, k) => { const cx = textX + (k % cols2) * (colW + 40), cy = y + Math.floor(k / cols2) * (lh + 8); if (cy > bottom) return; c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(cx, cy - fsz + 4, fsz - 4, fsz - 4); wrapLines(c, t, colW - fsz - 14, 1).forEach((ln) => c.fillText(ln, cx + fsz + 10, cy)); }); y += Math.ceil(Math.min(shots.length, 10) / cols2) * (lh + 8) + 18; }
    para(T('КОММЕНТАРИЙ', 'COMMENT'), v(l, 'comment'), ink, '400');
    para('', v(l, 'note') ? '! ' + v(l, 'note') : '', red, '600');
    // footer
    c.fillStyle = '#E3E0E6'; c.fillRect(M, H - M - 40, W - 2 * M, 2);
    c.fillStyle = ink; c.font = "28px Neucha, 'Inter Tight', sans-serif"; c.fillText('set', M, H - M + 2);
    c.font = "400 18px Inter, sans-serif"; c.fillStyle = soft; c.fillText(pad2(i + 1) + ' / ' + pad2(total) + '  ·  ' + T('SET — приложение для съёмок', 'SET — the app for shoots'), M + 60, H - M);
    c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(W - M - 26, H - M - 22, 24, 24); c.textAlign = 'right'; c.fillStyle = ink; c.font = "400 22px Inter, sans-serif"; c.fillText(T('снят', 'shot'), W - M - 38, H - M); c.textAlign = 'left';
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    files.push(new File([blob], fileBase(s, T('obraz', 'look')) + '-' + pad2(i + 1) + '.png', { type: 'image/png' }));
  }
  return files;
}
async function drawMoodPages(s) {
  await sheetFonts(); const { W, H } = A4; const M = 60; const pics = (s.mood || []).filter((x) => x.kind === 'img'); const links = (s.mood || []).filter((x) => x.kind === 'link').map((x) => x.url);
  const per = 12; const pages = Math.max(1, Math.ceil(pics.length / per)); const files = [];
  const grid = (n) => n <= 1 ? [1, 1] : n === 2 ? [2, 1] : n === 3 ? [3, 1] : n === 4 ? [2, 2] : n <= 6 ? [3, 2] : n <= 9 ? [3, 3] : [3, 4];
  for (let p = 0; p < pages; p++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic'; const desc = String(s.moodText || '').trim(); c.font = "400 24px Inter, sans-serif"; const dLines = p === 0 && desc ? desc.split('\n').flatMap((ln) => wrapLines(c, ln, W - 2 * M, 6)).slice(0, 8) : []; const headH = 150 + (dLines.length ? dLines.length * 32 + 30 : 0);
    c.fillStyle = '#1A1A22'; c.font = "28px Neucha, 'Inter Tight', sans-serif"; c.fillText('set', M, 62);
    c.fillStyle = '#6E6B75'; c.font = "500 20px 'IBM Plex Mono', monospace"; c.fillText(T('МУДБОРД', 'MOODBOARD') + (pages > 1 ? '  ' + (p + 1) + '/' + pages : ''), M + 64, 60);
    c.fillStyle = '#1A1A22'; let fs = 46; c.font = "600 " + fs + "px 'Inter Tight', Inter, sans-serif"; const title = titleOf(s); while (c.measureText(title).width > W - 2 * M - 300 && fs > 28) { fs -= 4; c.font = "600 " + fs + "px 'Inter Tight', Inter, sans-serif"; } c.fillText(title, M, 122);
    c.textAlign = 'right'; c.font = "400 22px Inter, sans-serif"; c.fillStyle = '#4A4852'; c.fillText([s.date ? fmtDate(s.date, { year: true }) : '', s.place].filter(Boolean).join(' · '), W - M, 122); c.textAlign = 'left';
    if (dLines.length) { c.font = "400 24px Inter, sans-serif"; c.fillStyle = '#1A1A22'; dLines.forEach((ln, j) => c.fillText(ln, M, 168 + j * 32)); }
    const chunk = pics.slice(p * per, p * per + per); const [, rows] = grid(chunk.length);
    const linkH = (p === pages - 1 && links.length ? Math.min(links.length, 3) * 26 + 20 : 0) + 44;
    const gy = headH, gh = H - headH - linkH, ch = gh / rows;
    const ims = await Promise.all(chunk.map((x) => loadImg(x.id)));
    const perRow = []; let left = ims.length; for (let r = 0; r < rows; r++) { const k = Math.ceil(left / (rows - r)); perRow.push(k); left -= k; }
    let idx = 0; perRow.forEach((k, r) => { const w = W / k; for (let j = 0; j < k; j++, idx++) { const im = ims[idx]; const cap = chunk[idx] && chunk[idx].cap; const x = j * w, y = gy + r * ch; c.save(); c.beginPath(); c.rect(Math.floor(x), Math.floor(y), Math.ceil(w) + 1, Math.ceil(ch) + 1); c.clip(); c.fillStyle = '#EFEDEA'; c.fillRect(x, y, w + 1, ch + 1); if (im) { const sc = Math.max(w / im.width, ch / im.height); c.drawImage(im, x + (w - im.width * sc) / 2, y + (ch - im.height * sc) / 2, im.width * sc, im.height * sc); } c.restore(); drawCap(c, cap, x, y, w, ch); } });
    let ly = H - linkH + 30; if (p === pages - 1 && links.length) { c.font = "400 18px Inter, sans-serif"; c.fillStyle = '#3B4FB0'; links.slice(0, 3).forEach((u) => { wrapLines(c, u, W - 2 * M, 1).forEach((ln) => c.fillText(ln, M, ly)); ly += 26; }); }
    c.font = "400 18px Inter, sans-serif"; c.fillStyle = '#6E6B75'; c.fillText(T('SET — приложение для съёмок', 'SET — the app for shoots'), M, H - 16);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    files.push(new File([blob], fileBase(s, 'moodboard') + (pages > 1 ? '-' + (p + 1) : '') + '.png', { type: 'image/png' }));
  }
  return files;
}
const pad2 = (n) => String(n).padStart(2, '0');
const fileBase = (s, k) => 'set-' + k + '-' + (titleOf(s).replace(/[^\wа-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sheet');
async function makeOut(sid, kind) {
  const s = getShoot(sid); if (!s) return;
  ui.sheet = { type: 'out', s: sid, kind, title: kind === 'mood' ? T('Мудборд', 'Moodboard') : T('Карточки образов', 'Look cards') }; render();
  try { const files = kind === 'looks' ? await drawLookCards(s) : kind === 'looks4' ? await drawLookPages(s) : await drawMoodPages(s); if (!ui.sheet || ui.sheet.type !== 'out' || ui.sheet.s !== sid) return; ui.sheet.files = files; ui.sheet.urls = files.map((f) => URL.createObjectURL(f)); render(); }
  catch (e) { toast(T('Не получилось собрать лист', 'Could not build the sheet')); }
}

/* ---------- demo ---------- */
function loadDemo() {
  const t = new Date();
  const dIso = (n) => { const d = new Date(t); d.setDate(d.getDate() + n); return isoOf(d); };
  const P = (name, role, insta, food) => { const p = { id: uid(), name, role, phone: '', insta, food: food || [], note: '' }; S.people.push(p); return p; };
  const ola = P(T('Оля Смирнова', 'Olivia Smith'), 'photo', '@ola.ph'), karina = P(T('Карина', 'Karina'), 'mua', '@karina.mua', ['nomeat']), mila = P(T('Мила', 'Mila'), 'model', '@mila.m'), sasha = P(T('Саша', 'Sasha'), 'model', '@sasha.models', ['lactose']), lena = P(T('Лена', 'Lena'), 'stylist', '@lena.style'), dima = P(T('Дима', 'Dima'), 'light', '');
  const M = (p, call, rate, status) => ({ id: uid(), pid: p.id, name: p.name, role: p.role, call, rate, unit: 'смена', pay: rate ? 'money' : 'tfp', barter: '', note: '', status, paid: false });
  const b = newShoot('brand', { client: T('Марта', 'Marta'), what: T('лукбук', 'lookbook'), date: dIso(3), place: T('Студия Свет', 'Studio Light'), address: T('ул. Пушкина, 12, 3 этаж, зал «Белый»', '12 Pushkin St, 3rd floor') });
  b.team = [M(ola, '09:00', '25000', 'yes'), M(karina, '08:45', '12000', 'yes'), M(mila, '09:15', '15000', 'asked'), M(sasha, '10:30', '15000', ''), M(lena, '08:30', '12000', 'yes'), M(dima, '08:30', '8000', 'yes')];
  b.looks = [[T('Нежный беж', 'Soft beige'), mila.name, T('льняной костюм, лоферы', 'linen suit, loafers')], [T('Город', 'City'), sasha.name, T('тренч, джинсы', 'trench, jeans')], [T('Вечер', 'Evening'), mila.name, T('шёлковое платье', 'silk dress')], [T('Выходной', 'Weekend'), sasha.name, T('трикотаж, кеды', 'knitwear, sneakers')]].map((x) => ({ id: uid(), name: x[0], model: x[1], clothes: x[2], makeup: T('нюд', 'nude'), hair: T('гладкий пучок', 'sleek bun'), mua: karina.name, ref: '', done: false }));
  const ck = (arr) => arr.map((text) => ({ id: uid(), text, done: false }));
  const BL = (sec, label, unit, pay) => ({ id: uid(), sec, label, desc: '', qty: '1', unit: unit || 'смена', rate: '', pay: pay || 'money', barter: '', q: false, mid: '' });
  b.call = '09:00'; b.end = '19:00';
  b.checklist = ck([T('Бриф от бренда', 'Brief from the brand'), T('Мудборд согласован', 'Moodboard approved'), T('Смета согласована', 'Budget approved'), T('Студия забронирована', 'Studio booked'), T('Модели подтвердили', 'Models confirmed'), T('Вещи у стилиста', 'Clothes with the stylist'), T('Права на фото и срок — договорились', 'Usage rights and term agreed'), T('Договор или акт', 'Contract or invoice')]);
  b.budget.lines = [BL('team', T('Фотограф', 'Photographer'), 'час'), BL('team', T('Видеограф', 'Videographer'), 'час'), BL('team', T('Стилист', 'Stylist')), BL('team', T('Визажист', 'Make-up')), BL('team', T('Волосы', 'Hair')), BL('team', T('Продюсирование', 'Production'), 'проект'), BL('models', T('Модели', 'Models'), 'чел'), BL('looks', T('Закуп образов с возвратом', 'Refundable wardrobe purchase'), 'сумма', 'refund'), BL('looks', T('Невозвратные расходы на образы', 'Non-refundable wardrobe costs'), 'сумма'), BL('place', T('Студия / локация', 'Studio / location'), 'час'), BL('place', T('Свет и техника', 'Light and gear'), 'сумма'), BL('food', T('Еда на площадку', 'Catering'), 'сумма'), BL('food', T('Такси и логистика', 'Taxi and transport'), 'сумма'), BL('post', T('Ретушь', 'Retouching'), 'шт')];
  b.retouch = T('40 кадров · 2 круга правок', '40 frames · 2 rounds');
  b.checklist.slice(0, 4).forEach((c) => { c.done = true; });
  b.budget.lines.forEach((x, i) => { x.rate = String([6000, 5000, 12000, 8000, 6000, 35000, 15000, 40000, 8000, 3000, 6000, 6000, 3000, 500][i] || ''); x.qty = String([4, 2, 1, 1, 1, 1, 2, 1, 1, 6, 1, 1, 1, 30][i] || 1); }); b.budget.lines[2].pay = 'barter'; b.budget.lines[2].barter = '15000'; b.budget.lines[2].rate = '';
  b.rights = T('1 год · онлайн · Россия', '1 year · online'); b.my.fee = '35000'; b.my.role = 'producer';
  const pe = newShoot('personal', { client: T('Анна К.', 'Anna K.'), what: T('портрет', 'portrait'), date: dIso(7), place: T('Студия Свет', 'Studio Light'), address: T('ул. Пушкина, 12', '12 Pushkin St') });
  pe.team = [M(ola, '11:00', '10000', 'yes'), M(karina, '10:30', '5000', 'asked')]; pe.my.fee = '12000';
  pe.call = '11:00'; pe.end = '14:00'; pe.deliver = T('через 7 дней', 'in 7 days');
  pe.checklist = ck([T('Предоплата получена', 'Deposit received'), T('Клиенту отправлена памятка «как подготовиться»', 'Prep guide sent to the client'), T('Образы обсудили', 'Outfits discussed')]);
  const cr = newShoot('creative', { what: T('шёлк', 'silk'), date: dIso(14) }); cr.team = [M(ola, '12:00', '', 'yes'), M(mila, '12:00', '', 'yes')]; cr.my.fee = '0'; cr.my.role = 'model'; cr.call = '12:00'; cr.end = '16:00'; cr.client = 'TFP';
  const past1 = newShoot('brand', { client: T('Кофейня Зерно', 'Grain Café'), what: T('меню', 'menu'), date: dIso(-5), status: 'done' }); past1.my = { role: 'producer', fee: '25000', shifts: 1, paid: true, check: true, note: '' };
  const past2 = newShoot('custom', { src: 'own', client: T('Шоурум Лён', 'Linen showroom'), what: T('лукбук', 'lookbook'), date: dIso(-12), modules: { team: false, timing: false, looks: false, budget: false, print: false } }); past2.my = { role: 'model', fee: '15000', shifts: 1, paid: false, check: false, note: '' };
  const past3 = newShoot('custom', { src: 'own', client: T('Каталог Дом и сад', 'Home & Garden'), what: T('каталог', 'catalogue'), date: dIso(-30), modules: { team: false, timing: false, looks: false, budget: false, print: false } }); past3.my = { role: 'producer', fee: '40000', shifts: 2, paid: true, check: false, note: '' };
  [b, pe, cr].forEach((x) => { x.timing = genTiming(x); });
  [b, pe, cr, past1, past2, past3].forEach((x) => { x.demo = true; });
  S.shoots.push(b, pe, cr, past1, past2, past3);
  if (!S.profile.name) S.profile.name = T('Ксения', 'Ksenia');
  save();
}

/* ---------- router & render ---------- */
function route() {
  const h = location.hash || '#/today';
  const parts = h.replace(/^#\/?/, '').split('/');
  if (!S.profile.onboarded && parts[0] !== 'welcome' && parts[0] !== 'activate' && parts[0] !== 'join') { location.replace('#/welcome'); return null; }
  return parts;
}
let lastHash = '';
function render() {
  clearTimeout(window._rt);
  const parts = route(); if (!parts) return;
  const keep = location.hash === lastHash ? window.scrollY : 0;
  const active = document.activeElement; const activeB = active?.dataset?.b; const selStart = active?.selectionStart;
  let html = '';
  const [a, b, c] = parts;
  if (a === 'welcome') html = vWelcome();
  else if (a === 'today' || a === '') html = vToday();
  else if (a === 'calendar') html = vCalendar();
  else if (a === 'projects') html = vProjects();
  else if (a === 'new') html = vNew();
  else if (a === 'people') html = vPeople();
  else if (a === 'me') html = vMe();
  else if (a === 'settings') html = vSettings();
  else if (a === 'pro') html = vPro();
  else if (a === 'join') { joinFrom(parts.slice(1).join('/')); return; }
  else if (a === 'activate') { const code = decodeURIComponent(parts.slice(1).join('/')); location.replace('#/pro'); doActivate(code); return; }
  else if (a === 'own') { const s = getShoot(b); if (s && !ui.sheet) ui.sheet = { type: 'own', data: JSON.parse(JSON.stringify(s)), isNew: false }; html = vCalendar(); }
  else if (a === 'p' && c === 'print') html = vPrint(b);
  else if (a === 'p' && c === 'onset') html = vOnSet(b);
  else if (a === 'p' && c === 'wrap') html = vWrap(b);
  else if (a === 'p') html = vProject(b, c);
  else html = vNotFound();
  document.body.style.background = a === 'p' && c === 'onset' ? '#1A1A22' : '';
  if (a === 'p' && c === 'onset') startCoach(); else stopCoach();
  $('#app').innerHTML = html + vSheet();
  if (location.hash === lastHash) window.scrollTo(0, keep); else window.scrollTo(0, 0);
  lastHash = location.hash;
  hydrate();
  document.querySelectorAll('textarea.tlw').forEach(growTa);
  if (ui.sheet && ui.sheet.type === 'recap') paintRecap();
  if (activeB) { const e = document.querySelector('[data-b="' + CSS.escape(activeB) + '"]'); if (e) { e.focus(); try { if (selStart != null) e.setSelectionRange(selStart, selStart); } catch (x) { /* date inputs */ } } }
}

/* ---------- events ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const fn = A[el.dataset.a];
  if (fn) { if (el.tagName === 'BUTTON' || (el.dataset.self && ev.target === el)) ev.preventDefault(); fn(el, ev); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target; const b = el.dataset.b;
  if (el.classList && el.classList.contains('tlw')) growTa(el);
  if (b) { setPath(b, el.value); if (el.dataset.live) { clearTimeout(el._t); el._t = setTimeout(render, 120); } }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.type === 'tel' && el.value) el.value = fmtPhone(el.value);
  if (el.dataset.tg && el.value) el.value = tgNick(el.value);
  if (el.dataset.time) el.value = normTime(el.value);
  if (el.dataset.b) { setPath(el.dataset.b, el.value); if (el.dataset.r && !(el.dataset.time && document.activeElement === el)) { clearTimeout(window._rt); window._rt = setTimeout(render, 250); } }
  if (el.id === 'oDate' && ui.sheet) { keepOwnInputs(); render(); }
});
document.addEventListener('focusout', (ev) => { const el = ev.target; if (el.dataset && el.dataset.time && el.dataset.r) { clearTimeout(window._rt); window._rt = setTimeout(render, 250); } });
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.dataset.enter) { ev.preventDefault(); A[ev.target.dataset.enter](ev.target); }
  if (ev.key === 'Escape' && ui.sheet) closeSheet();
});
$('#importFile').addEventListener('change', (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const x = JSON.parse(r.result); if (x.v !== 1 || !Array.isArray(x.shoots)) throw new Error('bad'); if (!confirm(T('Заменить текущие данные копией?', 'Replace current data with the backup?'))) return; const media = x.media || {}; delete x.media; S = Object.assign(fresh(), x); S.shoots.forEach(migrate); save(); Object.keys(media).forEach(async (id) => { const b = await (await fetch(media[id])).blob(); await mPut(id, b); }); toast(T('Копия загружена', 'Backup restored')); location.hash = '#/today'; render(); } catch (e) { toast(T('Это не похоже на копию SET', 'This is not a SET backup')); } };
  r.readAsText(f); ev.target.value = '';
});
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/own')) ui.sheet = null; render(); });
if (!S.deviceId) { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(8)); S.deviceId = [...r].map((x) => a[x % a.length]).join('').replace(/(.{4})/, '$1-'); save(); }
if (!S.firstRun) { S.firstRun = todayIso(); save(); }
if (S.freeUsed == null) { S.freeUsed = S.shoots.some((x) => x.src === 'set' && !x.demo); save(); }
document.documentElement.lang = S.lang;
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
