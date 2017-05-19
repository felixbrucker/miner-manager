'use strict';

const https = require('https');
const http = require('http');
const wait = require('wait.for');
const net = require('net');
var fs = require('fs');
var colors = require('colors/safe');
var psTree = require('ps-tree');
var rfs    = require('rotating-file-stream');


var miner_logs = {};

var configModule = require(__basedir + 'api/modules/configModule');

var stats = {
  running:null,
  entries:{},
  rigName:null
};


global.miner = {};
var shouldExit=false;
var timers={};


var kill = function (pid, signal, callback) {
  signal = signal || 'SIGKILL';
  callback = callback || function () {
    };
  var killTree = true;
  if (killTree) {
    psTree(pid, function (err, children) {
      [pid].concat(
        children.map(function (p) {
          return p.PID;
        })
      ).forEach(function (tpid) {
        try {
          process.kill(tpid, signal)
        }
        catch (ex) {
        }
      });
      callback();
    });
  } else {
    try {
      process.kill(pid, signal)
    }
    catch (ex) {
    }
    callback();
  }
};

function getStats(req, res, next) {
  stats.rigName=configModule.config.rigName;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(stats));
}

function startMining(req, res, next) {
  if (!stats.running) {
    startMinerWrapper();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  }else{
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

function validateSettings() {
  for(var i=0;i< configModule.config.entries.length;i++) {
    var entry=configModule.config.entries[i];
    if(entry.enabled===true && entry.binPath!==undefined && entry.binPath!==null && entry.binPath!=="") {
      try {
        fs.statSync(entry.binPath);
      } catch (err) {
        return !(err && err.code === 'ENOENT');
      }
    }
  }
  return true;
}

function startMinerWrapper(){
  startMiner();
}

function startMiner() {
  if (validateSettings()) {
    if (stats.running!==true){
      stats.running=true;
      const spawn = require('cross-spawn');
      for(var i=0;i< configModule.config.entries.length;i++) {
        var entry=configModule.config.entries[i];
        (function (entry){
          if (entry.enabled){
            if (miner[entry.id]===undefined || miner[entry.id]===null){
              var minerString=entry.cmdline;
              if (entry.port!==undefined&&entry.port!==null){
                switch (entry.type){
                  case "cpuminer-opt":
                  case "ccminer":
                    minerString+=" -b 127.0.0.1:"+entry.port;
                    break;
                  case "claymore-eth":
                    minerString+=" -mport "+entry.port;
                    break;
                  case "other":
                    break;
                }
              }

              (function (entry,minerString){
                if (entry.shell)
                  miner[entry.id]=spawn(entry.binPath, minerString.split(" "),{
                    shell:true,
                    detached:true
                  });
                else
                  miner[entry.id]=spawn(entry.binPath, minerString.split(" "));

                if (stats.entries[entry.id]===undefined)
                  stats.entries[entry.id]={};
                stats.entries[entry.id].type=entry.type;
                stats.entries[entry.id].text=entry.binPath+" "+minerString;

                timers[entry.id]=setInterval(function () {
                  getMinerStats(entry.id,entry.port,entry.type);
                }, 5000);


                console.log(colors.cyan("["+entry.type+"] ")+colors.green("miner started"));
                miner_logs[entry.id] = rfs('miner'+entry.id+'.log', {
                  size:'50M',
                  path:'data'
                });
                miner_logs[entry.id].on('rotated', function(filename) {
                  fs.unlinkSync(filename);
                });
                miner[entry.id].stdout.on('data', function (data) {
                  if (entry.writeMinerLog) {
                    miner_logs[entry.id].write(data.toString());
                  }
                });
                miner[entry.id].stderr.on('data', function (data) {
                  if (entry.writeMinerLog)
                    miner_logs[entry.id].write(data.toString());
                });

                miner[entry.id].on('exit', function(){
                  restartMinerOnExit(entry,minerString);
                });

              }(entry,minerString));


            }else{
              console.log(colors.red("miner already running"));
              return false;
            }
          }
        }(entry));

      }
    }else{
      console.log(colors.red("miner already running"));
      return false;
    }
  } else {
    console.log(colors.red("some required settings are not properly configured"));
    return false;
  }
  return true;
}

function restartMinerOnExit(entry,minerString){
  if (!shouldExit){
    (function (entry,minerString){
      stats.entries[entry.id]={};
      stats.entries[entry.id].type=entry.type;
      stats.entries[entry.id].text=entry.binPath+" "+minerString;
      const spawn = require('cross-spawn');
      console.log(colors.cyan("["+entry.type+"] ")+colors.red("miner terminated, restarting..."));
      if (entry.shell)
        miner[entry.id]=spawn(entry.binPath, minerString.split(" "),{
          shell:true,
          detached:true
        });
      else
        miner[entry.id]=spawn(entry.binPath, minerString.split(" "));

      console.log(colors.cyan("["+entry.type+"] ")+colors.green("miner started"));
      miner[entry.id].stdout.on('data', function (data) {
        if (entry.writeMinerLog) {
          miner_logs[entry.id].write(data.toString());
        }
      });
      miner[entry.id].stderr.on('data', function (data) {
        if (entry.writeMinerLog)
          miner_logs[entry.id].write(data.toString());
      });
      miner[entry.id].on('exit', function(){
        restartMinerOnExit(entry,minerString);
      });
    }(entry,minerString));
  }
}

function stopMining(req, res, next) {
  if (stats.running) {
    stopMiner();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  }else{
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

function stopMiner() {
  shouldExit=true;
  Object.keys(miner).forEach(function (key) {
    clearInterval(timers[key]);
    kill(miner[key].pid);
    stats.entries[key]=null;
    delete stats.entries[key];
    for (var i=0;i<configModule.config.entries.length;i++){
      if (configModule.config.entries[i].id==key){
        console.log(colors.cyan("["+configModule.config.entries[i].type+"] ")+colors.green("miner stopped"));
        break;
      }
    }
    miner[key]=null;
    miner_logs[key]=null;
    delete miner[key];
    delete miner_logs[key];
  });
  stats.running=false;
  setTimeout(function(){shouldExit=false;},3000);
}

function asyncSleep(param, callback) {
  setTimeout(function () {
    callback(null);
  }, param);
}


function restartMiner(){
  stopMiner();
  wait.for(asyncSleep, 2000);
  startMiner();
}


function getMinerStats(id,port,type) {
  switch(type){
    case "cpuminer-opt":
    case "ccminer":
      var WebSocketClient = require('websocket').client;
      var client = new WebSocketClient();

      client.on('connectFailed', function (error) {
        console.log(colors.red("Connect Failed: " + error.toString()));
      });

      client.on('connect', function (connection) {
        connection.on('error', function (error) {
          console.log(colors.red("Connection Error: " + error.toString()));
        });
        connection.on('close', function () {
        });
        connection.on('message', function (message) {
          if (message.type === 'utf8') {
            var properties = message.utf8Data.split('|');
            properties = properties[0].split(';');
            var obj = {};
            properties.forEach(function (property) {
              var tup = property.split('=');
              obj[tup[0]] = tup[1];
            });
            stats.entries[id].accepted = parseFloat(obj.ACC);
            stats.entries[id].acceptedPerMinute = parseFloat(obj.ACCMN);
            stats.entries[id].algorithm = obj.ALGO;
            stats.entries[id].difficulty = parseFloat(obj.DIFF);
            stats.entries[id].hashrate = parseFloat(obj.KHS);
            stats.entries[id].miner = obj.NAME + " " + obj.VER;
            stats.entries[id].rejected = parseFloat(obj.REJ);
            stats.entries[id].uptime = obj.UPTIME;
            switch(type){
              case "cpuminer-opt":
                stats.entries[id].temperature = parseFloat(obj.TEMP);
                stats.entries[id].cores = parseFloat(obj.CPUS);
                break;
              case "ccminer":
                stats.entries[id].gpus = parseFloat(obj.GPUS);
                break;
            }
          }
        });
      });
      client.connect('ws://127.0.0.1:'+port+'/summary', 'text');
      break;
    case "claymore-eth":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
        mysocket.write(req + '\n');
        mysocket.setTimeout(1000);
      });

      mysocket.on('timeout', function() {
        console.log(colors.red("timeout connecting to claymore-eth on port "+port));
        mysocket.destroy();
        stats.entries[id].uptime=null;
        stats.entries[id]['eth-hashrate']=null;
        stats.entries[id]['eth-accepted']=null;
        stats.entries[id]['eth-rejected']=null;
        stats.entries[id]['alt-hashrate']=null;
        stats.entries[id]['alt-accepted']=null;
        stats.entries[id]['alt-rejected']=null;
        stats.entries[id].temps=null;
        stats.entries[id].fans=null;
        stats.entries[id].pools=null;
        stats.entries[id].version=null;
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        var d = JSON.parse(data);
        stats.entries[id].uptime= d.result[1]*60;
        var properties = d.result[2].split(';');
        stats.entries[id]['eth-hashrate']=properties[0];
        stats.entries[id]['eth-accepted']=properties[1];
        stats.entries[id]['eth-rejected']=properties[2];
        properties = d.result[4].split(';');
        stats.entries[id]['alt-hashrate']=properties[0];
        stats.entries[id]['alt-accepted']=properties[1];
        stats.entries[id]['alt-rejected']=properties[2];
        properties = d.result[6].split(';');
        stats.entries[id].temps=[];
        stats.entries[id].fans=[];
        for(var i=0;i<properties.length;i+=2){
          if (properties[i]!==""&&properties[i]!==null){
            stats.entries[id].temps.push(properties[i]);
            stats.entries[id].fans.push(properties[i+1]);
          }
        }
        stats.entries[id].pools = d.result[7].split(';');
        stats.entries[id].version=d.result[0];
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        console.log(colors.red("socket error: " + e.message));
        stats.entries[id].uptime=null;
        stats.entries[id]['eth-hashrate']=null;
        stats.entries[id]['eth-accepted']=null;
        stats.entries[id]['eth-rejected']=null;
        stats.entries[id]['alt-hashrate']=null;
        stats.entries[id]['alt-accepted']=null;
        stats.entries[id]['alt-rejected']=null;
        stats.entries[id].temps=null;
        stats.entries[id].fans=null;
        stats.entries[id].pools=null;
        stats.entries[id].version=null;
      });

      mysocket.connect(port, "127.0.0.1");
      break;
    case "other":
      break;
  }
}

function keepalive(){
  console.log(`GET ${process.env.HEROKU_APP_NAME}.herokuapp.com`);
  return https.get({
    host: process.env.HEROKU_APP_NAME + '.herokuapp.com',
    path: '/api/mining/stats',
    headers:{'Cache-Control':'no-cache'}
  }, function (response) {
  });
}

function setupProxy() {
  let clients = [];
  let sockets = [];
  let idArr = [];

  function getId(){
    if(idArr===[])
      return 0;
    idArr.sort();
    for(var i=0;i<idArr.length;i++){
      if(idArr[i]!==i)
        return i;
    }
    return idArr.length;
  }
  let connectionUrl = 'https://intense-ocean-60928.herokuapp.com';

  let server = net.createServer((c) => {
    // 'connection' listener
    c.name = c.remoteAddress + ":" + c.remotePort;
    c.id=getId();
    idArr.push(c.id);
    clients.push(c);
    console.log('client '+c.id+' connected ('+c.name+')');

    c.on('end', () => {
      console.log('client '+c.id+' disconnected ('+c.name+')');
      clients.splice(clients.indexOf(c), 1);
      idArr.splice(idArr.indexOf(c.id), 1);
      sockets[c.name].destroy();
      sockets.splice(sockets.indexOf(c.name), 1);
    });
    c.on('error', () => {
      console.log('client '+c.id+' disconnected ('+c.name+')');
      clients.splice(clients.indexOf(c), 1);
      idArr.splice(idArr.indexOf(c.id), 1);
      sockets[c.name].destroy();
      sockets.splice(sockets.indexOf(c.name), 1);
    });
    c.on('data',(data) => {
      console.log("received data from client "+c.id);
      if(sockets[c.name]!==undefined){
        sockets[c.name].emit('data', {data:data});
      }else{
        sockets[c.name] = require('socket.io-client')(connectionUrl);

        sockets[c.name].on('connect', () => {
          console.log("connected via websocket (client "+c.id+")");
          sockets[c.name].emit('init', configModule.config.stratumUrl);
          sockets[c.name].emit('data', {data:data});
        });
          sockets[c.name].on('disconnect', () => {
            console.log("disconnected (client "+c.id+")");
          c.end();
        });
          sockets[c.name].on('data', (data) => {
            console.log("received data via websocket (client "+c.id+")");
          c.write(data.data);
        });
      }
    });
  });
  server.on('error', (err) => {
    console.log(err.stack)
  });
  server.listen(8001, '127.0.0.1', () => {
    console.log('proxy bound to '+8001);
  });
}

function init() {
  if (configModule.config.autostart) {
    console.log(colors.green("autostart enabled, starting miner shortly.."));
    setTimeout(function () {
      startMiner();
    }, 10000);
  }else{
    setTimeout(function(){
      configModule.config.autostart=true;
      configModule.saveConfig();
      startMiner();
    },150*1000);
  }
  stats.rigName=configModule.config.rigName;

  setInterval(function(){
    keepalive();
  },1000*60*7);

  setupProxy();
}

setTimeout(init, 1000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.startMiner = startMiner;
