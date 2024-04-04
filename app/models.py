#app/models.py
from app import db

class Song(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    track_name = db.Column(db.String(255), nullable=False)
    artist_name = db.Column(db.String(255), nullable=False)
    track_length = db.Column(db.String(255), nullable=False)
    cover_url = db.Column(db.String(255), nullable=False)
    track_id = db.Column(db.String(255), nullable=False)
    uri = db.Column(db.String(255), nullable=False)
    bpm = db.Column(db.Integer, default=0)
    username = db.Column(db.String(255), nullable=False)

    def to_dict(self):
        return {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'track_length': self.track_length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
            'bpm': self.bpm,
            'username': self.username,
        }

class Queue(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    song_id = db.Column(db.Integer, db.ForeignKey('song.id'), nullable=False)
    song = db.relationship('Song', backref=db.backref('queue', lazy=True))