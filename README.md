# miner-manager

(auto profit switching) mining monitoring software (wrapper)

can use nicehash api via https://github.com/felixbrucker/profitability-service or run standalone without switching

### Screens

![Stats](/screens/r01-stats.png?raw=true "Stats")
![Config](/screens/r01-config.png?raw=true "Config")


### Prerequisites

miner-manager requires nodejs >= 7.6.0, npm and optionally pm2 to run.
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

### Notes

- When using custom directories for miner binaries and you are using pm2 for miner-manager be sure to exclude this directory in `ignore_watch`
- When using claymore-* miners be sure to set command line option `-r 1` so restarts are handled by miner-manager
- Selecting multiple regular pools for a single pool entry in group config will only use the first pool, only autoswitch pools can be combined to use the most profitable
- Currently there is no strong support for linux (miner binaries), but it should be possible out of the box ™
- Currently pool availability monitoring and automatic failover have been disabled because most pools bock your ip if you do not send actual mining data over the stratum conenction made to check their availability. I'll probably include this again with regular pings or tcp port checks.

### Todos

 - Add Code Comments
 - Write Tests


License
----

GNU GPLv3 (see LICENSE)
