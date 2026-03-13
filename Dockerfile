FROM rust:1-bookworm AS builder
COPY HASHCARDS_VERSION /tmp/
RUN cargo install hashcards@$(cat /tmp/HASHCARDS_VERSION)

FROM denoland/deno:debian
COPY --from=builder /usr/local/cargo/bin/hashcards /usr/local/bin/hashcards
COPY src/server.ts src/landing.html /app/
WORKDIR /app
EXPOSE 3000
CMD ["run", "-A", "server.ts"]
