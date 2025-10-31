import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.scss'
import App from './App'
import { OidcProvider } from '@axa-fr/react-oidc'
import configuration from './configuration'
import { SSOEnabled } from './configuration'
import Authenticating from './callbacks/Authenticating'
import AuthenticationError from './callbacks/AuthenticationError'
import Loading from './callbacks/Loading'
import SessionLost from './callbacks/SessionLost'

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(
  <>
    {
      SSOEnabled ?
        <OidcProvider
          configuration={configuration}
          authenticatingComponent={Authenticating}
          authenticatingErrorComponent={AuthenticationError}
          loadingComponent={Loading}
          sessionLostComponent={SessionLost}
        >
          <App />
        </OidcProvider>
        : <App />
    }
  </>
)