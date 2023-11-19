from django.db import models

class Song(models.Model):
    track_name = models.CharField(max_length=255)
    artist_name = models.CharField(max_length=255)
    length = models.IntegerField()
    cover_url = models.CharField(max_length=255)
    track_id = models.CharField(max_length=255)
    uri = models.CharField(max_length=255)

class Queue(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    position = models.IntegerField()