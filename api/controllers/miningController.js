const net = require('net');
const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const psTree = require('ps-tree');
const rfs = require('rotating-file-stream');
const Rx = require('rx');
const axios = require('axios');
const WebSocketClient = require('websocket').client;
const log4js = require('log4js');
const spawn = require('cross-spawn');
const url = require('url');
const logger = log4js.getLogger('mining');
const stratumTestLogger = log4js.getLogger('stratumTest');

let miner_logs = {};

const configModule = require(`${__basedir}/api/modules/configModule`);
const stratumTestModule = require(`${__basedir}/api/modules/stratumTestModule`);
const minerUtil = require('../lib/miner/util');
const poolUtil = require('../lib/pool/util');

let stats = {
  running: null,
  entries: {},
  rigName: null
};

const timeEvents = Rx.Observable.interval(1000);

global.miner = {};
let shouldExit = false;
let timers = {};
let prevEntries = {};
let profitTimer = {};
let problemCounter = {};
let reloading = false;


function kill(pid, signal) {
  return new Promise((resolve) => {
    signal = signal || 'SIGKILL';
    psTree(pid, (err, children) => {
      [pid].concat(
        children.map((p) => p.PID)
      ).forEach((tpid) => {
        try {
          process.kill(tpid, signal)
        }
        catch (ex) {
        }
      });
      resolve();
    });
  });
}

function getStats(req, res, next) {
  stats.rigName = configModule.config.rigName;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(stats));
}

function startMining(req, res, next) {
  let result = false;
  if (!stats.running) {
    result = startAllMiner();
  }
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result}));
}

async function updateStratumStatus(pool, origPool) {
  if (reloading) {
    return false;
  }
  let result = {};
  try {
    result = await stratumTestModule.testStratum(pool, configModule.config.rigName);
    stratumTestLogger.debug(`${result.data} from pool: ${pool.name}`);
  } catch (err) {
    logger.error(err);
  }
  if (result.working) {
    if (problemCounter[pool.name] >= 2) {
      stratumTestLogger.info(`${pool.name} is working again`);
    }
    problemCounter[pool.name] = 0;
    origPool.working = true;
  } else {
    if (problemCounter[pool.name] === 1000) {
      problemCounter[pool.name] = 3;
    } else {
      problemCounter[pool.name] += 1;
    }
    if (problemCounter[pool.name] === 2) {
      origPool.working = false;
      stratumTestLogger.info(`${pool.name} is not working anymore: ${result.data}`);
    }
  }
}

function updatePoolStatus() {
  //only check mineable algos/pools
  let minerAlgos = {};
  configModule.config.entries.forEach((entry) => {
    if (entry.enabled) {
      minerAlgos[entry.algo] = true;
    }
  });
  configModule.config.pools.forEach((pool) => {
    if (pool.enabled && (!pool.isIgnored) && minerAlgos[pool.algo]) {
      if (problemCounter[pool.name] === undefined) {
        problemCounter[pool.name] = 0;
      }
      updateStratumStatus(pool, pool);
    }
  });
  configModule.config.autoswitchPools.forEach((asPool) => {
    asPool.pools.forEach((pool) => {
      if (pool.enabled && (!pool.isIgnored) && minerAlgos[pool.algo]) {
        const obj = JSON.parse(JSON.stringify(pool));
        obj.url = poolUtil.parseLocation(pool.url, asPool.location);
        obj.worker = asPool.worker;
        obj.pass = asPool.pass;
        if (problemCounter[pool.name] === undefined) {
          problemCounter[pool.name] = 0;
        }
        updateStratumStatus(obj, pool);
      }
    });
  });
}

async function checkIfMiningOnCorrectPool(group) {
  if (!group.pools) {
    return false;
  }
  const poolArray = await Promise.all(group.pools.map(async (pool) => {
    let result = false;
    if (pool.name.includes('autoswitch')) {
      try {
        result = await getMostProfitablePool(group, poolUtil.getAutoswitchPoolObj(pool.name));
      } catch(err) {
        logger.error(err.message);
      }
    } else {
      result = poolUtil.getPoolObj(pool.name);
    }
    return {prio: pool.prio, pool: result};
  }));
  const chosenPool = poolUtil.selectPool(poolArray, group);
  if (chosenPool === null) {
    return false;
  }
  let bestHr = 0;
  let pos = 0;
  //get the best miner for selected pool, allows multiple miners for same algo to be enabled and using the only the best
  configModule.config.entries.forEach((entry, index) => {
    if (entry.group === group.name && entry.enabled && entry.algo === chosenPool.pool.algo && entry.hashrate > bestHr) {
      pos = index;
      bestHr = entry.hashrate;
    }
  });

  if (prevEntries[group.name] !== undefined) {
    // different?
    if (prevEntries[group.name].pool.name !== chosenPool.pool.name || prevEntries[group.name].miner.id !== configModule.config.entries[pos].id) {
      //switch
      await stopMiner(prevEntries[group.name].miner);
      await startMiner(configModule.config.entries[pos], chosenPool.pool);
      prevEntries[group.name] = {pool: chosenPool.pool, miner: configModule.config.entries[pos]};
    }
  } else {
    // init
    await startMiner(configModule.config.entries[pos], chosenPool.pool);
    prevEntries[group.name] = {pool: chosenPool.pool, miner: configModule.config.entries[pos]};
  }
}

function startAllMiner() {
  if (configModule.config.groups === undefined) {
    return false;
  }
  logger.info('starting up miners, please wait..');
  const groupArr = configModule.config.groups.filter((group) => group.enabled);
  const groupEvents = Rx.Observable.fromArray(groupArr);
  Rx.Observable.zip(timeEvents, groupEvents, (i, group) => group)
    .subscribe(group => {
      checkIfMiningOnCorrectPool(group);
      profitTimer[group.id] = setInterval(() => {
        checkIfMiningOnCorrectPool(group);
      }, 1000 * 180);
    });
  stats.running = true;
  return true;
}

async function getMostProfitablePool(group, pool) { //expected to be an autoswitch pool obj
  if (configModule.config.profitabilityServiceUrl === undefined || configModule.config.profitabilityServiceUrl === null || !pool.enabled) {
    return false;
  }
  const query = {
    algos: {},
    region: pool.location,
    name: configModule.config.rigName + group.name,
  };
  configModule.config.entries.forEach((entry) => {
    if (entry.group === group.name && entry.enabled) {
      query.algos[entry.algo] = {hashrate: entry.hashrate};
    }
  });
  let requestUrl = configModule.config.profitabilityServiceUrl;
  if (requestUrl.indexOf('http') === -1) {
    requestUrl = `http://${requestUrl}`;
  }
  requestUrl = url.resolve(requestUrl, '/api/query');
  const result = (await axios.post(requestUrl, query)).data;
  if (!result.result) {
    return false;
  }
  const chosenPools = pool.pools.filter((currPool) => currPool.algo === result.result.algo);
  let bestHr = 0;
  let pos = 0;
  //get the best miner for selected algo, allows multiple miners for same algo to be enabled
  configModule.config.entries.forEach((entry, index) => {
    if (entry.group === group.name && entry.enabled && entry.algo === result.result.algo && entry.hashrate > bestHr) {
      pos = index;
      bestHr = entry.hashrate;
    }
  });
  const destinedOne = configModule.config.entries[pos];
  let preferSSL = false;
  //check if miner supports ssl connection
  if (destinedOne.type === 'claymore-zec' || destinedOne.type === 'claymore-cryptonight')
    preferSSL = true;
  let actualPool;
  //get the right pool (depending on ssl above)
  for (let j = 0; j < chosenPools.length; j++) {
    if (preferSSL) {
      if (chosenPools[j].isSSL) {
        actualPool = chosenPools[j];
        break;
      } else {
        actualPool = chosenPools[j];
      }
    } else {
      if (!chosenPools[j].isSSL) {
        actualPool = chosenPools[j];
      }
    }
  }
  actualPool.url = poolUtil.parseLocation(actualPool.url, pool.location);
  actualPool.worker = pool.worker;
  actualPool.pass = pool.pass;
  actualPool.appendRigName = pool.appendRigName;
  actualPool.appendGroupName = pool.appendGroupName;

  return actualPool;
}

async function startMiner(entry, pool) {
  const valid = await minerUtil.validateSettings(entry);
  if (!valid) {
    logger.error(colors.red('some required settings are not properly configured'));
    return false;
  }
  if (!entry.enabled) {
    logger.error(colors.red('miner is not enabled'));
    return false;
  }
  if (miner[entry.id] !== undefined && miner[entry.id] !== null) {
    logger.warn(colors.red('miner already running'));
    return false;
  }
  let minerString = entry.cmdline;
  if (entry.port !== undefined && entry.port !== null) {
    minerString += minerUtil.parseApiPort(entry);
  }
  minerString += minerUtil.parsePoolToMinerString(pool, entry.type, configModule.config.rigName, entry.group);
  if (stats.entries[entry.id] === undefined) {
    stats.entries[entry.id] = {};
  }
  stats.entries[entry.id].type = entry.type;
  stats.entries[entry.id].text = entry.binPath + " " + minerString;
  stats.entries[entry.id].expectedHr = entry.hashrate;

  if (entry.writeMinerLog) {
    miner_logs[entry.id] = rfs('miner' + entry.id + '.log', {
      size: '50M',
      path: 'data'
    });
    miner_logs[entry.id].on('rotated', (filename) => {
      fs.unlink(filename, () => {
      });
    });
  }

  setupMiner(entry, minerString);
  timers[entry.id] = setInterval(() => {
    updateMinerStats(entry.id, entry.port, entry.type);
  }, 5000);

  return true;
}

function setupMiner(entry, minerString) {
  minerUtil.startMiner(entry, minerString);
  logger.info(colors.cyan(`[${entry.type}]`) + ' miner started');
  miner[entry.id].stdout.on('data', (data) => {
    if (entry.writeMinerLog) {
      miner_logs[entry.id].write(data.toString());
    }
    if (minerUtil.checkMinerOutputString(data.toString())) {
      miner[entry.id].kill();
      kill(miner[entry.id].pid);
    }
  });
  miner[entry.id].stderr.on('data', (data) => {
    if (entry.writeMinerLog) {
      miner_logs[entry.id].write(data.toString());
    }
    if (minerUtil.checkMinerOutputString(data.toString())) {
      miner[entry.id].kill();
      kill(miner[entry.id].pid);
    }
  });
  miner[entry.id].on('close', () => {
    restartMinerOnExit(entry, minerString);
  });
  miner[entry.id].on('error', (err) => {
    //silently discard enoent for killing proc
  });
}

function restartMinerOnExit(entry, minerString) {
  if (shouldExit) {
    return;
  }
  setTimeout(() => {
    stats.entries[entry.id] = {};
    stats.entries[entry.id].type = entry.type;
    stats.entries[entry.id].text = `${entry.binPath} ${minerString}`;
    stats.entries[entry.id].expectedHr = entry.hashrate;

    logger.warn(colors.cyan(`[${entry.type}]`) + ' ' + colors.red('miner terminated, restarting...'));
    setupMiner(entry, minerString);
  }, 500);
}

async function stopMining(req, res, next) {
  if (stats.running) {
    await stopAllMiner();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

async function stopAllMiner() {
  shouldExit = true;
  stats.running = false;
  configModule.config.groups.forEach((group) => {
    if (profitTimer[group.id] !== undefined && profitTimer[group.id] !== null) {
      clearInterval(profitTimer[group.id]);
      profitTimer[group.id] = null;
    }
  });
  const keys = Object.keys(miner);
  for (let key of keys) {
    clearInterval(timers[key]);
    await kill(miner[key].pid);
    stats.entries[key] = null;
    delete stats.entries[key];
    const thisMiner = configModule.config.entries.find((entry) => entry.id === parseInt(key));
    logger.info(colors.cyan(`[${thisMiner.type}]`) + ' miner stopped');
    miner[key] = null;
    delete miner[key];
  }
  prevEntries = {};
  logger.info('all miners stopped');
  setTimeout(() => {
    shouldExit = false;
  }, 3000);
}

async function stopMiner(entry) {
  shouldExit = true;
  clearInterval(timers[entry.id]);
  await kill(miner[entry.id].pid);
  stats.entries[entry.id] = null;
  delete stats.entries[entry.id];
  logger.info(colors.cyan(`[${entry.type}]`) + ' miner stopped');
  miner[entry.id] = null;
  delete miner[entry.id];
  shouldExit = false;
}

async function updateMinerStats(id, port, type) {
  if (stats.entries[id] === undefined || stats.entries[id] === null) {
    return null;
  }
  switch (type) {
    case 'cpuminer-opt':
    case 'ccminer':
      return new Promise((resolve) => {
        const client = new WebSocketClient();

        client.on('connectFailed', (error) => {
          logger.error(`Connect failed for ${type} on port: ${port}`);
          logger.debug(error.toString());
          resolve();
        });

        client.on('connect', (connection) => {
          connection.on('error', (error) => {
            logger.error(`Connection Error for ${type} on port: ${port}`);
            logger.debug(error.toString());
            resolve();
          });
          connection.on('close', () => {});
          connection.on('message', (message) => {
            if (message.type !== 'utf8') {
              return;
            }
            let properties = message.utf8Data.split('|');
            properties = properties[0].split(';');
            let obj = {};
            properties.forEach((property) => {
              let tup = property.split('=');
              obj[tup[0]] = tup[1];
            });
            stats.entries[id].accepted = parseFloat(obj.ACC);
            stats.entries[id].acceptedPerMinute = parseFloat(obj.ACCMN);
            stats.entries[id].algorithm = obj.ALGO;
            stats.entries[id].difficulty = parseFloat(obj.DIFF);
            stats.entries[id].hashrate = parseFloat(obj.KHS);
            stats.entries[id].miner = `${obj.NAME} ${obj.VER}`;
            stats.entries[id].rejected = parseFloat(obj.REJ);
            stats.entries[id].uptime = obj.UPTIME;
            switch (type) {
              case 'cpuminer-opt':
                stats.entries[id].temperature = parseFloat(obj.TEMP);
                stats.entries[id].cores = parseFloat(obj.CPUS);
                break;
              case 'ccminer':
                stats.entries[id].gpus = parseFloat(obj.GPUS);
                break;
            }
            resolve();
          });
        });

        client.connect(`ws://127.0.0.1:${port}/summary`, 'text');
      });
    case 'claymore-eth':
      return new Promise((resolve) => {
        const mysocket = new net.Socket();

        mysocket.on('connect', () => {
          const req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
          mysocket.write(`${req}\n`);
          mysocket.setTimeout(1000);
        });

        mysocket.on('timeout', () => {
          mysocket.end();
          mysocket.destroy();
          logger.warn(`timeout connecting to claymore-eth on port ${port}`);
          stats.entries[id].uptime = null;
          stats.entries[id]['eth-hashrate'] = null;
          stats.entries[id]['eth-accepted'] = null;
          stats.entries[id]['eth-rejected'] = null;
          stats.entries[id]['alt-hashrate'] = null;
          stats.entries[id]['alt-accepted'] = null;
          stats.entries[id]['alt-rejected'] = null;
          stats.entries[id].temps = null;
          stats.entries[id].fans = null;
          stats.entries[id].pools = null;
          stats.entries[id].version = null;
          resolve();
        });

        mysocket.on('data', (data) => {
          const d = JSON.parse(data);
          stats.entries[id].uptime = d.result[1] * 60;
          let properties = d.result[2].split(';');
          stats.entries[id]['eth-hashrate'] = properties[0];
          stats.entries[id]['eth-accepted'] = properties[1];
          stats.entries[id]['eth-rejected'] = properties[2];
          properties = d.result[4].split(';');
          stats.entries[id]['alt-hashrate'] = properties[0];
          stats.entries[id]['alt-accepted'] = properties[1];
          stats.entries[id]['alt-rejected'] = properties[2];
          properties = d.result[6].split(';');
          stats.entries[id].temps = [];
          stats.entries[id].fans = [];
          for (let i = 0; i < properties.length; i += 2) {
            if (properties[i] !== "" && properties[i] !== null) {
              stats.entries[id].temps.push(properties[i]);
              stats.entries[id].fans.push(properties[i + 1]);
            }
          }
          stats.entries[id].pools = d.result[7].split(';');
          stats.entries[id].version = d.result[0].replace(' - ETH', '');
          mysocket.end();
          mysocket.destroy();
          resolve();
        });

        mysocket.on('close', () => {});

        mysocket.on('error', (err) => {
          logger.warn(`socket error for claymore-eth on port ${port}`);
          logger.debug(err.message);
          mysocket.destroy();
          resolve();
        });

        mysocket.connect(port, '127.0.0.1');
      });
    case 'claymore-zec':
      return new Promise((resolve) => {
        const mysocket = new net.Socket();

        mysocket.on('connect', () => {
          const req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
          mysocket.write(`${req}\n`);
          mysocket.setTimeout(1000);
        });

        mysocket.on('timeout', () => {
          mysocket.end();
          mysocket.destroy();
          logger.warn(`timeout connecting to claymore-zec on port ${port}`);
          stats.entries[id].uptime = null;
          stats.entries[id]['zec-hashrate'] = null;
          stats.entries[id]['zec-accepted'] = null;
          stats.entries[id]['zec-rejected'] = null;
          stats.entries[id].temps = null;
          stats.entries[id].fans = null;
          stats.entries[id].pools = null;
          stats.entries[id].version = null;
          resolve();
        });

        mysocket.on('data', (data) => {
          const d = JSON.parse(data);
          stats.entries[id].uptime = d.result[1] * 60;
          let properties = d.result[2].split(';');
          stats.entries[id]['zec-hashrate'] = properties[0];
          stats.entries[id]['zec-accepted'] = properties[1];
          stats.entries[id]['zec-rejected'] = properties[2];
          properties = d.result[6].split(';');
          stats.entries[id].temps = [];
          stats.entries[id].fans = [];
          for (let i = 0; i < properties.length; i += 2) {
            if (properties[i] !== "" && properties[i] !== null) {
              stats.entries[id].temps.push(properties[i]);
              stats.entries[id].fans.push(properties[i + 1]);
            }
          }
          stats.entries[id].pools = d.result[7].split(';');
          stats.entries[id].version = d.result[0].replace(' - ZEC', '');
          mysocket.end();
          mysocket.destroy();
          resolve();
        });

        mysocket.on('close', () => {});

        mysocket.on('error', (err) => {
          logger.warn(`socket error for claymore-zec on port ${port}`);
          logger.debug(err.message);
          mysocket.destroy();
          resolve();
        });

        mysocket.connect(port, '127.0.0.1');
      });
    case "claymore-cryptonight":
      return new Promise ((resolve) => {
        const mysocket = new net.Socket();

        mysocket.on('connect', () => {
          const req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
          mysocket.write(`${req}\n`);
          mysocket.setTimeout(1000);
        });

        mysocket.on('timeout', () => {
          mysocket.end();
          mysocket.destroy();
          logger.warn(`timeout connecting to claymore-cryptonight on port ${port}`);
          stats.entries[id].uptime = null;
          stats.entries[id].hashrate = null;
          stats.entries[id].accepted = null;
          stats.entries[id].rejected = null;
          stats.entries[id].temps = null;
          stats.entries[id].fans = null;
          stats.entries[id].pools = null;
          stats.entries[id].version = null;
          resolve();
        });

        mysocket.on('data', (data) => {
          const d = JSON.parse(data);
          stats.entries[id].uptime = d.result[1] * 60;
          let properties = d.result[2].split(';');
          stats.entries[id].hashrate = properties[0];
          stats.entries[id].accepted = properties[1];
          stats.entries[id].rejected = properties[2];
          properties = d.result[6].split(';');
          stats.entries[id].temps = [];
          stats.entries[id].fans = [];
          for (let i = 0; i < properties.length; i += 2) {
            if (properties[i] !== "" && properties[i] !== null) {
              stats.entries[id].temps.push(properties[i]);
              stats.entries[id].fans.push(properties[i + 1]);
            }
          }
          stats.entries[id].pools = d.result[7].split(';');
          stats.entries[id].version = d.result[0].replace(' - CN', '');
          mysocket.end();
          mysocket.destroy();
          resolve();
        });

        mysocket.on('close', () => {});

        mysocket.on('error', (err) => {
          logger.warn(`socket error for claymore-cryptonight on port ${port}`);
          logger.debug(err.message);
          mysocket.destroy();
          resolve();
        });

        mysocket.connect(port, '127.0.0.1');
      });
    case 'nheqminer':
      return new Promise ((resolve) => {
        const mysocket = new net.Socket();

        mysocket.on('connect', () => {
          const req = 'status';
          mysocket.write(`${req}\n`);
          mysocket.setTimeout(1000);
        });

        mysocket.on('timeout', () => {
          mysocket.end();
          mysocket.destroy();
          logger.warn("timeout connecting to nheqminer on port " + port);
          stats.entries[id].iterationRate = null;
          stats.entries[id].solutionRate = null;
          stats.entries[id].acceptedPerMinute = null;
          stats.entries[id].rejectedPerMinute = null;
          miner[id].kill();
          kill(miner[id].pid).then(() => {
            resolve();
          });
        });

        mysocket.on('data', (data) => {
          let d = JSON.parse(data);
          stats.entries[id].iterationRate = d.result.speed_ips;
          stats.entries[id].solutionRate = d.result.speed_sps;
          stats.entries[id].acceptedPerMinute = d.result.accepted_per_minute;
          stats.entries[id].rejectedPerMinute = d.result.rejected_per_minute;
          mysocket.end();
          mysocket.destroy();
          resolve();
        });

        mysocket.on('close', () => {});

        mysocket.on('error', (err) => {
          logger.warn(`socket error for nheqminer on port ${port}`);
          logger.debug(err.message);
          mysocket.destroy();
          resolve();
        });

        mysocket.connect(port, '127.0.0.1');
      });
    case 'optiminer-zec':
      try {
        const result = (await axios.get(`http://127.0.0.1:${port}`)).data;
        if (result.uptime) {
          stats.entries[id].uptime = result.uptime;
        }
        if (result.version) {
          stats.entries[id].version = result.version;
        }
        if (result["solution_rate"] && result["solution_rate"]["Total"]) {
          if (result["solution_rate"]["Total"]["3600s"]) {
            stats.entries[id].hashrate = result["solution_rate"]["Total"]["3600s"];
          } else {
            if (result["solution_rate"]["Total"]["60s"])
              stats.entries[id].hashrate = result["solution_rate"]["Total"]["60s"];
            else
              stats.entries[id].hashrate = result["solution_rate"]["Total"]["5s"];
          }
        }
        if (result.share) {
          stats.entries[id].accepted = result.share.accepted;
          stats.entries[id].rejected = result.share.rejected;
        }
      } catch(err) {
        stats.entries[id].uptime = null;
        stats.entries[id].version = null;
        stats.entries[id].hashrate = null;
        stats.entries[id].accepted = null;
        stats.entries[id].rejected = null;
        logger.warn(`Error: Unable to get stats data for optiminer-zec on port ${port}`);
      }
      return;
    case 'sgminer-gm':
      return new Promise ((resolve) => {
        const mysocket = new net.Socket();

        mysocket.on('connect', function () {
          let req = '{"command":"summary+coin","parameter":""}';
          mysocket.write(`${req}\n`);
          mysocket.setTimeout(2000);
        });

        mysocket.on('timeout', () => {
          mysocket.end();
          mysocket.destroy();
          stats.entries[id].accepted = null;
          stats.entries[id].rejected = null;
          stats.entries[id].algorithm = null;
          stats.entries[id].hashrate = null;
          stats.entries[id].miner = null;
          stats.entries[id].uptime = null;
          logger.warn(`timeout connecting to sgminer-gm on port ${port}`);
          resolve();
        });

        mysocket.on('data', (data) => {
          let parsed = null;
          const tmpString = data.toString('utf8');
          try {
            parsed = JSON.parse(tmpString.substring(0, tmpString.length - 1)); // cut last char ('')
          } catch (error) {
            stats.entries[id].accepted = null;
            stats.entries[id].rejected = null;
            stats.entries[id].algorithm = null;
            stats.entries[id].hashrate = null;
            stats.entries[id].miner = null;
            stats.entries[id].uptime = null;
            logger.warn(`Error: Unable to get stats data for sgminer-gm on port ${port}`);
            logger.debug(error);
          }
          if (parsed !== null) {
            stats.entries[id].accepted = parseInt(parsed.summary[0].SUMMARY[0].Accepted);
            stats.entries[id].rejected = parseFloat(parsed.summary[0].SUMMARY[0].Rejected);
            stats.entries[id].algorithm = parsed.coin[0].COIN[0]['Hash Method'];
            stats.entries[id].hashrate = parseFloat(parsed.summary[0].SUMMARY[0]['KHS av']);
            stats.entries[id].miner = parsed.summary[0].STATUS[0].Description;
            stats.entries[id].uptime = parsed.summary[0].SUMMARY[0].Elapsed;
          }
          mysocket.end();
          mysocket.destroy();
          resolve();
        });

        mysocket.on('close', () => {});

        mysocket.on('error', (err) => {
          stats.entries[id].accepted = null;
          stats.entries[id].rejected = null;
          stats.entries[id].algorithm = null;
          stats.entries[id].hashrate = null;
          stats.entries[id].miner = null;
          stats.entries[id].uptime = null;
          logger.warn(`socket error for sgminer-gm on port ${port}`);
          logger.debug(err.message);
          mysocket.destroy();
          resolve();
        });

        mysocket.connect(port, '127.0.0.1');
      });
    case 'other':
      return;
  }
}

function isRunning() {
  return stats.running;
}


function init() {
  logger.setLevel(configModule.config.logLevel);
  if (configModule.config.autostart) {
    logger.info('autostart enabled, starting miner shortly..');
    setTimeout(() => {
      startAllMiner();
    }, 10000);
  }
  stats.rigName = configModule.config.rigName;

  updatePoolStatus();
  setInterval(updatePoolStatus, 5 * 60 * 1000);
}

setTimeout(init, 1000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.stopAllMiner = stopAllMiner;
exports.startMiner = startMiner;
exports.startAllMiner = startAllMiner;
exports.isRunning = isRunning;
