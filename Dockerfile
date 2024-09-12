FROM alpine:3.18

LABEL maintainer="Charlotte George <cngg805@gmail.com>"

WORKDIR /app

RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    gcc \
    g++ \
    musl-dev \
    libffi-dev \
    libsndfile \
    openldap-dev \
    libsasl \
    make \
    bash \
    wget \
    sox \
    py3-scikit-learn \
    llvm15-dev \
    ffmpeg

RUN python3 -m ensurepip && \
    pip3 install --upgrade pip

ENV PATH="/usr/lib/llvm15/bin:${PATH}"

COPY requirements.txt /app
RUN pip3 install --upgrade --no-deps librosa \
    && pip3 install --upgrade --no-cache-dir -r requirements.txt

COPY . /app

CMD ["gunicorn", "app:create_app()", "--bind=0.0.0.0:8080", "--worker-class=gevent", "--workers=2"]
