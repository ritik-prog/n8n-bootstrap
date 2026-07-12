.PHONY: build test install-cli install-provider docker-up docker-down bootstrap

build:
	pnpm install
	pnpm build

test:
	pnpm test

install-cli:
	pnpm build
	ln -sf $(PWD)/packages/cli/dist/cli.js /usr/local/bin/n8nforge || cp packages/cli/dist/cli.js /usr/local/bin/n8nforge

install-provider:
	cd terraform-provider-n8nforge && go mod tidy && go build -o bin/terraform-provider-n8nforge .

docker-up:
	docker compose -f packages/adapters/docker/docker-compose.yml --env-file examples/docker-local/.env up -d

docker-down:
	docker compose -f packages/adapters/docker/docker-compose.yml --env-file examples/docker-local/.env down

bootstrap:
	./examples/docker-local/bootstrap.sh

pre-boot:
	node packages/cli/dist/cli.js bootstrap --phase pre-boot -f examples/docker-local/n8nforge.yaml

post-boot:
	node packages/cli/dist/cli.js bootstrap --phase post-boot -f examples/docker-local/n8nforge.yaml

doctor:
	node packages/cli/dist/cli.js doctor -f examples/docker-local/n8nforge.yaml
