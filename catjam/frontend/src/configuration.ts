import { OidcConfiguration } from "@axa-fr/react-oidc";

const oidcConfig: OidcConfiguration = {
  client_id: process.env.REACT_APP_SSO_CLIENT_ID ?? 'catjam-app',
  redirect_uri: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/oidc_callback`,
  scope: 'openid profile email',
  authority: process.env.REACT_APP_SSO_AUTHORITY ?? 'https://sso.csh.rit.edu/auth/realms/csh',
  silent_redirect_uri: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/silent_renew`,
};

export const SSOEnabled = (process.env.REACT_APP_SSO_ENABLED ?? 'true') === 'true';

export default oidcConfig;
