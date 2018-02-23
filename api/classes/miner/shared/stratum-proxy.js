const net = require('net');
const tls = require('tls');
const fs = require('fs');

const options = {
  key: fs.readFileSync('server-key.pem'),
  cert: fs.readFileSync('server-cert.pem'),
};

module.exports = class StratumProxy {
  constructor(options) {
    this.rigName = options.rigName;
    this.groupName = options.groupName;
    this.supportsSSL = options.supportsSSL;

    this.client = null;
    this.server = null;
  }

  setPool(pool) {
    let arr = pool.url.split('://');
    arr = arr[(arr.length === 1 ? 0 : 1)].split(':');
    this.poolHost = arr[0];
    this.poolPort = arr[1];
    let worker = pool.worker;
    // only append dot if no dot already present and at least one string is getting appended
    if ((pool.appendRigName || pool.appendGroupName) && worker.indexOf('.') === -1) {
      worker += '.';
    }
    worker += (pool.appendRigName ? this.rigName : '');
    worker += (pool.appendGroupName ? this.groupName : '');
    this.poolWorker = worker;
    this.poolPass = pool.pass;
    this.isSSL = pool.isSSL;
    this.algo = pool.algo;
  }

  getPort() {
    return this.server.address().port;
  }

  async switchPool(pool) {
    this.setPool(pool);
    if (this.connection) {
      this.connection.end();
      this.connection = null;
    }
  }

  async setupLocalServer() {
    if (this.supportsSSL) {
      this.server = tls.createServer(options, this.handleConnection.bind(this));
    } else {
      this.server = net.createServer(this.handleConnection.bind(this));
    }
    this.server.on('error', (err) => {
      console.error(err.stack);
    });
    await new Promise(resolve => {
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    console.log('setup done');
  }

  handleConnection(connection) {
    this.connection = connection;
    console.log('conn created');
    if (this.isSSL) {
      this.client = new tls.connect({
        host: this.poolHost,
        port: this.poolPort,
        rejectUnauthorized: false,
      });
    } else {
      this.client = new net.Socket().connect(this.poolPort, this.poolHost);
    }
    connection.on('end', () => {
      console.log('conn end');
      this.client.destroy();
      this.client = null;
      this.connection = null;
    });
    connection.on('error', () => {
      console.log('conn err');
      this.client.destroy();
      this.client = null;
      this.connection = null;
    });
    connection.on('data', (data) => {
      console.log('conn data');
      const lines = data.toString('utf8')
        .split('\n')
        .filter(line => line !== '')
        .map(line => JSON.parse(line))
        .map(line => {
          switch(line.method) {
            case 'mining.authorize':
              console.log('auth');
              line.params[0] = this.poolWorker;
              line.params[1] = this.poolPass;
              break;
            case 'eth_submitLogin':
              line.worker = this.poolWorker;
              line.params[0] = '';
              line.params[1] = this.poolPass;
              break;
            case 'login':
              line.params.login = this.poolWorker;
              line.params.pass = this.poolPass;
              break;
            case 'mining.submit':
              line.params[0] = this.poolWorker;
              break;
            default:
              if (this.algo === 'daggerhashimoto') {
                line.worker = this.poolWorker;
              }
          }
          return line;
        })
        .map(line => JSON.stringify(line))
        .join('\n');

      this.client.write(`${lines}\n`);
    });
    this.client.on('data', (data) => {
      console.log('client data');
      connection.write(data);
    });
    this.client.on('close', () => {
      console.log('client close');
      connection.end();
    });
    this.client.on('error', () => {
      console.log('client err');
      connection.end();
    });
  }
};