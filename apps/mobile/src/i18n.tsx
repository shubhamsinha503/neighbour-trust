/**
 * Translations for the native app, in the same five languages as the website.
 *
 * The dictionaries are the same shape as apps/web/lib/i18n.ts — plain data, so
 * the two apps can eventually share one source. English is the base; every other
 * language is layered over it, so an untranslated key falls back to English
 * rather than showing blank. The chosen locale is persisted in AsyncStorage, so
 * the app reopens in the language last picked.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "nt_lang";

export const LOCALES = ["en", "hi", "kn", "te", "mr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  te: "తెలుగు",
  mr: "मराठी",
};

type Dict = Record<string, string>;

const en: Dict = {
  brand: "Neighbour Trust",
  "home.title": "Know the neighbourhood",
  "home.subtitle": "Sourced, dated data with the confidence behind every number.",
  "home.search": "Search a locality…",
  "home.allCities": "All cities",
  "home.loadError": "Couldn't load localities. Pull to retry.",
  "common.localities": "localities",
  "common.noDataYet": "No data yet",
  "common.trustScore": "Trust Score",
  "lang.label": "Language",
  "report.back": "Back",
  "report.basedOn": "Based on",
  "report.of": "of",
  "report.categories": "categories",
  "report.loadError": "Couldn't load this report. Try again.",
  "report.sources": "Data pulled from",
  "cat.schools": "Schools",
  "cat.air_quality": "Air quality",
  "cat.crime": "Safety",
  "cat.water": "Water",
  "cat.infrastructure": "Connectivity",
  "detail.noData": "No data yet",
  "detail.source": "Source",
  "detail.confidence": "Confidence",
  "detail.asOf": "As of",
  "conf.high": "High confidence",
  "conf.medium": "Medium confidence",
  "conf.low": "Low confidence",
  "conf.community_estimated": "Community-estimated",
  "aq.aqi": "AQI (24-hr)",
  "aq.latestHour": "Latest hour",
  "aq.dominant": "Main pollutant",
  "aq.station": "Nearest station",
  "aq.km": "km away",
  "schools.within2": "Within 2 km",
  "schools.within5": "Within 5 km",
  "schools.staffingKnown": "Staffing known for",
  "schools.ptr": "Median pupils/teacher",
  "schools.nearest": "Nearest schools",
  "conn.summary": "What is nearby",
  "conn.metro": "Transit stations",
  "conn.hospitals": "Hospitals",
  "conn.clinics": "Clinics",
  "conn.parks": "Parks",
  "conn.markets": "Supermarkets",
  "cat.power": "Power",
  "cat.development": "Development",
};

const hi: Dict = {
  "home.title": "पड़ोस को जानें",
  "home.subtitle": "स्रोत और तारीख के साथ डेटा — हर आंकड़े के पीछे भरोसा।",
  "home.search": "कोई इलाका खोजें…",
  "home.allCities": "सभी शहर",
  "home.loadError": "इलाके लोड नहीं हो सके। पुनः प्रयास करें।",
  "common.localities": "इलाके",
  "common.noDataYet": "अभी कोई डेटा नहीं",
  "common.trustScore": "ट्रस्ट स्कोर",
  "lang.label": "भाषा",
  "report.back": "वापस",
  "report.basedOn": "इस पर आधारित",
  "report.of": "में से",
  "report.categories": "श्रेणियाँ",
  "report.loadError": "यह रिपोर्ट लोड नहीं हो सकी। फिर प्रयास करें।",
  "report.sources": "डेटा इनसे लिया गया",
  "cat.schools": "स्कूल",
  "cat.air_quality": "वायु गुणवत्ता",
  "cat.crime": "सुरक्षा",
  "cat.water": "पानी",
  "cat.infrastructure": "कनेक्टिविटी",
  "detail.noData": "अभी कोई डेटा नहीं",
  "detail.source": "स्रोत",
  "detail.confidence": "भरोसा",
  "detail.asOf": "इस तारीख तक",
  "conf.high": "उच्च भरोसा",
  "conf.medium": "मध्यम भरोसा",
  "conf.low": "कम भरोसा",
  "conf.community_estimated": "समुदाय-अनुमानित",
  "aq.aqi": "AQI (24-घंटे)",
  "aq.latestHour": "ताज़ा घंटा",
  "aq.dominant": "मुख्य प्रदूषक",
  "aq.station": "निकटतम स्टेशन",
  "aq.km": "किमी दूर",
  "schools.within2": "2 किमी के भीतर",
  "schools.within5": "5 किमी के भीतर",
  "schools.staffingKnown": "स्टाफ़िंग ज्ञात",
  "schools.ptr": "माध्य छात्र/शिक्षक",
  "schools.nearest": "निकटतम स्कूल",
  "conn.summary": "आस-पास क्या है",
  "conn.metro": "ट्रांज़िट स्टेशन",
  "conn.hospitals": "अस्पताल",
  "conn.clinics": "क्लीनिक",
  "conn.parks": "पार्क",
  "conn.markets": "सुपरमार्केट",
  "cat.power": "बिजली",
  "cat.development": "विकास",
};

const kn: Dict = {
  "home.title": "ನೆರೆಹೊರೆಯನ್ನು ತಿಳಿಯಿರಿ",
  "home.subtitle": "ಮೂಲ ಮತ್ತು ದಿನಾಂಕದೊಂದಿಗೆ ಡೇಟಾ — ಪ್ರತಿ ಸಂಖ್ಯೆಯ ಹಿಂದೆ ವಿಶ್ವಾಸ.",
  "home.search": "ಪ್ರದೇಶವನ್ನು ಹುಡುಕಿ…",
  "home.allCities": "ಎಲ್ಲಾ ನಗರಗಳು",
  "home.loadError": "ಪ್ರದೇಶಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  "common.localities": "ಪ್ರದೇಶಗಳು",
  "common.noDataYet": "ಇನ್ನೂ ಡೇಟಾ ಇಲ್ಲ",
  "common.trustScore": "ಟ್ರಸ್ಟ್ ಸ್ಕೋರ್",
  "lang.label": "ಭಾಷೆ",
  "report.back": "ಹಿಂದೆ",
  "report.basedOn": "ಇದನ್ನು ಆಧರಿಸಿ",
  "report.of": "ರಲ್ಲಿ",
  "report.categories": "ವರ್ಗಗಳು",
  "report.loadError": "ಈ ವರದಿಯನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  "report.sources": "ಡೇಟಾ ಇವುಗಳಿಂದ",
  "cat.schools": "ಶಾಲೆಗಳು",
  "cat.air_quality": "ಗಾಳಿಯ ಗುಣಮಟ್ಟ",
  "cat.crime": "ಸುರಕ್ಷತೆ",
  "cat.water": "ನೀರು",
  "cat.infrastructure": "ಸಂಪರ್ಕ",
  "detail.noData": "ಇನ್ನೂ ಡೇಟಾ ಇಲ್ಲ",
  "detail.source": "ಮೂಲ",
  "detail.confidence": "ವಿಶ್ವಾಸ",
  "detail.asOf": "ಈ ದಿನಾಂಕದವರೆಗೆ",
  "conf.high": "ಹೆಚ್ಚು ವಿಶ್ವಾಸ",
  "conf.medium": "ಮಧ್ಯಮ ವಿಶ್ವಾಸ",
  "conf.low": "ಕಡಿಮೆ ವಿಶ್ವಾಸ",
  "conf.community_estimated": "ಸಮುದಾಯ-ಅಂದಾಜು",
  "aq.aqi": "AQI (24-ಗಂ)",
  "aq.latestHour": "ಇತ್ತೀಚಿನ ಗಂಟೆ",
  "aq.dominant": "ಮುಖ್ಯ ಮಾಲಿನ್ಯಕಾರಕ",
  "aq.station": "ಹತ್ತಿರದ ಕೇಂದ್ರ",
  "aq.km": "ಕಿಮೀ ದೂರ",
  "schools.within2": "2 ಕಿಮೀ ಒಳಗೆ",
  "schools.within5": "5 ಕಿಮೀ ಒಳಗೆ",
  "schools.staffingKnown": "ಸಿಬ್ಬಂದಿ ತಿಳಿದಿದೆ",
  "schools.ptr": "ಮಧ್ಯಮ ವಿದ್ಯಾರ್ಥಿ/ಶಿಕ್ಷಕ",
  "schools.nearest": "ಹತ್ತಿರದ ಶಾಲೆಗಳು",
  "conn.summary": "ಸಮೀಪದಲ್ಲಿ ಏನಿದೆ",
  "conn.metro": "ಸಾರಿಗೆ ನಿಲ್ದಾಣಗಳು",
  "conn.hospitals": "ಆಸ್ಪತ್ರೆಗಳು",
  "conn.clinics": "ಚಿಕಿತ್ಸಾಲಯಗಳು",
  "conn.parks": "ಉದ್ಯಾನಗಳು",
  "conn.markets": "ಸೂಪರ್‌ಮಾರ್ಕೆಟ್‌ಗಳು",
  "cat.power": "ವಿದ್ಯುತ್",
  "cat.development": "ಅಭಿವೃದ್ಧಿ",
};

const te: Dict = {
  "home.title": "పరిసరాలను తెలుసుకోండి",
  "home.subtitle": "మూలం మరియు తేదీతో డేటా — ప్రతి సంఖ్య వెనుక విశ్వాసం.",
  "home.search": "ఒక ప్రాంతాన్ని వెతకండి…",
  "home.allCities": "అన్ని నగరాలు",
  "home.loadError": "ప్రాంతాలను లోడ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
  "common.localities": "ప్రాంతాలు",
  "common.noDataYet": "ఇంకా డేటా లేదు",
  "common.trustScore": "ట్రస్ట్ స్కోర్",
  "lang.label": "భాష",
  "report.back": "వెనుకకు",
  "report.basedOn": "దీని ఆధారంగా",
  "report.of": "లో",
  "report.categories": "వర్గాలు",
  "report.loadError": "ఈ నివేదికను లోడ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
  "report.sources": "డేటా వీటి నుండి",
  "cat.schools": "పాఠశాలలు",
  "cat.air_quality": "గాలి నాణ్యత",
  "cat.crime": "భద్రత",
  "cat.water": "నీరు",
  "cat.infrastructure": "కనెక్టివిటీ",
  "detail.noData": "ఇంకా డేటా లేదు",
  "detail.source": "మూలం",
  "detail.confidence": "విశ్వాసం",
  "detail.asOf": "ఈ తేదీ నాటికి",
  "conf.high": "అధిక విశ్వాసం",
  "conf.medium": "మధ్యస్థ విశ్వాసం",
  "conf.low": "తక్కువ విశ్వాసం",
  "conf.community_estimated": "సంఘం-అంచనా",
  "aq.aqi": "AQI (24-గం)",
  "aq.latestHour": "తాజా గంట",
  "aq.dominant": "ప్రధాన కాలుష్యకారి",
  "aq.station": "సమీప కేంద్రం",
  "aq.km": "కి.మీ దూరం",
  "schools.within2": "2 కి.మీ లోపల",
  "schools.within5": "5 కి.మీ లోపల",
  "schools.staffingKnown": "సిబ్బంది తెలుసు",
  "schools.ptr": "మధ్యగత విద్యార్థి/ఉపాధ్యాయుడు",
  "schools.nearest": "సమీప పాఠశాలలు",
  "conn.summary": "సమీపంలో ఏముంది",
  "conn.metro": "రవాణా స్టేషన్‌లు",
  "conn.hospitals": "ఆసుపత్రులు",
  "conn.clinics": "క్లినిక్‌లు",
  "conn.parks": "ఉద్యానవనాలు",
  "conn.markets": "సూపర్‌మార్కెట్‌లు",
  "cat.power": "విద్యుత్",
  "cat.development": "అభివృద్ధి",
};

const mr: Dict = {
  "home.title": "परिसर जाणून घ्या",
  "home.subtitle": "स्रोत आणि तारखेसह डेटा — प्रत्येक आकड्यामागे विश्वास.",
  "home.search": "एखादा परिसर शोधा…",
  "home.allCities": "सर्व शहरे",
  "home.loadError": "परिसर लोड होऊ शकले नाहीत. पुन्हा प्रयत्न करा.",
  "common.localities": "परिसर",
  "common.noDataYet": "अद्याप डेटा नाही",
  "common.trustScore": "ट्रस्ट स्कोर",
  "lang.label": "भाषा",
  "report.back": "मागे",
  "report.basedOn": "यावर आधारित",
  "report.of": "पैकी",
  "report.categories": "श्रेणी",
  "report.loadError": "हा अहवाल लोड होऊ शकला नाही. पुन्हा प्रयत्न करा.",
  "report.sources": "डेटा येथून घेतला",
  "cat.schools": "शाळा",
  "cat.air_quality": "हवेची गुणवत्ता",
  "cat.crime": "सुरक्षा",
  "cat.water": "पाणी",
  "cat.infrastructure": "कनेक्टिव्हिटी",
  "detail.noData": "अद्याप डेटा नाही",
  "detail.source": "स्रोत",
  "detail.confidence": "विश्वास",
  "detail.asOf": "या तारखेपर्यंत",
  "conf.high": "उच्च विश्वास",
  "conf.medium": "मध्यम विश्वास",
  "conf.low": "कमी विश्वास",
  "conf.community_estimated": "समुदाय-अंदाजित",
  "aq.aqi": "AQI (24-तास)",
  "aq.latestHour": "ताजा तास",
  "aq.dominant": "मुख्य प्रदूषक",
  "aq.station": "जवळचे केंद्र",
  "aq.km": "किमी दूर",
  "schools.within2": "2 किमी आत",
  "schools.within5": "5 किमी आत",
  "schools.staffingKnown": "कर्मचारी माहीत",
  "schools.ptr": "मध्यक विद्यार्थी/शिक्षक",
  "schools.nearest": "जवळच्या शाळा",
  "conn.summary": "जवळपास काय आहे",
  "conn.metro": "वाहतूक स्थानके",
  "conn.hospitals": "रुग्णालये",
  "conn.clinics": "दवाखाने",
  "conn.parks": "उद्याने",
  "conn.markets": "सुपरमार्केट",
  "cat.power": "वीज",
  "cat.development": "विकास",
};

const DICTS: Record<Locale, Dict> = { en, hi, kn, te, mr };

function dictFor(locale: Locale): Dict {
  return locale === "en" ? en : { ...en, ...DICTS[locale] };
}

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  categoryLabel: (category: string, fallback: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Load the saved choice once on mount. Fails soft: if storage is unreadable
  // the app just stays on English.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (active && isLocale(saved)) setLocaleState(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Set and persist. The write is fire-and-forget — a failed save only means the
  // next launch reopens in English, never a broken UI now.
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<Ctx>(() => {
    const dict = dictFor(locale);
    const t = (key: string) => dict[key] ?? key;
    return {
      locale,
      setLocale,
      t,
      categoryLabel: (category, fallback) => {
        const v = t("cat." + category);
        return v === "cat." + category ? fallback : v;
      },
    };
  }, [locale]);
  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}
