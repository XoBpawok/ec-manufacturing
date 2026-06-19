import { Alert, Card, Col, Collapse, InputNumber, Row, Spin, Statistic, Table, Tag, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
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
  rootItemId: number;
  onPriceChange: (itemId: number, price: number) => void;
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  marketPrices: Map<number, number>;
  // While prices are still loading from the database, editing is disabled: a fresh
  // fetch replaces the whole price map, so an edit made mid-load would be lost.
  pricesLoading?: boolean;
}

export function SummaryPanel({
  summary,
  rootItemId,
  onPriceChange,
  priceOverrides,
  priceMeta,
  marketPrices,
  pricesLoading = false,
}: Props) {
  const { t } = useTranslation();

  // Finished item price, editable like any material override.
  const finishedOverridden = priceOverrides.has(rootItemId);
  const finishedMarket = marketPrices.get(rootItemId);
  const finishedUnitPrice = priceOverrides.get(rootItemId) ?? finishedMarket ?? 0;
  const finishedPriceKnown = finishedOverridden || finishedMarket != null;
  const savings =
    summary.buyFinishedCost != null ? summary.buyFinishedCost - summary.grandTotal : null;
  // Show the total caption only when buying more than one unit (unit price ≠ total).
  const showFinishedTotal =
    summary.buyFinishedCost != null &&
    Math.round(summary.buyFinishedCost) !== Math.round(finishedUnitPrice);

  const materialColumns: ColumnsType<AggregatedMaterial> = [
    {
      title: t("summary.material"),
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
      title: t("summary.type"),
      dataIndex: "type",
      key: "type",
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: t("summary.quantity"),
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      render: (q: number) => formatQuantity(q),
    },
    {
      title: t("summary.unitPrice"),
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
              disabled={pricesLoading}
              style={{ width: 130 }}
              status={m.priceKnown ? undefined : "warning"}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => v != null && onPriceChange(m.itemId, Number(v))}
            />
            {overridden && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t("common.marketValue", { value: market != null ? formatISKExact(market) : "—" })}
                <FreshnessDot updatedAt={priceMeta.get(m.itemId)?.updatedAt} />
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: t("summary.sum"),
      dataIndex: "total",
      key: "total",
      align: "right",
      render: (value: number) => formatISK(value),
    },
  ];

  const categoryColumns: ColumnsType<CategorySubtotal> = [
    { title: t("summary.category"), dataIndex: "type", key: "type" },
    {
      title: t("summary.quantity"),
      dataIndex: "quantity",
      key: "quantity",
      align: "right",
      render: (q: number) => formatQuantity(q),
    },
    {
      title: t("summary.sum"),
      dataIndex: "total",
      key: "total",
      align: "right",
      render: (value: number) => formatISK(value),
    },
  ];

  const jobColumns: ColumnsType<JobRow> = [
    {
      title: t("summary.element"),
      dataIndex: "name",
      key: "name",
      render: (name: string, j) => (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <ItemIcon src={j.iconUrl} size={20} />
          {name}
          {j.kind === "reverse" && <Tag color="purple">{t("summary.reverse")}</Tag>}
        </span>
      ),
    },
    { title: t("summary.jobs"), dataIndex: "runs", key: "runs", align: "right" },
    {
      title: t("summary.jobCost"),
      dataIndex: "jobCost",
      key: "jobCost",
      align: "right",
      render: (v: number) => formatISK(v),
    },
    {
      title: t("summary.time"),
      dataIndex: "jobTime",
      key: "jobTime",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
  ];

  return (
    <>
      {pricesLoading && (
        <Alert
          type="info"
          showIcon
          icon={<Spin size="small" />}
          message={t("summary.pricesLoading")}
          style={{ marginBottom: 16 }}
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t("summary.totalCraft")} value={Math.round(summary.grandTotal)} suffix="ISK" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("summary.materials")}
              value={Math.round(summary.totalBuyCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("summary.jobsCost")}
              value={Math.round(summary.totalJobCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("summary.blueprints")}
              value={Math.round(summary.totalBlueprintCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text type="secondary">{t("summary.buyFinished")}</Text>
              <EditOutlined style={{ color: "rgba(0,0,0,0.25)", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
              <InputNumber
                variant="borderless"
                controls={false}
                value={finishedUnitPrice}
                min={0}
                disabled={pricesLoading}
                status={finishedPriceKnown ? undefined : "warning"}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
                parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
                onChange={(v) => v != null && onPriceChange(rootItemId, Number(v))}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              />
              <Text type="secondary" style={{ fontSize: 14 }}>
                ISK
              </Text>
            </div>
            {(finishedOverridden || showFinishedTotal) && (
              <div style={{ marginTop: 2, display: "flex", flexDirection: "column" }}>
                {finishedOverridden && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t("common.marketValue", {
                      value: finishedMarket != null ? formatISKExact(finishedMarket) : "—",
                    })}
                    <FreshnessDot updatedAt={priceMeta.get(rootItemId)?.updatedAt} />
                  </Text>
                )}
                {showFinishedTotal && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t("summary.finishedTotal", { value: formatISK(summary.buyFinishedCost!) })}
                  </Text>
                )}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            {savings != null ? (
              <Statistic
                title={savings >= 0 ? t("summary.savings") : t("summary.moreExpensive")}
                value={Math.abs(Math.round(savings))}
                suffix="ISK"
                valueStyle={{ color: savings >= 0 ? "#3f8600" : "#cf1322" }}
              />
            ) : (
              <Statistic title={t("summary.savings")} value="—" />
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t("summary.totalTime")} value={formatDuration(summary.totalTime)} />
          </Card>
        </Col>
      </Row>

      <Collapse
        defaultActiveKey={["shopping"]}
        style={{ marginTop: 16 }}
        items={[
          {
            key: "shopping",
            label: t("summary.shoppingList"),
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
                      <Text strong>{t("summary.totalMaterials")}</Text>
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
            label: t("summary.categorySubtotals"),
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
            label: t("summary.production", { count: summary.jobs.length }),
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
