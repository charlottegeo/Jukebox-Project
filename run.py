from app import app, socketio
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    socketio.run(app, debug=True)
