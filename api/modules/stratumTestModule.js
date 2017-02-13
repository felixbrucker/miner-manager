const net = require('net');
const tls = require('tls');
var log4js = require('log4js');
var logger = log4js.getLogger('stratumTest');
const configModule = require(__basedir + 'api/modules/configModule');

var self = module.exports = {
  testStratum : function (pool,callback){
    var callbackSent=false;
    var mysocket;
    var arr = pool.url.split("://");
    arr = arr[(arr.length===1 ? 0 : 1)].split(":");
    var hostname = arr[0];
    var port = arr[1];
    var isNH=(hostname.indexOf("nicehash")!== -1 ? true : false);
    //work around nicehash bans with high p param
    var pass=(isNH ? "p=9999" : pool.pass);

    if(pool.isSSL){
      mysocket = new tls.connect({host:hostname,port:port,rejectUnauthorized:false});
    }else{
      mysocket = new net.Socket().connect(port, hostname);
    }

    mysocket.setTimeout(10000);

    mysocket.on('connect', function() {
      var req;
      switch(pool.algo){
        case "cryptonight":
          req = '{"id":2, "jsonrpc":"2.0", "method":"login", "params": {"login":"'+pool.worker+'", "pass": "'+pass+'", "agent": "stratumTest"}}';
          break;
        default:
          req = '{"id":1, "jsonrpc":"2.0", "method":"mining.subscribe", "params": []}';
      }
      mysocket.write(req + '\n');
      mysocket.setTimeout(10000);
    });


    mysocket.on('timeout', function() {
      callbackSent=true;
      mysocket.end();
      mysocket.destroy();
      callback({working:false,data:"timeout"});
    });

    mysocket.on('data', function(data) {
      var parsed=null;
      try{
        //incase multiline invalid json incoming (not comma seperated)
        parsed=data.toString('utf8').split('\n').map(function(line) {
          if(line!=="")
            return JSON.parse(line);
          else
            return null;
        });
      }catch(error){
        logger.debug(data.toString('utf8'));
        logger.debug(error);
        callbackSent=true;
        mysocket.end();
        mysocket.destroy();
        callback({working:false,data:"json error"});
      }

      logger.debug(JSON.stringify(parsed,null,2));
      if(parsed!==null){
        for(var i=0;i<parsed.length;i++){
          if(parsed[i]!==null&&(parsed[i].id===1||parsed[i].id===2)){
            //ignore other stuff
            parsed=parsed[i];
            break;
          }
        }
        switch(pool.algo){
          default:
            switch (parsed.id){
              case 1:
                if(parsed.error!==undefined&&parsed.error===null){
                  var req = '{"id": 2, "jsonrpc":"2.0", "method": "mining.authorize", "params": ["'+pool.worker+'", "'+pass+'"]}';
                  mysocket.write(req + '\n');
                  mysocket.setTimeout(10000);
                }else{
                  callbackSent=true;
                  mysocket.end();
                  mysocket.destroy();
                  callback({working:false,data:"subscribe error"});
                }
                break;
              case 2:
                if(isNH&&parsed.result===false&&parsed.error[1]==="High price. No order to work on."){
                  //disregard error because we used high p param, stratum should be working fine
                  mysocket.setTimeout(0);
                  callbackSent=true;
                  mysocket.end();
                  mysocket.destroy();
                  callback({working:true,data:"success"});
                }else{
                  if(parsed.error!==undefined&&parsed.error===null){
                    //success
                    mysocket.setTimeout(0);
                    callbackSent=true;
                    mysocket.end();
                    mysocket.destroy();
                    callback({working:true,data:"success"});
                  }else{
                    callbackSent=true;
                    mysocket.end();
                    mysocket.destroy();
                    callback({working:false,data:"authorize error"});
                  }
                }
                break;
            }
        }
      }
    });

    mysocket.on('close', function() {
      if(!callbackSent)
        callback({working:false,data:"closed connection"});
    });

    mysocket.on('error', function(e) {
      logger.debug("socket error: " + e.message);
      callbackSent=true;
      callback({working:false,data:"socket error"});
    });
  }
};

function init() {
  logger.setLevel(configModule.config.logLevel);
}

setTimeout(init, 1000);
