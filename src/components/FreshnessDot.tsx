import { Tooltip } from "antd";
import { freshnessColor, freshnessLabel } from "../domain/freshness";

export function FreshnessDot({ updatedAt }: { updatedAt?: string }) {
  if (!updatedAt) return null;
  return (
    <Tooltip title={freshnessLabel(updatedAt)}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: freshnessColor(updatedAt),
          marginLeft: 6,
          verticalAlign: "middle",
        }}
      />
    </Tooltip>
  );
}
