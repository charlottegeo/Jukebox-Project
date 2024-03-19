#app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from flask_migrate import Migrate
from config import Config
from app.routes import main as main_blueprint

db = SQLAlchemy()
socketio = SocketIO()
migrate = Migrate()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    db.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app)
    
    app.register_blueprint(main_blueprint)
    
    from app import models, events

    return app
