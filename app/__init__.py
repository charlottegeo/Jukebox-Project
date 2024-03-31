#app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from flask_migrate import Migrate
from flask_pyoidc.flask_pyoidc import OIDCAuthentication
from flask_pyoidc.provider_configuration import ProviderConfiguration, ClientMetadata
from config import Config


db = SQLAlchemy()
socketio = SocketIO()
migrate = Migrate()

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
migrate.init_app(app, db)
socketio.init_app(app)

CSH_AUTH = ProviderConfiguration(
    issuer=app.config["OIDC_ISSUER"],
    client_metadata=ClientMetadata(
        app.config["OIDC_CLIENT_ID"], app.config["OIDC_CLIENT_SECRET"]
    ),
)
auth = OIDCAuthentication({"default": CSH_AUTH}, app)
auth.init_app(app)

from app.routes import main as main_blueprint
from app import models, events

app.register_blueprint(main_blueprint)
