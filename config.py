import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('CATJAM_DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
