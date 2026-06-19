import { Dropdown, Button } from "antd";
import { GlobalOutlined, DownOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/languages";
import { Flag } from "./Flag";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        selectable: true,
        selectedKeys: [current.code],
        items: LANGUAGES.map((l) => ({
          key: l.code,
          label: (
            <span>
              <span style={{ marginInlineEnd: 8 }}>
                <Flag countryCode={l.countryCode} title={l.nativeName} />
              </span>
              {l.nativeName}
            </span>
          ),
        })),
        onClick: ({ key }) => {
          void i18n.changeLanguage(key);
        },
      }}
    >
      <Button type="text" style={{ color: "#fff" }}>
        <GlobalOutlined />
        <span
          style={{
            marginInline: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Flag countryCode={current.countryCode} title={current.nativeName} />
          {current.nativeName}
        </span>
        <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Dropdown>
  );
}
