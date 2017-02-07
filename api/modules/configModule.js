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
    groups:[],
    rigName:null,
    profitabilityServiceUrl:null,
    pools:[],
    autoswitchPools:[]
  },
  configNonPersistent:{
    types:["cpuminer-opt","claymore-eth","claymore-zec","claymore-cryptonight","optiminer-zec","sgminer-gm","ccminer","nheqminer","other"],
    algos:[
      "cryptonight",
      "daggerhashimoto",
      "decred",
      "equihash",
      "lbry",
      "lyra2re",
      "lyra2rev2",
      "m7m",
      "myr-gr",
      "neoscrypt",
      "sib",
      "skein",
      "veltor",
      "x11evo",
      "x17",
      "yescrypt",
      "timetravel",
      "pascal"
    ],
    locations:[
      "eu",
      "usa",
      "hk",
      "jp"
    ]
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
          if (config.config.groups===undefined)
            config.config.groups=[];
          if(config.config.profitabilityServiceUrl===undefined)
            config.config.profitabilityServiceUrl=null;
          if (config.config.pools===undefined)
            config.config.pools=[];
          if (config.config.autoswitchPools===undefined)
            config.config.autoswitchPools=[
              {enabled:false,name:"nicehash-autoswitch",appendRigName:true,worker:"",pass:"",location:"eu",pools:[]}
            ];
          config.config.autoswitchPools[0].pools=[
            {enabled:true,isNH:true,name:"nicehash-neoscrypt",algo:"neoscrypt",url:"stratum+tcp://neoscrypt.#APPENDLOCATION#.nicehash.com:3341",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-lyra2rev2",algo:"lyra2rev2",url:"stratum+tcp://lyra2rev2.#APPENDLOCATION#.nicehash.com:3347",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-daggerhashimoto",algo:"daggerhashimoto",url:"stratum+tcp://daggerhashimoto.#APPENDLOCATION#.nicehash.com:3353",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-decred",algo:"decred",url:"stratum+tcp://decred.#APPENDLOCATION#.nicehash.com:3354",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-cryptonight",algo:"cryptonight",url:"stratum+tcp://cryptonight.#APPENDLOCATION#.nicehash.com:3355",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-cryptonightSSL",algo:"cryptonight",url:"stratum+ssl://cryptonight.#APPENDLOCATION#.nicehash.com:33355",isSSL:true,working:true},
            {enabled:true,isNH:true,name:"nicehash-lbry",algo:"lbry",url:"stratum+tcp://lbry.#APPENDLOCATION#.nicehash.com:3356",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-equihash",algo:"equihash",url:"stratum+tcp://equihash.#APPENDLOCATION#.nicehash.com:3357",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-equihashSSL",algo:"equihash",url:"stratum+ssl://equihash.#APPENDLOCATION#.nicehash.com:33357",isSSL:true,working:true},
            {enabled:true,isNH:true,name:"nicehash-pascal",algo:"pascal",url:"stratum+tcp://pascal.#APPENDLOCATION#.nicehash.com:3358",isSSL:false,working:true}
          ];
        });
      } else if (err.code == 'ENOENT') {
        //default conf
        config.config.autostart=false;
        config.config.rigName="RXX";
        config.config.autoswitchPools=[
          {enabled:false,name:"nicehash-autoswitch",appendRigName:true,worker:"",pass:"",location:"eu",pools:[
            {enabled:true,isNH:true,name:"nicehash-neoscrypt",algo:"neoscrypt",url:"stratum+tcp://neoscrypt.#APPENDLOCATION#.nicehash.com:3341",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-lyra2rev2",algo:"lyra2rev2",url:"stratum+tcp://lyra2rev2.#APPENDLOCATION#.nicehash.com:3347",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-daggerhashimoto",algo:"daggerhashimoto",url:"stratum+tcp://daggerhashimoto.#APPENDLOCATION#.nicehash.com:3353",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-decred",algo:"decred",url:"stratum+tcp://decred.#APPENDLOCATION#.nicehash.com:3354",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-cryptonight",algo:"cryptonight",url:"stratum+tcp://cryptonight.#APPENDLOCATION#.nicehash.com:3355",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-cryptonightSSL",algo:"cryptonight",url:"stratum+ssl://cryptonight.#APPENDLOCATION#.nicehash.com:33355",isSSL:true,working:true},
            {enabled:true,isNH:true,name:"nicehash-lbry",algo:"lbry",url:"stratum+tcp://lbry.#APPENDLOCATION#.nicehash.com:3356",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-equihash",algo:"equihash",url:"stratum+tcp://equihash.#APPENDLOCATION#.nicehash.com:3357",isSSL:false,working:true},
            {enabled:true,isNH:true,name:"nicehash-equihashSSL",algo:"equihash",url:"stratum+ssl://equihash.#APPENDLOCATION#.nicehash.com:33357",isSSL:true,working:true},
            {enabled:true,isNH:true,name:"nicehash-pascal",algo:"pascal",url:"stratum+tcp://pascal.#APPENDLOCATION#.nicehash.com:3358",isSSL:false,working:true}
          ]}
        ];
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
