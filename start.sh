#!/usr/bin/env bash
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

if [ ! -d "miner-manager" ]; then
  git clone --branch cloud https://github.com/felixbrucker/miner-manager
  cd miner-manager
  npm install
  node main.js &
  PID=$!
  cd ..
  # cpuminer-opt
  git clone https://github.com/felixbrucker/cpuminer-opt
  cd cpuminer-opt
  ./build.sh
  mkdir -p ../miner-manager/bin
  cp cpuminer ../miner-manager/bin/
  git reset --hard
  cd ..
  wait $PID
fi
