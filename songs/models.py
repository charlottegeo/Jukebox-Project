from django.db import models


#Song model to store all data about song
class Song(models.Model):
    track_name = models.CharField(max_length=255)
    artist_name = models.CharField(max_length=255)
    length = models.CharField(max_length=255)
    cover_url = models.CharField(max_length=255)
    track_id = models.CharField(max_length=255)
    uri = models.CharField(max_length=255)
    bpm = models.IntegerField(default=0)
    def to_dict(self):
        return {
            'track_name': self.track_name,
            'artist_name': self.artist_name,
            'length': self.length,
            'cover_url': self.cover_url,
            'track_id': self.track_id,
            'uri': self.uri,
            'bpm': self.bpm,
        }
    
#Queue model to store all songs in queue, stores objects of Song model
class Queue(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE)