class Song:
    def __init__(self, track_name, artist_name, track_length, cover_url, track_id, uri, bpm, uid, source, wav_url=None):
        self.track_name = track_name
        self.artist_name = artist_name
        self.track_length = track_length
        self.cover_url = cover_url
        self.track_id = track_id
        self.uri = uri
        self.bpm = bpm
        self.uid = uid
        self.source = source
        self.wav_url = wav_url  # Optional attribute for YouTube songs

    def to_dict(self):
        song_dict = {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'track_length': self.track_length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
            'bpm': self.bpm,
            'uid': self.uid,
            'source': self.source
        }
        if self.wav_url:  # Only include wav_url if it exists
            song_dict['wav_url'] = self.wav_url
        return song_dict

    @classmethod
    def from_dict(cls, data):
        return cls(
            track_name=data['track_name'],
            artist_name=data['artist_name'],
            track_length=data['track_length'],
            cover_url=data['cover_url'],
            track_id=data['track_id'],
            uri=data['uri'],
            bpm=data['bpm'],
            uid=data['uid'],
            source=data['source'],
            wav_url=data.get('wav_url')  # Get wav_url if it exists in the data
        )

class UserQueue:
    def __init__(self, uid, queue=None):
        self.uid = uid
        self.queue = queue if queue is not None else []

    def add_song(self, song):
        self.queue.append(song)

    def remove_song(self, index=0):
        if self.queue:
            removed_song = self.queue.pop(index)
            return removed_song
        return None

    def get_queue(self):
        return [song.to_dict() for song in self.queue]

    def reorder_queue(self, old_index, new_index):
        if 0 <= old_index < len(self.queue) and 0 <= new_index < len(self.queue):
            self.queue.insert(new_index, self.queue.pop(old_index))

    def to_dict(self):
        return {
            'uid': self.uid,
            'queue': [song.to_dict() for song in self.queue]
        }

    @classmethod
    def from_dict(cls, data):
        queue = [Song.from_dict(song) for song in data.get('queue', [])]
        return cls(uid=data['uid'], queue=queue)
