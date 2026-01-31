import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import DisplayPage from './pages/DisplayPage';
import SearchPage from './pages/SearchPage';
import PageContainer from './containers/PageContainer'
import 'csh-material-bootstrap/dist/csh-material-bootstrap.css'
import NotFound from './pages/NotFound'
import { OidcSecure } from '@axa-fr/react-oidc';
import { SSOEnabled } from './configuration';
import { MessageProvider } from './contexts/MessageContext';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';

export interface AdminPanelProps {
  adminPanelOpen: boolean;
  setAdminPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

type Props = {
  rerouteHomeOn404?: boolean
}

const App: React.FC<Props> = ({ rerouteHomeOn404 = null }) => {
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  return (
    <Router>
      <AuthProvider>
        <MessageProvider>
          <SocketProvider>
            <PageContainer adminPanelOpen={adminPanelOpen} setAdminPanelOpen={setAdminPanelOpen}>
              <Routes>
                <Route path="/" element={
                  SSOEnabled ? (
                    <OidcSecure>
                      <SearchPage adminPanelOpen={adminPanelOpen} setAdminPanelOpen={setAdminPanelOpen} />
                    </OidcSecure>
                  ) : (
                    <SearchPage adminPanelOpen={adminPanelOpen} setAdminPanelOpen={setAdminPanelOpen} />
                  )
                } />
                <Route path='/display' element={<DisplayPage />} />
                <Route path='*' element={rerouteHomeOn404 ?? true ? (
                  SSOEnabled ? (
                    <OidcSecure>
                      <SearchPage adminPanelOpen={adminPanelOpen} setAdminPanelOpen={setAdminPanelOpen} />
                    </OidcSecure>
                  ) : (
                    <SearchPage adminPanelOpen={adminPanelOpen} setAdminPanelOpen={setAdminPanelOpen} />
                  )
                ) : (
                  <NotFound />
                )} />
              </Routes>
            </PageContainer>
          </SocketProvider>
        </MessageProvider>
      </AuthProvider>
    </Router>
  )
}

export default App