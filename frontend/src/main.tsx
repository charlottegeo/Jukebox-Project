import React from 'react'
import ReactDOM from 'react-dom/client'
import 'csh-material-bootstrap/dist/csh-material-bootstrap.css'
import './styles/global.scss'
import App from './App'
import { OidcProvider } from '@axa-fr/react-oidc'
import configuration from './configuration'
import Authenticating from './callbacks/Authenticating'
import AuthenticationError from './callbacks/AuthenticationError'
import Loading from './callbacks/Loading'
import SessionLost from './callbacks/SessionLost'
import { HelmetProvider } from 'react-helmet-async'


import "material-icons/iconfont/filled.css";
import "material-icons/iconfont/outlined.css";

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <OidcProvider
        configuration={configuration}
        authenticatingComponent={Authenticating}
        authenticatingErrorComponent={AuthenticationError}
        loadingComponent={Loading}
        sessionLostComponent={SessionLost}
      >
        <App />
      </OidcProvider>
    </HelmetProvider>
  </React.StrictMode>
);