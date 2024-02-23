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

    def to_dict(self):
        return {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'track_length': self.track_length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
            'bpm': self.bpm,
        }
