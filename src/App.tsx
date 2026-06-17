import { ConfigProvider, Layout, Menu, Typography, theme } from "antd";
import ukUA from "antd/locale/uk_UA";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Content } = Layout;
const { Title } = Typography;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ConfigProvider locale={ukUA} theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Title level={4} style={{ color: "#fff", margin: 0, whiteSpace: "nowrap" }}>
            EVE Echoes
          </Title>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname === "/rating" ? "/rating" : "/"]}
            onClick={(e) => navigate(e.key)}
            items={[
              { key: "/", label: "Калькулятор" },
              { key: "/rating", label: "Топ прибуткових" },
            ]}
            style={{ flex: 1, minWidth: 0 }}
          />
        </Header>
        <Content style={{ padding: 24, width: "100%" }}>
          <Outlet />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
