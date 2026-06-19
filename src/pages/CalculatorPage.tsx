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

const { Text } = Typography;

export function CalculatorPage() {
  const calc = useCalculator();

  return (
    <>
      {calc.loading && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" tip="Завантаження даних гри…">
            <div style={{ padding: 40 }} />
          </Spin>
        </div>
      )}

      {calc.error && (
        <Alert
          type="error"
          message="Не вдалося завантажити дані"
          description={calc.error}
          action={
            <Button onClick={calc.refresh} icon={<ReloadOutlined />}>
              Повторити
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
                <Text type="secondary">Предмет</Text>
                <ItemSelector
                  data={calc.data}
                  value={calc.rootItemId}
                  onChange={calc.setRootItemId}
                />
              </Space>
              <Space direction="vertical" size={2}>
                <Text type="secondary">Кількість</Text>
                <InputNumber
                  min={1}
                  value={calc.desiredQty}
                  onChange={(v) => calc.setDesiredQty(Number(v) || 1)}
                />
              </Space>
              <Space direction="vertical" size={2}>
                <Text type="secondary">
                  <ThunderboltOutlined /> Авто-оптимізація
                </Text>
                <Tooltip title="Автоматично вибирати дешевше: купити чи крафтити (включно з реверс-інжинірингом) для кожного компонента">
                  <Switch
                    checked={calc.auto}
                    onChange={calc.setAuto}
                    checkedChildren="авто"
                    unCheckedChildren="вручну"
                  />
                </Tooltip>
              </Space>
              <Button icon={<ReloadOutlined />} onClick={calc.refresh}>
                Оновити дані
              </Button>
            </Space>
          </Card>

          {!calc.tree || !calc.summary ? (
            <Alert type="warning" showIcon message="Для цього предмета немає блюпрінта" />
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={6}>
                <Card title="Скіли індустрії" size="small">
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
                    onPriceChange={calc.setPriceOverride}
                    priceOverrides={calc.priceOverrides}
                    priceMeta={calc.priceMeta}
                    marketPrices={calc.data.priceByItemId}
                  />
                  <Collapse
                    items={[
                      {
                        key: "tree",
                        label: "Дерево крафту",
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
