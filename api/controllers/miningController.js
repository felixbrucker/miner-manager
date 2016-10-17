'use strict';

const https = require('https');
const http = require('http');
const wait = require('wait.for');
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
        var entry=JSON.parse(JSON.stringify(configModule.config.entries[i]));
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

            (function (entry){
              timers[entry.id]=setInterval(function () {
                getMinerStats(entry.id,entry.port,entry.type);
              }, 5000);
            }(entry));


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
            (function (entry,minerString){
              miner[entry.id].on('exit', function(){
                restartMinerOnExit(entry,minerString);
              });
            }(entry,minerString));
          }else{
            console.log(colors.red("miner already running"));
            return false;
          }
        }
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
    stats.entries[entry.id]={};
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
    (function (entry,minerString){
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
            var properties = properties[0].split(';');
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
      break;
    case "other":
      break;
  }
}

function init() {
  if (configModule.config.autostart) {
    console.log(colors.green("autostart enabled, starting miner shortly.."));
    setTimeout(function () {
      startMiner();
    }, 10000);
  }
  stats.rigName=configModule.config.rigName;
}

setTimeout(init, 1000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.startMiner = startMiner;
