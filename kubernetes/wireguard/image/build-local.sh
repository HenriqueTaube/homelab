#!/bin/sh

set -eu

IMAGE_NAME="${IMAGE_NAME:-wireguard-puro}"
IMAGE_TAG="${IMAGE_TAG:-dev}"

docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .
