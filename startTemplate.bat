cd ..
if not exist "cpuminer-opt-binary" git clone https://github.com/felixbrucker/cpuminer-opt-binary
cd cpuminer-opt-binary
git pull
if not exist "..\miner-manager\bin" mkdir ..\miner-manager\bin
copy /Y cpuminer-core-avx-i.exe ..\miner-manager\bin\cpuminer.exe
copy /Y *.dll ..\miner-manager\bin\
cd ..\miner-manager
git pull
call npm update
call npm start
