ROOT := ..
TAG ?= dev
API_IMG ?= factorio-api:$(TAG)
WEB_IMG ?= factorio-web:$(TAG)

.PHONY: build deploy undeploy port-forward

build:
	cd $(ROOT) && docker build -f apps/api/Dockerfile -t $(API_IMG) .
	cd $(ROOT) && docker build -f apps/web/Dockerfile -t $(WEB_IMG) .

deploy:
	kubectl apply -k .
	kubectl -n factorio-system set image deployment/factorio-api api=$(API_IMG)
	kubectl -n factorio-system set image deployment/factorio-web web=$(WEB_IMG)
	kubectl -n factorio-system rollout status deployment/factorio-api --timeout=180s
	kubectl -n factorio-system rollout status deployment/factorio-web --timeout=180s

undeploy:
	kubectl delete -k . --ignore-not-found=true

port-forward:
	kubectl -n factorio-system port-forward svc/factorio-web 3000:3000
