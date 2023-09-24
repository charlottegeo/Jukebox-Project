from django.db import models

class Song(models.Model):
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    length = models.IntegerField()
    picture = models.CharField(max_length=255)
