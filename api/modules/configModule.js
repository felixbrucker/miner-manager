'use strict';

var colors = require('colors/safe');
var fs = require('fs');

var configPath="data/settings.json";

if (!fs.existsSync("data")){
  fs.mkdirSync("data");
}
var config = module.exports = {
  config: {
    autostart:null,
    entries:[],
    rigName:null,
    types:["cpuminer-opt","ccminer","claymore-eth","other"],
    stratumUrl:'stratum+tcp://cryptonight.usa.nicehash.com:3355'
  },
  getConfig: function () {
    return config.config;
  },
  setConfig: function (newConfig) {
    config.config = newConfig;
  },
  saveConfig: function () {
    console.log(colors.grey("writing config to file.."));
    fs.writeFile(configPath, JSON.stringify(config.config,null,2), function (err) {
      if (err) {
        return console.log(err);
      }
    });
  },
  loadConfig: function () {
    fs.stat(configPath, function (err, stat) {
      if (err == null) {
        fs.readFile(configPath, 'utf8', function (err, data) {
          if (err) throw err;
          config.config = JSON.parse(data);
          for (var i=0;i<config.config.entries.length;i++){
            if (config.config.entries[i].shell===undefined)
              config.config.entries[i].shell=false;
          }
        });
      } else if (err.code == 'ENOENT') {
        //default conf
        config.config.autostart=false;
        config.config.rigName=process.env.WNAME;
        config.config.entries.push({id:Date.now(),enabled:false,binPath:"bin/cpuminer",cmdline:"-a zoin -o stratum+tcp://hexx.suprnova.cc:2876 -u someone123."+process.env.WNAME+" -p x -t 2",type:"cpuminer-opt",port:10001,writeMinerLog:true,shell:false});
        config.config.entries.push({id:Date.now(),enabled:false,binPath:"bin/cpuminer",cmdline:"-a cryptonight -o stratum+tcp://cryptonight.usa.nicehash.com:3355 -u 14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2."+process.env.WNAME+" -p x -t 2",type:"cpuminer-opt",port:10001,writeMinerLog:true,shell:false});
        config.config.entries.push({id:Date.now(),enabled:true,binPath:"bin/cpuminer",cmdline:"-a cryptonight -o stratum+tcp://127.0.0.1:8001 -u 14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2."+process.env.WNAME+" -p x -t 2",type:"cpuminer-opt",port:10001,writeMinerLog:true,shell:false});
        config.saveConfig();
        setTimeout(function(){
          config.loadConfig();
        },500);
      }
    });
  }
};
console.log("initializing, please wait...");
config.loadConfig();
