import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  InputNumber,
  Row,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { ItemSelector } from "../components/ItemSelector";
import { SkillsPanel } from "../components/SkillsPanel";
import { CraftTree } from "../components/CraftTree";
import { SummaryPanel } from "../components/SummaryPanel";
import { useCalculator } from "../store/useCalculator";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

export function CalculatorPage() {
  const calc = useCalculator();
  const { t } = useTranslation();

  return (
    <>
      {calc.loading && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" tip={t("calc.loading")}>
            <div style={{ padding: 40 }} />
          </Spin>
        </div>
      )}

      {calc.error && (
        <Alert
          type="error"
          message={t("common.loadErrorTitle")}
          description={calc.error}
          action={
            <Button onClick={calc.refresh} icon={<ReloadOutlined />}>
              {t("common.retry")}
            </Button>
          }
          showIcon
        />
      )}

      {calc.data && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small">
            <Space wrap align="center" size="large">
              <Space direction="vertical" size={2}>
                <Text type="secondary">{t("calc.item")}</Text>
                <ItemSelector
                  data={calc.data}
                  value={calc.rootItemId}
                  onChange={calc.setRootItemId}
                />
              </Space>
              <Space direction="vertical" size={2}>
                <Text type="secondary">{t("calc.quantity")}</Text>
                <InputNumber
                  min={1}
                  value={calc.desiredQty}
                  onChange={(v) => calc.setDesiredQty(Number(v) || 1)}
                />
              </Space>
              <Space direction="vertical" size={2}>
                <Text type="secondary">
                  <ThunderboltOutlined /> {t("calc.autoOptimize")}
                </Text>
                <Tooltip title={t("calc.autoTooltip")}>
                  <Switch
                    checked={calc.auto}
                    onChange={calc.setAuto}
                    checkedChildren={t("calc.auto")}
                    unCheckedChildren={t("calc.manual")}
                  />
                </Tooltip>
              </Space>
            </Space>
          </Card>

          {!calc.tree || !calc.summary ? (
            <Alert type="warning" showIcon message={t("calc.noBlueprint")} />
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={6}>
                <Card title={t("calc.skillsTitle")} size="small">
                  <SkillsPanel
                    data={calc.data}
                    relevantSkills={calc.summary.relevantSkills}
                    skillLevels={calc.skillLevels}
                    onChange={calc.setSkillLevel}
                    onReset={calc.resetSkills}
                    materialEfficiency={calc.materialEfficiency}
                    onMaterialEfficiencyChange={calc.setMaterialEfficiency}
                    capComponentCostReduction={calc.capComponentCostReduction}
                    onCapComponentCostReductionChange={calc.setCapComponentCostReduction}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={18}>
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
                  <SummaryPanel
                    summary={calc.summary}
                    rootItemId={calc.rootItemId}
                    onPriceChange={calc.setPriceOverride}
                    priceOverrides={calc.priceOverrides}
                    priceMeta={calc.priceMeta}
                    marketPrices={calc.data.priceByItemId}
                    pricesLoading={calc.pricesLoading}
                  />
                  <Collapse
                    items={[
                      {
                        key: "tree",
                        label: t("calc.craftTree"),
                        children: (
                          <CraftTree
                            tree={calc.tree}
                            rootItemId={calc.rootItemId}
                            auto={calc.auto}
                            onToggleBuild={calc.toggleBuild}
                            onPriceChange={calc.setPriceOverride}
                            priceOverrides={calc.priceOverrides}
                            priceMeta={calc.priceMeta}
                            marketPrices={calc.data.priceByItemId}
                            pricesLoading={calc.pricesLoading}
                          />
                        ),
                      },
                    ]}
                  />
                </Space>
              </Col>
            </Row>
          )}
        </Space>
      )}
    </>
  );
}
