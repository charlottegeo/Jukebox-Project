from django.urls import path
from . import views

urlpatterns = [
    path('', views.songs, name='songs'),
]