import React from "react";
import { Container } from "reactstrap";
import { useLocation } from "react-router-dom";
import NavBar from "../components/NavBar";
import './PageContainer.tsx.scss';

type Props = {
  children: React.ReactNode;
};

export const PageContainer: React.FC<Props> = ({ children }) => {
  const location = useLocation();

  const isDisplayPage = location.pathname === "/display";

  return (
    <div className={isDisplayPage ? 'full-screen' : 'page'}>
      {!isDisplayPage && <NavBar />} {/* Render NavBar only if it's not the display page */}
      <Container fluid className={isDisplayPage ? 'full-container' : ''}>
        {children}
      </Container>
    </div>
  );
};

export default PageContainer;
