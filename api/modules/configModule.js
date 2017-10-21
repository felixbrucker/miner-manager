const colors = require('colors/safe');
const fs = require('fs');
const log4js = require('log4js');
const logger = log4js.getLogger('config');
const configPath = 'data/settings.json';

// create data dir if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const nhPools = [
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-neoscrypt',
    algo: 'neoscrypt',
    url: 'stratum+tcp://neoscrypt.#APPENDLOCATION#.nicehash.com:3341', isSSL: false, working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-lyra2rev2',
    algo: 'lyra2rev2',
    url: 'stratum+tcp://lyra2rev2.#APPENDLOCATION#.nicehash.com:3347',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-daggerhashimoto',
    algo: 'daggerhashimoto',
    url: 'stratum+tcp://daggerhashimoto.#APPENDLOCATION#.nicehash.com:3353',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-decred',
    algo: 'decred',
    url: 'stratum+tcp://decred.#APPENDLOCATION#.nicehash.com:3354',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-cryptonight',
    algo: 'cryptonight',
    url: 'stratum+tcp://cryptonight.#APPENDLOCATION#.nicehash.com:3355',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-cryptonightSSL',
    algo: 'cryptonight',
    url: 'stratum+ssl://cryptonight.#APPENDLOCATION#.nicehash.com:33355',
    isSSL: true,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-lbry',
    algo: 'lbry',
    url: 'stratum+tcp://lbry.#APPENDLOCATION#.nicehash.com:3356',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-equihash',
    algo: 'equihash',
    url: 'stratum+tcp://equihash.#APPENDLOCATION#.nicehash.com:3357',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-equihashSSL',
    algo: 'equihash',
    url: 'stratum+ssl://equihash.#APPENDLOCATION#.nicehash.com:33357',
    isSSL: true,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-pascal',
    algo: 'pascal',
    url: 'stratum+tcp://pascal.#APPENDLOCATION#.nicehash.com:3358',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-sib',
    algo: 'sib',
    url: 'stratum+tcp://x11gost.#APPENDLOCATION#.nicehash.com:3359',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-sia',
    algo: 'sia',
    url: 'stratum+tcp://sia.#APPENDLOCATION#.nicehash.com:3360',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-skunk',
    algo: 'skunk',
    url: 'stratum+tcp://skunk.#APPENDLOCATION#.nicehash.com:3362',
    isSSL: false,
    working: true
  },
  {
    enabled: true,
    isIgnored: false,
    name: 'nicehash-blake2s',
    algo: 'blake2s',
    url: 'stratum+tcp://blake2s.#APPENDLOCATION#.nicehash.com:3361',
    isSSL: false,
    working: true
  }
];

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
        pools: nhPools,
      }
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
  nhPools,
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
    if (config.config.autoswitchPools === undefined) {
      config.config.autoswitchPools = [
        {
          enabled: false,
          name: 'nicehash-autoswitch',
          appendRigName: true,
          appendGroupName: false,
          worker: '',
          pass: '',
          location: 'eu',
          pools: [],
        },
      ];
    }
    config.config.autoswitchPools[0].pools = config.nhPools;
    if (config.config.logLevel === undefined) {
      config.config.logLevel = 'INFO';
    }
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
