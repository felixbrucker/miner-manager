#!/usr/bin/env bash
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ ! -d "miner-manager" ]; then
  git clone --branch cloud https://github.com/felixbrucker/miner-manager
  cd miner-manager
  npm install
  npm install pm2 -g
  pm2 start process.json
  pm2 save
  cd ..
  # cpuminer-opt
  git clone https://github.com/felixbrucker/cpuminer-opt
  cd cpuminer-opt
  cp /app/.apt/usr/include/x86_64-linux-gnu/gmp.h .
  ./build-cloud.sh
  mkdir -p ../miner-manager/bin
  cp cpuminer ../miner-manager/bin/
  git reset --hard
  cd ..
  sleep infinity
fi
