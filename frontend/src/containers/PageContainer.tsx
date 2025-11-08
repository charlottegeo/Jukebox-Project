import React from "react";
import { Container } from "reactstrap";
import { useLocation } from "react-router-dom";
import NavBar from "../components/NavBar";
import './PageContainer.tsx.scss';
import { AdminPanelProps } from "../App";

type Props = {
  children: React.ReactNode;
} & AdminPanelProps;

export const PageContainer: React.FC<Props> = ({ children, adminPanelOpen, setAdminPanelOpen }) => {
  const location = useLocation();

  const isDisplayPage = location.pathname === "/display";

  return (
    <div className={isDisplayPage ? 'full-screen' : 'page'}>
      {!isDisplayPage && <NavBar setAdminPanelOpen={setAdminPanelOpen} />}
      <Container fluid className={isDisplayPage ? 'full-container' : ''}>
        {children}
      </Container>
    </div>
  );
};

export default PageContainer;
