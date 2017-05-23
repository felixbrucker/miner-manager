FROM ubuntu:latest
RUN apt update && apt -y install build-essential ca-certificates libssl-dev libcurl4-openssl-dev libjansson-dev libgmp-dev git-core curl g++ python automake
RUN useradd -m myuser
USER myuser
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash
ENV NVM_DIR=/home/myuser/.nvm
RUN . $NVM_DIR/nvm.sh && nvm install node
COPY start.sh /home/myuser/
WORKDIR /home/myuser
CMD ./start.sh
