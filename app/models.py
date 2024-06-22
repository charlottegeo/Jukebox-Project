class Song:
    def __init__(self, track_name, artist_name, track_length, cover_url, track_id, uri, bpm, uid, source):
        self.track_name = track_name
        self.artist_name = artist_name
        self.track_length = track_length
        self.cover_url = cover_url
        self.track_id = track_id
        self.uri = uri
        self.bpm = bpm
        self.uid = uid
        self.source = source

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
            'source': self.source
        }

class UserQueue:
    def __init__(self, uid):
        self.uid = uid
        self.queue = []

    def add_song(self, song):
        self.queue.append(song)
        print(f"Song added to {self.uid}'s queue. Current queue: {self.get_queue()}")

    def remove_song(self, index=0):
        if self.queue:
            removed_song = self.queue.pop(index)
            print(f"Song removed from {self.uid}'s queue. Current queue: {self.get_queue()}")
            return removed_song
        print(f"No song to remove from {self.uid}'s queue. Current queue: {self.get_queue()}")
        return None

    def get_queue(self):
        return [song.to_dict() for song in self.queue]

    def reorder_queue(self, old_index, new_index):
        if 0 <= old_index < len(self.queue) and 0 <= new_index < len(self.queue):
            self.queue.insert(new_index, self.queue.pop(old_index))
            print(f"Queue reordered for {self.uid}. Current queue: {self.get_queue()}")
