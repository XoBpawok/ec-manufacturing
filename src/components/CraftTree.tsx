import { InputNumber, Switch, Table, Tag, Tooltip, Typography } from "antd";
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
}: Props) {
  const columns: ColumnsType<BuildNode> = [
    {
      title: "Предмет",
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
              блюпрінт
            </Tag>
          )}
          {node.mode === "build" ? (
            node.recipeKind === "reverse" ? (
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                реверс ×{node.runs} (≈{node.attempts.toFixed(1)} спроб)
              </Tag>
            ) : (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                крафт ×{node.runs}
              </Tag>
            )
          ) : (
            <Tag style={{ marginInlineEnd: 0 }}>купити</Tag>
          )}
          {!node.priceKnown && node.mode === "buy" && (
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              ціна невідома
            </Tag>
          )}
        </Space2>
      ),
    },
    {
      title: "Тип",
      dataIndex: "type",
      key: "type",
      width: 200,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "Кількість",
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      width: 130,
      render: (q: number) => formatQuantity(q),
    },
    {
      title: "Ціна/од.",
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
              style={{ width: 140 }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => v != null && onPriceChange(node.itemId, Number(v))}
            />
            {priceOverrides.has(node.itemId) && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ринок: {marketPrices.get(node.itemId) != null ? formatISKExact(marketPrices.get(node.itemId)!) : "—"}
                <FreshnessDot updatedAt={priceMeta.get(node.itemId)?.updatedAt} />
              </Text>
            )}
          </div>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Вартість",
      key: "nodeTotal",
      align: "right",
      width: 170,
      render: (_, node) => <Text>{formatISK(node.nodeTotal)}</Text>,
    },
    {
      title: "Job (вартість / час)",
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
      title: "Режим",
      key: "toggle",
      width: 120,
      render: (_, node) => {
        const isRoot = node.itemId === rootItemId;
        return (
          <Tooltip
            title={
              auto
                ? "Вимкніть авто-оптимізацію для ручного вибору"
                : isRoot
                  ? "Кінцевий предмет завжди крафтиться"
                  : !node.craftable
                    ? "Немає рецепта — лише купити"
                    : "Перемкнути крафт / купити"
            }
          >
            <Switch
              size="small"
              checkedChildren="крафт"
              unCheckedChildren="купити"
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

// невеликий інлайн-флекс, щоб не тягнути Space у кожен рядок із дефолтними відступами
function Space2({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{children}</span>;
}
