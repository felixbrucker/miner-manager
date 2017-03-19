/**
 * @namespace configCtrl
 *
 * @author: Felix Brucker
 * @version: v0.0.1
 *
 * @description
 * handles functionality for the config page
 *
 */
(function () {
    'use strict';

    angular
        .module('app')
        .controller('configCtrl', configController);

    function configController($scope,$interval,$http,$rootScope,$filter) {

        var vm = this;
        vm.config = {
            rigName: null,
            autostart:null,
            entries:[],
            types:[],
            groups:[],
            algos:[],
            pools:[],
            autoswitchPools:[],
            profitabilityServiceUrl:null,
            logLevel:null
        };
        vm.waiting = null;
        vm.updating=null;
        vm.updatingMiner=null;

        vm.newCustomMiner={
            id:null,
            enabled:true,
            binPath:"",
            cmdline:"",
            type:null,
            port:null,
            writeMinerLog:false,
            shell:false,
            hashrate:null,
            group:null,
            algo:null
        };

        vm.newGroup={
            id:null,
            enabled:true,
            name:"",
            pools:[]
        };

        vm.newPool={
            id:null,
            enabled:true,
            name:"",
            algo:"",
            url:"",
            isSSL:false,
            isIgnored:false,
            appendRigName:true,
            appendGroupName:false,
            worker:"",
            pass:"x",
            working:true
        };

        vm.currentlyEditing = {
            id:null,
            group: null,
            pools: [],
            availablePools:[],
            newPool: {
                id: null,
                prio:null,
                name:""
            }
        };


        // controller API
        vm.init = init;
        vm.getConfig=getConfig;
        vm.setConfig=setConfig;
        vm.update=update;
        vm.updateMiner=updateMiner;
        vm.updateMinerClean=updateMinerClean;
        vm.addCustomMiner=addCustomMiner;
        vm.delCustomMiner=delCustomMiner;
        vm.addGroup=addGroup;
        vm.delGroup=delGroup;
        vm.rebootSystem=rebootSystem;
        vm.getMatchingPools=getMatchingPools;
        vm.saveFromPoolConfigModal=saveFromPoolConfigModal;
        vm.addPoolFromModal=addPoolFromModal;
        vm.delPoolFromModal=delPoolFromModal;
        vm.addPool=addPool;
        vm.delPool=delPool;



        /**
         * @name init
         * @desc data initialization function
         * @memberOf configCtrl
         */
        function init() {
            angular.element(document).ready(function () {
                $('#groupPoolConfigModal').on('show.bs.modal', function (event) {
                    var button = $(event.relatedTarget); // Button that triggered the modal
                    var entryId = parseInt(button.data('entry')); // Extract info from data-* attributes
                    if (entryId !== -1){
                        for (var i = 0; i < vm.config.groups.length; i++) {
                            var entry = vm.config.groups[i];
                            if (entry.id === entryId) {
                                vm.currentlyEditing.name = JSON.parse(JSON.stringify(entry.name));
                                vm.currentlyEditing.id = parseInt(JSON.parse(JSON.stringify(entry.id)));
                                vm.currentlyEditing.pools = [];
                                if (entry.pools !== undefined){
                                    vm.currentlyEditing.pools = JSON.parse(JSON.stringify(entry.pools));
                                }
                                vm.currentlyEditing.availablePools=getMatchingPools(entry.name);
                                break;
                            }
                        }
                    }else{
                        vm.currentlyEditing.id=-1;
                        vm.currentlyEditing.name=vm.newGroup.name;
                        if (vm.newGroup.pools !== undefined)
                            vm.currentlyEditing.pools = JSON.parse(JSON.stringify(vm.newGroup.pools));
                        else
                            vm.currentlyEditing.pools = [];
                        vm.currentlyEditing.availablePools=[];
                    }

                    $scope.$apply();
                    var modal = $(this);
                    modal.find('.modal-title').text('Configure pools for ' + vm.currentlyEditing.name);
                });


                vm.getConfig();
            });
        }

        /**
         * @name addPool
         * @desc add new pool to array
         * @memberOf configCtrl
         */
        function addPool() {
            if (vm.newPool.name!==""&&vm.newPool.name!==null){
                //gen unique id
                vm.newPool.id=Date.now();
                //add to array
                vm.config.pools.push(JSON.parse(JSON.stringify(vm.newPool)));
                //clear variables
                vm.newPool={
                    id:null,
                    enabled:true,
                    name:"",
                    algo:"",
                    url:"",
                    isSSL:false,
                    isIgnored:false,
                    appendRigName:true,
                    appendGroupName:false,
                    worker:"",
                    pass:"x",
                    working:true
                };
                vm.setConfig();
            }
        }


        /**
         * @name delPool
         * @desc delete pool from array
         * @memberOf configCtrl
         */
        function delPool(id) {
            vm.config.pools.forEach(function (entry,index,array) {
                if (entry.id===id){
                    vm.config.pools.splice(index,1);
                }
            });
            vm.setConfig();
        }

        function addPoolFromModal(){
            vm.currentlyEditing.newPool.id = Date.now();
            vm.currentlyEditing.pools.push(JSON.parse(JSON.stringify(vm.currentlyEditing.newPool)));
            vm.currentlyEditing.newPool={
                id: null,
                prio:null,
                name:""
            };
        }

        function delPoolFromModal(id){
            vm.currentlyEditing.pools.forEach(function (entry, index, array) {
                if (entry.id === id) {
                    vm.currentlyEditing.pools.splice(index, 1);
                }
            });
        }

        /**
         * @name saveFromPoolConfigModal
         * @desc save pools to group config
         * @memberOf configCtrl
         */
        function saveFromPoolConfigModal() {
            for (var i = 0; i < vm.config.groups.length; i++) {
                var entry = vm.config.groups[i];
                if (entry.id === vm.currentlyEditing.id) {
                    entry.pools = JSON.parse(JSON.stringify(vm.currentlyEditing.pools));
                    break;
                }
            }
            vm.setConfig();
            $('#groupPoolConfigModal').modal('hide');
        }

        /**
         * @name getMatchingPools
         * @desc gets all pools matching the algo of miners in the group
         * @memberOf configCtrl
         */
        function getMatchingPools(group){
            var result=[];
            var foundAlgo={};
            for(var k=0;k<vm.config.entries.length;k++) {
                var entry = vm.config.entries[k];
                if (entry.group === group) {
                    foundAlgo[entry.algo] = true;
                }
            }
            //for every algo in pools
            for (var property in foundAlgo) {
                if (foundAlgo.hasOwnProperty(property)) {
                    for(var i=0;i<vm.config.pools.length;i++){
                        if(vm.config.pools[i].algo===property)
                            result.push(vm.config.pools[i].name);
                    }

                }
            }
            //for every algo in autoswitch pools
            for (var property in foundAlgo) {
                if (foundAlgo.hasOwnProperty(property)) {
                    for(var i=0;i<vm.config.autoswitchPools.length;i++){
                        var found=false;
                        for(var j=0;j<vm.config.autoswitchPools[i].pools.length;j++){
                            if(vm.config.autoswitchPools[i].pools[j].algo===property){
                                found=true;
                                break;
                            }
                        }
                        if(found&&!(result.includes(vm.config.autoswitchPools[i].name)))
                            result.push(vm.config.autoswitchPools[i].name);
                    }

                }
            }
            //console.log(result);


            return result;
        }

        /**
         * @name addCustomMiner
         * @desc add new custom miner to array
         * @memberOf configCtrl
         */
        function addCustomMiner() {
            if (vm.newCustomMiner.binPath!==""&&vm.newCustomMiner.binPath!==null){
                if (vm.newCustomMiner.type!=='other'&&(vm.newCustomMiner.port===null||vm.newCustomMiner.port==="")){
                    return false;
                }else{
                    //gen unique id
                    vm.newCustomMiner.id=Date.now();
                    //add to array
                    vm.config.entries.push(JSON.parse(JSON.stringify(vm.newCustomMiner)));
                    //clear variables
                    vm.newCustomMiner.id=null;
                    vm.newCustomMiner.enabled=true;
                    vm.newCustomMiner.binPath="";
                    vm.newCustomMiner.cmdline="";
                    vm.newCustomMiner.type=null;
                    vm.newCustomMiner.port=null;
                    vm.newCustomMiner.writeMinerLog=false;
                    vm.newCustomMiner.shell=false;
                    vm.newCustomMiner.hashrate=null;
                    vm.newCustomMiner.group=null;
                    vm.newCustomMiner.algo=null;
                    vm.setConfig();
                }
            }
        }

        /**
         * @name delCustomMiner
         * @desc delete custom miner from array
         * @memberOf configCtrl
         */
        function delCustomMiner(id) {
            vm.config.entries.forEach(function (entry,index,array) {
                if (entry.id===id){
                    vm.config.entries.splice(index,1);
                }
            });
            vm.setConfig();
        }



        /**
         * @name addGroup
         * @desc add new group to array
         * @memberOf configCtrl
         */
        function addGroup() {
            if (vm.newGroup.name!==""&&vm.newGroup.name!==null){
                //gen unique id
                vm.newGroup.id=Date.now();
                //add to array
                vm.config.groups.push(JSON.parse(JSON.stringify(vm.newGroup)));
                //clear variables
                vm.newGroup.id=null;
                vm.newGroup.enabled=true;
                vm.newGroup.name="";
                vm.newGroup.pools=[];
                vm.setConfig();
            }
        }


        /**
         * @name delGroup
         * @desc delete group from array
         * @memberOf configCtrl
         */
        function delGroup(id) {
            vm.config.groups.forEach(function (entry,index,array) {
                if (entry.id===id){
                    vm.config.groups.splice(index,1);
                }
            });
            vm.setConfig();
        }

        /**
         * @name getConfig
         * @desc get the config
         * @memberOf configCtrl
         */
        function getConfig() {
            return $http({
                method: 'GET',
                url: 'api/config'
            }).then(function successCallback(response) {
                vm.config.rigName = response.data.rigName;
                vm.config.autostart = response.data.autostart;
                vm.config.entries=response.data.entries;
                vm.config.types=response.data.types;
                vm.config.groups=response.data.groups;
                vm.config.pools=response.data.pools;
                vm.config.autoswitchPools=response.data.autoswitchPools;
                vm.config.algos=response.data.algos;
                vm.config.locations=response.data.locations;
                vm.config.profitabilityServiceUrl=response.data.profitabilityServiceUrl;
                vm.config.logLevel=response.data.logLevel;

                vm.config.groups = $filter('orderBy')(vm.config.groups, 'name');
                vm.config.entries = $filter('orderBy')(vm.config.entries, ['group','type']);
                vm.config.pools = $filter('orderBy')(vm.config.pools, ['name','algo']);

                $rootScope.title = vm.config.rigName + " Miner-Manager Config";
            }, function errorCallback(response) {
                console.log(response);
            });
        }


        /**
         * @name setConfig
         * @desc set the config
         * @memberOf configCtrl
         */
        function setConfig() {
            vm.waiting=true;
            return $http({
                method: 'POST',
                url: 'api/config',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                data: vm.config
            }).then(function successCallback(response) {
                setTimeout(function(){vm.waiting = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }

        /**
         * @name update
         * @desc updates the project from git
         * @memberOf configCtrl
         */
        function update() {
            vm.updating=true;
            return $http({
                method: 'POST',
                url: 'api/config/update',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                }
            }).then(function successCallback(response) {
                setTimeout(function(){vm.updating = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }

        /**
         * @name updateMiner
         * @desc updates the miner from git
         * @memberOf configCtrl
         */
        function updateMiner() {
            vm.updatingMiner=true;
            return $http({
                method: 'POST',
                url: 'api/config/updateMiner',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                }
            }).then(function successCallback(response) {
                setTimeout(function(){vm.updatingMiner = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }

        /**
         * @name updateMinerClean
         * @desc cleans the directory and updates the miner from git
         * @memberOf configCtrl
         */
        function updateMinerClean() {
            vm.updatingMiner=true;
            return $http({
                method: 'POST',
                url: 'api/config/updateMiner',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                data: {clean: true}
            }).then(function successCallback(response) {
                setTimeout(function(){vm.updatingMiner = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }

        /**
         * @name rebootSystem
         * @desc reboots the system if confirmed
         * @memberOf configCtrl
         */
        function rebootSystem() {
            if(confirm('Are you sure you want to reboot the System?')){
                return $http({
                    method: 'POST',
                    url: 'api/config/reboot',
                    headers: {
                        'Content-Type': 'application/json;charset=UTF-8'
                    }
                }).then(function successCallback(response) {
                }, function errorCallback(response) {
                    console.log(response);
                });
            }
        }


        // call init function on firstload
        vm.init();

    }

})();
