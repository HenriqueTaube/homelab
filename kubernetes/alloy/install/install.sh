helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm install alloy grafana/alloy \
  --namespace alloy \
  --create-namespace \
  -f alloy-values.yaml
