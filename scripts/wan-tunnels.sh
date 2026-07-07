#!/bin/zsh
# SSM port-forward tunnels from this Mac to the Wan 2.2 ComfyUI workers.
# Local port → box :8188. Auto-restarts each tunnel; does NOT survive Mac
# reboot/logout — rerun after either. Kill with: pkill -f wan-tunnels
#
# Add more workers as they come online (and append the URL to COMFY_URL in .env.local):
#   9012 → i-059db1ff762123998   (parked: needs Serial Console disk cleanup + fp8 weights)
REGION=us-east-1
typeset -A BOXES
BOXES[9010]=i-08888f50b23144cdf
BOXES[9011]=i-0634014e5e11df029
BOXES[9013]=i-01aa32f4dde99d1fa

for port in ${(k)BOXES}; do
  (
    while true; do
      aws ssm start-session --target ${BOXES[$port]} \
        --document-name AWS-StartPortForwardingSession \
        --parameters "{\"portNumber\":[\"8188\"],\"localPortNumber\":[\"$port\"]}" \
        --region $REGION
      sleep 3
    done
  ) &
done
wait
