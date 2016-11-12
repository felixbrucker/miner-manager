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

    function configController($scope,$interval,$http) {

        var vm = this;
        vm.config = {
            rigName: null,
            autostart:null,
            entries:[],
            types:[],
            groups:[],
            algos:[]
        };
        vm.waiting = null;
        vm.updating=null;

        vm.newCustomMiner={
            id:null,
            enabled:true,
            binPath:"",
            cmdline:"",
            type:null,
            port:null,
            writeMinerLog:true,
            shell:false,
            hashrate:null,
            group:null,
            algo:null
        };

        vm.newGroup={
            id:null,
            enabled:true,
            name:"",
            autoswitch:null
        };



        // controller API
        vm.init = init;
        vm.getConfig=getConfig;
        vm.setConfig=setConfig;
        vm.update=update;
        vm.addCustomMiner=addCustomMiner;
        vm.delCustomMiner=delCustomMiner;
        vm.addGroup=addGroup;
        vm.delGroup=delGroup;



        /**
         * @name init
         * @desc data initialization function
         * @memberOf configCtrl
         */
        function init() {
            angular.element(document).ready(function () {
                vm.getConfig();
            });
        }

        /**
         * @name addCustomMiner
         * @desc add new custom miner to array
         * @memberOf configCtrl
         */
        function addCustomMiner() {
            if (vm.newCustomMiner.binPath!==""&&vm.newCustomMiner.binPath!==null&&vm.newCustomMiner.cmdline!==""&&vm.newCustomMiner.cmdline!==null){
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
                    vm.newCustomMiner.writeMinerLog=true;
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
                vm.newGroup.autoswitch=null;
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
                vm.config.algos=response.data.algos;
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




        // call init function on firstload
        vm.init();

    }

})();
