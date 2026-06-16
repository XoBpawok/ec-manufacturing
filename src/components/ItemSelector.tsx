import { Select } from "antd";
import { useMemo } from "react";
import type { GameData } from "../api/types";

interface Props {
  data: GameData;
  value: number;
  onChange: (id: number) => void;
}

/** Пошуковий вибір craftable-предмета (лише ті, що мають блюпрінт). */
export function ItemSelector({ data, value, onChange }: Props) {
  const options = useMemo(() => {
    return data.craftables.map((it) => ({
      value: it.id,
      label: `${it.name} — ${it.groupName}`,
    }));
  }, [data]);

  return (
    <Select
      showSearch
      style={{ minWidth: 360 }}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Виберіть предмет"
      filterOption={(input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
      }
    />
  );
}
