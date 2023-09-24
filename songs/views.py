from django.http import HttpResponse
from django.template import loader
from django.views.static import serve
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse



def songs(request):
    template = loader.get_template('display.html')
    return HttpResponse(template.render())


def styles(request):
    try:
        return serve(request, 'css/styles.css', document_root=settings.STATIC_ROOT)
    except Exception as e:
        return HttpResponse(e)
