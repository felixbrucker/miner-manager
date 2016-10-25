#!/usr/bin/env bash
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

sudo apt-get update && apt-get -y upgrade

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
  ./build.sh
  mkdir -p ../miner-manager/bin
  cp cpuminer ../miner-manager/bin/
  git reset --hard
  cd ..
  # nheqminer
  git clone https://github.com/nicehash/nheqminer.git
  cd nheqminer/nheqminer
  mkdir build
  cd build
  #cmake ..
  #make
  #cp nheqminer ../miner-manager/bin/
  cd ..
  sleep infinity
fi
