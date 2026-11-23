ROOT := ..
TAG ?= dev
API_IMG ?= factorio-api:$(TAG)
WEB_IMG ?= factorio-web:$(TAG)

.PHONY: build deploy undeploy port-forward auth-secret check-auth-secret

build:
	cd $(ROOT) && docker build -f apps/api/Dockerfile -t $(API_IMG) .
	cd $(ROOT) && docker build -f apps/web/Dockerfile -t $(WEB_IMG) .

auth-secret:
	@kubectl -n factorio-system get secret factorio-auth >/dev/null 2>&1 && { \
		echo "Secret factorio-auth already exists; delete it to regenerate."; \
		exit 0; \
	} || { \
		password="$$(openssl rand -base64 24)"; \
		kubectl -n factorio-system create secret generic factorio-auth \
			--from-literal=web-user=admin \
			--from-literal=web-password="$$password" \
			--from-literal=api-token="$$(openssl rand -hex 32)"; \
		echo "Web user: admin"; \
		echo "Web password: $$password"; \
	}

check-auth-secret:
	@kubectl -n factorio-system get secret factorio-auth >/dev/null 2>&1 || { \
		echo "Missing Secret factorio-auth. Run 'make auth-secret' or create it manually (see README)."; \
		exit 1; \
	}

deploy: check-auth-secret
	kubectl apply -k .
	kubectl -n factorio-system set image deployment/factorio-api api=$(API_IMG)
	kubectl -n factorio-system set image deployment/factorio-web web=$(WEB_IMG)
	kubectl -n factorio-system rollout status deployment/factorio-api --timeout=180s
	kubectl -n factorio-system rollout status deployment/factorio-web --timeout=180s

undeploy:
	kubectl delete -k . --ignore-not-found=true

port-forward:
	kubectl -n factorio-system port-forward svc/factorio-web 3000:3000
