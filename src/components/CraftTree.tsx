import { InputNumber, Switch, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { BuildNode } from "../domain/tree";
import { formatDuration, formatISK, formatQuantity } from "../domain/format";

const { Text } = Typography;

interface Props {
  tree: BuildNode;
  rootItemId: number;
  onToggleBuild: (itemId: number) => void;
  onPriceChange: (itemId: number, price: number | null) => void;
}

export function CraftTree({ tree, rootItemId, onToggleBuild, onPriceChange }: Props) {
  const columns: ColumnsType<BuildNode> = [
    {
      title: "Предмет",
      dataIndex: "name",
      key: "name",
      render: (_, node) => (
        <Space2>
          <Text strong={node.itemId === rootItemId}>{node.name}</Text>
          {node.mode === "build" ? (
            <Tag color="blue">крафт ×{node.runs}</Tag>
          ) : (
            <Tag>купити</Tag>
          )}
          {!node.priceKnown && node.mode === "buy" && <Tag color="orange">ціна невідома</Tag>}
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
          <InputNumber
            size="small"
            value={node.unitPrice}
            min={0}
            style={{ width: 140 }}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
            parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
            onChange={(v) => onPriceChange(node.itemId, v == null ? null : Number(v))}
          />
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
              isRoot
                ? "Кінцевий предмет завжди крафтиться"
                : !node.craftable
                  ? "Немає блюпрінта — лише купити"
                  : "Перемкнути крафт / купити"
            }
          >
            <Switch
              size="small"
              checkedChildren="крафт"
              unCheckedChildren="купити"
              checked={node.mode === "build"}
              disabled={isRoot || !node.craftable}
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
      defaultExpandedRowKeys={[tree.key]}
      expandable={{ childrenColumnName: "children" }}
    />
  );
}

// невеликий інлайн-флекс, щоб не тягнути Space у кожен рядок із дефолтними відступами
function Space2({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{children}</span>;
}
