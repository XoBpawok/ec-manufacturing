import { Button, Empty, InputNumber, Slider, Space, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { GameData } from "../api/types";
import { effectiveSkillLevel, isSkillUnlocked, MAX_SKILL_LEVEL, skillPrerequisite } from "../domain/skills";

const { Text } = Typography;

interface Props {
  data: GameData;
  relevantSkills: string[];
  skillLevels: Map<string, number>;
  onChange: (name: string, level: number) => void;
  onReset: () => void;
  materialEfficiency: number | null;
  onMaterialEfficiencyChange: (value: number | null) => void;
  capComponentCostReduction: number;
  onCapComponentCostReductionChange: (pct: number) => void;
}

/** Level sliders (0..5) for skills + manual material-efficiency override. */
export function SkillsPanel({
  data,
  relevantSkills,
  skillLevels,
  onChange,
  onReset,
  materialEfficiency,
  onMaterialEfficiencyChange,
  capComponentCostReduction,
  onCapComponentCostReductionChange,
}: Props) {
  const { t } = useTranslation();
  const meActive = materialEfficiency != null;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <div>
        <Space style={{ justifyContent: "space-between", width: "100%" }}>
          <Text>
            {t("skills.materialEfficiency")}{" "}
            <Tooltip title={t("skills.materialEfficiencyTooltip")}>
              <Text type="secondary" style={{ cursor: "help" }}>
                ⓘ
              </Text>
            </Tooltip>
          </Text>
          {meActive && (
            <Button size="small" type="text" onClick={() => onMaterialEfficiencyChange(null)}>
              {t("skills.bySkillsReset")}
            </Button>
          )}
        </Space>
        <InputNumber
          style={{ width: "100%", marginTop: 4 }}
          min={50}
          max={150}
          step={1}
          value={materialEfficiency}
          placeholder={t("skills.bySkillsPlaceholder")}
          addonAfter="%"
          onChange={(v) => onMaterialEfficiencyChange(v ?? null)}
        />
      </div>

      <div>
        <Text>
          {t("skills.capDiscount")}{" "}
          <Tooltip title={t("skills.capDiscountTooltip")}>
            <Text type="secondary" style={{ cursor: "help" }}>
              ⓘ
            </Text>
          </Tooltip>
        </Text>
        <InputNumber
          style={{ width: "100%", marginTop: 4 }}
          min={0}
          max={100}
          step={1}
          value={capComponentCostReduction}
          addonAfter="%"
          onChange={(v) => onCapComponentCostReductionChange(v ?? 0)}
        />
      </div>

      {relevantSkills.length === 0 ? (
        <Empty description={t("skills.noSkills")} />
      ) : (
        <>
          <div style={{ textAlign: "right" }}>
            <Button size="small" onClick={onReset}>
              {t("skills.allMax")}
            </Button>
          </div>
          {relevantSkills.map((name) => {
            const skill = data.skillByName.get(name);
            const unlocked = isSkillUnlocked(name, skillLevels);
            const level = effectiveSkillLevel(name, skillLevels);
            const eff = skill && level > 0 ? skill.efficiency[level - 1] : 0;
            const prereq = skillPrerequisite(name);
            const slider = (
              <div key={name} style={{ opacity: meActive ? 0.5 : unlocked ? 1 : 0.5 }}>
                <Space style={{ justifyContent: "space-between", width: "100%" }}>
                  <Text>{name}</Text>
                  <Text type="secondary">{t("skills.levelInfo", { level, eff })}</Text>
                </Space>
                <Slider
                  min={0}
                  max={MAX_SKILL_LEVEL}
                  value={level}
                  marks={{ 0: "0", 5: "5" }}
                  disabled={!unlocked}
                  onChange={(v) => onChange(name, v)}
                />
              </div>
            );
            return prereq && !unlocked ? (
              <Tooltip
                key={name}
                title={t("skills.lockedTooltip", { skill: prereq.name, level: prereq.minLevel })}
              >
                {slider}
              </Tooltip>
            ) : (
              slider
            );
          })}
        </>
      )}
    </Space>
  );
}
