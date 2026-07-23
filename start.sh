#!/bin/bash

set -e

corepack enable
corepack prepare pnpm@latest --activate

pnpm install

cd artifacts/discord-bot

exec pnpm dev
