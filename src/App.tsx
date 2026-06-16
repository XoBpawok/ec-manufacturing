import {
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  InputNumber,
  Layout,
  Row,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
  theme,
} from "antd";
import { ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import ukUA from "antd/locale/uk_UA";
import { ItemSelector } from "./components/ItemSelector";
import { SkillsPanel } from "./components/SkillsPanel";
import { CraftTree } from "./components/CraftTree";
import { SummaryPanel } from "./components/SummaryPanel";
import { useCalculator } from "./store/useCalculator";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function App() {
  const calc = useCalculator();

  return (
    <ConfigProvider locale={ukUA} theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Title level={4} style={{ color: "#fff", margin: 0 }}>
            EVE Echoes — Калькулятор виробництва
          </Title>
        </Header>
        <Content style={{ padding: 24, width: "100%" }}>
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
                <Alert
                  type="warning"
                  showIcon
                  message="Для цього предмета немає блюпрінта"
                />
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
                      />
                    </Card>
                  </Col>
                  <Col xs={24} xl={18}>
                    <Space direction="vertical" size="large" style={{ width: "100%" }}>
                      <SummaryPanel
                        summary={calc.summary}
                        onPriceChange={calc.setPriceOverride}
                        onResetPrices={calc.resetPriceOverrides}
                        priceOverrides={calc.priceOverrides}
                        marketPrices={calc.data.priceByItemId}
                      />
                      <Card title="Дерево крафту" size="small">
                        <CraftTree
                          tree={calc.tree}
                          rootItemId={calc.rootItemId}
                          auto={calc.auto}
                          onToggleBuild={calc.toggleBuild}
                          onPriceChange={calc.setPriceOverride}
                        />
                      </Card>
                    </Space>
                  </Col>
                </Row>
              )}
            </Space>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
