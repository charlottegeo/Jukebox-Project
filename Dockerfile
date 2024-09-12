FROM alpine:3.18

LABEL maintainer="Charlotte George <cngg805@gmail.com>"

WORKDIR /app

# Install necessary libraries and dependencies, including Sox, scikit-learn, and ffmpeg
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

# Ensure pip is upgraded
RUN python3 -m ensurepip && \
    pip3 install --upgrade pip

# Set the LLVM path
ENV PATH="/usr/lib/llvm15/bin:${PATH}"

# Install Python dependencies
COPY requirements.txt /app
RUN pip3 install --upgrade --no-deps librosa \
    && pip3 install --upgrade --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

# Run the application with Gunicorn
CMD ["gunicorn", "app:create_app()", "--bind=0.0.0.0:8080", "--worker-class=gevent", "--workers=2"]
