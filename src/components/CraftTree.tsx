import { InputNumber, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { ColumnsType } from "antd/es/table";
import type { BuildNode } from "../domain/tree";
import { formatDuration, formatISK, formatISKExact, formatQuantity } from "../domain/format";
import { ItemIcon } from "./ItemIcon";
import { FreshnessDot } from "./FreshnessDot";
import type { PriceEntry } from "../api/prices";

const { Text } = Typography;

interface Props {
  tree: BuildNode;
  rootItemId: number;
  auto: boolean;
  onToggleBuild: (itemId: number) => void;
  onPriceChange: (itemId: number, price: number) => void;
  priceOverrides: Map<number, number>;
  marketPrices: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  pricesLoading?: boolean;
}

export function CraftTree({
  tree,
  rootItemId,
  auto,
  onToggleBuild,
  onPriceChange,
  priceOverrides,
  marketPrices,
  priceMeta,
  pricesLoading = false,
}: Props) {
  const { t } = useTranslation();
  const columns: ColumnsType<BuildNode> = [
    {
      title: t("tree.item"),
      dataIndex: "name",
      key: "name",
      width: 380,
      render: (_, node) => (
        <Space2>
          <ItemIcon src={node.iconUrl} />
          <Text strong={node.itemId === rootItemId} style={{ whiteSpace: "nowrap" }}>
            {node.name}
          </Text>
          {node.isBlueprint && (
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>
              {t("tree.blueprint")}
            </Tag>
          )}
          {node.mode === "build" ? (
            node.recipeKind === "reverse" ? (
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                {t("tree.reverseTag", { runs: node.runs, attempts: node.attempts.toFixed(1) })}
              </Tag>
            ) : (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {t("tree.craftTag", { runs: node.runs })}
              </Tag>
            )
          ) : (
            <Tag style={{ marginInlineEnd: 0 }}>{t("tree.buyTag")}</Tag>
          )}
          {!node.priceKnown && node.mode === "buy" && (
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              {t("tree.priceUnknown")}
            </Tag>
          )}
        </Space2>
      ),
    },
    {
      title: t("tree.type"),
      dataIndex: "type",
      key: "type",
      width: 200,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: t("tree.quantity"),
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      width: 130,
      render: (q: number) => formatQuantity(q),
    },
    {
      title: t("tree.unitPrice"),
      key: "unitPrice",
      align: "right",
      width: 160,
      render: (_, node) =>
        node.mode === "buy" ? (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
            <InputNumber
              size="small"
              value={node.unitPrice}
              min={0}
              disabled={pricesLoading}
              style={{ width: 140 }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => v != null && onPriceChange(node.itemId, Number(v))}
            />
            {priceOverrides.has(node.itemId) && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t("common.marketValue", {
                  value:
                    marketPrices.get(node.itemId) != null
                      ? formatISKExact(marketPrices.get(node.itemId)!)
                      : "—",
                })}
                <FreshnessDot updatedAt={priceMeta.get(node.itemId)?.updatedAt} />
              </Text>
            )}
          </div>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t("tree.cost"),
      key: "nodeTotal",
      align: "right",
      width: 170,
      render: (_, node) => <Text>{formatISK(node.nodeTotal)}</Text>,
    },
    {
      title: t("tree.job"),
      key: "job",
      align: "right",
      width: 200,
      render: (_, node) =>
        node.mode === "build" ? (
          <Text type="secondary">
            {formatISK(node.jobCost)} · {formatDuration(node.jobTime)}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t("tree.mode"),
      key: "toggle",
      width: 120,
      render: (_, node) => {
        const isRoot = node.itemId === rootItemId;
        return (
          <Tooltip
            title={
              auto
                ? t("tree.toggleAuto")
                : isRoot
                  ? t("tree.toggleRoot")
                  : !node.craftable
                    ? t("tree.toggleNoRecipe")
                    : t("tree.toggleSwitch")
            }
          >
            <Switch
              size="small"
              checkedChildren={t("tree.craft")}
              unCheckedChildren={t("tree.buy")}
              checked={node.mode === "build"}
              disabled={auto || isRoot || !node.craftable}
              onChange={() => onToggleBuild(node.itemId)}
            />
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Table<BuildNode>
      columns={columns}
      dataSource={[tree]}
      rowKey="key"
      pagination={false}
      size="small"
      scroll={{ x: "max-content" }}
      defaultExpandedRowKeys={[tree.key]}
      expandable={{ childrenColumnName: "children" }}
    />
  );
}

// Small inline flex to avoid pulling Space into every row with its default gaps.
function Space2({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{children}</span>;
}
