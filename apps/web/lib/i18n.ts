/**
 * UI language: dictionaries and helpers, shared by server and client.
 *
 * Manual toggle, not per-city auto: the visitor picks a language and it sticks
 * (a first-party `nt_lang` cookie, so the server can render the chosen language
 * on the first frame — the same reason the city preference is a cookie). English
 * is the base; every other language is layered over it, so a key that has not
 * been translated yet falls back to English rather than showing a blank or a raw
 * key. That makes translation something we can fill in over time without ever
 * shipping a broken screen.
 *
 * This file has no "use client": it is imported by server components (via
 * lib/i18n-server) and by client components (via components/LanguageProvider),
 * and the dictionaries are plain data either side can hold.
 */

export const LOCALES = ["en", "hi", "kn", "te", "mr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "nt_lang";

/** The name of each language, written in that language — how a picker should
 * label it, so a Kannada reader sees "ಕನ್ನಡ" rather than "Kannada". */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  te: "తెలుగు",
  mr: "मराठी",
};

/** The city each language is the primary tongue of — shown as a hint in the
 * picker, since that is how a buyer thinks of it ("the Bengaluru one"). */
export const LOCALE_CITY_HINT: Partial<Record<Locale, string>> = {
  kn: "Bengaluru",
  hi: "Gurugram",
  te: "Hyderabad",
  mr: "Mumbai",
};

export type Dict = Record<string, string>;

const en: Dict = {
  "nav.privacy": "Privacy",
  "lang.label": "Language",
  "common.allCities": "All cities",
  "common.browseAll": "Browse all localities →",
  "common.localities": "localities",
  "home.hero1": "Know the neighbourhood",
  "home.hero2": "before you commit to it.",
  "home.heroSub":
    "Search a locality, pincode, apartment or landmark. See its schools, safety, air, water and connectivity — with the source and date behind every number.",
  "home.recentlyViewed": "Recently viewed",
  "home.manage": "Manage",
  "home.loadError":
    "Couldn't load the localities just now. Please refresh in a moment.",
  "consent.title": "Remember your preferences and history?",
  "consent.body":
    "We can keep the city you filter to and a history of the localities you open on our side, tied to a private id that never shows who you are — so they're remembered for you, and carry across your devices once you sign in. You can erase it all anytime.",
  "consent.how": "How this works",
  "consent.yes": "Yes, remember",
  "consent.no": "No thanks",
  "cat.schools": "Schools",
  "cat.air_quality": "Air quality",
  "cat.crime": "Safety",
  "cat.water": "Water",
  "cat.infrastructure": "Connectivity",
  "search.placeholder": "Locality, pincode, apartment, road or landmark",
  "search.try": "Try",
  "nearme.show": "Show my neighbourhood",
  "nearme.finding": "Finding you…",
};

const hi: Dict = {
  "nav.privacy": "गोपनीयता",
  "lang.label": "भाषा",
  "common.allCities": "सभी शहर",
  "common.browseAll": "सभी इलाके देखें →",
  "common.localities": "इलाके",
  "home.hero1": "पड़ोस को जानें",
  "home.hero2": "उसमें बसने से पहले।",
  "home.heroSub":
    "कोई इलाका, पिनकोड, अपार्टमेंट या लैंडमार्क खोजें। उसके स्कूल, सुरक्षा, हवा, पानी और कनेक्टिविटी देखें — हर आंकड़े के पीछे स्रोत और तारीख के साथ।",
  "home.recentlyViewed": "हाल में देखे गए",
  "home.manage": "प्रबंधित करें",
  "home.loadError":
    "इलाके अभी लोड नहीं हो सके। कृपया कुछ देर बाद रिफ्रेश करें।",
  "consent.title": "क्या आपकी प्राथमिकताएँ और इतिहास याद रखें?",
  "consent.body":
    "आप जिस शहर को फ़िल्टर करते हैं और जिन इलाकों को खोलते हैं उनका इतिहास हम अपनी ओर रख सकते हैं — एक निजी आईडी से जुड़ा, जो कभी यह नहीं दिखाती कि आप कौन हैं। साइन इन करने के बाद ये आपके सभी डिवाइस पर उपलब्ध रहेंगे। आप इन्हें कभी भी मिटा सकते हैं।",
  "consent.how": "यह कैसे काम करता है",
  "consent.yes": "हाँ, याद रखें",
  "consent.no": "नहीं, धन्यवाद",
  "cat.schools": "स्कूल",
  "cat.air_quality": "वायु गुणवत्ता",
  "cat.crime": "सुरक्षा",
  "cat.water": "पानी",
  "cat.infrastructure": "कनेक्टिविटी",
  "search.placeholder": "इलाका, पिनकोड, अपार्टमेंट, सड़क या लैंडमार्क",
  "search.try": "आज़माएँ",
  "nearme.show": "मेरा पड़ोस दिखाएँ",
  "nearme.finding": "आपको खोज रहे हैं…",
};

const kn: Dict = {
  "nav.privacy": "ಗೌಪ್ಯತೆ",
  "lang.label": "ಭಾಷೆ",
  "common.allCities": "ಎಲ್ಲಾ ನಗರಗಳು",
  "common.browseAll": "ಎಲ್ಲಾ ಪ್ರದೇಶಗಳನ್ನು ವೀಕ್ಷಿಸಿ →",
  "common.localities": "ಪ್ರದೇಶಗಳು",
  "home.hero1": "ನೆರೆಹೊರೆಯನ್ನು ತಿಳಿಯಿರಿ",
  "home.hero2": "ನೀವು ನಿರ್ಧರಿಸುವ ಮೊದಲು.",
  "home.heroSub":
    "ಪ್ರದೇಶ, ಪಿನ್‌ಕೋಡ್, ಅಪಾರ್ಟ್‌ಮೆಂಟ್ ಅಥವಾ ಹೆಗ್ಗುರುತನ್ನು ಹುಡುಕಿ. ಅದರ ಶಾಲೆಗಳು, ಸುರಕ್ಷತೆ, ಗಾಳಿ, ನೀರು ಮತ್ತು ಸಂಪರ್ಕವನ್ನು ನೋಡಿ — ಪ್ರತಿ ಸಂಖ್ಯೆಯ ಹಿಂದೆ ಮೂಲ ಮತ್ತು ದಿನಾಂಕದೊಂದಿಗೆ.",
  "home.recentlyViewed": "ಇತ್ತೀಚೆಗೆ ವೀಕ್ಷಿಸಿದವು",
  "home.manage": "ನಿರ್ವಹಿಸಿ",
  "home.loadError":
    "ಪ್ರದೇಶಗಳನ್ನು ಇದೀಗ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ರಿಫ್ರೆಶ್ ಮಾಡಿ.",
  "consent.title": "ನಿಮ್ಮ ಆದ್ಯತೆಗಳು ಮತ್ತು ಇತಿಹಾಸವನ್ನು ನೆನಪಿಡಬೇಕೆ?",
  "consent.body":
    "ನೀವು ಫಿಲ್ಟರ್ ಮಾಡುವ ನಗರ ಮತ್ತು ನೀವು ತೆರೆಯುವ ಪ್ರದೇಶಗಳ ಇತಿಹಾಸವನ್ನು ನಾವು ನಮ್ಮ ಬಳಿ ಇರಿಸಬಹುದು — ನಿಮ್ಮ ಗುರುತನ್ನು ಎಂದಿಗೂ ತೋರಿಸದ ಖಾಸಗಿ ಐಡಿಗೆ ಜೋಡಿಸಲಾಗಿದೆ. ನೀವು ಸೈನ್ ಇನ್ ಮಾಡಿದ ನಂತರ ಇವು ನಿಮ್ಮ ಸಾಧನಗಳಲ್ಲಿ ಲಭ್ಯವಿರುತ್ತವೆ. ನೀವು ಯಾವಾಗ ಬೇಕಾದರೂ ಅಳಿಸಬಹುದು.",
  "consent.how": "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",
  "consent.yes": "ಹೌದು, ನೆನಪಿಡಿ",
  "consent.no": "ಬೇಡ",
  "cat.schools": "ಶಾಲೆಗಳು",
  "cat.air_quality": "ಗಾಳಿಯ ಗುಣಮಟ್ಟ",
  "cat.crime": "ಸುರಕ್ಷತೆ",
  "cat.water": "ನೀರು",
  "cat.infrastructure": "ಸಂಪರ್ಕ",
  "search.placeholder": "ಪ್ರದೇಶ, ಪಿನ್‌ಕೋಡ್, ಅಪಾರ್ಟ್‌ಮೆಂಟ್, ರಸ್ತೆ ಅಥವಾ ಹೆಗ್ಗುರುತು",
  "search.try": "ಪ್ರಯತ್ನಿಸಿ",
  "nearme.show": "ನನ್ನ ನೆರೆಹೊರೆಯನ್ನು ತೋರಿಸಿ",
  "nearme.finding": "ನಿಮ್ಮನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ…",
};

const te: Dict = {
  "nav.privacy": "గోప్యత",
  "lang.label": "భాష",
  "common.allCities": "అన్ని నగరాలు",
  "common.browseAll": "అన్ని ప్రాంతాలను చూడండి →",
  "common.localities": "ప్రాంతాలు",
  "home.hero1": "పరిసరాలను తెలుసుకోండి",
  "home.hero2": "దానిలో స్థిరపడే ముందు.",
  "home.heroSub":
    "ఒక ప్రాంతం, పిన్‌కోడ్, అపార్ట్‌మెంట్ లేదా ల్యాండ్‌మార్క్‌ను వెతకండి. దాని పాఠశాలలు, భద్రత, గాలి, నీరు మరియు కనెక్టివిటీని చూడండి — ప్రతి సంఖ్య వెనుక మూలం మరియు తేదీతో.",
  "home.recentlyViewed": "ఇటీవల చూసినవి",
  "home.manage": "నిర్వహించండి",
  "home.loadError":
    "ప్రాంతాలను ప్రస్తుతం లోడ్ చేయలేకపోయాం. దయచేసి కొద్దిసేపటి తర్వాత రిఫ్రెష్ చేయండి.",
  "consent.title": "మీ ప్రాధాన్యతలు మరియు చరిత్రను గుర్తుంచుకోవాలా?",
  "consent.body":
    "మీరు ఫిల్టర్ చేసే నగరం మరియు మీరు తెరిచే ప్రాంతాల చరిత్రను మేము మా వద్ద ఉంచగలం — మీరు ఎవరో ఎప్పుడూ చూపని ప్రైవేట్ ఐడీకి అనుసంధానించబడి. మీరు సైన్ ఇన్ చేసిన తర్వాత ఇవి మీ పరికరాలలో అందుబాటులో ఉంటాయి. మీరు ఎప్పుడైనా తొలగించవచ్చు.",
  "consent.how": "ఇది ఎలా పనిచేస్తుంది",
  "consent.yes": "అవును, గుర్తుంచుకో",
  "consent.no": "వద్దు",
  "cat.schools": "పాఠశాలలు",
  "cat.air_quality": "గాలి నాణ్యత",
  "cat.crime": "భద్రత",
  "cat.water": "నీరు",
  "cat.infrastructure": "కనెక్టివిటీ",
  "search.placeholder": "ప్రాంతం, పిన్‌కోడ్, అపార్ట్‌మెంట్, రోడ్డు లేదా ల్యాండ్‌మార్క్",
  "search.try": "ప్రయత్నించండి",
  "nearme.show": "నా పరిసరాలను చూపించు",
  "nearme.finding": "మిమ్మల్ని కనుగొంటోంది…",
};

const mr: Dict = {
  "nav.privacy": "गोपनीयता",
  "lang.label": "भाषा",
  "common.allCities": "सर्व शहरे",
  "common.browseAll": "सर्व परिसर पाहा →",
  "common.localities": "परिसर",
  "home.hero1": "परिसर जाणून घ्या",
  "home.hero2": "तिथे राहण्याचा निर्णय घेण्यापूर्वी.",
  "home.heroSub":
    "एखादा परिसर, पिनकोड, अपार्टमेंट किंवा लँडमार्क शोधा. त्याच्या शाळा, सुरक्षा, हवा, पाणी आणि कनेक्टिव्हिटी पाहा — प्रत्येक आकड्यामागे स्रोत आणि तारखेसह.",
  "home.recentlyViewed": "अलीकडे पाहिलेले",
  "home.manage": "व्यवस्थापित करा",
  "home.loadError":
    "परिसर सध्या लोड होऊ शकले नाहीत. कृपया थोड्या वेळाने रिफ्रेश करा.",
  "consent.title": "तुमच्या पसंती आणि इतिहास लक्षात ठेवायचा का?",
  "consent.body":
    "तुम्ही फिल्टर करता ते शहर आणि तुम्ही उघडता ते परिसर यांचा इतिहास आम्ही आमच्याकडे ठेवू शकतो — तुम्ही कोण आहात हे कधीही न दाखवणाऱ्या खाजगी आयडीशी जोडलेला. तुम्ही साइन इन केल्यावर हे तुमच्या सर्व उपकरणांवर उपलब्ध राहील. तुम्ही ते कधीही पुसून टाकू शकता.",
  "consent.how": "हे कसे कार्य करते",
  "consent.yes": "होय, लक्षात ठेवा",
  "consent.no": "नको",
  "cat.schools": "शाळा",
  "cat.air_quality": "हवेची गुणवत्ता",
  "cat.crime": "सुरक्षा",
  "cat.water": "पाणी",
  "cat.infrastructure": "कनेक्टिव्हिटी",
  "search.placeholder": "परिसर, पिनकोड, अपार्टमेंट, रस्ता किंवा लँडमार्क",
  "search.try": "प्रयत्न करा",
  "nearme.show": "माझा परिसर दाखवा",
  "nearme.finding": "तुम्हाला शोधत आहे…",
};

const DICTS: Record<Locale, Dict> = { en, hi, kn, te, mr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The dictionary for a locale, layered over English so any untranslated key
 * falls back to English rather than to a raw key. English itself is returned
 * directly.
 */
export function getDict(locale: Locale): Dict {
  if (locale === "en") return en;
  return { ...en, ...DICTS[locale] };
}

/** A translator bound to one locale. Missing keys fall through to English, then
 * to the key itself, so a typo is visible rather than blank. */
export function translator(locale: Locale): (key: string) => string {
  const dict = getDict(locale);
  return (key: string) => dict[key] ?? key;
}
