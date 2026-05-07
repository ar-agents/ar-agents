# Dockerfile for @ar-agents/mcp.
#
# Used by Glama (and any other MCP host that prefers a containerized run)
# to spin up the server and run an introspection check.
#
# Run:
#   docker build -t ar-agents-mcp .
#   docker run --rm -i ar-agents-mcp
#
# The server speaks MCP over stdio. Provide credentials via -e env vars:
#   docker run --rm -i \
#     -e MP_ACCESS_TOKEN=TEST-... \
#     -e AFIP_CERT_PEM="$(cat cert.pem)" \
#     -e AFIP_KEY_PEM="$(cat key.pem)" \
#     ar-agents-mcp
#
# Without env vars: only `validate_cuit` (algorithm-only, no I/O) is exposed.
# Each env-var group enables a different subset of tools — see README.

FROM node:20-alpine

# Install the published npm package globally. We do not bundle source here
# because @ar-agents/mcp is the union of 7 workspace packages; pinning to the
# published artifact ensures we test the exact binary users get from npx.
RUN npm install -g @ar-agents/mcp

# MCP servers communicate over stdio. No ports exposed.
ENTRYPOINT ["ar-agents-mcp"]
