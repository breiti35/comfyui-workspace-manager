import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { Lang, translations, TransKey } from "./translations";

interface LanguageCtx {
  lang: Lang;
  t: (key: TransKey) => string;
}

const LanguageContext = createContext<LanguageCtx>({
  lang: "en",
  t: (key) => translations.en[key] ?? key,
});

// Provides the current UI language and a translate function. Reads the
// `language` setting on mount and re-reads whenever a `language` event fires
// (dispatched by the settings toggle), so translated surfaces switch live.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const read = () =>
      userSettingsTable
        ?.getSetting("language")
        .then((l) => setLang(l === "de" ? "de" : "en"));
    read();
    window.addEventListener("language", read);
    return () => window.removeEventListener("language", read);
  }, []);

  const t = (key: TransKey): string =>
    translations[lang][key] ?? translations.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useT = () => useContext(LanguageContext);
