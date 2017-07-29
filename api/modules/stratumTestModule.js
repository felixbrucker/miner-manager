const net = require('net');
const tls = require('tls');
const log4js = require('log4js');
const logger = log4js.getLogger('stratumTest');
const configModule = require(`${__basedir}/api/modules/configModule`);

module.exports = {
  testStratum: (pool, rigName) => {
    return new Promise((resolve) => {
      let callbackSent = false;
      let mysocket = null;
      let arr = pool.url.split("://");
      arr = arr[(arr.length === 1 ? 0 : 1)].split(":");
      const hostname = arr[0];
      const port = arr[1];
      const isNH = (hostname.indexOf("nicehash") !== -1);
      //work around nicehash bans with high p param
      const pass = (isNH ? 'p=9999' : pool.pass);
      const worker = pool.worker + (pool.appendRigName ? `.${rigName}` : '');

      if (pool.isSSL) {
        mysocket = new tls.connect({host: hostname, port: port, rejectUnauthorized: false});
      } else {
        mysocket = new net.Socket().connect(port, hostname);
      }
      mysocket.setTimeout(10000);

      mysocket.on('connect', () => {
        let req = null;
        switch (pool.algo) {
          case 'cryptonight':
            req = `{"id":2, "jsonrpc":"2.0", "method":"login", "params": {"login":"${worker}", "pass": "${pass}", "agent": "stratumTest"}}`;
            break;
          default:
            req = '{"id":1, "jsonrpc":"2.0", "method":"mining.subscribe", "params": []}';
        }
        mysocket.write(`${req}\n`);
      });

      mysocket.on('timeout', () => {
        mysocket.end();
        mysocket.destroy();
        callbackSent = true;
        return resolve({working: false, data: 'timeout'});
      });

      mysocket.on('data', (data) => {
        let parsed = null;
        try {
          //incase multiline invalid json incoming (not comma seperated)
          parsed = data.toString('utf8').split('\n').map((line) => {
            if (line !== '')
              return JSON.parse(line);
            else
              return null;
          });
        } catch (err) {
          logger.debug(data.toString('utf8'));
          logger.debug(err);
          mysocket.end();
          mysocket.destroy();
          callbackSent = true;
          return resolve({working: false, data: 'json error'});
        }
        logger.debug(JSON.stringify(parsed, null, 2));
        if (parsed === null) {
          mysocket.end();
          mysocket.destroy();
          callbackSent = true;
          return resolve({working: false, data: 'json error'});
        }
        for (let i = 0; i < parsed.length; i++) {
          if (parsed[i] !== null && (parsed[i].id === 1 || parsed[i].id === 2)) {
            //ignore other stuff
            parsed = parsed[i];
            break;
          }
        }
        switch (parsed.id) {
          case 1:
            if (parsed.error !== undefined && parsed.error === null) {
              const req = '{"id": 2, "jsonrpc":"2.0", "method": "mining.authorize", "params": ["' + worker + '", "' + pass + '"]}';
              mysocket.write(`${req}\n`);
            } else {
              mysocket.end();
              mysocket.destroy();
              callbackSent = true;
              return resolve({working: false, data: 'subscribe error'});
            }
            break;
          case 2:
            if (isNH && parsed.result === false && parsed.error[1] === 'High price. No order to work on.') {
              //disregard error because we used high p param, stratum should be working fine
              mysocket.end();
              mysocket.destroy();
              callbackSent = true;
              return resolve({working: true, data: 'success'});
            } else {
              if (parsed.error !== undefined && parsed.error === null) {
                //success
                mysocket.end();
                mysocket.destroy();
                callbackSent = true;
                return resolve({working: true, data: 'success'});
              } else {
                mysocket.end();
                mysocket.destroy();
                callbackSent = true;
                return resolve({working: false, data: 'authorize error'});
              }
            }
            break;
        }
      });

      mysocket.on('close', () => {
        if (!callbackSent) {
          return resolve({working: false, data: 'closed connection'});
        }
      });

      mysocket.on('error', (err) => {
        logger.debug('socket error: ' + err.message);
        if (!callbackSent) {
          callbackSent = true;
          return resolve({working: false, data: 'socket error'});
        }
      });
    });
  }
};

function init() {
  logger.setLevel(configModule.config.logLevel);
}

setTimeout(init, 1000);
