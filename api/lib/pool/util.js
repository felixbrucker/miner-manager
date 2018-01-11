const configModule = require('../../modules/configModule');

const util = {
  minerForPoolEnabled: (pool, group) => {
    return configModule.config.entries.find((entry) => {
      return entry.enabled && entry.algo === pool.algo && entry.group === group.name;
    });
  },
  selectPool: (pools, group) => {
    let lowest = 9999;
    let pos = 0;
    pools.forEach((pool, index) => {
      if (pool.prio < lowest && pool.pool && pool.pool.working && pool.pool.enabled && util.minerForPoolEnabled(pool.pool, group)) {
        lowest = pool.prio;
        pos = index;
      }
    });
    if (lowest !== 9999) {
      return pools[pos];
    }
    return null;
  },
  parseLocation: (url, location) => url.replace("#APPENDLOCATION#", location),
  getAutoswitchPoolObj: (poolName) => configModule.config.autoswitchPools.find((pool) => pool.name === poolName),
  getPoolObj: (poolName) => configModule.config.pools.find((pool) => pool.name === poolName),
};

module.exports = util;
