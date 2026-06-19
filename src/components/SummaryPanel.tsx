import { Card, Col, Collapse, InputNumber, Row, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  AggregatedMaterial,
  CategorySubtotal,
  JobRow,
  TreeSummary,
} from "../domain/tree";
import { formatDuration, formatISK, formatISKExact, formatQuantity } from "../domain/format";
import { ItemIcon } from "./ItemIcon";
import { FreshnessDot } from "./FreshnessDot";
import type { PriceEntry } from "../api/prices";

const { Text } = Typography;

interface Props {
  summary: TreeSummary;
  onPriceChange: (itemId: number, price: number) => void;
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  marketPrices: Map<number, number>;
}

export function SummaryPanel({
  summary,
  onPriceChange,
  priceOverrides,
  priceMeta,
  marketPrices,
}: Props) {
  const savings =
    summary.buyFinishedCost != null ? summary.buyFinishedCost - summary.grandTotal : null;

  const materialColumns: ColumnsType<AggregatedMaterial> = [
    {
      title: "Матеріал",
      dataIndex: "name",
      key: "name",
      render: (name: string, m) => (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <ItemIcon src={m.iconUrl} size={20} />
          {name}
        </span>
      ),
    },
    {
      title: "Тип",
      dataIndex: "type",
      key: "type",
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "Кількість",
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      render: (q: number) => formatQuantity(q),
    },
    {
      title: "Ціна/од.",
      key: "unitPrice",
      align: "right",
      render: (_, m) => {
        const overridden = priceOverrides.has(m.itemId);
        const market = marketPrices.get(m.itemId);
        return (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
            <InputNumber
              size="small"
              value={m.unitPrice}
              min={0}
              style={{ width: 130 }}
              status={m.priceKnown ? undefined : "warning"}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => v != null && onPriceChange(m.itemId, Number(v))}
            />
            {overridden && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ринок: {market != null ? formatISKExact(market) : "—"}
                <FreshnessDot updatedAt={priceMeta.get(m.itemId)?.updatedAt} />
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Сума",
      dataIndex: "total",
      key: "total",
      align: "right",
      render: (t: number) => formatISK(t),
    },
  ];

  const categoryColumns: ColumnsType<CategorySubtotal> = [
    { title: "Категорія", dataIndex: "type", key: "type" },
    {
      title: "Кількість",
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      render: (q: number) => formatQuantity(q),
    },
    {
      title: "Сума",
      dataIndex: "total",
      key: "total",
      align: "right",
      render: (t: number) => formatISK(t),
    },
  ];

  const jobColumns: ColumnsType<JobRow> = [
    {
      title: "Елемент",
      dataIndex: "name",
      key: "name",
      render: (name: string, j) => (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <ItemIcon src={j.iconUrl} size={20} />
          {name}
          {j.kind === "reverse" && <Tag color="purple">реверс</Tag>}
        </span>
      ),
    },
    { title: "Jobs", dataIndex: "runs", key: "runs", align: "right" },
    {
      title: "Вартість job",
      dataIndex: "jobCost",
      key: "jobCost",
      align: "right",
      render: (v: number) => formatISK(v),
    },
    {
      title: "Час",
      dataIndex: "jobTime",
      key: "jobTime",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
  ];

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Разом (крафт)" value={Math.round(summary.grandTotal)} suffix="ISK" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Матеріали"
              value={Math.round(summary.totalBuyCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Вартість jobs"
              value={Math.round(summary.totalJobCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Блюпрінти"
              value={Math.round(summary.totalBlueprintCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Купити готовий"
              value={summary.buyFinishedCost != null ? Math.round(summary.buyFinishedCost) : "—"}
              suffix={summary.buyFinishedCost != null ? "ISK" : ""}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            {savings != null ? (
              <Statistic
                title={savings >= 0 ? "Економія від крафту" : "Дорожче за купівлю"}
                value={Math.abs(Math.round(savings))}
                suffix="ISK"
                valueStyle={{ color: savings >= 0 ? "#3f8600" : "#cf1322" }}
              />
            ) : (
              <Statistic title="Економія від крафту" value="—" />
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Загальний час" value={formatDuration(summary.totalTime)} />
          </Card>
        </Col>
      </Row>

      <Collapse
        defaultActiveKey={["shopping"]}
        style={{ marginTop: 16 }}
        items={[
          {
            key: "shopping",
            label: "Список покупок (агреговано)",
            children: (
              <Table<AggregatedMaterial>
                columns={materialColumns}
                dataSource={summary.shoppingList}
                rowKey="itemId"
                pagination={false}
                size="small"
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong>Разом матеріали</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{formatISK(summary.totalBuyCost)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            ),
          },
          {
            key: "categories",
            label: "Підсумки по категоріях",
            children: (
              <Table<CategorySubtotal>
                columns={categoryColumns}
                dataSource={summary.categorySubtotals}
                rowKey="type"
                pagination={false}
                size="small"
              />
            ),
          },
          {
            key: "jobs",
            label: `Виробництво (jobs) — ${summary.jobs.length} елем.`,
            children: (
              <Table<JobRow>
                columns={jobColumns}
                dataSource={summary.jobs}
                rowKey="itemId"
                pagination={false}
                size="small"
              />
            ),
          },
        ]}
      />
    </>
  );
}
