from django.db import models

class Song(models.Model):
    track_name = models.CharField(max_length=255)
    artist_name = models.CharField(max_length=255)
    length = models.CharField(max_length=255)
    cover_url = models.CharField(max_length=255)
    track_id = models.CharField(max_length=255)
    uri = models.CharField(max_length=255)
    def to_dict(self):
        return {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'length': self.length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
        }
class Queue(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE)