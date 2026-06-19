import { useState } from "react";
import { Button, Modal, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/languages";
import { LANG_STORAGE_KEY } from "../i18n";
import { Flag } from "./Flag";

const { Paragraph } = Typography;

// True once the user has explicitly chosen a language (key is only written on
// an explicit choice, not on the default fallback) — or if storage is blocked,
// in which case we don't nag.
function languageChosen(): boolean {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) != null;
  } catch {
    return true;
  }
}

// First-visit modal letting non-Ukrainian speakers pick a language before the
// (Ukrainian-default) UI scares them off. Flags + endonyms are self-explanatory.
export function LanguagePrompt() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(() => !languageChosen());

  const choose = (code: string) => {
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // Storage unavailable — language still applies for this session.
    }
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      title={t("lang.promptTitle")}
      footer={null}
      closable={false}
      maskClosable={false}
      centered
    >
      <Paragraph type="secondary">{t("lang.promptSubtitle")}</Paragraph>
      <Space wrap>
        {LANGUAGES.map((l) => (
          <Button key={l.code} size="large" onClick={() => choose(l.code)}>
            <span style={{ marginInlineEnd: 8 }}>
              <Flag countryCode={l.countryCode} title={l.nativeName} />
            </span>
            {l.nativeName}
          </Button>
        ))}
      </Space>
    </Modal>
  );
}
