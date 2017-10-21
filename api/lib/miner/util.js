const fs = require('fs');
const ccminer = require('../../classes/miner/ccminer');
const cpuminerOpt = require('../../classes/miner/cpuminer-opt');
const claymoreEth = require('../../classes/miner/claymore-eth');
const claymoreZec = require('../../classes/miner/claymore-zec');
const claymoreXmr = require('../../classes/miner/claymore-xmr');
const optiminerZec = require('../../classes/miner/optiminer-zec');
const sgminer = require('../../classes/miner/sgminer');
const genericMiner = require('../../classes/miner/genericMiner');

module.exports = {
  validateSettings: (entry) => {
    return new Promise((resolve) => {
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
  createMinerInstance: (entry, pool, options) => {
    let miner = null;
    switch (entry.type) {
      case 'ccminer':
        miner = new ccminer(entry, pool, options);
        break;
      case 'cpuminer-opt':
        miner = new cpuminerOpt(entry, pool, options);
        break;
      case 'claymore-eth':
        miner = new claymoreEth(entry, pool, options);
        break;
      case 'claymore-zec':
        miner = new claymoreZec(entry, pool, options);
        break;
      case 'claymore-xmr':
        miner = new claymoreXmr(entry, pool, options);
        break;
      case 'optiminer-zec':
        miner = new optiminerZec(entry, pool, options);
        break;
      case 'sgminer':
        miner = new sgminer(entry, pool, options);
        break;
      default:
        miner = new genericMiner(entry, pool, options);
    }
    return miner;
  }
};