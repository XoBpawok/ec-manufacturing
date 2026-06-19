import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Divider, Space, Spin, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ColumnsType } from "antd/es/table";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { rankCraftProfits, recipeCategories, type CraftProfit } from "../domain/rating";
import { loadDisabledCategories, saveDisabledCategories } from "../store/useCalculator";
import { usePrices } from "../store/usePrices";
import { ItemIcon } from "../components/ItemIcon";
import { RatingPriceDrawer } from "../components/RatingPriceDrawer";
import { formatDuration, formatISK } from "../domain/format";

const { Text } = Typography;

function buildColumns(t: TFunction): ColumnsType<CraftProfit> {
  return [
    {
      title: t("rating.item"),
      dataIndex: "name",
      key: "name",
      render: (_: string, r: CraftProfit) => (
        <Space>
          <ItemIcon src={r.iconUrl} />
          <Link
            to={`/?item=${r.itemId}`}
            title={t("rating.openInCalculator")}
            onClick={(e) => e.stopPropagation()}
          >
            {r.name}
          </Link>
          {r.kind === "reverse" && <Tag color="purple">{t("rating.reverse")}</Tag>}
        </Space>
      ),
    },
    {
      title: t("rating.category"),
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
      title: t("rating.sellPrice"),
      dataIndex: "sellPrice",
      key: "sellPrice",
      align: "right",
      sorter: (a, b) => a.sellPrice - b.sellPrice,
      render: (_: number, r: CraftProfit) => (
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span>
            {formatISK(r.sellPrice)}{" "}
            {r.sellIsOverride && <Tag color="blue" style={{ marginInlineEnd: 0 }}>{t("rating.yours")}</Tag>}
          </span>
          {r.sellIsOverride && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t("common.marketValue", { value: formatISK(r.sellPriceMarket) })}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("rating.craftCost"),
      dataIndex: "craftCost",
      key: "craftCost",
      align: "right",
      sorter: (a, b) => a.craftCost - b.craftCost,
      render: (_: number, r: CraftProfit) => (
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span>{formatISK(r.craftCost)}</span>
          {Math.round(r.craftCostMarket) !== Math.round(r.craftCost) && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t("rating.byMarketValue", { value: formatISK(r.craftCostMarket) })}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t("rating.profit"),
      dataIndex: "profit",
      key: "profit",
      align: "right",
      sorter: (a, b) => a.profit - b.profit,
      render: (v: number) => (
        <Text type={v >= 0 ? "success" : "danger"}>{formatISK(v)}</Text>
      ),
    },
    {
      title: t("rating.margin"),
      dataIndex: "margin",
      key: "margin",
      align: "right",
      sorter: (a, b) => a.margin - b.margin,
      render: (v: number) => `${(v * 100).toFixed(1)}%`,
    },
    {
      title: t("rating.time"),
      dataIndex: "craftTime",
      key: "craftTime",
      align: "right",
      sorter: (a, b) => a.craftTime - b.craftTime,
      render: (v: number) => formatDuration(v),
    },
    {
      title: t("rating.iskPerHour"),
      dataIndex: "profitPerHour",
      key: "profitPerHour",
      align: "right",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.profitPerHour - b.profitPerHour,
      render: (v: number) => formatISK(v),
    },
  ];
}

export function RatingPage() {
  const { t } = useTranslation();
  const columns = useMemo(() => buildColumns(t), [t]);
  const [data, setData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { priceOverrides, priceMeta, pricesLoading, setPriceOverride } = usePrices();
  const [disabledCategories, setDisabledCategories] = useState<Set<string>>(loadDisabledCategories);
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
    saveDisabledCategories(disabledCategories);
  }, [disabledCategories]);

  const toggleCategory = useCallback((category: string) => {
    setDisabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const categories = useMemo(() => (data ? recipeCategories(data) : []), [data]);

  const enabledCategories = useMemo(
    () => new Set(categories.filter((c) => !disabledCategories.has(c))),
    [categories, disabledCategories],
  );

  const allEnabled = enabledCategories.size === categories.length;

  const rows = useMemo(() => {
    if (!data) return [];
    return rankCraftProfits({ data, priceOverrides, levels: new Map(), enabledCategories });
  }, [data, priceOverrides, enabledCategories]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" tip={t("rating.loading")}>
          <div style={{ padding: 40 }} />
        </Spin>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message={t("common.loadErrorTitle")}
        description={error}
        action={
          <Button onClick={() => setReloadKey((k) => k + 1)} icon={<ReloadOutlined />}>
            {t("common.retry")}
          </Button>
        }
        showIcon
      />
    );
  }

  return (
    <Card
      title={
        allEnabled
          ? t("rating.top50")
          : t("rating.top50Selected", { enabled: enabledCategories.size, total: categories.length })
      }
    >
      <Text type="secondary">{t("rating.description")}</Text>
      <div style={{ marginTop: 12 }}>
        <Space size={8} wrap align="center">
          <Text strong>{t("rating.categories")}</Text>
          {categories.map((c) => (
            <Checkbox
              key={c}
              checked={enabledCategories.has(c)}
              onChange={() => toggleCategory(c)}
            >
              {c}
            </Checkbox>
          ))}
          <Divider type="vertical" />
          <Button size="small" onClick={() => setDisabledCategories(new Set())}>
            {t("common.all")}
          </Button>
          <Button size="small" onClick={() => setDisabledCategories(new Set(categories))}>
            {t("common.none")}
          </Button>
        </Space>
      </div>
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
          priceMeta={priceMeta}
          pricesLoading={pricesLoading}
          onPriceChange={setPriceOverride}
          onClose={() => setDrawerItemId(null)}
        />
      )}
    </Card>
  );
}
