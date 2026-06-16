import { Card, Col, InputNumber, Row, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  AggregatedMaterial,
  CategorySubtotal,
  JobRow,
  TreeSummary,
} from "../domain/tree";
import { formatDuration, formatISK, formatQuantity } from "../domain/format";

const { Text } = Typography;

interface Props {
  summary: TreeSummary;
  onPriceChange: (itemId: number, price: number | null) => void;
}

export function SummaryPanel({ summary, onPriceChange }: Props) {
  const savings =
    summary.buyFinishedCost != null ? summary.buyFinishedCost - summary.grandTotal : null;

  const materialColumns: ColumnsType<AggregatedMaterial> = [
    { title: "Матеріал", dataIndex: "name", key: "name" },
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
      render: (_, m) => (
        <InputNumber
          size="small"
          value={m.unitPrice}
          min={0}
          style={{ width: 130 }}
          status={m.priceKnown ? undefined : "warning"}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
          parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
          onChange={(v) => onPriceChange(m.itemId, v == null ? null : Number(v))}
        />
      ),
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
    { title: "Елемент", dataIndex: "name", key: "name" },
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
            <Statistic title="Загальний час" value={formatDuration(summary.totalTime)} />
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
      </Row>

      <Card title="Список покупок (агреговано)" style={{ marginTop: 16 }} size="small">
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
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Підсумки по категоріях" size="small">
            <Table<CategorySubtotal>
              columns={categoryColumns}
              dataSource={summary.categorySubtotals}
              rowKey="type"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Виробництво (jobs)"
            size="small"
            extra={<Tag color="blue">{summary.jobs.length} елем.</Tag>}
          >
            <Table<JobRow>
              columns={jobColumns}
              dataSource={summary.jobs}
              rowKey="itemId"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
