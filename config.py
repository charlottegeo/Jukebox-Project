import os
from os import environ as env
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('CATJAM_DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    OIDC_ISSUER = env.get("OIDC_ISSUER", "https://sso.csh.rit.edu/auth/realms/csh")
    OIDC_CLIENT_ID = env.get("OIDC_CLIENT_ID", "deadass")
    OIDC_CLIENT_SECRET = env.get("OIDC_CLIENT_SECRET", "NOT-A-SECRET")
    OIDC_REDIRECT_URI = env.get("OIDC_REDIRECT_URI", "https://catjam.cs.house/oidc_callback")