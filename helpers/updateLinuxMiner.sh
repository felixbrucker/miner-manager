#!/usr/bin/env bash
# set starting point
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# change to working dir
cd ..

# clone on first time
if [ ! -d "miner" ]; then
  git clone https://github.com/felixbrucker/linux-miner miner
fi

cd "miner"

# check on src changes for building
prevSizeCPU=`du -s src/cpuminer-opt`

# update
git pull

# check on src changes for building
currSizeCPU=`du -s src/cpuminer-opt`

# build incase newer version is detected
if [ "$prevSizeCPU" != "$currSizeCPU" ]; then
    echo 'newer cpuminer-opt version available, building ...'
    cd src/cpuminer-opt
    ./build.sh
    mkdir -p ../../../bin
    cp cpuminer ../../../bin/
    cd ../../
    git reset --hard
fi

