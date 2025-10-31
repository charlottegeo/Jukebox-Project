import React from 'react'
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

type Props = {
  rerouteHomeOn404?: boolean
}

const App: React.FC<Props> = ({ rerouteHomeOn404 = null }) => {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <MessageProvider>
            <PageContainer>
              <Routes>
                <Route path="/" element={
                  SSOEnabled ? (
                    <OidcSecure>
                      <SearchPage />
                    </OidcSecure>
                  ) : (
                    <SearchPage />
                  )
                } />
                <Route path='/display' element={<DisplayPage />} />
                <Route path='*' element={rerouteHomeOn404 ?? true ? (
                  SSOEnabled ? (
                    <OidcSecure>
                      <SearchPage />
                    </OidcSecure>
                  ) : (
                    <SearchPage />
                  )
                ) : (
                  <NotFound />
                )} />
              </Routes>
            </PageContainer>
          </MessageProvider>
        </SocketProvider>
      </AuthProvider>
    </Router>
  )
}

export default App