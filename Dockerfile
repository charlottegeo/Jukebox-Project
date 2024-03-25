FROM --platform=$BUILDPLATFORM python:3.11.5-alpine
WORKDIR /app 
COPY requirements.txt /app
RUN pip3 install -r requirements.txt --no-cache-dir
COPY . /app 
ENTRYPOINT ["python3"] 
CMD ["flask run", "0.0.0.0:8080"]
