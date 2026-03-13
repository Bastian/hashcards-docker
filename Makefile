.PHONY: dev check fmt

dev:
	COLLECTION_DIR=example_cards deno run -A src/server.ts

check:
	deno task check

fmt:
	deno fmt
