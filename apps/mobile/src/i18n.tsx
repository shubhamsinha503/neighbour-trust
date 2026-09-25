/**
 * Translations for the native app, in the same five languages as the website.
 *
 * The dictionaries are the same shape as apps/web/lib/i18n.ts — plain data, so
 * the two apps can eventually share one source. English is the base; every other
 * language is layered over it, so an untranslated key falls back to English
 * rather than showing blank. Locale lives in React state here (no cookies on a
 * phone); persisting it across launches with AsyncStorage is a later step.
 */

import React, { createContext, useContext, useMemo, useState } from "react";

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
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
