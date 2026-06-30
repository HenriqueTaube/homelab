FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        iproute2 \
        iptables \
        procps \
        wireguard-tools \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

LABEL org.opencontainers.image.title="wireguard-puro" \
      org.opencontainers.image.description="Imagem minima de WireGuard puro para Kubernetes/Talos" \
      org.opencontainers.image.source="https://forgejo.example.local" \
      org.opencontainers.image.licenses="MIT"

ENTRYPOINT ["/entrypoint.sh"]
