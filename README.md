# miner-manager

(auto profit switching) mining monitoring software (wrapper)

can use nicehash or zpool api via https://github.com/felixbrucker/profitability-service or run standalone without switching
will see if using both is useful/possible when i got some spare time

### Screens

![Stats](/screens/r01-stats.png?raw=true "Stats")
![Config](/screens/r01-config.png?raw=true "Config")


### Prerequisites

miner-manager requires nodejs, npm and optionally pm2 to run.
Additionally miner binaries are needed for cpu and gpu mining.


### Installation

```sh
git clone https://github.com/felixbrucker/miner-manager
cd miner-manager
npm install
npm install pm2 -g
```

### Run

```sh
pm2 start process.json
```

or

```sh
npm start
```

to startup on boot:

```sh
pm2 save
pm2 startup
```

note: windows users need the following instead for pm2:

```sh
npm install pm2-windows-startup -g
pm2-startup install
pm2 save
```

or just modify startTemplate.bat file to match your preferred compile and save as start.bat to not interfere with git updates

### Update software

run ``` git pull ```

### Todos

 - Error handling
 - Properly use async Methods
 - Properly send responses to indicate the result to frontend
 - Add Code Comments
 - Write Tests


License
----

GNU GPLv3 (see LICENSE)
