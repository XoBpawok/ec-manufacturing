import { useMemo } from "react";
import { Drawer, Card, Col, InputNumber, Row, Space, Statistic, Typography } from "antd";
import type { GameData } from "../api/types";
import { buildTree, summarizeTree, fullBuildSet } from "../domain/tree";
import { SummaryPanel } from "./SummaryPanel";
import { FreshnessDot } from "./FreshnessDot";
import { formatISK, formatISKExact } from "../domain/format";
import type { PriceEntry } from "../api/prices";

const { Text } = Typography;

interface Props {
  open: boolean;
  data: GameData;
  itemId: number | null;
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  onPriceChange: (itemId: number, price: number) => void;
  onClose: () => void;
}

export function RatingPriceDrawer({
  open,
  data,
  itemId,
  priceOverrides,
  priceMeta,
  onPriceChange,
  onClose,
}: Props) {
  const recipe = itemId != null ? data.recipeByItemId.get(itemId) : undefined;

  const { summary } = useMemo(() => {
    if (itemId == null || !data.recipeByItemId.has(itemId)) {
      return { summary: null };
    }
    const params = {
      data,
      rootItemId: itemId,
      desiredQty: 1,
      levels: new Map<string, number>(),
      materialEfficiency: null,
      buildSet: fullBuildSet(data, itemId),
      priceOverrides,
      capComponentCostReduction: 0,
    };
    const t = buildTree(params);
    return { summary: summarizeTree(t, params) };
  }, [data, itemId, priceOverrides]);

  const market = itemId != null ? data.priceByItemId.get(itemId) : undefined;
  const sellOverride = itemId != null ? priceOverrides.get(itemId) : undefined;
  const sell = sellOverride ?? market ?? 0;
  const craftCost = summary?.grandTotal ?? 0;
  const profit = sell - craftCost;

  return (
    <Drawer
      width={760}
      open={open}
      onClose={onClose}
      title={recipe ? `Ціни: ${recipe.name}` : "Ціни"}
    >
      {itemId == null || summary == null ? null : (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small" title="Ціна готового виробу (продаж)">
            <Space align="end" wrap size="large">
              <div style={{ display: "inline-flex", flexDirection: "column" }}>
                <Text type="secondary">Ваша ціна продажу</Text>
                <InputNumber
                  value={sellOverride ?? market ?? 0}
                  min={0}
                  style={{ width: 180 }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
                  parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
                  onChange={(v) => v != null && onPriceChange(itemId, Number(v))}
                />
                {sellOverride != null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    ринок: {market != null ? formatISKExact(market) : "—"}
                    <FreshnessDot updatedAt={priceMeta.get(itemId)?.updatedAt} />
                  </Text>
                )}
              </div>
            </Space>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={12} md={8}>
                <Statistic title="Вартість крафту" value={Math.round(craftCost)} suffix="ISK" />
              </Col>
              <Col xs={12} md={8}>
                <Statistic
                  title="Прибуток"
                  value={Math.round(profit)}
                  suffix="ISK"
                  valueStyle={{ color: profit >= 0 ? "#3f8600" : "#cf1322" }}
                />
              </Col>
              <Col xs={12} md={8}>
                <Statistic
                  title="Маржа"
                  value={craftCost > 0 ? (profit / craftCost) * 100 : 0}
                  precision={1}
                  suffix="%"
                />
              </Col>
            </Row>
          </Card>

          <Text type="secondary">
            Ціни інгредієнтів (сировина) і блюпрінтів. Збережені ціни мають пріоритет; під полем —
            ринкова (середньотижнева) ціна. {formatISK(craftCost)} — поточна вартість крафту.
          </Text>

          <SummaryPanel
            summary={summary}
            onPriceChange={onPriceChange}
            priceOverrides={priceOverrides}
            priceMeta={priceMeta}
            marketPrices={data.priceByItemId}
          />
        </Space>
      )}
    </Drawer>
  );
}
