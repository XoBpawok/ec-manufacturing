import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Space, Spin, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { rankCraftProfits, type CraftProfit } from "../domain/rating";
import { loadPriceOverrides, savePriceOverrides } from "../store/useCalculator";
import { ItemIcon } from "../components/ItemIcon";
import { RatingPriceDrawer } from "../components/RatingPriceDrawer";
import { formatDuration, formatISK } from "../domain/format";

const { Text } = Typography;

const columns: ColumnsType<CraftProfit> = [
  {
    title: "Предмет",
    dataIndex: "name",
    key: "name",
    render: (_: string, r: CraftProfit) => (
      <Space>
        <ItemIcon src={r.iconUrl} />
        <span>{r.name}</span>
        {r.kind === "reverse" && <Tag color="purple">реверс</Tag>}
      </Space>
    ),
  },
  {
    title: "Категорія",
    dataIndex: "categoryName",
    key: "categoryName",
    render: (_: string, r: CraftProfit) => (
      <Space direction="vertical" size={0}>
        <span>{r.categoryName}</span>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.groupName}</Text>
      </Space>
    ),
  },
  {
    title: "Ціна продажу",
    dataIndex: "sellPrice",
    key: "sellPrice",
    align: "right",
    sorter: (a, b) => a.sellPrice - b.sellPrice,
    render: (_: number, r: CraftProfit) => (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span>
          {formatISK(r.sellPrice)} {r.sellIsOverride && <Tag color="blue" style={{ marginInlineEnd: 0 }}>своя</Tag>}
        </span>
        {r.sellIsOverride && (
          <Text type="secondary" style={{ fontSize: 11 }}>ринок: {formatISK(r.sellPriceMarket)}</Text>
        )}
      </div>
    ),
  },
  {
    title: "Вартість крафту",
    dataIndex: "craftCost",
    key: "craftCost",
    align: "right",
    sorter: (a, b) => a.craftCost - b.craftCost,
    render: (_: number, r: CraftProfit) => (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span>{formatISK(r.craftCost)}</span>
        {Math.round(r.craftCostMarket) !== Math.round(r.craftCost) && (
          <Text type="secondary" style={{ fontSize: 11 }}>за ринком: {formatISK(r.craftCostMarket)}</Text>
        )}
      </div>
    ),
  },
  {
    title: "Прибуток",
    dataIndex: "profit",
    key: "profit",
    align: "right",
    sorter: (a, b) => a.profit - b.profit,
    render: (v: number) => (
      <Text type={v >= 0 ? "success" : "danger"}>{formatISK(v)}</Text>
    ),
  },
  {
    title: "Маржа",
    dataIndex: "margin",
    key: "margin",
    align: "right",
    sorter: (a, b) => a.margin - b.margin,
    render: (v: number) => `${(v * 100).toFixed(1)}%`,
  },
  {
    title: "Час",
    dataIndex: "craftTime",
    key: "craftTime",
    align: "right",
    sorter: (a, b) => a.craftTime - b.craftTime,
    render: (v: number) => formatDuration(v),
  },
  {
    title: "ISK/год",
    dataIndex: "profitPerHour",
    key: "profitPerHour",
    align: "right",
    defaultSortOrder: "descend",
    sorter: (a, b) => a.profitPerHour - b.profitPerHour,
    render: (v: number) => formatISK(v),
  },
];

export function RatingPage() {
  const [data, setData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(loadPriceOverrides);
  const [drawerItemId, setDrawerItemId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadGameData(reloadKey > 0)
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    savePriceOverrides(priceOverrides);
  }, [priceOverrides]);

  const setPriceOverride = useCallback((itemId: number, price: number | null) => {
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      if (price == null) next.delete(itemId);
      else next.set(itemId, price);
      return next;
    });
  }, []);

  const resetPriceOverrides = useCallback(() => setPriceOverrides(new Map()), []);

  const rows = useMemo(() => {
    if (!data) return [];
    return rankCraftProfits({ data, priceOverrides, levels: new Map() });
  }, [data, priceOverrides]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" tip="Обчислення рейтингу…">
          <div style={{ padding: 40 }} />
        </Spin>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Не вдалося завантажити дані"
        description={error}
        action={
          <Button onClick={() => setReloadKey((k) => k + 1)} icon={<ReloadOutlined />}>
            Повторити
          </Button>
        }
        showIcon
      />
    );
  }

  return (
    <Card
      title="Топ-50 найприбутковіших для крафту"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => setReloadKey((k) => k + 1)}>
          Оновити дані
        </Button>
      }
    >
      <Text type="secondary">
        Вартість крафту рахується «до сировини» на максимальних скілах, із цінами блюпрінтів.
        Збережені (ваші) ціни мають пріоритет; ринкова (середньотижнева) показується поряд.
        Клік на рядок — редагувати ціни виробу, інгредієнтів і блюпрінтів.
      </Text>
      <Table<CraftProfit>
        style={{ marginTop: 16 }}
        rowKey="itemId"
        columns={columns}
        dataSource={rows}
        size="small"
        pagination={false}
        scroll={{ x: true }}
        onRow={(r) => ({
          style: { cursor: "pointer" },
          onClick: () => setDrawerItemId(r.itemId),
        })}
      />
      {data && (
        <RatingPriceDrawer
          open={drawerItemId != null}
          data={data}
          itemId={drawerItemId}
          priceOverrides={priceOverrides}
          onPriceChange={setPriceOverride}
          onResetPrices={resetPriceOverrides}
          onClose={() => setDrawerItemId(null)}
        />
      )}
    </Card>
  );
}
