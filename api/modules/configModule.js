const colors = require('colors/safe');
const fs = require('fs');
const log4js = require('log4js');
const logger = log4js.getLogger('config');
const configPath = 'data/settings.json';

// create data dir if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const config = module.exports = {
  //default conf
  config: {
    autostart: false,
    entries: [],
    groups: [],
    rigName: 'RXX',
    profitabilityServiceUrl: null,
    pools: [],
    autoswitchPools: [
      {
        enabled: false,
        name: 'nicehash-autoswitch',
        appendRigName: true,
        appendGroupName: false,
        worker: '',
        pass: '',
        location: 'eu',
        provider: 'nicehash',
      },
      {
        enabled: false,
        name: 'miningpoolhub-autoswitch',
        appendRigName: true,
        appendGroupName: false,
        worker: '',
        pass: '',
        location: 'eu',
        provider: 'miningpoolhub',
      },
      {
        enabled: false,
        name: 'minecryptonight-autoswitch',
        appendRigName: false,
        appendGroupName: false,
        worker: '',
        pass: '',
        location: 'eu',
        provider: 'minecryptonight',
      },
    ],
    logLevel: 'INFO',
  },
  configNonPersistent: {
    types: [
      'ccminer',
      'claymore-eth',
      'claymore-xmr',
      'claymore-zec',
      'cpuminer-opt',
      'optiminer-zec',
      'other',
      'sgminer',
    ],
    algos: [
      'blake2s',
      'cryptonight',
      'daggerhashimoto',
      'decred',
      'equihash',
      'lbry',
      'lyra2re',
      'lyra2rev2',
      'm7m',
      'myr-gr',
      'neoscrypt',
      'pascal',
      'sha256t',
      'sia',
      'sib',
      'skein',
      'skunk',
      'timetravel',
      'veltor',
      'x11evo',
      'x17',
      'yescrypt',
      'zcoin',
      'zoin',
    ],
    locations: [
      'br',
      'eu',
      'hk',
      'in',
      'jp',
      'usa',
    ]
  },
  getConfig: () => config.config,
  setConfig: (newConfig) => {
    config.config = newConfig;
  },
  saveConfig: () => {
    logger.info(colors.grey('writing config to file..'));
    return new Promise((resolve, reject) => {
      fs.writeFile(configPath, JSON.stringify(config.config, null, 2), (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  },
  loadConfig: async () => {
    await new Promise((resolve, reject) => {
      fs.stat(configPath, (err) => {
        if (err !== null && err.code !== 'ENOENT') {
          return reject(err);
        }
        return resolve();
      });
    });
    const data = await new Promise((resolve, reject) => {
      fs.readFile(configPath, 'utf8', (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    });
    config.config = JSON.parse(data);
    // migrations
    config.migrateConfig();
    logger.setLevel(config.config.logLevel);
  },
  migrateConfig: () => {
    config.config.entries.forEach((entry) => {
      if (entry.shell === undefined) {
        entry.shell = false;
      }
      if (entry.useStratumProxy === undefined) {
        entry.useStratumProxy = false;
      }
    });
    if (config.config.groups === undefined) {
      config.config.groups = [];
    }
    if (config.config.profitabilityServiceUrl === undefined) {
      config.config.profitabilityServiceUrl = null;
    }
    if (config.config.pools === undefined) {
      config.config.pools = [];
    }
    if (config.config.autoswitchPools.length === 1) {
      config.config.autoswitchPools.push({
        enabled: false,
        name: 'miningpoolhub-autoswitch',
        appendRigName: true,
        appendGroupName: false,
        worker: '',
        pass: '',
        location: 'eu',
        provider: 'miningpoolhub',
        });
    }
    delete config.config.autoswitchPools[0].pools;
    if (!config.config.autoswitchPools[0].provider) {
      config.config.autoswitchPools[0].provider = 'nicehash';
    }
    if (config.config.autoswitchPools.length === 2) {
      config.config.autoswitchPools.push({
        enabled: false,
        name: 'minecryptonight-autoswitch',
        appendRigName: false,
        appendGroupName: false,
        worker: '',
        pass: '',
        location: 'eu',
        provider: 'minecryptonight',
      });
    }
    if (config.config.logLevel === undefined) {
      config.config.logLevel = 'INFO';
    }
    config.config.groups.map(group => group.pools.map(pool => {
      if (!Array.isArray(pool.name)) {
        pool.name = [ pool.name ];
      }
    }));
  },
};

async function init() {
  logger.info('initializing, please wait...');
  try {
    await config.loadConfig();
  } catch (err) {
    logger.error('Error loading settings file');
  }
}

init();
