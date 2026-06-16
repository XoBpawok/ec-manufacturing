import { Button, Empty, Slider, Space, Typography } from "antd";
import type { GameData } from "../api/types";
import { MAX_SKILL_LEVEL } from "../domain/skills";

const { Text } = Typography;

interface Props {
  data: GameData;
  relevantSkills: string[];
  skillLevels: Map<string, number>;
  onChange: (name: string, level: number) => void;
  onReset: () => void;
}

/** Слайдери рівнів (0..5) для скілів, задіяних у поточному дереві. */
export function SkillsPanel({ data, relevantSkills, skillLevels, onChange, onReset }: Props) {
  if (relevantSkills.length === 0) {
    return <Empty description="Немає скілів для цього предмета" />;
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <div style={{ textAlign: "right" }}>
        <Button size="small" onClick={onReset}>
          Усі на макс (5)
        </Button>
      </div>
      {relevantSkills.map((name) => {
        const skill = data.skillByName.get(name);
        const level = skillLevels.get(name) ?? MAX_SKILL_LEVEL;
        const eff = skill && level > 0 ? skill.efficiency[level - 1] : 0;
        return (
          <div key={name}>
            <Space style={{ justifyContent: "space-between", width: "100%" }}>
              <Text>{name}</Text>
              <Text type="secondary">
                рів. {level} · −{eff}% матеріалів
              </Text>
            </Space>
            <Slider
              min={0}
              max={MAX_SKILL_LEVEL}
              value={level}
              marks={{ 0: "0", 5: "5" }}
              onChange={(v) => onChange(name, v)}
            />
          </div>
        );
      })}
    </Space>
  );
}
