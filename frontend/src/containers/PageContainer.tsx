import { useLocation } from "react-router-dom";
import { Container } from "reactstrap";
import NavBar from "../components/NavBar";

type Props = {
  children: React.ReactNode;
};

export default function PageContainer({ children }: Props) {
  const location = useLocation();
  const isDisplayPage = location.pathname === "/display";

  return (
    <div className="page-and-navbar">
      {!isDisplayPage && <NavBar />}
      <Container className="main" fluid>
        <Container className="main-child">{children}</Container>
      </Container>
    </div>
  );
}