const fs = require('fs');
const spawn = require('cross-spawn');
const path = require('path');

module.exports = {
  parsePoolToMinerString: (pool, minerType, rigName, groupName) => {
    let worker = pool.worker;
    // only append dot if no dot already present and at least one string is getting appended
    if ((pool.appendRigName || pool.appendGroupName) && worker.indexOf('.') === -1) {
      worker += '.';
    }
    worker += (pool.appendRigName ? rigName : '');
    worker += (pool.appendGroupName ? groupName : '');
    switch (minerType) {
      case 'claymore-eth':
        return ` -epool ${pool.url} -ewal ${worker} -epsw ${pool.pass}`;
      case 'claymore-zec':
        return ` -zpool ${pool.url} -zwal ${worker} -zpsw ${pool.pass}`;
      case 'optiminer-zec':
        let arr = pool.url.split('://');
        arr = arr[(arr.length === 1 ? 0 : 1)].split(':');
        const hostname = arr[0];
        const port = arr[1];
        return ` -s ${hostname}:${port} -u ${worker} -p ${pool.pass}`;
      case 'sgminer-gm':
      case 'claymore-cryptonight':
      case 'ccminer':
      case 'cpuminer-opt':
        return ` -o ${pool.url} -u ${worker} -p ${pool.pass}`;
      case 'nheqminer':
        return ` -l ${pool.url} -u ${worker} -p ${pool.pass}`;
      case 'other':
        return '';
    }
  },
  parseApiPort: (entry) => {
    switch (entry.type) {
      case 'cpuminer-opt':
      case 'ccminer':
        return ` -b 127.0.0.1:${entry.port}`;
      case 'claymore-eth':
      case 'claymore-zec':
      case 'claymore-cryptonight':
        return ` -mport -${entry.port}`; // dash to enabled read-only
      case 'optiminer-zec':
        return ` -m ${entry.port}`;
      case 'sgminer-gm':
        return ` --api-listen --api-port ${entry.port}`;
      case 'nheqminer':
        return ` -a ${entry.port}`;
      case 'other':
        return '';
    }
  },
  validateSettings: (entry) => {
    return new Promise((resolve, reject) => {
      if (!entry.enabled || entry.binPath === undefined || entry.binPath === null || entry.binPath === '') {
        return resolve(false);
      }
      fs.stat(entry.binPath, (err) => {
        if (err) {
          return resolve(false);
        }
        return resolve(true);
      });
    });
  },
  startMiner: (entry, minerString) => {
    const isWin = /^win/.test(process.platform);
    if (entry.shell) {
      if (isWin) {
        miner[entry.id] = spawn(path.basename(entry.binPath), minerString.split(' '), {
          shell: true,
          detached: true,
          cwd: path.dirname(entry.binPath),
        });
      } else {
        miner[entry.id] = spawn(entry.binPath, minerString.split(' '), {
          shell: true,
          detached: true,
        });
      }
    } else {
      if (isWin) {
        miner[entry.id] = spawn(path.basename(entry.binPath), minerString.split(' '), {
          cwd: path.dirname(entry.binPath),
        });
      } else {
        miner[entry.id] = spawn(entry.binPath, minerString.split(' '));
      }
    }
  },
  checkMinerOutputString: (output) => {
    return (
      output.indexOf("CUDA error") !== -1 ||
      output.indexOf("eq_cuda_context") !== -1 ||
      output.indexOf("null (23)") !== -1 ||
      output.indexOf("read_until") !== -1
    );
  }
};