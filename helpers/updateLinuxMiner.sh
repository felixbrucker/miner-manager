#!/usr/bin/env bash

# set starting point
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd ..

{

# clone on first time and setup
if [ ! -d "miner" ]; then
    git clone https://github.com/felixbrucker/linux-miner miner
    cd "miner"
    echo 'initial setup, building ...'
    cd src/cpuminer-opt
    chmod +x build.sh
    chmod +x autogen.sh
    ./build.sh
    mkdir -p ../../../bin
    cp cpuminer ../../../bin/
    cd ../../
    git reset --hard
else

    cd "miner"

    # check on src changes for building
    prevSizeCPU=`du -s src/cpuminer-opt`

    # update
    git pull

    # check on src changes for building
    currSizeCPU=`du -s src/cpuminer-opt`

    # build in case newer version is detected
    if [ "$prevSizeCPU" != "$currSizeCPU" ]; then
        echo 'newer cpuminer-opt version available, building ...'
        cd src/cpuminer-opt
        chmod +x build.sh
        chmod +x autogen.sh
        ./build.sh
        mkdir -p ../../../bin
        cp cpuminer ../../../bin/
        cd ../../
        git reset --hard
    fi
fi

} &> data/minerUpdate.log
