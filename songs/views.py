from django.http import HttpResponse
from django.template import loader

def songs(request):
    template = loader.get_template('display.html')
    return HttpResponse(template.render())