import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-secret-key'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() in ('true', '1', 't')
    SESSION_COOKIE_SAMESITE = 'Lax'
    OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "https://sso.csh.rit.edu/auth/realms/csh")
    OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "catjam-app")
    OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "NOT-A-SECRET")
    OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "http://localhost:5000/oidc_callback")
