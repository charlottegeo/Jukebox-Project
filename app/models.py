class Song:
    def __init__(self, track_name, artist_name, track_length, cover_url, track_id, uri, bpm, uid):
        self.track_name = track_name
        self.artist_name = artist_name
        self.track_length = track_length
        self.cover_url = cover_url
        self.track_id = track_id
        self.uri = uri
        self.bpm = bpm
        self.uid = uid

    def to_dict(self):
        return {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'track_length': self.track_length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
            'bpm': self.bpm,
            'uid': self.uid,
        }

class UserQueue:
    def __init__(self, uid):
        self.uid = uid
        self.queue = []

    def add_song(self, song):
        self.queue.append(song)

    def remove_song(self):
        if self.queue:
            return self.queue.pop(0)
        return None

    def get_queue(self):
        return [song.to_dict() for song in self.queue]
