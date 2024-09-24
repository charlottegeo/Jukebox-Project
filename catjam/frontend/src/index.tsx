import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { OidcProvider, OidcSecure } from '@axa-fr/react-oidc';
import configuration from './configuration';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OidcProvider configuration={configuration}>
      <OidcSecure>
        <App />
      </OidcSecure>
    </OidcProvider>
  </StrictMode>
);
